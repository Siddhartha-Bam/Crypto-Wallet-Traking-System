import type {
  DashboardStats,
  RecentInvestigation,
  InvestigationBundle,
  GraphNode,
  GraphEdgeData,
  RiskIndicator,
  FlowPath,
  WalletStats,
  TransactionsResponse,
  TransactionRow,
  TokenTransferRow,
  SourceMeta,
} from '../types/api'

const SUSPECT_ADDRESS = '0x742d35Cc6634C0532925a3b8D40d6b5c5F5dE8c1'
const VICTIM_ADDRESSES = [
  '0x1111111111111111111111111111111111111111',
  '0x2222222222222222222222222222222222222222',
  '0x3333333333333333333333333333333333333333',
  '0x4444444444444444444444444444444444444444',
  '0x5555555555555555555555555555555555555555',
  '0x6666666666666666666666666666666666666666',
  '0x7777777777777777777777777777777777777777',
  '0x8888888888888888888888888888888888888888',
  '0x9999999999999999999999999999999999999999',
  '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  '0xcccccccccccccccccccccccccccccccccccccccc',
  '0xdddddddddddddddddddddddddddddddddddddddd',
  '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  '0xffffffffffffffffffffffffffffffffffffffff',
  '0x1234567890123456789012345678901234567890',
]
const BURNER_A = '0x8ba1f109551bD432803012645Hac136c772c3c4d'
const BURNER_B = '0x9ca2f209551bD432803012645Hac136c772c3c4e'
const DEMO_EXCHANGE = '0x0dE7e0058E3F94F80c8C2d8b3a1C2e8f8e9A0b1C'
const DEMO_MIXER = '0x1eF8f1169F4aA5G91d9D3e9c4B2D3f9f9F0b1C2D'
const DEMO_BRIDGE = '0x2fA9a227aG5bB6H02e0E4f0D5C3E4a0a1B2C3D4E'

const DEMO_HASHES = [
  '0xdemohash-001a2b3c4d5e6f7890abcdef1234567890abcdef',
  '0xdemohash-112b3c4d5e6f7890abcdef1234567890abcdef12',
  '0xdemohash-223c4d5e6f7890abcdef1234567890abcdef1234',
  '0xdemohash-334d5e6f7890abcdef1234567890abcdef123456',
  '0xdemohash-445e6f7890abcdef1234567890abcdef12345678',
  '0xdemohash-556f7890abcdef1234567890abcdef1234567890',
  '0xdemohash-667890abcdef1234567890abcdef1234567890ab',
  '0xdemohash-77890abcdef1234567890abcdef1234567890abc',
  '0xdemohash-8890abcdef1234567890abcdef1234567890abcd',
  '0xdemohash-990abcdef1234567890abcdef1234567890abcde',
]

const BASE_TIME = '2024-01-15T10:00:00.000Z'

export const mockWalletStats: WalletStats = {
  txCountAnalyzed: 42,
  firstSeenAt: '2023-11-20T14:30:00.000Z',
  lastActivityAt: '2024-01-15T10:45:00.000Z',
  incomingVolumeNative: '24.5000',
  outgoingVolumeNative: '23.8000',
  failedTxCount: 3,
  counterpartyCount: 28,
}

export const mockGraphNodes: GraphNode[] = [
  {
    id: SUSPECT_ADDRESS.toLowerCase(),
    address: SUSPECT_ADDRESS,
    chain: 'ethereum',
    role: 'suspect',
    depth: 0,
    txCountAnalyzed: 42,
    balanceNative: '0.7000',
    balanceSymbol: 'ETH',
  },
  {
    id: BURNER_A.toLowerCase(),
    address: BURNER_A,
    chain: 'ethereum',
    role: 'intermediary',
    depth: 1,
    txCountAnalyzed: 12,
    balanceNative: '0.2000',
    balanceSymbol: 'ETH',
  },
  {
    id: BURNER_B.toLowerCase(),
    address: BURNER_B,
    chain: 'ethereum',
    role: 'intermediary',
    depth: 2,
    txCountAnalyzed: 8,
    balanceNative: '0.1500',
    balanceSymbol: 'ETH',
  },
  {
    id: DEMO_EXCHANGE.toLowerCase(),
    address: DEMO_EXCHANGE,
    chain: 'ethereum',
    role: 'attributed_entity',
    depth: 3,
    txCountAnalyzed: 156,
    balanceNative: '12450.0000',
    balanceSymbol: 'ETH',
    entityName: 'DemoExchange X',
    entityType: 'exchange',
    attributionConfidence: 'HIGH',
    attributionSource: 'Etherscan label · verified 2024-01-10',
  },
  {
    id: DEMO_MIXER.toLowerCase(),
    address: DEMO_MIXER,
    chain: 'ethereum',
    role: 'attributed_entity',
    depth: 2,
    txCountAnalyzed: 89,
    balanceNative: '45.2000',
    balanceSymbol: 'ETH',
    entityName: 'DemoMixer M',
    entityType: 'mixer',
    attributionConfidence: 'HIGH',
    attributionSource: 'Etherscan label · verified 2024-01-10',
  },
  {
    id: DEMO_BRIDGE.toLowerCase(),
    address: DEMO_BRIDGE,
    chain: 'ethereum',
    role: 'attributed_entity',
    depth: 2,
    txCountAnalyzed: 234,
    balanceNative: '320.5000',
    balanceSymbol: 'ETH',
    entityName: 'DemoBridge B',
    entityType: 'bridge',
    attributionConfidence: 'MEDIUM',
    attributionSource: 'Etherscan label · verified 2024-01-10',
  },
  ...VICTIM_ADDRESSES.map((addr) => ({
    id: addr.toLowerCase(),
    address: addr,
    chain: 'ethereum',
    role: 'intermediary' as const,
    depth: 0,
    txCountAnalyzed: 1,
    balanceNative: '0.0000',
    balanceSymbol: 'ETH',
  })),
]

export const mockGraphEdges: GraphEdgeData[] = [
  ...VICTIM_ADDRESSES.map((addr, i) => ({
    id: `edge-victim-${i}`,
    source: addr.toLowerCase(),
    target: SUSPECT_ADDRESS.toLowerCase(),
    direction: 'in' as const,
    asset: 'ETH',
    transactionCount: 1,
    totalValue: '0.5000',
    firstSeen: '2024-01-15T10:00:00.000Z',
    lastSeen: '2024-01-15T10:00:00.000Z',
    sampleTxHashes: [DEMO_HASHES[i % DEMO_HASHES.length]],
  })),
  {
    id: 'edge-suspect-burnerA',
    source: SUSPECT_ADDRESS.toLowerCase(),
    target: BURNER_A.toLowerCase(),
    direction: 'out',
    asset: 'ETH',
    transactionCount: 3,
    totalValue: '8.0000',
    firstSeen: '2024-01-15T10:05:00.000Z',
    lastSeen: '2024-01-15T10:15:00.000Z',
    sampleTxHashes: [DEMO_HASHES[0], DEMO_HASHES[1], DEMO_HASHES[2]],
  },
  {
    id: 'edge-burnerA-burnerB',
    source: BURNER_A.toLowerCase(),
    target: BURNER_B.toLowerCase(),
    direction: 'out',
    asset: 'ETH',
    transactionCount: 2,
    totalValue: '7.6000',
    firstSeen: '2024-01-15T10:20:00.000Z',
    lastSeen: '2024-01-15T10:30:00.000Z',
    sampleTxHashes: [DEMO_HASHES[3], DEMO_HASHES[4]],
  },
  {
    id: 'edge-burnerB-exchange',
    source: BURNER_B.toLowerCase(),
    target: DEMO_EXCHANGE.toLowerCase(),
    direction: 'out',
    asset: 'ETH',
    transactionCount: 1,
    totalValue: '7.4000',
    firstSeen: '2024-01-15T10:35:00.000Z',
    lastSeen: '2024-01-15T10:35:00.000Z',
    sampleTxHashes: [DEMO_HASHES[5]],
  },
  {
    id: 'edge-burnerA-mixer',
    source: BURNER_A.toLowerCase(),
    target: DEMO_MIXER.toLowerCase(),
    direction: 'out',
    asset: 'ETH',
    transactionCount: 1,
    totalValue: '1.0000',
    firstSeen: '2024-01-15T10:18:00.000Z',
    lastSeen: '2024-01-15T10:18:00.000Z',
    sampleTxHashes: [DEMO_HASHES[6]],
  },
  {
    id: 'edge-burnerA-bridge',
    source: BURNER_A.toLowerCase(),
    target: DEMO_BRIDGE.toLowerCase(),
    direction: 'out',
    asset: 'ETH',
    transactionCount: 1,
    totalValue: '0.4000',
    firstSeen: '2024-01-15T10:22:00.000Z',
    lastSeen: '2024-01-15T10:22:00.000Z',
    sampleTxHashes: [DEMO_HASHES[7]],
  },
]

const peelChainAddresses = Array.from({ length: 6 }, (_, i) => 
  `0xpeel${String(i).padStart(2, '0')}0000000000000000000000000000000000`
)
const fanOutAddresses = Array.from({ length: 12 }, (_, i) => 
  `0xfanout${String(i).padStart(2, '0')}0000000000000000000000000000000000`
)

peelChainAddresses.forEach((addr, i) => {
  mockGraphNodes.push({
    id: addr.toLowerCase(),
    address: addr,
    chain: 'ethereum',
    role: 'intermediary',
    depth: 2 + i,
    txCountAnalyzed: 1,
    balanceNative: '0.0500',
    balanceSymbol: 'ETH',
  })
  mockGraphEdges.push({
    id: `edge-peel-${i}`,
    source: i === 0 ? BURNER_A.toLowerCase() : peelChainAddresses[i - 1].toLowerCase(),
    target: addr.toLowerCase(),
    direction: 'out',
    asset: 'ETH',
    transactionCount: 1,
    totalValue: (0.8 - i * 0.1).toFixed(4),
    firstSeen: new Date(Date.parse(BASE_TIME) + (25 + i * 5) * 60000).toISOString(),
    lastSeen: new Date(Date.parse(BASE_TIME) + (25 + i * 5) * 60000).toISOString(),
    sampleTxHashes: [DEMO_HASHES[(8 + i) % DEMO_HASHES.length]],
  })
})

fanOutAddresses.forEach((addr, i) => {
  mockGraphNodes.push({
    id: addr.toLowerCase(),
    address: addr,
    chain: 'ethereum',
    role: 'intermediary',
    depth: 2,
    txCountAnalyzed: 1,
    balanceNative: '0.0200',
    balanceSymbol: 'ETH',
  })
  mockGraphEdges.push({
    id: `edge-fanout-${i}`,
    source: BURNER_A.toLowerCase(),
    target: addr.toLowerCase(),
    direction: 'out',
    asset: 'ETH',
    transactionCount: 1,
    totalValue: '0.0500',
    firstSeen: new Date(Date.parse(BASE_TIME) + (30 + i * 2) * 60000).toISOString(),
    lastSeen: new Date(Date.parse(BASE_TIME) + (30 + i * 2) * 60000).toISOString(),
    sampleTxHashes: [DEMO_HASHES[(14 + i) % DEMO_HASHES.length]],
  })
})

export const mockRiskIndicators: RiskIndicator[] = [
  {
    rule: 'rapid_movement',
    severity: 'high',
    score: 18,
    evidence: '8.0 ETH moved from suspect to Burner A within 10 minutes, then forwarded to Burner B within 15 minutes, and to DemoExchange X within 5 minutes. Total path traversal: 30 minutes for 3 hops.',
    transactions: [DEMO_HASHES[0], DEMO_HASHES[3], DEMO_HASHES[5]],
  },
  {
    rule: 'high_volume_pass_through',
    severity: 'high',
    score: 15,
    evidence: 'Burner A received 8.0 ETH and forwarded 9.0 ETH total (7.6 + 1.0 + 0.4) within 17 minutes — pass-through ratio 112%.',
    transactions: [DEMO_HASHES[0], DEMO_HASHES[3], DEMO_HASHES[4], DEMO_HASHES[6], DEMO_HASHES[7]],
  },
  {
    rule: 'fan_out',
    severity: 'medium',
    score: 12,
    evidence: 'Burner A distributed funds to 14 distinct addresses (Burner B, DemoMixer M, DemoBridge B, 6 peel-chain addresses, 12 fan-out addresses) within 30 minutes.',
    transactions: DEMO_HASHES.slice(3, 10),
  },
  {
    rule: 'fan_in',
    severity: 'medium',
    score: 10,
    evidence: 'Suspect wallet received 0.5 ETH from 16 distinct victim addresses within a 2-minute window — coordinated fan-in pattern.',
    transactions: DEMO_HASHES.slice(0, 8),
  },
  {
    rule: 'peel_chain',
    severity: 'high',
    score: 16,
    evidence: '6 sequential peel-chain hops detected from Burner A, each forwarding diminishing amounts (0.8→0.7→0.6→0.5→0.4→0.3 ETH) to newly created addresses.',
    transactions: DEMO_HASHES.slice(8, 14),
  },
  {
    rule: 'layering',
    severity: 'high',
    score: 14,
    evidence: 'Funds split across 3 distinct paths: main flow to exchange (7.4 ETH), mixer (1.0 ETH), bridge (0.4 ETH), plus 18 peel/fan-out micro-transfers — classic layering structure.',
    transactions: DEMO_HASHES,
  },
  {
    rule: 'exchange_exposure',
    severity: 'medium',
    score: 8,
    evidence: 'Terminal hop deposits 7.4 ETH into DemoExchange X (attributed exchange, HIGH confidence). Exchange exposure provides off-ramp for investigation.',
    transactions: [DEMO_HASHES[5]],
  },
  {
    rule: 'mixer_exposure',
    severity: 'high',
    score: 13,
    evidence: '1.0 ETH routed to DemoMixer M (attributed mixer, HIGH confidence). Mixer usage indicates deliberate obfuscation attempt.',
    transactions: [DEMO_HASHES[6]],
  },
  {
    rule: 'cross_chain_exposure',
    severity: 'medium',
    score: 9,
    evidence: '0.4 ETH bridged via DemoBridge B (attributed bridge, MEDIUM confidence). Cross-chain movement complicates tracing.',
    transactions: [DEMO_HASHES[7]],
  },
]

export const mockFlowPaths: FlowPath[] = [
  {
    hops: [
      {
        from: SUSPECT_ADDRESS,
        to: BURNER_A,
        asset: 'ETH',
        totalValue: '8.0000',
        transactionCount: 3,
        sampleTxHash: DEMO_HASHES[0],
        firstSeen: '2024-01-15T10:05:00.000Z',
        lastSeen: '2024-01-15T10:15:00.000Z',
      },
      {
        from: BURNER_A,
        to: BURNER_B,
        asset: 'ETH',
        totalValue: '7.6000',
        transactionCount: 2,
        sampleTxHash: DEMO_HASHES[3],
        firstSeen: '2024-01-15T10:20:00.000Z',
        lastSeen: '2024-01-15T10:30:00.000Z',
      },
      {
        from: BURNER_B,
        to: DEMO_EXCHANGE,
        asset: 'ETH',
        totalValue: '7.4000',
        transactionCount: 1,
        sampleTxHash: DEMO_HASHES[5],
        firstSeen: '2024-01-15T10:35:00.000Z',
        lastSeen: '2024-01-15T10:35:00.000Z',
      },
    ],
    endpointAddress: DEMO_EXCHANGE,
    endpointEntityName: 'DemoExchange X',
    endpointEntityType: 'exchange',
    endpointConfidence: 'HIGH',
    intermediaryCount: 2,
  },
  {
    hops: [
      {
        from: SUSPECT_ADDRESS,
        to: BURNER_A,
        asset: 'ETH',
        totalValue: '8.0000',
        transactionCount: 3,
        sampleTxHash: DEMO_HASHES[0],
        firstSeen: '2024-01-15T10:05:00.000Z',
        lastSeen: '2024-01-15T10:15:00.000Z',
      },
      {
        from: BURNER_A,
        to: DEMO_MIXER,
        asset: 'ETH',
        totalValue: '1.0000',
        transactionCount: 1,
        sampleTxHash: DEMO_HASHES[6],
        firstSeen: '2024-01-15T10:18:00.000Z',
        lastSeen: '2024-01-15T10:18:00.000Z',
      },
    ],
    endpointAddress: DEMO_MIXER,
    endpointEntityName: 'DemoMixer M',
    endpointEntityType: 'mixer',
    endpointConfidence: 'HIGH',
    intermediaryCount: 1,
  },
  {
    hops: [
      {
        from: SUSPECT_ADDRESS,
        to: BURNER_A,
        asset: 'ETH',
        totalValue: '8.0000',
        transactionCount: 3,
        sampleTxHash: DEMO_HASHES[0],
        firstSeen: '2024-01-15T10:05:00.000Z',
        lastSeen: '2024-01-15T10:15:00.000Z',
      },
      {
        from: BURNER_A,
        to: DEMO_BRIDGE,
        asset: 'ETH',
        totalValue: '0.4000',
        transactionCount: 1,
        sampleTxHash: DEMO_HASHES[7],
        firstSeen: '2024-01-15T10:22:00.000Z',
        lastSeen: '2024-01-15T10:22:00.000Z',
      },
    ],
    endpointAddress: DEMO_BRIDGE,
    endpointEntityName: 'DemoBridge B',
    endpointEntityType: 'bridge',
    endpointConfidence: 'MEDIUM',
    intermediaryCount: 1,
  },
]

const riskScore = mockRiskIndicators.reduce((sum, r) => sum + r.score, 0)
const riskBand = riskScore >= 80 ? 'critical' : riskScore >= 60 ? 'high' : riskScore >= 30 ? 'medium' : 'low'

export function createMockInvestigationBundle(id: string, caseId?: string): InvestigationBundle {
  return {
    id,
    caseId: caseId ?? null,
    chain: 'ethereum',
    suspectAddress: SUSPECT_ADDRESS,
    mode: 'demo',
    status: 'completed',
    incidentType: 'investment_scam',
    victimAmount: '840000',
    victimCurrency: 'INR',
    riskScore,
    riskBand,
    summary: {
      provenance: 'demo',
      onChainSource: 'demo_pipeline_v1',
      attributionSource: 'demo_attribution_v1',
      balanceNative: '0.7000',
      balanceSymbol: 'ETH',
      walletStats: mockWalletStats,
      limits: { maxDepth: 3, maxNodes: 60, maxEdgesPerNode: 15, minValueEth: 0.001 },
      truncated: false,
    },
    createdAt: new Date(Date.now() - 5000).toISOString(),
    completedAt: new Date().toISOString(),
    indicators: mockRiskIndicators,
    graphSnapshot: {
      nodes: mockGraphNodes,
      edges: mockGraphEdges,
      depth: 3,
    },
    flowPaths: mockFlowPaths,
  }
}

export const mockRecentInvestigations: RecentInvestigation[] = [
  {
    id: 'inv-001',
    caseId: 'NCRP-2024-001234',
    chain: 'ethereum',
    suspectAddress: SUSPECT_ADDRESS,
    mode: 'demo',
    status: 'completed',
    riskScore,
    riskBand,
    createdAt: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: 'inv-002',
    caseId: 'NCRP-2024-001235',
    chain: 'ethereum',
    suspectAddress: '0x8888888888888888888888888888888888888888',
    mode: 'live',
    status: 'completed',
    riskScore: 45,
    riskBand: 'medium',
    createdAt: new Date(Date.now() - 7200000).toISOString(),
  },
  {
    id: 'inv-003',
    caseId: null,
    chain: 'ethereum',
    suspectAddress: '0x9999999999999999999999999999999999999999',
    mode: 'live',
    status: 'running',
    riskScore: null,
    riskBand: null,
    createdAt: new Date(Date.now() - 10000).toISOString(),
  },
]

export const mockDashboardStats: DashboardStats = {
  totals: {
    investigations: 12,
    active: 1,
    highRiskWallets: 8,
  },
  chainDistribution: [
    { chain: 'ethereum', count: 12 },
  ],
  recentInvestigations: mockRecentInvestigations,
}

function createMockTransactions(address: string, count: number): TransactionRow[] {
  return Array.from({ length: count }, (_, i) => {
    const isOutgoing = i % 3 === 0
    const ethAmount = Math.random() * 2 + 0.1
    const valueWei = Math.floor(ethAmount * 1e18).toString()
    return {
      hash: `0xtx${String(i).padStart(8, '0')}`,
      from: isOutgoing ? address : VICTIM_ADDRESSES[i % VICTIM_ADDRESSES.length],
      to: isOutgoing ? BURNER_A : address,
      valueWei,
      timestamp: new Date(Date.parse(BASE_TIME) + i * 300000).toISOString(),
      blockNumber: 18500000 + i,
      feeWei: '2100000000000000',
      isError: false,
    }
  })
}

function createMockTokenTransfers(address: string, count: number): TokenTransferRow[] {
  return Array.from({ length: count }, (_, i) => {
    const isOutgoing = i % 2 === 0
    return {
      txHash: `0xtokentx${String(i).padStart(8, '0')}`,
      from: isOutgoing ? address : DEMO_EXCHANGE,
      to: isOutgoing ? DEMO_EXCHANGE : address,
      contractAddress: '0xA0b86a33E6441b8c4C8C8C8C8C8C8C8C8C8C8C8C8',
      tokenSymbol: 'USDC',
      amount: (Math.random() * 1000 + 100).toFixed(6),
      timestamp: new Date(Date.parse(BASE_TIME) + i * 600000).toISOString(),
      blockNumber: 18500000 + i * 2,
    }
  })
}

export function createMockTransactionsResponse<T extends TransactionRow | TokenTransferRow>(
  address: string,
  assetType: 'normal' | 'token',
  page: number,
  pageSize: number
): TransactionsResponse<T> {
  const totalItems = assetType === 'normal' ? 42 : 15
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const start = (page - 1) * pageSize
  const items = assetType === 'normal'
    ? createMockTransactions(address, totalItems)
    : createMockTokenTransfers(address, totalItems)

  const meta: SourceMeta & { window?: { analyzed?: number; truncated?: boolean } } = {
    provenance: 'demo',
    source: 'demo_pipeline_v1',
    chain: 'ethereum',
    retrievedAt: new Date().toISOString(),
    window: { analyzed: totalItems, truncated: false },
  }

  return {
    meta,
    address,
    assetType,
    pagination: { page, pageSize, totalItems, totalPages },
    items: items.slice(start, start + pageSize) as T[],
  }
}