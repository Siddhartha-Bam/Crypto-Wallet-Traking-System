import express, { type Express } from 'express'
import type { Router } from 'express'
import helmet from 'helmet'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import { env, corsOrigins } from './config/env.js'
import { httpLogger } from './middleware/logger.js'
import { errorHandler, notFoundHandler } from './middleware/errors.js'
import { healthRouter } from './routes/health.js'
import { statsRouter } from './routes/stats.js'
import { createBlockchainProvider } from './blockchain/index.js'
import { createWalletRouter } from './routes/wallet.js'
import { createInvestigationsRouter } from './routes/investigations.js'
import { SeededAttributionProvider } from './attribution/SeededAttributionProvider.js'

export interface AppDeps {
  walletRouter?: Router
  investigationsRouter?: Router
}

export function createApp(deps: AppDeps = {}): Express {
  const app = express()

  app.disable('x-powered-by')
  app.set('trust proxy', 1)

  app.use(httpLogger)
  app.use(helmet())
  app.use(
    cors({
      origin: corsOrigins,
      credentials: true,
    }),
  )
  app.use(express.json({ limit: '100kb' }))

  app.use(
    '/api',
    rateLimit({
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      limit: env.RATE_LIMIT_MAX,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
    }),
  )

  app.use('/api/health', healthRouter)
  app.use('/api/stats', statsRouter)
  app.use('/api/wallet', deps.walletRouter ?? createWalletRouter())
  app.use(
    '/api/investigations',
    deps.investigationsRouter ??
      createInvestigationsRouter({
        providerFactory: createBlockchainProvider,
        attribution: new SeededAttributionProvider(),
      }),
  )

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
