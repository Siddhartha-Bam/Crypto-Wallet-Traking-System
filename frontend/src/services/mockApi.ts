import type {
  DashboardStats,
  InvestigationBundle,
  CreateInvestigationResponse,
  TransactionsResponse,
  TransactionRow,
  TokenTransferRow,
} from '../types/api'
import {
  mockDashboardStats,
  createMockInvestigationBundle,
  createMockTransactionsResponse,
  mockRecentInvestigations,
} from '../data/mockData'

const INVESTIGATION_STAGES = ['pending', 'running', 'completed'] as const
const STAGE_DELAYS = [1000, 2000, 1500]

const investigationStore = new Map<string, {
  bundle: InvestigationBundle
  stageIndex: number
  timerId?: ReturnType<typeof setTimeout>
}>()

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function generateId(): string {
  return `inv-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function advanceStage(id: string): void {
  const record = investigationStore.get(id)
  if (!record || record.stageIndex >= INVESTIGATION_STAGES.length - 1) return

  const nextIndex = record.stageIndex + 1
  const nextStage = INVESTIGATION_STAGES[nextIndex]
  const nextDelay = STAGE_DELAYS[nextIndex]

  record.stageIndex = nextIndex
  record.bundle = {
    ...record.bundle,
    status: nextStage,
    completedAt: nextStage === 'completed' ? new Date().toISOString() : record.bundle.completedAt,
  }

  if (nextStage !== 'completed') {
    record.timerId = setTimeout(() => advanceStage(id), nextDelay)
  }
}

export async function mockGetStats(): Promise<DashboardStats> {
  await delay(300)
  return mockDashboardStats
}

export async function mockCreateInvestigation(params: {
  address: string
  chain: string
  mode: 'live' | 'demo'
  caseId?: string
  victimAmount?: string
  victimCurrency?: 'INR' | 'USD'
  incidentType?: string
  depth: number
}): Promise<CreateInvestigationResponse> {
  await delay(500)

  const id = generateId()
  const bundle = createMockInvestigationBundle(id, params.caseId)

  bundle.suspectAddress = params.address
  bundle.chain = params.chain
  bundle.mode = params.mode
  bundle.incidentType = params.incidentType ?? null
  bundle.victimAmount = params.victimAmount ?? null
  bundle.victimCurrency = params.victimCurrency ?? 'INR'
  bundle.status = 'pending'
  bundle.completedAt = null

  if (params.mode === 'live') {
    bundle.mode = 'live'
    bundle.summary = {
      ...bundle.summary!,
      provenance: 'on_chain',
      onChainSource: 'Etherscan V2',
      attributionSource: 'SeededAttributionProvider',
    }
    bundle.indicators = bundle.indicators.map(i => ({
      ...i,
      evidence: i.evidence.replace('demo', 'live').replace('Demo', ''),
    }))
  }

  investigationStore.set(id, {
    bundle: { ...bundle, status: 'pending' },
    stageIndex: 0,
  })

  setTimeout(() => advanceStage(id), STAGE_DELAYS[0])

  return { id, statusUrl: `/api/investigations/${id}` }
}

export async function mockGetInvestigation(id: string): Promise<InvestigationBundle> {
  await delay(200)

  const record = investigationStore.get(id)
  if (record) {
    return record.bundle
  }

  const bundle = createMockInvestigationBundle(id)
  bundle.status = 'completed'
  return bundle
}

export async function mockGetTransactions(
  _chain: string,
  address: string,
  type: 'normal' | 'token',
  page: number,
  pageSize: number
): Promise<TransactionsResponse<TransactionRow | TokenTransferRow>> {
  await delay(400)
  return createMockTransactionsResponse(address, type, page, pageSize)
}

export async function mockGetInvestigationsList(page: number, pageSize: number): Promise<{
  items: typeof mockRecentInvestigations
  total: number
  page: number
  pageSize: number
}> {
  await delay(200)
  const start = (page - 1) * pageSize
  return {
    items: mockRecentInvestigations.slice(start, start + pageSize),
    total: mockRecentInvestigations.length,
    page,
    pageSize,
  }
}

export function clearInvestigationStore(): void {
  investigationStore.forEach(record => {
    if (record.timerId) clearTimeout(record.timerId)
  })
  investigationStore.clear()
}