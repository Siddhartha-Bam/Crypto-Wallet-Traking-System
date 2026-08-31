import { AppError } from '../middleware/errors.js'

/** Converts a base-unit integer string into a human decimal string without floating point. */
export function formatUnits(raw: string, decimals: number): string {
  if (!/^-?\d+$/.test(raw)) {
    throw new AppError(502, 'PROVIDER_ERROR', `Malformed amount received from provider: ${raw}`)
  }
  const negative = raw.startsWith('-')
  const digits = negative ? raw.slice(1) : raw
  if (decimals === 0) {
    return `${negative ? '-' : ''}${digits}`
  }
  const padded = digits.padStart(decimals + 1, '0')
  const intPart = padded.slice(0, padded.length - decimals)
  const fracPart = padded.slice(padded.length - decimals).replace(/0+$/, '')
  const sign = negative ? '-' : ''
  return fracPart ? `${sign}${intPart}.${fracPart}` : `${sign}${intPart}`
}
