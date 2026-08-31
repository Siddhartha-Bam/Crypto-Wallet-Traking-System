import { z } from 'zod'
import 'dotenv/config'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // Blockchain providers — optional until Phase 2 wires them up
  BLOCKCHAIN_API_KEY: z.string().optional(),
  RPC_URL: z.string().optional(),
  ETHERSCAN_BASE_URL: z.string().url().default('https://api.etherscan.io/v2/api'),
  // Etherscan V2 free keys enforce ~3 calls/sec in practice; 350ms keeps headroom.
  ETHERSCAN_MIN_INTERVAL_MS: z.coerce.number().int().positive().default(350),
  WALLET_TX_WINDOW: z.coerce.number().int().positive().default(10_000),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
})

export type Env = z.infer<typeof envSchema>

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  // Fail fast with a readable message — misconfiguration must never boot.
  const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
  throw new Error(`Invalid environment configuration -> ${issues}`)
}

export const env = parsed.data

export const corsOrigins = env.CORS_ORIGIN.split(',')
  .map((o) => o.trim())
  .filter(Boolean)
