import type { AttributionResult } from '../attribution/types.js'

/**
 * Headless investigation graph — independent of any frontend library.
 * Nodes are addresses; edges are aggregated transfer relationships.
 */

export interface GraphNode {
  id: string // lowercase address (stable key)
  address: string // checksummed display form
  chain: string
  role: 'suspect' | 'intermediary' | 'attributed_entity'
  depth: number
  txCountAnalyzed?: number
  balanceNative?: string
  balanceSymbol?: string
  entityName?: string
  entityType?: string
  attributionConfidence?: string
  attributionSource?: string
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  /** Edge orientation relative to the suspect: out = suspect sent, in = suspect received, internal = deeper hop. */
  direction: 'in' | 'out' | 'internal'
  asset: string
  assetContract?: string
  assetDecimals?: number
  transactionCount: number
  totalValue: string // human decimal string in `asset`
  firstSeen: string
  lastSeen: string
  sampleTxHashes: string[]
}

export interface GraphResult {
  suspectAddress: string
  chain: string
  nodes: GraphNode[]
  edges: GraphEdge[]
  attributedEntities: AttributionResult[]
  truncated: boolean
  limits: {
    maxDepth: number
    maxNodes: number
    maxEdgesPerNode: number
    minValueEth: number
  }
  generatedAt: string
}

export interface GraphCrawlOptions {
  maxDepth?: number
  maxNodes?: number
  maxEdgesPerNode?: number
  minValueEth?: number
}
