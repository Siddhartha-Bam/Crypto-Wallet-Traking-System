import type { ApiErrorBody } from '../types/api'

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

export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: { Accept: 'application/json' }, signal })
  if (!res.ok) await parseError(res)
  return (await res.json()) as T
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) await parseError(res)
  return (await res.json()) as T
}
