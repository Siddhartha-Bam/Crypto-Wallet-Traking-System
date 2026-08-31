import { createApp } from './app.js'
import { env } from './config/env.js'
import { logger } from './middleware/logger.js'
import { prisma } from './database/prisma.js'

const app = createApp()

const server = app.listen(env.PORT, () => {
  logger.info(`API listening on http://localhost:${env.PORT} (env=${env.NODE_ENV})`)
})

async function shutdown(signal: string): Promise<void> {
  logger.info(`${signal} received — shutting down`)
  server.close(async () => {
    await prisma.$disconnect()
    process.exit(0)
  })
  // Hard exit if connections do not drain in time.
  setTimeout(() => process.exit(1), 10_000).unref()
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
