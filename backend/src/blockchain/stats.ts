import type { Transaction } from './types.js'
import { formatUnits } from './units.js'

export interface WalletStats {
  txCountAnalyzed: number
  firstSeenAt: Date | null
  lastActivityAt: Date | null
  incomingVolumeNative: string
  outgoingVolumeNative: string
  failedTxCount: number
  counterpartyCount: number
}

/** Pure aggregation over a normalized transaction window. Used by the wallet route and the investigation pipeline. */
export function computeWalletStats(address: string, transactions: Transaction[], decimals: number): WalletStats {
  const self = address.toLowerCase()
  let incomingWei = BigInt(0)
  let outgoingWei = BigInt(0)
  let failedTxCount = 0
  const counterparties = new Set<string>()
  let lastActivityAt: Date | null = null
  let firstSeenAt: Date | null = null

  for (const tx of transactions) {
    if (!lastActivityAt || tx.timestamp > lastActivityAt) lastActivityAt = tx.timestamp
    if (!firstSeenAt || tx.timestamp < firstSeenAt) firstSeenAt = tx.timestamp
    if (tx.isError) {
      failedTxCount += 1
      continue
    }
    const value = BigInt(tx.valueWei)
    if (tx.from.toLowerCase() === self && (!tx.to || tx.to.toLowerCase() !== self)) {
      outgoingWei += value
      if (tx.to) counterparties.add(tx.to)
    } else if (tx.to && tx.to.toLowerCase() === self && tx.from.toLowerCase() !== self) {
      incomingWei += value
      counterparties.add(tx.from)
    }
  }

  return {
    txCountAnalyzed: transactions.length,
    firstSeenAt,
    lastActivityAt,
    incomingVolumeNative: formatUnits(incomingWei.toString(), decimals),
    outgoingVolumeNative: formatUnits(outgoingWei.toString(), decimals),
    failedTxCount,
    counterpartyCount: counterparties.size,
  }
}
