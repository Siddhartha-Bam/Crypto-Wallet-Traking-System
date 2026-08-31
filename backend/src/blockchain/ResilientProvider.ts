import { AppError } from '../middleware/errors.js'
import type { Balance, BlockchainProvider, TokenTransfer, Transaction } from './types.js'

type CallableKeys = {
  [K in keyof BlockchainProvider]: BlockchainProvider[K] extends (...args: never[]) => unknown ? K : never
}[keyof BlockchainProvider]

const FALLBACK_STATUSES = new Set([429, 502, 503])

/**
 * Delegates to the primary provider; on provider-side failures falls back
 * per-method where a secondary source can answer (e.g. balance via RPC).
 * The primary error is surfaced when fallback also fails or cannot help.
 */
export class ResilientBlockchainProvider implements BlockchainProvider {
  readonly name: string

  constructor(
    private readonly primary: BlockchainProvider,
    private readonly fallback?: BlockchainProvider,
  ) {
    // Field initializers run before constructor bodies (ES2022),
    // so `name` must be derived here, not at the declaration site.
    this.name = fallback ? `${primary.name}+${fallback.name}` : primary.name
  }

  getBalance(address: string): Promise<Balance> {
    return this.withFallback('getBalance', [address])
  }

  getTransactions(address: string, max?: number): Promise<Transaction[]> {
    return this.withFallback('getTransactions', [address, max])
  }

  getTokenTransfers(address: string, max?: number): Promise<TokenTransfer[]> {
    return this.withFallback('getTokenTransfers', [address, max])
  }

  getBlockTimestamp(block: number): Promise<Date> {
    return this.withFallback('getBlockTimestamp', [block])
  }

  private async withFallback<M extends CallableKeys>(
    method: M,
    args: Parameters<BlockchainProvider[M]>,
  ): Promise<Awaited<ReturnType<BlockchainProvider[M]>>> {
    type Result = Awaited<ReturnType<BlockchainProvider[M]>>
    const invoke = (target: BlockchainProvider): Promise<Result> =>
      (target[method] as (...a: unknown[]) => Promise<Result>)(...args)

    try {
      return await invoke(this.primary)
    } catch (primaryError) {
      if (
        !this.fallback ||
        !(primaryError instanceof AppError) ||
        !FALLBACK_STATUSES.has(primaryError.status)
      ) {
        throw primaryError
      }
      try {
        return await invoke(this.fallback)
      } catch {
        throw primaryError
      }
    }
  }
}
