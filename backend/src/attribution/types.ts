/**
 * Attribution domain — intelligence about WHO controls an address.
 * Strictly separated from on-chain facts; every record must carry a real,
 * citable source and a confidence level. Fabricated attribution is forbidden.
 */

export const ENTITY_TYPES = [
  'exchange',
  'broker',
  'processor',
  'bridge',
  'defi',
  'mixer',
  'gambling',
  'unknown_service',
] as const

export type EntityType = (typeof ENTITY_TYPES)[number]

export const CONFIDENCE_LEVELS = ['HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'] as const
export type Confidence = (typeof CONFIDENCE_LEVELS)[number]

export interface AttributionResult {
  address: string
  chain: string
  entityName: string
  entityType: EntityType
  confidence: Confidence
  /** Citation of the public source this record was verified against. */
  source: string
  /** ISO date of the most recent manual verification against the source. */
  lastVerified: string
  notes?: string
}

/** Provenance tag for API envelopes carrying attribution data. */
export type AttributionProvenance = 'attribution'
