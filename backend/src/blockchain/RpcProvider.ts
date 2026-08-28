import { AppError } from '../middleware/errors.js'
import type { Balance, BlockchainProvider, TokenTransfer, Transaction } from './types.js'
import { getChain } from './chains.js'

/**
 * Raw JSON-RPC fallback. Public endpoints can serve balances and block data
 * but cannot index address history — history methods are explicitly unsupported.
 */
export class RpcProvider implements BlockchainProvider {
  readonly name: string

  private readonly rpcUrl: string
  private readonly symbol: string
  private readonly decimals: number
  private nextId = 1

  constructor(
    rpcUrl: string,
    chainSlug: string,
  ) {
    this.rpcUrl = rpcUrl
    const chain = getChain(chainSlug)
    this.symbol = chain.nativeSymbol
    this.decimals = chain.nativeDecimals
    this.name = `rpc:${new URL(rpcUrl).host}`
  }

  private async call<T>(method: string, params: unknown[]): Promise<T> {
    let res: Response
    try {
      res = await fetch(this.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: this.nextId++, method, params }),
        signal: AbortSignal.timeout(12_000),
      })
    } catch (cause) {
      throw new AppError(503, 'PROVIDER_UNAVAILABLE', `RPC request failed: ${(cause as Error).message}`)
    }
    if (!res.ok) {
      throw new AppError(502, 'PROVIDER_HTTP_ERROR', `RPC returned HTTP ${res.status}`)
    }
    const body = (await res.json()) as { result?: T; error?: { message?: string } }
    if (body.error) {
      throw new AppError(502, 'PROVIDER_ERROR', `RPC error: ${body.error.message ?? 'unknown'}`)
    }
    if (body.result === undefined) {
      throw new AppError(502, 'PROVIDER_ERROR', 'RPC response missing result')
    }
    return body.result
  }

  async getBalance(address: string): Promise<Balance> {
    const weiHex = await this.call<string>('eth_getBalance', [address.toLowerCase(), 'latest'])
    return {
      address,
      chain: 'ethereum',
      wei: BigInt(weiHex).toString(),
      symbol: this.symbol,
      decimals: this.decimals,
    }
  }

  getTransactions(): Promise<Transaction[]> {
    throw new AppError(501, 'PROVIDER_UNSUPPORTED', 'Address history is not available over raw RPC')
  }

  getTokenTransfers(): Promise<TokenTransfer[]> {
    throw new AppError(501, 'PROVIDER_UNSUPPORTED', 'Token transfers are not available over raw RPC')
  }

  async getBlockTimestamp(block: number): Promise<Date> {
    const result = await this.call<{ timestamp: string }>('eth_getBlockByNumber', [
      `0x${block.toString(16)}`,
      false,
    ])
    return new Date(Number(BigInt(result.timestamp)) * 1000)
  }
}
