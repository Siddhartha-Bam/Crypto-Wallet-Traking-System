/**
 * Normalized blockchain domain types.
 *
 * Every provider implementation maps raw vendor payloads into these types.
 * Values that must not lose precision (wei, token base units) are decimal strings.
 */

export type TransferDirection = 'in' | 'out' | 'self'

export interface Balance {
  address: string
  chain: string
  /** Native currency balance in wei (decimal string). */
  wei: string
  symbol: string
  decimals: number
}

export interface Transaction {
  hash: string
  from: string
  to: string | null
  valueWei: string
  timestamp: Date
  blockNumber: number
  gasUsedWei: string
  gasPriceWei: string | null
  feeWei: string
  isError: boolean
  input: string
  nonce: number | null
}

export interface TokenTransfer {
  txHash: string
  logIndex: number
  from: string
  to: string
  contractAddress: string
  tokenSymbol: string
  tokenDecimals: number
  amountRaw: string
  amount: string
  timestamp: Date
  blockNumber: number
}

/** Envelope proving where a fact came from and when it was retrieved. */
export type Provenance = 'on_chain'

export interface SourceMeta {
  provenance: Provenance
  source: string
  chain: string
  retrievedAt: string
  window?: {
    requestedMax?: number
    analyzed?: number
    truncated?: boolean
  }
}

export interface BlockchainProvider {
  readonly name: string
  getBalance(address: string): Promise<Balance>
  getTransactions(address: string, max?: number): Promise<Transaction[]>
  getTokenTransfers(address: string, max?: number): Promise<TokenTransfer[]>
  getBlockTimestamp(block: number): Promise<Date>
}
