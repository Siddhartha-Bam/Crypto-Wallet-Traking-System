import { afterEach, describe, expect, it, vi } from 'vitest'
import { EtherscanProvider } from '../src/blockchain/EtherscanProvider.js'
import { ResilientBlockchainProvider } from '../src/blockchain/ResilientProvider.js'
import { RpcProvider } from '../src/blockchain/RpcProvider.js'
import { AppError } from '../src/middleware/errors.js'
import type { BlockchainProvider } from '../src/blockchain/types.js'

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as unknown as Response
}

function envelope(result: unknown, message = 'OK', status = '1'): unknown {
  return { status, message, result }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

const ADDR = '0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B'

describe('EtherscanProvider', () => {
  it('maps balance payloads', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(envelope('1234567890123456789'))),
    )
    const provider = new EtherscanProvider('test-key', 'https://api.etherscan.test/api', 'ethereum')
    const balance = await provider.getBalance(ADDR)
    expect(balance.wei).toBe('1234567890123456789')
    expect(balance.symbol).toBe('ETH')
  })

  it('maps transaction rows including failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(
          envelope([
            {
              hash: '0xabc',
              from: ADDR,
              to: '0x1111111111111111111111111111111111111111',
              value: '1000000000000000000',
              timeStamp: '1700000000',
              blockNumber: '19000000',
              gasUsed: '21000',
              gasPrice: '20000000000',
              isError: '0',
              input: '0x',
              nonce: '7',
            },
            {
              hash: '0xfail',
              from: '0x2222222222222222222222222222222222222222',
              to: ADDR,
              value: '500000000000000000',
              timeStamp: '1700000100',
              blockNumber: '19000001',
              gasUsed: '21000',
              gasPrice: '20000000000',
              isError: '1',
              input: '0x',
            },
          ]),
        ),
      ),
    )
    const provider = new EtherscanProvider('test-key', 'https://api.etherscan.test/api', 'ethereum')
    const txs = await provider.getTransactions(ADDR)
    expect(txs).toHaveLength(2)
    expect(txs[0]!.hash).toBe('0xabc')
    expect(txs[0]!.timestamp.toISOString()).toBe(new Date(1700000000 * 1000).toISOString())
    expect(txs[0]!.feeWei).toBe((BigInt(21000) * BigInt(20000000000)).toString())
    expect(txs[1]!.isError).toBe(true)
  })

  it('returns an empty array when the address has no history', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(envelope('No transactions found', 'NOTOK', '0'))),
    )
    const provider = new EtherscanProvider('test-key', 'https://api.etherscan.test/api', 'ethereum')
    await expect(provider.getTransactions(ADDR)).resolves.toEqual([])
  })

  it('raises a typed rate-limit error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(envelope('Max rate limit reached', 'NOTOK', '0'))),
    )
    const provider = new EtherscanProvider('test-key', 'https://api.etherscan.test/api', 'ethereum')
    await expect(provider.getTransactions(ADDR)).rejects.toMatchObject({
      code: 'PROVIDER_RATE_LIMITED',
      status: 429,
    })
  })

  it('parses proxy block timestamps', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ jsonrpc: '2.0', id: 1, result: { timestamp: '0x64a7b2c0' } })),
    )
    const provider = new EtherscanProvider('test-key', 'https://api.etherscan.test/api', 'ethereum')
    const ts = await provider.getBlockTimestamp(19_000_000)
    expect(ts.getTime()).toBe(Number(BigInt('0x64a7b2c0')) * 1000)
  })
})

describe('ResilientBlockchainProvider', () => {
  function failingPrimary(): BlockchainProvider {
    return {
      name: 'failing-primary',
      getBalance: () => Promise.reject(new AppError(429, 'PROVIDER_RATE_LIMITED', 'limited')),
      getTransactions: () => Promise.reject(new AppError(429, 'PROVIDER_RATE_LIMITED', 'limited')),
      getTokenTransfers: () => Promise.reject(new AppError(429, 'PROVIDER_RATE_LIMITED', 'limited')),
      getBlockTimestamp: () => Promise.reject(new AppError(429, 'PROVIDER_RATE_LIMITED', 'limited')),
    }
  }

  it('falls back to RPC for balance when primary is rate limited', async () => {
    let rpcCalls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: URL | string, init?: RequestInit) => {
        const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null
        if (body?.method === 'eth_getBalance') {
          rpcCalls += 1
          return jsonResponse({ jsonrpc: '2.0', id: 1, result: '0x56bc75e2d63100000' })
        }
        return jsonResponse(envelope('Max rate limit reached', 'NOTOK', '0'), 429)
      }),
    )
    const resilient = new ResilientBlockchainProvider(
      failingPrimary(),
      new RpcProvider('http://localhost:8545', 'ethereum'),
    )
    const balance = await resilient.getBalance(ADDR)
    expect(balance.wei).toBe(BigInt('0x56bc75e2d63100000').toString())
    expect(rpcCalls).toBe(1)
  })

  it('surfaces the primary error when fallback cannot answer', async () => {
    vi.stubGlobal('fetch', vi.fn())
    const resilient = new ResilientBlockchainProvider(
      failingPrimary(),
      new RpcProvider('http://localhost:8545', 'ethereum'),
    )
    // RPC cannot serve history; the original rate-limit error must surface.
    await expect(resilient.getTransactions(ADDR)).rejects.toMatchObject({ code: 'PROVIDER_RATE_LIMITED' })
  })

  it('propagates non-provider errors untouched', async () => {
    vi.stubGlobal('fetch', vi.fn())
    const boom = new Error('unexpected')
    const provider: BlockchainProvider = {
      name: 'broken',
      getBalance: () => Promise.reject(boom),
      getTransactions: () => Promise.reject(boom),
      getTokenTransfers: () => Promise.reject(boom),
      getBlockTimestamp: () => Promise.reject(boom),
    }
    const resilient = new ResilientBlockchainProvider(provider, new RpcProvider('http://localhost:8545', 'ethereum'))
    await expect(resilient.getBalance(ADDR)).rejects.toBe(boom)
  })
})
