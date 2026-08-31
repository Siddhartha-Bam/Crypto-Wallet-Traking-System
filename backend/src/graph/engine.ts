import type { AttributionProvider } from '../attribution/AttributionProvider.js'
import type { AttributionResult } from '../attribution/types.js'
import type { BlockchainProvider, TokenTransfer, Transaction } from '../blockchain/types.js'
import { formatUnits } from '../blockchain/units.js'
import { getChain } from '../blockchain/chains.js'
import type { GraphCrawlOptions, GraphEdge, GraphNode, GraphResult } from './types.js'

const MAX_DEPTH_HARD_CAP = 3
const MAX_NODES_HARD_CAP = 60
const MAX_EDGES_PER_NODE_HARD_CAP = 15
const SAMPLE_HASH_LIMIT = 3

interface EdgeAccum {
  count: number
  totalRaw: bigint
  decimals: number
  asset: string
  contract?: string
  firstSeen: Date
  lastSeen: Date
  hashes: string[]
}

export interface GraphEngineDeps {
  getProvider: (chain: string) => BlockchainProvider
  attribution: AttributionProvider
}

/**
 * Bounded BFS fund-flow crawler.
 *
 * Follows OUTFLOWS from the suspect toward eventual endpoints (the fraud-trail
 * direction). Inflow counterparties are recorded as edges for fan-in analysis
 * but are never expanded. Attributed entities are terminal nodes: crawling an
 * exchange hot wallet's millions of depositors is meaningless for attribution.
 *
 * Hard caps guarantee the crawl terminates regardless of wallet activity level;
 * `truncated: true` tells the investigator the view was bounded, never silent.
 */
export class GraphEngine {
  constructor(private readonly deps: GraphEngineDeps) {}

  async crawl(
    suspectAddress: string,
    chainSlug: string,
    options: GraphCrawlOptions = {},
  ): Promise<GraphResult> {
    const chain = getChain(chainSlug)
    const provider = this.deps.getProvider(chain.slug)

    const maxDepth = Math.min(options.maxDepth ?? 2, MAX_DEPTH_HARD_CAP)
    const maxNodes = Math.min(options.maxNodes ?? 25, MAX_NODES_HARD_CAP)
    const maxEdgesPerNode = Math.min(options.maxEdgesPerNode ?? 8, MAX_EDGES_PER_NODE_HARD_CAP)
    const minValueEth = options.minValueEth ?? 0.001
    // ETH-equivalent floor for native-transfer expansion candidates.
    const minWeiForExpansion = BigInt(Math.max(1, Math.floor(minValueEth * 1e9))) * BigInt(1e9)

    const suspectId = suspectAddress.toLowerCase()
    const nodesById = new Map<string, GraphNode>()
    const edgesByKey = new Map<string, EdgeAccum>()
    const attributionsByAddress = new Map<string, AttributionResult>()
    const visited = new Set<string>([suspectId])
    const queue: Array<{ address: string; depth: number }> = [{ address: suspectAddress, depth: 0 }]
    let truncated = false

    const ensureNode = (address: string, role: GraphNode['role'], depth: number): GraphNode => {
      const id = address.toLowerCase()
      let node = nodesById.get(id)
      if (!node) {
        node = { id, address, chain: chain.slug, role, depth }
        nodesById.set(id, node)
      } else if (depth < node.depth) {
        node.depth = depth
        if (node.role === 'intermediary' && role !== 'intermediary') node.role = role
      }
      return node
    }

    ensureNode(suspectAddress, 'suspect', 0)

    while (queue.length > 0) {
      const current = queue.shift()!
      const currentId = current.address.toLowerCase()

      if (current.depth >= maxDepth) continue
      if (nodesById.size >= maxNodes) {
        truncated = true
        break
      }
      // Attributed entities are endpoints; never expand beyond them.
      if (currentId !== suspectId && attributionsByAddress.has(currentId)) continue

      const [transactions, tokenTransfers] = await Promise.all([
        provider.getTransactions(current.address),
        provider.getTokenTransfers(current.address),
      ])

      nodesById.get(currentId)!.txCountAnalyzed = transactions.length + tokenTransfers.length

      this.accumulateNative(transactions, currentId, edgesByKey)
      this.accumulateTokens(tokenTransfers, currentId, edgesByKey)

      const outflowCandidates = [...edgesByKey.entries()]
        .map(([key, acc]) => ({ key, acc }))
        .filter(({ key, acc }) => {
          const [from, , asset] = key.split('|')
          return from === currentId && asset === chain.nativeSymbol && acc.totalRaw >= minWeiForExpansion
        })
        .sort((a, b) => (b.acc.totalRaw > a.acc.totalRaw ? 1 : b.acc.totalRaw < a.acc.totalRaw ? -1 : 0))
        .slice(0, maxEdgesPerNode)

      for (const { key } of outflowCandidates) {
        const to = key.split('|')[1]!
        if (visited.has(to)) continue

        const results = await this.deps.attribution.identify(to, chain.slug)
        const attribution = results[0]
        if (attribution) attributionsByAddress.set(to, attribution)

        if (nodesById.size >= maxNodes) {
          truncated = true
          break
        }
        visited.add(to)
        ensureNode(to, attribution ? 'attributed_entity' : 'intermediary', current.depth + 1)
        queue.push({ address: to, depth: current.depth + 1 })
      }
    }

    for (const [id, attribution] of attributionsByAddress) {
      const node = nodesById.get(id)
      if (!node) continue
      node.role = 'attributed_entity'
      node.entityName = attribution.entityName
      node.entityType = attribution.entityType
      node.attributionConfidence = attribution.confidence
      node.attributionSource = attribution.source
    }

    await Promise.all(
      [...nodesById.values()]
        .filter((n) => n.role === 'suspect' || n.role === 'attributed_entity')
        .map(async (n) => {
          try {
            const balance = await provider.getBalance(n.address)
            n.balanceNative = formatUnits(balance.wei, balance.decimals)
            n.balanceSymbol = balance.symbol
          } catch {
            // Balance enrichment is supplementary; a valid graph survives without it.
          }
        }),
    )

    const edges: GraphEdge[] = [...edgesByKey.entries()].flatMap(([key, acc]) => {
      const [source, target] = key.split('|')
      if (!source || !target) return []
      const suspectInvolved = source === suspectId || target === suspectId
      return [
        {
          id: key,
          source,
          target,
          direction: !suspectInvolved ? 'internal' : source === suspectId ? 'out' : 'in',
          asset: acc.asset,
          assetContract: acc.contract,
          assetDecimals: acc.decimals,
          transactionCount: acc.count,
          totalValue: formatUnits(acc.totalRaw.toString(), acc.decimals),
          firstSeen: acc.firstSeen.toISOString(),
          lastSeen: acc.lastSeen.toISOString(),
          sampleTxHashes: acc.hashes,
        },
      ]
    })

    return {
      suspectAddress,
      chain: chain.slug,
      nodes: [...nodesById.values()],
      edges,
      attributedEntities: [...attributionsByAddress.values()],
      truncated,
      limits: { maxDepth, maxNodes, maxEdgesPerNode, minValueEth },
      generatedAt: new Date().toISOString(),
    }
  }

  private accumulateNative(transactions: Transaction[], selfId: string, edges: Map<string, EdgeAccum>): void {
    for (const tx of transactions) {
      if (tx.isError || tx.valueWei === '0' || !tx.to) continue
      const from = tx.from.toLowerCase()
      const to = tx.to.toLowerCase()
      if ((from !== selfId && to !== selfId) || from === to) continue
      this.upsert(edges, `${from}|${to}|ETH`, {
        decimals: 18,
        asset: 'ETH',
        raw: BigInt(tx.valueWei),
        timestamp: tx.timestamp,
        hash: tx.hash,
      })
    }
  }

  private accumulateTokens(transfers: TokenTransfer[], selfId: string, edges: Map<string, EdgeAccum>): void {
    for (const t of transfers) {
      const from = t.from.toLowerCase()
      const to = t.to.toLowerCase()
      if ((from !== selfId && to !== selfId) || from === to) continue
      this.upsert(edges, `${from}|${to}|${t.contractAddress.toLowerCase()}`, {
        decimals: t.tokenDecimals,
        asset: t.tokenSymbol,
        contract: t.contractAddress,
        raw: BigInt(t.amountRaw),
        timestamp: t.timestamp,
        hash: t.txHash,
      })
    }
  }

  private upsert(
    edges: Map<string, EdgeAccum>,
    key: string,
    item: { decimals: number; asset: string; contract?: string; raw: bigint; timestamp: Date; hash: string },
  ): void {
    const existing = edges.get(key)
    if (existing) {
      existing.count += 1
      existing.totalRaw += item.raw
      if (item.timestamp < existing.firstSeen) existing.firstSeen = item.timestamp
      if (item.timestamp > existing.lastSeen) existing.lastSeen = item.timestamp
      if (existing.hashes.length < SAMPLE_HASH_LIMIT) existing.hashes.push(item.hash)
    } else {
      edges.set(key, {
        count: 1,
        totalRaw: item.raw,
        decimals: item.decimals,
        asset: item.asset,
        contract: item.contract,
        firstSeen: item.timestamp,
        lastSeen: item.timestamp,
        hashes: [item.hash],
      })
    }
  }
}
