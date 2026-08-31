export interface RecentInvestigation {
  id: string
  caseId: string | null
  chain: string
  suspectAddress: string
  mode: 'live' | 'demo'
  status: 'pending' | 'running' | 'completed' | 'failed' | string
  riskScore: number | null
  riskBand: 'low' | 'medium' | 'high' | 'critical' | null | string
  createdAt: string
}

export interface DashboardStats {
  totals: {
    investigations: number
    active: number
    highRiskWallets: number
  }
  chainDistribution: { chain: string; count: number }[]
  recentInvestigations: RecentInvestigation[]
}

export type Provenance = 'on_chain' | 'attribution' | 'inference' | 'demo'

export interface SourceMeta {
  provenance: Provenance
  source: string
  chain: string
  retrievedAt: string
}

export interface WalletStats {
  txCountAnalyzed: number
  firstSeenAt: string | null
  lastActivityAt: string | null
  incomingVolumeNative: string
  outgoingVolumeNative: string
  failedTxCount: number
  counterpartyCount: number
}

export interface GraphNode {
  id: string
  address: string
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

export interface GraphEdgeData {
  id: string
  source: string
  target: string
  direction: 'in' | 'out' | 'internal'
  asset: string
  assetContract?: string
  transactionCount: number
  totalValue: string
  firstSeen: string
  lastSeen: string
  sampleTxHashes: string[]
}

export interface GraphResult {
  suspectAddress: string
  chain: string
  nodes: GraphNode[]
  edges: GraphEdgeData[]
  attributedEntities: {
    address: string
    entityName: string
    entityType: string
    confidence: string
    source: string
    lastVerified: string
  }[]
  truncated: boolean
  limits: { maxDepth: number; maxNodes: number; maxEdgesPerNode: number; minValueEth: number }
  generatedAt: string
}

export interface RiskIndicator {
  rule: string
  severity: 'info' | 'low' | 'medium' | 'high'
  score: number
  evidence: string
  transactions: string[]
}

export interface FlowHop {
  from: string
  to: string
  asset: string
  totalValue: string
  transactionCount: number
  sampleTxHash: string
  firstSeen: string
  lastSeen: string
}

export interface FlowPath {
  hops: FlowHop[]
  endpointAddress: string
  endpointEntityName?: string
  endpointEntityType?: string
  endpointConfidence?: string
  intermediaryCount: number
}

export interface InvestigationBundle {
  id: string
  caseId: string | null
  chain: string
  suspectAddress: string
  mode: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  incidentType: string | null
  victimAmount: string | null
  victimCurrency: string | null
  riskScore: number | null
  riskBand: string | null
  summary: {
    provenance: Provenance
    onChainSource: string
    attributionSource: string
    balanceNative: string
    balanceSymbol: string
    walletStats: WalletStats
    limits?: { maxDepth: number; maxNodes: number; maxEdgesPerNode: number; minValueEth: number }
    truncated?: boolean
    error?: string
  } | null
  createdAt: string
  completedAt: string | null
  indicators: RiskIndicator[]
  graphSnapshot: { nodes: GraphNode[]; edges: GraphEdgeData[]; depth: number } | null
  flowPaths: FlowPath[]
}

export interface CreateInvestigationResponse {
  id: string
  statusUrl: string
}

export interface TransactionRow {
  hash: string
  from: string | null
  to: string | null
  valueWei: string
  timestamp: string
  blockNumber: number
  feeWei: string
  isError: boolean
}

export interface TokenTransferRow {
  txHash: string
  from: string
  to: string
  contractAddress: string
  tokenSymbol: string
  amount: string
  timestamp: string
  blockNumber: number
}

export interface TransactionsResponse<T> {
  meta: SourceMeta & { window?: { analyzed?: number; truncated?: boolean } }
  address: string
  assetType: 'normal' | 'token'
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number }
  items: T[]
}

export interface ApiErrorBody {
  error?: {
    code?: string
    message?: string
    details?: unknown
  }
}
