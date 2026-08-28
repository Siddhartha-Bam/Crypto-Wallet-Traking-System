import { describe, expect, it } from 'vitest'
import { assertValidAddress, toChecksumAddress } from '../src/blockchain/address.js'
import { formatUnits } from '../src/blockchain/units.js'
import { getChain } from '../src/blockchain/chains.js'

describe('EIP-55 checksum', () => {
  it('produces canonical checksummed forms', () => {
    expect(toChecksumAddress('0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed')).toBe(
      '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed',
    )
    expect(toChecksumAddress('0xfb6916095ca1df60bb79ce92ce3ea74c37c5d359')).toBe(
      '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359',
    )
  })

  it('accepts mixed-case input and normalizes deterministically', () => {
    const a = toChecksumAddress('0x5AAEB6053F3E94C9B9A09F33669435E7EF1BEAED')
    const b = toChecksumAddress('0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed')
    expect(a).toBe(b)
  })

  it('rejects malformed addresses', () => {
    expect(() => toChecksumAddress('0x1234')).toThrow()
    expect(() => toChecksumAddress('not-an-address')).toThrow()
  })

  it('assertValidAddress returns the checksummed form for lowercase input', () => {
    const result = assertValidAddress('0xfb6916095ca1df60bb79ce92ce3ea74c37c5d359')
    expect(result).toBe('0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359')
  })
})

describe('formatUnits', () => {
  it('converts base units without floating point error', () => {
    expect(formatUnits('1000000000000000000', 18)).toBe('1')
    expect(formatUnits('123456789', 6)).toBe('123.456789')
    expect(formatUnits('1500000', 6)).toBe('1.5')
    expect(formatUnits('50', 0)).toBe('50')
    expect(formatUnits('5', 18)).toBe('0.000000000000000005')
  })
})

describe('chain registry', () => {
  it('resolves ethereum and rejects unknown chains', () => {
    expect(getChain('ethereum').etherscanChainId).toBe(1)
    expect(() => getChain('solana')).toThrow(/Unsupported chain/)
  })
})
