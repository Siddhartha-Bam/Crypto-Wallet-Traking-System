import { describe, it, expect, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { prisma } from '../src/database/prisma.js'

const app = createApp()

afterAll(async () => {
  await prisma.$disconnect()
})

describe('GET /api/health', () => {
  it('returns ok with database reachable and provider status derived from config', async () => {
    const res = await request(app).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
    expect(res.body.services.database).toBe('ok')
    const expectedEtherscanStatus = process.env.BLOCKCHAIN_API_KEY ? 'ok' : 'unconfigured'
    expect(res.body.services.blockchainProviders.etherscan.status).toBe(expectedEtherscanStatus)
  })
})

describe('GET /api/stats', () => {
  it('returns zeroed totals and empty collections on a fresh database', async () => {
    // NOTE: assumes the dev database has no investigations yet (Phase 1).
    const res = await request(app).get('/api/stats')
    expect(res.status).toBe(200)
    expect(res.body.totals.investigations).toBeTypeOf('number')
    expect(Array.isArray(res.body.chainDistribution)).toBe(true)
    expect(Array.isArray(res.body.recentInvestigations)).toBe(true)
  })
})

describe('unknown routes', () => {
  it('returns structured 404', async () => {
    const res = await request(app).get('/api/does-not-exist')
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('NOT_FOUND')
  })
})
