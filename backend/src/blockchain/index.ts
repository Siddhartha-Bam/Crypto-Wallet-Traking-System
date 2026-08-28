import { env } from '../config/env.js'
import { AppError } from '../middleware/errors.js'
import { getChain } from './chains.js'
import { EtherscanProvider } from './EtherscanProvider.js'
import { RpcProvider } from './RpcProvider.js'
import { ResilientBlockchainProvider } from './ResilientProvider.js'
import type { BlockchainProvider } from './types.js'

export function isLiveBlockchainConfigured(): boolean {
  return Boolean(env.BLOCKCHAIN_API_KEY)
}

export function createBlockchainProvider(chainSlug: string): BlockchainProvider {
  getChain(chainSlug)
  if (!isLiveBlockchainConfigured()) {
    throw new AppError(
      503,
      'BLOCKCHAIN_NOT_CONFIGURED',
      'Live blockchain data requires BLOCKCHAIN_API_KEY (free Etherscan key) in backend/.env',
    )
  }
  const primary = new EtherscanProvider(env.BLOCKCHAIN_API_KEY as string, env.ETHERSCAN_BASE_URL, chainSlug)
  const fallback = env.RPC_URL ? new RpcProvider(env.RPC_URL, chainSlug) : undefined
  return new ResilientBlockchainProvider(primary, fallback)
}

export * from './types.js'
export { assertValidAddress, toChecksumAddress, isEvmAddressFormat } from './address.js'
export { formatUnits } from './units.js'
export { CHAINS, getChain } from './chains.js'
