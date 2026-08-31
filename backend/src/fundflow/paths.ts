import type { GraphEdge, GraphNode, GraphResult } from '../graph/types.js'

export interface FlowHop {
  from: string
  to: string
  asset: string
  totalValue: string
  transactionCount: number
  sampleTxHash: string
  firstSeen: string
  lastSeen: string
}

export interface FlowPath {
  hops: FlowHop[]
  /** Address of the terminal node of the path. */
  endpointAddress: string
  endpointEntityName?: string
  endpointEntityType?: string
  endpointConfidence?: string
  intermediaryCount: number
}

const MAX_PATHS = 10

/**
 * Extracts suspect→attributed-endpoint fund-flow paths by DFS over outgoing edges.
 * Any attributed entity terminates a path (mixers/bridges included — they are
 * investigative endpoints even though they aren't cash-out points).
 */
export function extractFlowPaths(graph: GraphResult): FlowPath[] {
  const nodesById = new Map<string, GraphNode>(graph.nodes.map((n) => [n.id, n]))
  const outBySource = new Map<string, GraphEdge[]>()
  for (const edge of graph.edges) {
    if (edge.direction === 'in') continue
    const list = outBySource.get(edge.source) ?? []
    list.push(edge)
    outBySource.set(edge.source, list)
  }

  const paths: FlowPath[] = []

  const isTerminal = (node: GraphNode | undefined): boolean =>
    !!node && node.role === 'attributed_entity' && !!node.entityType

  const walk = (currentId: string, hops: FlowHop[], intermediaries: number): void => {
    if (paths.length >= MAX_PATHS) return
    const node = nodesById.get(currentId)

    if (currentId !== graph.suspectAddress.toLowerCase() && node && isTerminal(node)) {
      paths.push({
        hops: [...hops],
        endpointAddress: node.address,
        endpointEntityName: node.entityName,
        endpointEntityType: node.entityType,
        endpointConfidence: node.attributionConfidence,
        intermediaryCount: intermediaries,
      })
      return
    }
    // Depth guard: paths cannot exceed the crawl's own depth budget.
    if (hops.length > graph.limits.maxDepth + 1 || !node) return

    const outs = [...(outBySource.get(currentId) ?? [])].sort(
      (a, b) => b.transactionCount - a.transactionCount,
    )
    for (const edge of outs) {
      if (hops.some((h) => h.from === edge.target)) continue
      walk(edge.target, [
        ...hops,
        {
          from: edge.source,
          to: edge.target,
          asset: edge.asset,
          totalValue: edge.totalValue,
          transactionCount: edge.transactionCount,
          sampleTxHash: edge.sampleTxHashes[0] ?? 'unknown',
          firstSeen: edge.firstSeen,
          lastSeen: edge.lastSeen,
        },
      ], node.role === 'intermediary' && currentId !== graph.suspectAddress.toLowerCase() ? intermediaries + 1 : intermediaries)
    }
  }

  walk(graph.suspectAddress.toLowerCase(), [], 0)
  return paths
}
