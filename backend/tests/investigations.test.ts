import { afterAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { createInvestigationsRouter } from '../src/routes/investigations.js'
import type { BlockchainProvider } from '../src/blockchain/types.js'
import type { AttributionProvider } from '../src/attribution/AttributionProvider.js'
import { prisma } from '../src/database/prisma.js'

const SUSPECT = '0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B'
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

function clusterProvider(): BlockchainProvider {
  const txs = new Map<string, ReturnType<typeof tx>[]>([
    [
      SUSPECT.toLowerCase(),
      [tx('0x1111111111111111111111111111111111111111', SUSPECT, '5000000000000000000', 0, '0xin1'), tx(SUSPECT, BURNER, '4500000000000000000', 3_600_000, '0xout1')],
    ],
    [BURNER.toLowerCase(), [tx(BURNER, EXCHANGE, '4200000000000000000', 7_200_000, '0xhop2')]],
    [EXCHANGE.toLowerCase(), []],
  ])
  const balances = new Map<string, string>([
    [SUSPECT.toLowerCase(), '500000000000000000'],
    [EXCHANGE.toLowerCase(), '1000000000000000000000'],
  ])
  return {
    name: 'mock-pipeline',
    getBalance: (a) =>
      Promise.resolve({ address: a, chain: 'ethereum', wei: balances.get(a.toLowerCase()) ?? '0', symbol: 'ETH', decimals: 18 }),
    getTransactions: (a) => Promise.resolve(txs.get(a.toLowerCase()) ?? []),
    getTokenTransfers: () => Promise.resolve([]),
    getBlockTimestamp: (b) => Promise.resolve(new Date(b * 1000)),
  }
}

function mockAttribution(): AttributionProvider {
  return {
    name: 'mock-attribution',
    identify: (address) =>
      Promise.resolve(
        address.toLowerCase() === EXCHANGE.toLowerCase()
          ? [
              {
                address: EXCHANGE,
                chain: 'ethereum',
                entityName: 'Mock Exchange',
                entityType: 'exchange',
                confidence: 'HIGH',
                source: 'test-source',
                lastVerified: new Date().toISOString(),
              },
            ]
          : [],
      ),
  }
}

const app = createApp({
  investigationsRouter: createInvestigationsRouter({
    providerFactory: () => clusterProvider(),
    attribution: mockAttribution(),
  }),
})

afterAll(async () => {
  await prisma.$disconnect()
})

async function waitForCompletion(id: string, timeoutMs = 15000): Promise<any> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const res = await request(app).get(`/api/investigations/${id}`)
    if (res.status === 200 && ['completed', 'failed'].includes(res.body.status)) return res.body
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error('investigation did not finish in time')
}

describe('POST /api/investigations', () => {
  it('validates the request body', async () => {
    // Address checksum validation lives in the service layer → INVALID_ADDRESS.
    const bad = await request(app).post('/api/investigations').send({ address: 'not-an-address' })
    expect(bad.status).toBe(400)
    expect(bad.body.error.code).toBe('INVALID_ADDRESS')

    const badChain = await request(app)
      .post('/api/investigations')
      .send({ address: SUSPECT, chain: 'solana' })
    expect(badChain.status).toBe(400)
    expect(badChain.body.error.code).toBe('UNKNOWN_CHAIN')
  })

  it('returns 202 immediately and completes with persisted artifacts', async () => {
    const created = await request(app).post('/api/investigations').send({
      address: SUSPECT,
      chain: 'ethereum',
      caseId: 'NCRP-TEST-1',
      victimAmount: '250000',
      victimCurrency: 'INR',
      incidentType: 'upi_fraud',
      depth: 2,
    })
    expect(created.status).toBe(202)
    const id = created.body.id as string
    expect(created.body.statusUrl).toContain(id)

    const done = await waitForCompletion(id)
    expect(done.status).toBe('completed')
    expect(done.mode).toBe('live')
    expect(done.riskScore).toBeGreaterThan(0)
    expect(['low', 'medium', 'high', 'critical']).toContain(done.riskBand)
    expect(done.summary.balanceNative).toBe('0.5')
    expect(done.summary.walletStats.counterpartyCount).toBe(2)

    expect(done.indicators.length).toBeGreaterThanOrEqual(2)
    const rules = done.indicators.map((i: { rule: string }) => i.rule)
    expect(rules).toContain('high_volume_pass_through')
    expect(rules).toContain('exchange_exposure')

    expect(done.graphSnapshot.nodes.length).toBe(3)
    expect(done.flowPaths.length).toBe(1)
    expect(done.flowPaths[0].endpointType).toBe('exchange')
    expect(done.flowPaths[0].hops[0].sampleTxHash).toBe('0xout1')
  })

  it('marks failed investigations with the error message', async () => {
    // Unattributed provider failure: make factory throw for a specific address is hard here;
    // instead use an unknown chain already covered. Exercise failure path via bad depth? Depth validated.
    // Simplest deterministic failure: suspect address whose balance fetch throws.
    const failingApp = createApp({
      investigationsRouter: createInvestigationsRouter({
        providerFactory: () => ({
          name: 'failing',
          getBalance: () => Promise.reject(new Error('provider exploded')),
          getTransactions: () => Promise.resolve([]),
          getTokenTransfers: () => Promise.resolve([]),
          getBlockTimestamp: () => Promise.reject(new Error('no')),
        }),
        attribution: mockAttribution(),
      }),
    })
    const created = await request(failingApp).post('/api/investigations').send({ address: SUSPECT })
    expect(created.status).toBe(202)
    const done = await waitForCompletion(created.body.id)
    expect(done.status).toBe('failed')
    expect(done.summary.error).toContain('provider exploded')
  })

  it('lists investigations newest-first with pagination', async () => {
    const res = await request(app).get('/api/investigations?page=1&pageSize=5')
    expect(res.status).toBe(200)
    expect(res.body.total).toBeGreaterThanOrEqual(1)
    const dates = res.body.items.map((i: { createdAt: string }) => i.createdAt)
    expect([...dates].sort().reverse()).toEqual(dates)
  })

  it('404s unknown investigation ids', async () => {
    const res = await request(app).get('/api/investigations/does-not-exist')
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('INVESTIGATION_NOT_FOUND')
  })
})
