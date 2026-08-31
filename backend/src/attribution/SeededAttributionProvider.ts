import type { AttributionProvider } from './AttributionProvider.js'
import type { AttributionResult } from './types.js'
import { prisma } from '../database/prisma.js'

const CACHE_TTL_MS = 5 * 60_000

/**
 * Attribution backed by the curated `attribution_records` table.
 *
 * Every row in that table must have been manually verified against a real,
 * citable public source before insertion (see prisma/seed/README.md and
 * docs/ATTRIBUTION_SOURCES.md). This provider never invents attributions:
 * addresses absent from the dataset return an empty result, which callers
 * render as "Unknown address".
 */
export class SeededAttributionProvider implements AttributionProvider {
  readonly name = 'seeded_dataset_v1'

  private cache: { loadedAt: number; records: Map<string, AttributionResult> } | null = null

  async identify(address: string, chain: string): Promise<AttributionResult[]> {
    const records = await this.load()
    const key = `${chain}:${address.toLowerCase()}`
    const hit = records.get(key)
    return hit ? [hit] : []
  }

  async identifyMany(addresses: string[], chain: string): Promise<Map<string, AttributionResult>> {
    const records = await this.load()
    const out = new Map<string, AttributionResult>()
    for (const address of addresses) {
      const hit = records.get(`${chain}:${address.toLowerCase()}`)
      if (hit) out.set(address.toLowerCase(), hit)
    }
    return out
  }

  private async load(): Promise<Map<string, AttributionResult>> {
    if (this.cache && Date.now() - this.cache.loadedAt < CACHE_TTL_MS) {
      return this.cache.records
    }
    const rows = await prisma.attributionRecord.findMany()
    const map = new Map<string, AttributionResult>()
    for (const row of rows) {
      map.set(`${row.chain}:${row.address.toLowerCase()}`, {
        address: row.address,
        chain: row.chain,
        entityName: row.entityName,
        entityType: row.entityType as AttributionResult['entityType'],
        confidence: row.confidence as AttributionResult['confidence'],
        source: row.source,
        lastVerified: row.lastVerified.toISOString(),
        notes: row.notes ?? undefined,
      })
    }
    this.cache = { loadedAt: Date.now(), records: map }
    return map
  }
}
