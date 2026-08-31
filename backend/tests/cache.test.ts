import { describe, expect, it, vi } from 'vitest'
import { TtlCache } from '../src/cache/cache.js'
import { Throttle } from '../src/cache/throttle.js'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('TtlCache', () => {
  it('returns cached values within ttl', async () => {
    const cache = new TtlCache<string>(50)
    cache.set('k', 'v')
    expect(cache.get('k')).toBe('v')
  })

  it('expires values after ttl', async () => {
    const cache = new TtlCache<string>(10)
    cache.set('k', 'v')
    await sleep(25)
    expect(cache.get('k')).toBeUndefined()
  })

  it('wrap fetches once and caches', async () => {
    const cache = new TtlCache<number>(500)
    let calls = 0
    const fetch = async (): Promise<number> => {
      calls += 1
      return calls
    }
    await cache.wrap('k', fetch)
    await cache.wrap('k', fetch)
    expect(calls).toBe(1)
  })

  it('evicts oldest entry beyond capacity', () => {
    const cache = new TtlCache<number>(1000, 2)
    cache.set('a', 1)
    cache.set('b', 2)
    cache.set('c', 3)
    expect(cache.get('a')).toBeUndefined()
    expect(cache.get('c')).toBe(3)
  })
})

describe('Throttle', () => {
  it('spaces task starts by at least minIntervalMs', async () => {
    const throttle = new Throttle(40)
    const starts: number[] = []
    const tasks = [1, 2, 3].map((n) =>
      throttle.schedule(async () => {
        starts.push(Date.now())
        return n
      }),
    )
    const results = await Promise.all(tasks)
    expect(results).toEqual([1, 2, 3])
    expect(starts).toHaveLength(3)
    for (let i = 1; i < starts.length; i++) {
      expect(starts[i]! - starts[i - 1]!).toBeGreaterThanOrEqual(30)
    }
  })

  it('propagates task errors without blocking later tasks', async () => {
    const throttle = new Throttle(1)
    await expect(throttle.schedule(async () => { throw new Error('boom') })).rejects.toThrow('boom')
    await expect(throttle.schedule(async () => 'ok')).resolves.toBe('ok')
  })
})
