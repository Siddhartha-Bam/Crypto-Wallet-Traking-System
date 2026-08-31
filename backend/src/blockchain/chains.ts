import { AppError } from '../middleware/errors.js'

export interface ChainDefinition {
  slug: string
  label: string
  /** Etherscan V2 chainid parameter. */
  etherscanChainId: number
  nativeSymbol: string
  nativeDecimals: number
}

export const CHAINS: Record<string, ChainDefinition> = {
  ethereum: {
    slug: 'ethereum',
    label: 'Ethereum',
    etherscanChainId: 1,
    nativeSymbol: 'ETH',
    nativeDecimals: 18,
  },
}

export function getChain(slug: string): ChainDefinition {
  const def = CHAINS[slug]
  if (!def) {
    throw new AppError(
      400,
      'UNKNOWN_CHAIN',
      `Unsupported chain "${slug}". Supported: ${Object.keys(CHAINS).join(', ')}`,
    )
  }
  return def
}
