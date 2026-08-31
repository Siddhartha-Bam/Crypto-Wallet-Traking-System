import type { ApiErrorBody } from '../types/api'

const USE_MOCK = import.meta.env.VITE_USE_MOCK_DATA !== 'false'
const BASE: string = import.meta.env.VITE_API_URL ?? '/api'

export class ApiRequestError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
    this.code = code
  }
}

async function parseError(res: Response): Promise<never> {
  const body = (await res.json().catch(() => null)) as ApiErrorBody | null
  throw new ApiRequestError(
    res.status,
    body?.error?.code ?? 'REQUEST_FAILED',
    body?.error?.message ?? `Request failed (${res.status})`,
  )
}

let mockApi: typeof import('../services/mockApi') | null = null

async function getMockApi() {
  if (!mockApi) {
    mockApi = await import('../services/mockApi')
  }
  return mockApi
}

export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  if (USE_MOCK) {
    const mock = await getMockApi()
    
    if (path === '/stats') {
      return mock.mockGetStats() as Promise<T>
    }
    
    if (path.startsWith('/investigations/') && !path.includes('/report') && !path.includes('/transactions')) {
      const id = path.split('/investigations/')[1]
      return mock.mockGetInvestigation(id) as Promise<T>
    }
    
    if (path.startsWith('/wallet/') && path.includes('/transactions')) {
      const match = path.match(/\/wallet\/([^/]+)\/([^/]+)\/transactions\?type=(normal|token)&page=(\d+)&pageSize=(\d+)/)
      if (match) {
        const [, chain, address, type, page, pageSize] = match
        return mock.mockGetTransactions(chain, address, type as 'normal' | 'token', parseInt(page), parseInt(pageSize)) as Promise<T>
      }
    }

    if (path === '/investigations') {
      return mock.mockGetInvestigationsList(1, 10) as Promise<T>
    }
  }

  const res = await fetch(`${BASE}${path}`, { headers: { Accept: 'application/json' }, signal })
  if (!res.ok) await parseError(res)
  return (await res.json()) as T
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  if (USE_MOCK && path === '/investigations') {
    const mock = await getMockApi()
    const params = body as {
      address: string
      chain: string
      mode: 'live' | 'demo'
      caseId?: string
      victimAmount?: string
      victimCurrency?: 'INR' | 'USD'
      incidentType?: string
      depth: number
    }
    return mock.mockCreateInvestigation(params) as Promise<T>
  }

  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) await parseError(res)
  return (await res.json()) as T
}