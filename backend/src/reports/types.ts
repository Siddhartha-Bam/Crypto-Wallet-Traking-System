import type { FlowPath } from '../fundflow/paths.js'
import type { RiskIndicator } from '../risk/rules.js'
import type { GraphEdge, GraphNode } from '../graph/types.js'

export interface InvestigationBundleData {
  investigation: {
    id: string
    caseId: string | null
    chain: string
    suspectAddress: string
    mode: 'live' | 'demo'
    status: string
    incidentType: string | null
    victimAmount: string | null
    victimCurrency: string | null
    riskScore: number | null
    riskBand: string | null
    createdAt: Date | string
    completedAt: Date | null
    summary: {
      provenance: string
      onChainSource: string
      attributionSource?: string
      balanceNative: string
      balanceSymbol: string
      walletStats: Record<string, unknown>
    } | null
  }
  indicators: RiskIndicator[]
  graph: { nodes: GraphNode[]; edges: GraphEdge[] } | null
  flowPaths: FlowPath[]
}
