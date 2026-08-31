import { afterAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { createWalletRouter } from '../src/routes/wallet.js'
import type { BlockchainProvider } from '../src/blockchain/types.js'
import type { AttributionProvider } from '../src/attribution/AttributionProvider.js'
import type { AttributionResult } from '../src/attribution/types.js'
import { prisma } from '../src/database/prisma.js'

const ADDR = '0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B'
const OTHER = '0x1111111111111111111111111111111111111111'
const BURNER = '0x2222222222222222222222222222222222222222'
const EXCHANGE = '0x28C6c06298d514Db089934071355E5743bf21d60'

const T0 = Date.UTC(2026, 0, 10, 12, 0, 0)

function tx(from: string, to: string, valueWei: string, offsetMs: number, hash: string) {
  return {
    hash,
    from,
    to,
    valueWei,
    timestamp: new Date(T0 + offsetMs),
    blockNumber: 19_000_000,
    gasUsedWei: '21000',
    gasPriceWei: '1000000000',
    feeWei: '21000000000000',
    isError: false,
    input: '0x',
    nonce: null,
  }
}

function makeClusterProvider(): BlockchainProvider {
  const txsFor = new Map<string, ReturnType<typeof tx>[]>([
    [
      ADDR.toLowerCase(),
      [
        // small fan-in deposits (old history)
        tx(OTHER, ADDR, '50000000000000000', -86_400_000 * 30, '0xfan1'),
        tx('0x3333333333333333333333333333333333333333', ADDR, '40000000000000000', -86_400_000 * 20, '0xfan2'),
        tx('0x4444444444444444444444444444444444444444', ADDR, '40000000000000000', -86_400_000 * 10, '0xfan3'),
        // pass-through + rapid movement: received then forwarded within the hour
        tx(OTHER, ADDR, '5000000000000000000', 0, '0xin1'),
        tx(ADDR, BURNER, '4500000000000000000', 3_600_000, '0xout1'),
      ],
    ],
    [
      BURNER.toLowerCase(),
      [tx(BURNER, EXCHANGE, '4200000000000000000', 7_200_000, '0xhop2')],
    ],
    [EXCHANGE.toLowerCase(), [tx(EXCHANGE, OTHER, '100000000000000', 9_000_000, '0xsweep')]],
  ])

  const balances = new Map<string, string>([
    [ADDR.toLowerCase(), '2000000000000000000'],
    [BURNER.toLowerCase(), '300000000000000000'],
    [EXCHANGE.toLowerCase(), '987650000000000000000000'],
  ])

  return {
    name: 'mock-cluster',
    getBalance: (address) =>
      Promise.resolve({
        address,
        chain: 'ethereum',
        wei: balances.get(address.toLowerCase()) ?? '0',
        symbol: 'ETH',
        decimals: 18,
      }),
    getTransactions: (address) => Promise.resolve(txsFor.get(address.toLowerCase()) ?? []),
    getTokenTransfers: (address) =>
      Promise.resolve(
        address.toLowerCase() === ADDR.toLowerCase()
          ? [
              {
                txHash: '0xtok1',
                logIndex: 1,
                from: ADDR,
                to: BURNER,
                contractAddress: '0xdac17f958d2ee523a2206206994597c13d831ec7',
                tokenSymbol: 'USDT',
                tokenDecimals: 6,
                amountRaw: '15000000',
                amount: '15',
                timestamp: new Date(T0 + 5_400_000),
                blockNumber: 19_000_001,
              },
            ]
          : [],
      ),
    getBlockTimestamp: (block) => Promise.resolve(new Date(block * 1000)),
  }
}

function makeMockAttribution(): AttributionProvider {
  return {
    name: 'mock-attribution',
    identify: (address): Promise<AttributionResult[]> =>
      Promise.resolve(
        address.toLowerCase() === EXCHANGE.toLowerCase()
          ? [
              {
                address: EXCHANGE,
                chain: 'ethereum',
                entityName: 'Binance 14 (hot wallet)',
                entityType: 'exchange',
                confidence: 'MEDIUM',
                source: 'Etherscan name tag https://etherscan.io/address/0x28C6c06298d514Db089934071355E5743bf21d60',
                lastVerified: new Date().toISOString(),
              },
            ]
          : [],
      ),
  }
}

const app = createApp({
  walletRouter: createWalletRouter({
    providerFactory: () => makeClusterProvider(),
    attribution: makeMockAttribution(),
  }),
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('wallet summary route', () => {
  it('returns on-chain provenance envelope with computed stats', async () => {
    const res = await request(app).get(`/api/wallet/ethereum/${ADDR}`)
    expect(res.status).toBe(200)
    expect(res.body.meta.provenance).toBe('on_chain')
    expect(res.body.meta.source).toBe('mock-cluster')
    expect(res.body.balance.native).toBe('2')
    expect(res.body.stats.txCountAnalyzed).toBe(5)
    expect(res.body.stats.counterpartyCount).toBe(4)
    expect(res.body.stats.failedTxCount).toBe(0)
  })

  it('normalizes lowercase addresses to checksummed form', async () => {
    const res = await request(app).get(`/api/wallet/ethereum/${ADDR.toLowerCase()}`)
    expect(res.status).toBe(200)
    expect(res.body.address).toBe(ADDR)
  })

  it('rejects malformed addresses with INVALID_ADDRESS', async () => {
    const res = await request(app).get('/api/wallet/ethereum/0xdeadbeef')
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_ADDRESS')
  })

  it('rejects unsupported chains with UNKNOWN_CHAIN', async () => {
    const res = await request(app).get(`/api/wallet/solana/${ADDR}`)
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('UNKNOWN_CHAIN')
  })
})

describe('wallet transactions route', () => {
  it('paginates normal transactions', async () => {
    const res = await request(app).get(`/api/wallet/ethereum/${ADDR}/transactions?type=normal&page=1&pageSize=2`)
    expect(res.status).toBe(200)
    expect(res.body.pagination.totalItems).toBe(5)
    expect(res.body.items).toHaveLength(2)
  })

  it('serves token transfers with decimal-adjusted amounts', async () => {
    const res = await request(app).get(`/api/wallet/ethereum/${ADDR}/transactions?type=token&pageSize=10`)
    expect(res.status).toBe(200)
    expect(res.body.pagination.totalItems).toBe(1)
    expect(res.body.items[0].amount).toBe('15')
  })
})

describe('attribution route', () => {
  it('returns empty result for unattributed addresses (never inferred)', async () => {
    const res = await request(app).get(`/api/wallet/ethereum/${BURNER}/attribution`)
    expect(res.status).toBe(200)
    expect(res.body.attributed).toBe(false)
    expect(res.body.items).toHaveLength(0)
  })

  it('returns the seeded record with source citation for known entities', async () => {
    const res = await request(app).get(`/api/wallet/ethereum/${EXCHANGE}/attribution`)
    expect(res.status).toBe(200)
    expect(res.body.attributed).toBe(true)
    expect(res.body.items[0].entityName).toContain('Binance')
    expect(res.body.items[0].source).toContain('etherscan.io')
    expect(res.body.meta.provenance).toBe('attribution')
  })
})

describe('graph route', () => {
  it('crawls the outflow trail, stops at attributed endpoints, dedups nodes', async () => {
    const res = await request(app).get(`/api/wallet/ethereum/${ADDR}/graph?depth=2&maxNodes=10&minValueEth=0.01`)
    expect(res.status).toBe(200)
    const { graph } = res.body
    const ids = graph.nodes.map((n: { id: string }) => n.id)
    expect(ids).toContain(ADDR.toLowerCase())
    expect(ids).toContain(BURNER.toLowerCase())
    expect(ids).toContain(EXCHANGE.toLowerCase())
    const exchangeNode = graph.nodes.find((n: { id: string }) => n.id === EXCHANGE.toLowerCase())
    expect(exchangeNode.role).toBe('attributed_entity')
    expect(exchangeNode.entityType).toBe('exchange')
    expect(graph.truncated).toBe(false)
    const edgeToExchange = graph.edges.find(
      (e: { source: string; target: string }) =>
        e.source === BURNER.toLowerCase() && e.target === EXCHANGE.toLowerCase(),
    )
    expect(edgeToExchange.sampleTxHashes).toContain('0xhop2')
  })
})

describe('risk route', () => {
  it('produces explainable indicators, composite score and disclaimer', async () => {
    const res = await request(app).get(`/api/wallet/ethereum/${ADDR}/risk?depth=2&maxNodes=10&minValueEth=0.01`)
    expect(res.status).toBe(200)
    expect(res.body.meta.provenance).toBe('inference')

    const rules = res.body.indicators.map((i: { rule: string }) => i.rule)
    expect(rules).toContain('high_volume_pass_through')
    expect(rules).toContain('rapid_movement')
    expect(rules).toContain('exchange_exposure')

    const passThrough = res.body.indicators.find((i: { rule: string }) => i.rule === 'high_volume_pass_through')
    expect(passThrough.evidence).toContain('%')
    expect(passThrough.transactions.length).toBeGreaterThan(0)

    // pass_through(30) + rapid_movement(20) + exchange_exposure(20)
    expect(res.body.investigativeRiskScore.score).toBe(70)
    expect(['high', 'critical']).toContain(res.body.investigativeRiskScore.band)
    expect(res.body.investigativeRiskScore.disclaimer).toMatch(/NOT evidence of criminal activity/i)

    expect(res.body.fundFlowPaths.length).toBeGreaterThanOrEqual(1)
    expect(res.body.fundFlowPaths[0].endpointEntityName).toContain('Binance')
    expect(res.body.fundFlowPaths[0].intermediaryCount).toBe(1)
  })
})
