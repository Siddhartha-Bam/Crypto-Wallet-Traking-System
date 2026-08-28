import { toChecksumAddress } from '../blockchain/address.js'
import type { Balance, BlockchainProvider, TokenTransfer, Transaction } from '../blockchain/types.js'

/**
 * Deterministic synthetic cluster for DEMO investigations.
 *
 * RULES:
 * - Every address, hash, amount and timestamp is synthetic and deterministic
 *   (same output on every machine, no network access).
 * - Hashes carry a visible `demo` marker so nothing can be mistaken for a
 *   real transaction. Addresses are hex-valid but non-existent patterns.
 * - Demo data NEVER mixes with on-chain facts: it is only reachable through
 *   mode:'demo' investigations, which render with a persistent DEMO banner.
 */

const pad = (hexCore: string): string => toChecksumAddress(`0x${hexCore}${'0'.repeat(Math.max(0, 40 - hexCore.length))}`)

export const DEMO_ADDRESSES = {
  suspect: pad('a11ce1'),
  burnerA: pad('b0b57a'),
  burnerB: pad('cafeb'),
  exchange: pad('ba5e5c'),
  mixer: pad('deadb'),
  bridge: pad('c0deb'),
} as const

function fanTarget(i: number): string {
  return pad(`f00d${String(i).padStart(3, '0')}`)
}

function victimAddr(i: number): string {
  return pad(`face${String(i).padStart(4, '0')}`)
}

export function demoHash(n: number): string {
  return `0xdemohash-${String(n).padStart(6, '0')}`
}

/** Fixed epoch so relative timestamps stay stable across demo runs. */
const T0 = Date.UTC(2026, 7, 20, 9, 30, 0)
const H = 3_600_000

interface DemoTx {
  from: string
  to: string
  valueWei: string
  atMs: number
  hash: string
}

const ETH = (n: number): string => (BigInt(Math.round(n * 1e6)) * BigInt(1e12)).toString()

function buildCluster(): Map<string, DemoTx[]> {
  const txs: DemoTx[] = []
  let h = 1
  const add = (from: string, to: string, ethAmount: number, atMs: number): void => {
    txs.push({ from, to, valueWei: ETH(ethAmount), atMs, hash: demoHash(h++) })
  }

  // 16 victims pay the suspect (fan-in) across the first day (~12.6 ETH total).
  for (let i = 1; i <= 16; i++) {
    add(victimAddr(i), DEMO_ADDRESSES.suspect, 0.75 + (i % 4) * 0.05, T0 + i * 40 * 60_000)
  }
  // Suspect forwards ~90% within the hour (rapid movement + pass-through).
  add(DEMO_ADDRESSES.suspect, DEMO_ADDRESSES.burnerA, 8.0, T0 + 22 * H)
  // Peel-chain behaviour: six decreasing transfers leaving residue.
  const peel = [0.6, 0.45, 0.35, 0.28, 0.22, 0.18]
  peel.forEach((amount, i) => {
    add(DEMO_ADDRESSES.suspect, fanTarget(i + 1), amount, T0 + (24 + i) * H)
  })
  // Broad fan-out dust.
  for (let i = 7; i <= 18; i++) {
    add(DEMO_ADDRESSES.suspect, fanTarget(i), 0.01, T0 + 31 * H)
  }
  // Layering chain A → B → exchange.
  add(DEMO_ADDRESSES.burnerA, DEMO_ADDRESSES.burnerB, 7.6, T0 + 26 * H)
  add(DEMO_ADDRESSES.burnerB, DEMO_ADDRESSES.exchange, 7.4, T0 + 30 * H)
  // Mixer and bridge touches.
  add(DEMO_ADDRESSES.suspect, DEMO_ADDRESSES.mixer, 1.0, T0 + 25 * H)
  add(DEMO_ADDRESSES.burnerA, DEMO_ADDRESSES.bridge, 0.4, T0 + 27 * H)

  const byAddress = new Map<string, DemoTx[]>()
  for (const t of txs) {
    for (const addr of [t.from.toLowerCase(), t.to.toLowerCase()]) {
      const list = byAddress.get(addr) ?? []
      if (!list.some((x) => x.hash === t.hash)) list.push(t)
      byAddress.set(addr, list)
    }
  }
  return byAddress
}

const CLUSTER = buildCluster()
const BALANCES = new Map<string, string>([
  [DEMO_ADDRESSES.suspect.toLowerCase(), ETH(1.23)],
  [DEMO_ADDRESSES.burnerA.toLowerCase(), ETH(0.02)],
  [DEMO_ADDRESSES.burnerB.toLowerCase(), ETH(0.19)],
  [DEMO_ADDRESSES.exchange.toLowerCase(), ETH(999)],
])

export class DemoBlockchainProvider implements BlockchainProvider {
  readonly name = 'demo_seeded_v1'

  async getBalance(address: string): Promise<Balance> {
    return {
      address,
      chain: 'ethereum',
      wei: BALANCES.get(address.toLowerCase()) ?? '0',
      symbol: 'ETH',
      decimals: 18,
    }
  }

  async getTransactions(address: string): Promise<Transaction[]> {
    const rows = CLUSTER.get(address.toLowerCase()) ?? []
    return rows
      .map((t) => ({
        hash: t.hash,
        from: toChecksumAddress(t.from),
        to: toChecksumAddress(t.to),
        valueWei: t.valueWei,
        timestamp: new Date(T0 + t.atMs),
        blockNumber: 1_000_000 + Number.parseInt(t.hash.slice(-6), 36 % 10 || 0 || 0),
        gasUsedWei: '21000',
        gasPriceWei: '1000000000',
        feeWei: '21000000000000',
        isError: false,
        input: '0x',
        nonce: null,
      }))
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
  }

  async getTokenTransfers(): Promise<TokenTransfer[]> {
    // The synthetic scenario is native-ETH only; kept honest rather than padded.
    return []
  }

  async getBlockTimestamp(block: number): Promise<Date> {
    return new Date(T0 + block * 1000)
  }
}
