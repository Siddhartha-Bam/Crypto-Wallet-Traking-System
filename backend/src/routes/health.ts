import { Router } from 'express'
import { checkDatabase } from '../database/prisma.js'
import { env } from '../config/env.js'

export const healthRouter = Router()

/**
 * GET /api/health
 * Liveness + dependency status. Reports provider *configuration* honestly;
 * live reachability probes arrive with the Phase 2 blockchain providers.
 */
healthRouter.get('/', async (_req, res) => {
  let database: 'ok' | 'error' = 'ok'
  try {
    await checkDatabase()
  } catch {
    database = 'error'
  }

  const services = {
    database,
    blockchainProviders: {
      etherscan: {
        configured: Boolean(env.BLOCKCHAIN_API_KEY),
        status: env.BLOCKCHAIN_API_KEY ? 'ok' : 'unconfigured',
      },
      rpc: { configured: Boolean(env.RPC_URL), status: env.RPC_URL ? 'ok' : 'unconfigured' },
    },
  }

  const ok = database === 'ok'
  res.status(ok ? 200 : 503).json({ status: ok ? 'ok' : 'degraded', uptimeSeconds: Math.floor(process.uptime()), services })
})
