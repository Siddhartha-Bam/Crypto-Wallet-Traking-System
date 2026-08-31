import type { AttributionResult } from './types.js'

/**
 * Abstraction over attribution intelligence sources.
 *
 * Future implementations may wrap commercial analytics APIs, government
 * datasets, or investigator-curated labels. Results MUST always carry a
 * source citation and confidence — providers that cannot cite a source
 * must not report an attribution at all.
 */
export interface AttributionProvider {
  readonly name: string
  identify(address: string, chain: string): Promise<AttributionResult[]>
}
