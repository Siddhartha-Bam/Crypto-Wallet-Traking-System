import { keccak256 } from 'js-sha3'
import { AppError } from '../middleware/errors.js'

const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/

export function isEvmAddressFormat(address: string): boolean {
  return EVM_ADDRESS_RE.test(address)
}

/** EIP-55 mixed-case checksum encoding. */
export function toChecksumAddress(address: string): string {
  if (!isEvmAddressFormat(address)) {
    throw new AppError(400, 'INVALID_ADDRESS', `Not a valid EVM address: ${address}`)
  }
  const lower = address.toLowerCase().slice(2)
  const hash = keccak256(lower)
  let out = '0x'
  for (let i = 0; i < 40; i++) {
    const nibble = Number.parseInt(hash[i] as string, 16)
    const ch = lower.charAt(i)
    out += nibble >= 8 ? ch.toUpperCase() : ch
  }
  return out
}

/** Validates and normalizes a user-supplied address; returns the checksummed form. */
export function assertValidAddress(address: string): string {
  if (!isEvmAddressFormat(address)) {
    throw new AppError(400, 'INVALID_ADDRESS', 'Wallet address must be a 20-byte hex EVM address (0x…)')
  }
  return toChecksumAddress(address)
}
