const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Serializes async work ensuring each task starts at least `minIntervalMs`
 * after the previous task started. Used to stay inside provider rate limits.
 */
export class Throttle {
  private lastStart = 0
  private tail: Promise<void> = Promise.resolve()

  constructor(private readonly minIntervalMs: number) {}

  schedule<T>(task: () => Promise<T>): Promise<T> {
    const gate = this.tail.then(async () => {
      const wait = this.lastStart + this.minIntervalMs - Date.now()
      if (wait > 0) await sleep(wait)
      this.lastStart = Date.now()
    })
    // Keep the queue alive even when a gate rejects.
    this.tail = gate.then(
      () => undefined,
      () => undefined,
    )
    return gate.then(task)
  }
}

const throttleRegistry = new Map<string, Throttle>()

export function getSharedThrottle(key: string, minIntervalMs: number): Throttle {
  if (!throttleRegistry.has(key)) {
    throttleRegistry.set(key, new Throttle(minIntervalMs))
  }
  return throttleRegistry.get(key)!
}
