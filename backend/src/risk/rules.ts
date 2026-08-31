import type { Transaction } from '../blockchain/types.js'
import type { GraphResult } from '../graph/types.js'
import type { FlowPath } from '../fundflow/paths.js'
import type { RiskRulesConfig, RuleName } from './config.js'

export interface RiskIndicator {
  rule: RuleName
  severity: 'info' | 'low' | 'medium' | 'high'
  score: number
  evidence: string
  transactions: string[]
}

export interface RiskAnalysisInput {
  chain: string
  address: string
  transactions: Transaction[]
  graph: GraphResult
  flowPaths: FlowPath[]
}

const WEI_PER_ETH = 1e18
const HOUR_MS = 3_600_000

function eth(wei: bigint): number {
  return Number(wei) / WEI_PER_ETH
}

function successfulTransfers(
  address: string,
  txs: Transaction[],
): { inflow: Transaction[]; outflow: Transaction[] } {
  const self = address.toLowerCase()
  const inflow: Transaction[] = []
  const outflow: Transaction[] = []
  for (const tx of txs) {
    if (tx.isError || !tx.to) continue
    if (tx.from.toLowerCase() === self && tx.to.toLowerCase() !== self) outflow.push(tx)
    else if (tx.to.toLowerCase() === self && tx.from.toLowerCase() !== self) inflow.push(tx)
  }
  return { inflow, outflow }
}

type RulesConfig = RiskRulesConfig['rules']
type RuleFn<N extends RuleName> = (input: RiskAnalysisInput, cfg: RulesConfig[N]) => RiskIndicator | null

function exposureIndicator(
  input: RiskAnalysisInput,
  matches: (entityType: string | undefined) => boolean,
  label: string,
): { nodes: GraphResult['nodes']; sampleTxs: string[] } | null {
  const hits = input.graph.nodes.filter((n) => n.role === 'attributed_entity' && matches(n.entityType))
  if (hits.length === 0) return null
  const sampleTxs = input.graph.edges
    .filter((e) => hits.some((h) => h.id === e.target))
    .flatMap((e) => e.sampleTxHashes.slice(0, 2))
  return { nodes: hits, sampleTxs }
}

export const RULES: {
  rapid_movement: RuleFn<'rapid_movement'>
  high_volume_pass_through: RuleFn<'high_volume_pass_through'>
  fan_out: RuleFn<'fan_out'>
  fan_in: RuleFn<'fan_in'>
  peel_chain: RuleFn<'peel_chain'>
  layering: RuleFn<'layering'>
  exchange_exposure: RuleFn<'exchange_exposure'>
  mixer_exposure: RuleFn<'mixer_exposure'>
  cross_chain_exposure: RuleFn<'cross_chain_exposure'>
} = {
  rapid_movement(input, c) {
    if (!c.enabled) return null
    const { inflow, outflow } = successfulTransfers(input.address, input.transactions)
    const inflowWei = inflow.reduce((sum, t) => sum + BigInt(t.valueWei), BigInt(0))
    const inflowEth = eth(inflowWei)
    if (inflowEth < c.minInflowEth || inflow.length === 0 || outflow.length === 0) return null
    const inSorted = [...inflow].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
    const outTimes = outflow.map((t) => t.timestamp.getTime()).sort((a, b) => a - b)
    let rapidlyMovedWei = BigInt(0)
    const rapidSamples: string[] = []
    for (const t of inSorted) {
      const nextOut = outTimes.find((ts) => ts >= t.timestamp.getTime())
      if (nextOut === undefined) continue
      if ((nextOut - t.timestamp.getTime()) / HOUR_MS <= c.maxMedianHoldHours) {
        rapidlyMovedWei += BigInt(t.valueWei)
        if (rapidSamples.length < 3) rapidSamples.push(t.hash)
      }
    }
    const rapidRatio = Number(rapidlyMovedWei) / Number(inflowWei)
    if (rapidRatio < 0.5) return null
    return {
      rule: 'rapid_movement',
      severity: c.severity,
      score: c.score,
      evidence: `${(rapidRatio * 100).toFixed(0)}% of received funds (${eth(rapidlyMovedWei).toFixed(3)} of ${inflowEth.toFixed(3)} ETH) were forwarded within ${c.maxMedianHoldHours}h of receipt — funds moved shortly after arrival.`,
      transactions: rapidSamples,
    }
  },

  high_volume_pass_through(input, c) {
    if (!c.enabled) return null
    const { inflow, outflow } = successfulTransfers(input.address, input.transactions)
    const inWei = inflow.reduce((s, t) => s + BigInt(t.valueWei), BigInt(0))
    const outWei = outflow.reduce((s, t) => s + BigInt(t.valueWei), BigInt(0))
    if (inWei === BigInt(0)) return null
    const ratio = Number(outWei) / Number(inWei)
    // Ratios far above 100% mean outflows exceed windowed inflows (swaps,
    // token sales, prior balance) — that is NOT evidence of forwarding.
    if (ratio < c.minForwardRatio || ratio > c.maxForwardRatio || eth(outWei) < c.minOutflowEth) return null
    return {
      rule: 'high_volume_pass_through',
      severity: c.severity,
      score: c.score,
      evidence: `Forwards ${(ratio * 100).toFixed(1)}% of received funds (${eth(outWei).toFixed(3)} of ${eth(inWei).toFixed(3)} ETH received in window) — consistent with an intermediary/pass-through wallet.`,
      transactions: outflow.slice(0, 3).map((t) => t.hash),
    }
  },

  fan_out(input, c) {
    if (!c.enabled) return null
    const outs = input.graph.edges.filter((e) => e.direction === 'out')
    const counterparties = new Set(outs.map((e) => e.target))
    if (counterparties.size < c.minCounterparties) return null
    return {
      rule: 'fan_out',
      severity: c.severity,
      score: c.score,
      evidence: `Suspect wallet distributes funds to ${counterparties.size} distinct addresses within the analyzed window.`,
      transactions: outs.slice(0, 3).map((e) => e.sampleTxHashes[0]).filter(Boolean) as string[],
    }
  },

  fan_in(input, c) {
    if (!c.enabled) return null
    const ins = input.graph.edges.filter((e) => e.direction === 'in')
    const counterparties = new Set(ins.map((e) => e.source))
    if (counterparties.size < c.minCounterparties) return null
    return {
      rule: 'fan_in',
      severity: c.severity,
      score: c.score,
      evidence: `${counterparties.size} distinct addresses send funds into the suspect wallet within the analyzed window.`,
      transactions: ins.slice(0, 3).map((e) => e.sampleTxHashes[0]).filter(Boolean) as string[],
    }
  },

  peel_chain(input, c) {
    if (!c.enabled) return null
    const { outflow } = successfulTransfers(input.address, input.transactions)
    const ordered = [...outflow].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
    let sequentialHits = 0
    for (let i = 1; i < ordered.length; i++) {
      const prev = BigInt(ordered[i - 1]!.valueWei)
      const cur = BigInt(ordered[i]!.valueWei)
      if (prev > BigInt(0) && cur <= prev && Number(cur) >= Number(prev) * c.similarityRatioMin) {
        sequentialHits += 1
      }
    }
    if (sequentialHits < c.minSequentialTransfers) return null
    return {
      rule: 'peel_chain',
      severity: c.severity,
      score: c.score,
      evidence: `${sequentialHits} successive partial transfers with non-increasing amounts — pattern consistent with peel-chain distribution leaving residual balances.`,
      transactions: ordered.slice(0, 4).map((t) => t.hash),
    }
  },

  layering(input, c) {
    if (!c.enabled) return null
    const qualifying = input.flowPaths.filter((p) => p.intermediaryCount >= c.minIntermediaryDepth)
    if (qualifying.length === 0) return null
    const deepest = qualifying.reduce((max, p) => Math.max(max, p.intermediaryCount), 0)
    return {
      rule: 'layering',
      severity: c.severity,
      score: c.score,
      evidence: `${qualifying.length} fund-flow path(s) traverse ≥${c.minIntermediaryDepth} intermediary wallets before reaching an attributed entity (deepest: ${deepest}).`,
      transactions: qualifying.flatMap((p) => p.hops.map((h) => h.sampleTxHash)).slice(0, 5),
    }
  },

  exchange_exposure(input, c) {
    if (!c.enabled) return null
    const hit = exposureIndicator(input, (t) => t === 'exchange' || t === 'broker', 'an attributed centralized exchange/broker')
    if (!hit) return null
    const names = hit.nodes.map((n) => `${n.entityName} [${n.attributionConfidence}]`).join(', ')
    return {
      rule: 'exchange_exposure',
      severity: c.severity,
      score: c.score,
      evidence: `Fund trail reaches an attributed centralized exchange/broker: ${names}. Attribution sourced from the seeded dataset — verify citations on the entity panel.`,
      transactions: hit.sampleTxs,
    }
  },

  mixer_exposure(input, c) {
    if (!c.enabled) return null
    const hit = exposureIndicator(input, (t) => t === 'mixer', 'a known mixer contract')
    if (!hit) return null
    const names = hit.nodes.map((n) => `${n.entityName} [${n.attributionConfidence}]`).join(', ')
    return {
      rule: 'mixer_exposure',
      severity: c.severity,
      score: c.score,
      evidence: `Fund trail interacts with a known mixer contract: ${names}. Mixer interaction materially complicates downstream tracing.`,
      transactions: hit.sampleTxs,
    }
  },

  cross_chain_exposure(input, c) {
    if (!c.enabled) return null
    const hit = exposureIndicator(input, (t) => t === 'bridge', 'a known bridge contract')
    if (!hit) return null
    const names = hit.nodes.map((n) => `${n.entityName} [${n.attributionConfidence}]`).join(', ')
    return {
      rule: 'cross_chain_exposure',
      severity: c.severity,
      score: c.score,
      evidence: `Fund trail interacts with a bridge contract (${names}); tracing should continue on the destination chain.`,
      transactions: hit.sampleTxs,
    }
  },
}

function runRule<N extends RuleName>(
  name: N,
  input: RiskAnalysisInput,
  cfg: RulesConfig[N],
): RiskIndicator | null {
  const fn = RULES[name] as RuleFn<N>
  return fn(input, cfg)
}

export function runRiskAnalysis(
  input: RiskAnalysisInput,
  config: RiskRulesConfig,
): { indicators: RiskIndicator[]; compositeScore: number; band: 'low' | 'medium' | 'high' | 'critical' } {
  const indicators: RiskIndicator[] = []
  for (const name of Object.keys(RULES) as RuleName[]) {
    const result = runRule(name, input, config.rules[name])
    if (result) indicators.push(result)
  }

  const compositeScore = Math.min(
    100,
    indicators.reduce((sum, i) => sum + i.score, 0),
  )

  const b = config.bands
  const band =
    compositeScore <= b.lowUpper
      ? 'low'
      : compositeScore <= b.mediumUpper
        ? 'medium'
        : compositeScore <= b.highUpper
          ? 'high'
          : 'critical'

  return { indicators, compositeScore, band }
}
