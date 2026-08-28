export type { Prisma } from '@prisma/client'
import { PrismaClient } from '@prisma/client'
import { env } from '../config/env.js'

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined
}

export const prisma =
  globalThis.__prisma ??
  new PrismaClient({
    log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })

if (env.NODE_ENV !== 'production') {
  globalThis.__prisma = prisma
}

/** Lightweight connectivity probe used by /health. */
export async function checkDatabase(): Promise<boolean> {
  await prisma.$queryRaw`SELECT 1`
  return true
}


