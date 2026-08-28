import { describe, expect, it } from 'vitest'
import { extractFlowPaths } from '../src/fundflow/paths.js'
import { runRiskAnalysis } from '../src/risk/rules.js'
import { riskConfigSchema } from '../src/risk/config.js'
import type { GraphEdge, GraphNode, GraphResult } from '../src/graph/types.js'
import type { RiskRulesConfig } from '../src/risk/config.js'

function node(id: string, role: GraphNode['role'], entityType?: string): GraphNode {
  return {
    id,
    address: id,
    chain: 'ethereum',
    role,
    depth: 0,
    entityType,
    entityName: entityType ? `Entity ${id}` : undefined,
    attributionConfidence: entityType ? 'MEDIUM' : undefined,
  }
}

function edge(source: string, target: string, direction: GraphEdge['direction'], hash = `0x${source}${target}`): GraphEdge {
  return {
    id: `${source}|${target}|ETH`,
    source,
    target,
    direction,
    asset: 'ETH',
    transactionCount: 1,
    totalValue: '1',
    firstSeen: new Date(0).toISOString(),
    lastSeen: new Date(1000).toISOString(),
    sampleTxHashes: [hash],
  }
}

function graph(partial: Partial<GraphResult>): GraphResult {
  return {
    suspectAddress: 's',
    chain: 'ethereum',
    nodes: [],
    edges: [],
    attributedEntities: [],
    truncated: false,
    limits: { maxDepth: 2, maxNodes: 25, maxEdgesPerNode: 8, minValueEth: 0.001 },
    generatedAt: new Date().toISOString(),
    ...partial,
  }
}

const baseConfig: RiskRulesConfig = riskConfigSchema.parse({
  bands: { lowUpper: 29, mediumUpper: 59, highUpper: 79 },
  rules: {
    rapid_movement: { enabled: false, score: 20, severity: 'medium', maxMedianHoldHours: 24, minInflowEth: 0 },
    high_volume_pass_through: { enabled: false, score: 30, severity: 'high', minForwardRatio: 0.8, maxForwardRatio: 1.2, minOutflowEth: 0 },
    fan_out: { enabled: false, score: 15, severity: 'low', minCounterparties: 10 },
    fan_in: { enabled: false, score: 15, severity: 'low', minCounterparties: 15 },
    peel_chain: { enabled: false, score: 15, severity: 'low', minSequentialTransfers: 5, similarityRatioMin: 0.3 },
    layering: { enabled: true, score: 25, severity: 'high', minIntermediaryDepth: 2 },
    exchange_exposure: { enabled: true, score: 20, severity: 'medium' },
    mixer_exposure: { enabled: true, score: 40, severity: 'high' },
    cross_chain_exposure: { enabled: true, score: 15, severity: 'low' },
  },
})

describe('extractFlowPaths', () => {
  it('finds the suspect→intermediary→attributed-endpoint path with hop hashes', () => {
    const g = graph({
      suspectAddress: 's',
      nodes: [node('s', 'suspect'), node('a', 'intermediary'), node('x', 'attributed_entity', 'exchange')],
      edges: [
        edge('s', 'a', 'out', '0xhop1'),
        edge('a', 'x', 'internal', '0xhop2'),
        edge('in1', 's', 'in'),
      ],
    })
    const paths = extractFlowPaths(g)
    expect(paths).toHaveLength(1)
    expect(paths[0]!.hops.map((h) => h.sampleTxHash)).toEqual(['0xhop1', '0xhop2'])
    expect(paths[0]!.endpointEntityType).toBe('exchange')
    expect(paths[0]!.intermediaryCount).toBe(1)
  })

  it('returns no paths when no attributed endpoint is reachable', () => {
    const g = graph({
      suspectAddress: 's',
      nodes: [node('s', 'suspect'), node('a', 'intermediary')],
      edges: [edge('s', 'a', 'out')],
    })
    expect(extractFlowPaths(g)).toHaveLength(0)
  })

  it('requires two intermediaries for the layering rule to fire', () => {
    const oneHop = graph({
      suspectAddress: 's',
      nodes: [node('s', 'suspect'), node('a', 'intermediary'), node('b', 'intermediary'), node('x', 'attributed_entity', 'mixer')],
      edges: [edge('s', 'a', 'out'), edge('a', 'b', 'internal'), edge('b', 'x', 'internal')],
    })
    const paths = extractFlowPaths(oneHop)
    const resultOneIntermediary = runRiskAnalysis(
      { chain: 'ethereum', address: 's', transactions: [], graph: oneHop, flowPaths: paths },
      baseConfig,
    )
    // path s→a→b→x has intermediaries a,b → count 2 → fires
    expect(resultOneIntermediary.indicators.map((i) => i.rule)).toContain('layering')
    // layering(25) + mixer_exposure(40) = 65 → high band
    expect(resultOneIntermediary.compositeScore).toBe(65)
    expect(resultOneIntermediary.band).toBe('high')

    const shortGraph = graph({
      suspectAddress: 's',
      nodes: [node('s', 'suspect'), node('a', 'intermediary'), node('x', 'attributed_entity', 'exchange')],
      edges: [edge('s', 'a', 'out'), edge('a', 'x', 'internal')],
    })
    const resultShort = runRiskAnalysis(
      { chain: 'ethereum', address: 's', transactions: [], graph: shortGraph, flowPaths: extractFlowPaths(shortGraph) },
      baseConfig,
    )
    expect(resultShort.indicators.map((i) => i.rule)).not.toContain('layering')
    expect(resultShort.compositeScore).toBe(20)
    expect(resultShort.band).toBe('low')
  })

  it('caps composite at 100 and maps critical band', () => {
    const cfg = structuredClone(baseConfig)
    cfg.rules.mixer_exposure.score = 60
    cfg.rules.exchange_exposure.score = 50
    const g = graph({
      suspectAddress: 's',
      nodes: [
        node('s', 'suspect'),
        node('m', 'attributed_entity', 'mixer'),
        node('x', 'attributed_entity', 'exchange'),
      ],
      edges: [edge('s', 'm', 'out'), edge('s', 'x', 'out')],
    })
    const result = runRiskAnalysis({ chain: 'ethereum', address: 's', transactions: [], graph: g, flowPaths: [] }, cfg)
    expect(result.compositeScore).toBe(100)
    expect(result.band).toBe('critical')
  })

  it('scores zero and low band on an empty context', () => {
    const g = graph({ suspectAddress: 's', nodes: [node('s', 'suspect')] })
    const result = runRiskAnalysis({ chain: 'ethereum', address: 's', transactions: [], graph: g, flowPaths: [] }, baseConfig)
    expect(result.compositeScore).toBe(0)
    expect(result.band).toBe('low')
    expect(result.indicators).toHaveLength(0)
  })
})

