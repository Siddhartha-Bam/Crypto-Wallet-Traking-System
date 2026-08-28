interface Entry<V> {
  value: V
  expiresAt: number
}

/** Minimal in-process TTL cache with capacity bounding. Not shared across processes. */
export class TtlCache<V> {
  private store = new Map<string, Entry<V>>()

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 500,
  ) {}

  get(key: string): V | undefined {
    const entry = this.store.get(key)
    if (!entry) return undefined
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key)
      return undefined
    }
    return entry.value
  }

  set(key: string, value: V): void {
    if (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next().value
      if (oldest !== undefined) this.store.delete(oldest)
    }
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs })
  }

  /** Returns the cached value or fetches, stores, and returns a fresh one. */
  async wrap(key: string, fetchFn: () => Promise<V>): Promise<V> {
    const hit = this.get(key)
    if (hit !== undefined) return hit
    const fresh = await fetchFn()
    this.set(key, fresh)
    return fresh
  }
}
