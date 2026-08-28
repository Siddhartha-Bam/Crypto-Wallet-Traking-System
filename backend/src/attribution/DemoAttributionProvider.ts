import type { AttributionProvider } from './AttributionProvider.js'
import type { AttributionResult } from './types.js'
import { DEMO_ADDRESSES } from '../demo/DemoBlockchainProvider.js'

const VERIFIED_ON = new Date('2026-08-25T00:00:00Z')
const SOURCE = 'Synthetic demo dataset (SIH 26183 presentation) — not a real-world attribution'

/**
 * Attribution used exclusively by demo investigations. It labels the three
 * synthetic infrastructure addresses (exchange/mixer/bridge) so the full
 * risk pipeline can be demonstrated offline. These records describe fake
 * addresses and must never be merged into the real seeded dataset.
 */
export class DemoAttributionProvider implements AttributionProvider {
  readonly name = 'demo_attribution_v1'

  private readonly records: Map<string, AttributionResult>

  constructor() {
    const entry = (
      address: string,
      entityName: string,
      entityType: AttributionResult['entityType'],
    ): [string, AttributionResult] => [
      `ethereum:${address.toLowerCase()}`,
      {
        address,
        chain: 'ethereum',
        entityName,
        entityType,
        confidence: 'HIGH',
        source: SOURCE,
        lastVerified: VERIFIED_ON.toISOString(),
        notes: 'Synthetic presentation data — exists only in demo mode.',
      },
    ]

    this.records = new Map([
      entry(DEMO_ADDRESSES.exchange, 'DemoExchange X', 'exchange'),
      entry(DEMO_ADDRESSES.mixer, 'DemoMixer M', 'mixer'),
      entry(DEMO_ADDRESSES.bridge, 'DemoBridge B', 'bridge'),
    ])
  }

  async identify(address: string, chain: string): Promise<AttributionResult[]> {
    const hit = this.records.get(`${chain}:${address.toLowerCase()}`)
    return hit ? [hit] : []
  }
}
