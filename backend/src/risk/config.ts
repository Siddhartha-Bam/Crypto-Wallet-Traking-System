import { z } from 'zod'
import rawConfig from '../config/risk-rules.json' with { type: 'json' }

const ruleSchema = z.object({
  enabled: z.boolean().default(true),
  score: z.number().int().min(0).max(100),
  severity: z.enum(['info', 'low', 'medium', 'high']),
})

export const riskConfigSchema = z.object({
  bands: z.object({
    lowUpper: z.number().int(),
    mediumUpper: z.number().int(),
    highUpper: z.number().int(),
  }),
  rules: z.object({
    rapid_movement: ruleSchema.extend({
      maxMedianHoldHours: z.number().positive(),
      minInflowEth: z.number().nonnegative(),
    }),
    high_volume_pass_through: ruleSchema.extend({
      minForwardRatio: z.number().min(0).max(1),
      maxForwardRatio: z.number().min(1),
      minOutflowEth: z.number().nonnegative(),
    }),
    fan_out: ruleSchema.extend({ minCounterparties: z.number().int().positive() }),
    fan_in: ruleSchema.extend({ minCounterparties: z.number().int().positive() }),
    peel_chain: ruleSchema.extend({
      minSequentialTransfers: z.number().int().positive(),
      similarityRatioMin: z.number().min(0).max(1),
    }),
    layering: ruleSchema.extend({ minIntermediaryDepth: z.number().int().positive() }),
    exchange_exposure: ruleSchema,
    mixer_exposure: ruleSchema,
    cross_chain_exposure: ruleSchema,
  }),
})

export type RiskRulesConfig = z.infer<typeof riskConfigSchema>
export type RuleName = keyof RiskRulesConfig['rules']

let cached: RiskRulesConfig | null = null

/**
 * Validates risk-rules.json at load time. The file ships inside the bundle;
 * editing thresholds requires an app restart — acceptable for the MVP.
 */
export function loadRiskConfig(): RiskRulesConfig {
  if (!cached) {
    cached = riskConfigSchema.parse(rawConfig)
  }
  return cached
}

/** Test seam. */
export function setRiskConfigForTesting(config: RiskRulesConfig): void {
  cached = config
}
