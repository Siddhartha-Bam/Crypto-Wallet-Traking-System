import { env } from '../config/env.js'
import type { Balance, BlockchainProvider, TokenTransfer, Transaction } from './types.js'
import { formatUnits } from './units.js'
import { TtlCache } from '../cache/cache.js'
import { Throttle } from '../cache/throttle.js'
import { AppError } from '../middleware/errors.js'
import { getChain } from './chains.js'
import { toChecksumAddress } from './address.js'

interface EtherscanEnvelope<T> {
  status?: string
  message?: string
  result: T
}

interface EtherscanNormalTxRow {
  hash: string
  from: string
  to: string | null
  value: string
  timeStamp: string
  blockNumber: string
  gasUsed: string
  gasPrice: string
  isError?: string
  input: string
  nonce?: string
}

interface EtherscanTokenTxRow {
  hash: string
  from: string
  to: string
  contractAddress: string
  tokenSymbol: string
  tokenDecimal: string
  value: string
  timeStamp: string
  blockNumber: string
  log_index?: string
}

interface EtherscanProxyBlock {
  timestamp: string
}

const PERMANENT = Number.MAX_SAFE_INTEGER

export class EtherscanProvider implements BlockchainProvider {
  readonly name = 'etherscan_v2'

  private readonly chainId: number
  private readonly symbol: string
  private readonly decimals: number
  private readonly throttle = new Throttle(env.ETHERSCAN_MIN_INTERVAL_MS)
  private readonly balanceCache = new TtlCache<Balance>(15_000)
  private readonly txCache = new TtlCache<Transaction[]>(60_000)
  private readonly tokenCache = new TtlCache<TokenTransfer[]>(60_000)
  private readonly blockTsCache = new TtlCache<Date>(PERMANENT)

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
    chainSlug: string,
  ) {
    const chain = getChain(chainSlug)
    this.chainId = chain.etherscanChainId
    this.symbol = chain.nativeSymbol
    this.decimals = chain.nativeDecimals
  }

  private async request<T>(params: Record<string, string>): Promise<T> {
    return this.throttle.schedule(async () => {
      const url = new URL(this.baseUrl)
      for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
      url.searchParams.set('chainid', String(this.chainId))
      url.searchParams.set('apikey', this.apiKey)

      let res: Response
      try {
        res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
      } catch (cause) {
        throw new AppError(503, 'PROVIDER_UNAVAILABLE', `Etherscan request failed: ${(cause as Error).message}`)
      }
      if (res.status === 429) {
        throw new AppError(429, 'PROVIDER_RATE_LIMITED', 'Etherscan rate limit reached')
      }
      if (!res.ok) {
        throw new AppError(502, 'PROVIDER_HTTP_ERROR', `Etherscan returned HTTP ${res.status}`)
      }

      const body = (await res.json()) as EtherscanEnvelope<T>
      if (body.message === 'NOTOK') {
        const detail = typeof body.result === 'string' ? body.result : 'Unknown Etherscan error'
        if (/rate|limit|max calls/i.test(detail)) {
          throw new AppError(429, 'PROVIDER_RATE_LIMITED', detail)
        }
        if (/no transactions found/i.test(detail)) {
          return [] as unknown as T
        }
        throw new AppError(502, 'PROVIDER_ERROR', `Etherscan error: ${detail}`)
      }
      return body.result as T
    })
  }

  async getBalance(address: string): Promise<Balance> {
    const key = `${this.chainId}:${address}`
    return this.balanceCache.wrap(key, async () => {
      const result = await this.request<string>({
        module: 'account',
        action: 'balance',
        address,
        tag: 'latest',
      })
      if (typeof result !== 'string' || !/^\d+$/.test(result)) {
        throw new AppError(502, 'PROVIDER_ERROR', 'Unexpected balance payload from Etherscan')
      }
      return { address, chain: 'ethereum', wei: result, symbol: this.symbol, decimals: this.decimals }
    })
  }

  async getTransactions(address: string, max: number = env.WALLET_TX_WINDOW): Promise<Transaction[]> {
    const key = `${this.chainId}:${address}:${max}`
    return this.txCache.wrap(key, async () => {
      const rows = await this.request<EtherscanNormalTxRow[]>({
        module: 'account',
        action: 'txlist',
        address,
        startblock: '0',
        endblock: '99999999',
        page: '1',
        offset: String(Math.min(max, 10_000)),
        sort: 'desc',
      })
      return rows.map((row) => this.mapTransaction(row, address))
    })
  }

  async getTokenTransfers(address: string, max: number = env.WALLET_TX_WINDOW): Promise<TokenTransfer[]> {
    const key = `${this.chainId}:tokentx:${address}:${max}`
    return this.tokenCache.wrap(key, async () => {
      const rows = await this.request<EtherscanTokenTxRow[]>({
        module: 'account',
        action: 'tokentx',
        address,
        startblock: '0',
        endblock: '99999999',
        page: '1',
        offset: String(Math.min(max, 10_000)),
        sort: 'desc',
      })
      return rows.map((row) => this.mapTokenTransfer(row, address))
    })
  }

  async getBlockTimestamp(block: number): Promise<Date> {
    return this.blockTsCache.wrap(`block:${this.chainId}:${block}`, async () => {
      const result = await this.request<EtherscanProxyBlock>({
        module: 'proxy',
        action: 'eth_getBlockByNumber',
        tag: `0x${block.toString(16)}`,
        boolean: 'false',
      })
      const seconds = Number.parseInt(BigInt(result.timestamp).toString(10), 10)
      return new Date(seconds * 1000)
    })
  }

  private mapTransaction(row: EtherscanNormalTxRow, _queryAddress: string): Transaction {
    const gasUsedWei = row.gasUsed
    const gasPriceWei = row.gasPrice
    return {
      hash: row.hash,
      from: toChecksumAddress(row.from),
      to: row.to ? toChecksumAddress(row.to) : null,
      valueWei: row.value,
      timestamp: new Date(Number.parseInt(row.timeStamp, 10) * 1000),
      blockNumber: Number.parseInt(row.blockNumber, 10),
      gasUsedWei,
      gasPriceWei,
      feeWei: (BigInt(gasUsedWei) * BigInt(gasPriceWei || '0')).toString(),
      isError: row.isError === '1',
      input: row.input ?? '0x',
      nonce: row.nonce != null ? Number.parseInt(row.nonce, 10) : null,
    }
  }

  private mapTokenTransfer(row: EtherscanTokenTxRow, _queryAddress: string): TokenTransfer {
    const decimals = Number.parseInt(row.tokenDecimal ?? '0', 10) || 0
    return {
      txHash: row.hash,
      logIndex: row.log_index ? Number.parseInt(row.log_index, 10) : 0,
      from: toChecksumAddress(row.from),
      to: toChecksumAddress(row.to),
      contractAddress: toChecksumAddress(row.contractAddress),
      tokenSymbol: row.tokenSymbol || 'TOKEN',
      tokenDecimals: decimals,
      amountRaw: row.value,
      amount: formatUnits(row.value, decimals),
      timestamp: new Date(Number.parseInt(row.timeStamp, 10) * 1000),
      blockNumber: Number.parseInt(row.blockNumber, 10),
    }
  }
}
