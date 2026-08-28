import { prisma, type Prisma } from '../database/prisma.js'
import { getChain } from '../blockchain/chains.js'
import type { BlockchainProvider } from '../blockchain/types.js'
import { computeWalletStats } from '../blockchain/stats.js'
import { formatUnits } from '../blockchain/units.js'
import { assertValidAddress } from '../blockchain/address.js'
import { DemoBlockchainProvider } from '../demo/DemoBlockchainProvider.js'
import { DemoAttributionProvider } from '../attribution/DemoAttributionProvider.js'
import { GraphEngine } from '../graph/engine.js'
import type { GraphResult } from '../graph/types.js'
import { extractFlowPaths, type FlowPath } from '../fundflow/paths.js'
import { loadRiskConfig } from '../risk/config.js'
import { runRiskAnalysis } from '../risk/rules.js'
import { AppError } from '../middleware/errors.js'
import type { AttributionProvider } from '../attribution/AttributionProvider.js'

export interface CreateInvestigationInput {
  address: string
  chain: string
  caseId?: string
  victimAmount?: string
  victimCurrency?: string
  incidentType?: string
  depth?: number
  mode?: 'live' | 'demo'
}

export interface PipelineDeps {
  providerFactory: (chain: string) => BlockchainProvider
  attribution: AttributionProvider
}

interface PipelineOutcome {
  providerName: string
  transactions: Awaited<ReturnType<BlockchainProvider['getTransactions']>>
  walletStats: ReturnType<typeof computeWalletStats>
  balanceNative: string
  balanceSymbol: string
  graph: GraphResult
  flowPaths: FlowPath[]
}

async function executePipeline(
  address: string,
  chainSlug: string,
  depth: number,
  deps: PipelineDeps,
): Promise<PipelineOutcome> {
  const chain = getChain(chainSlug)
  const provider = deps.providerFactory(chain.slug)
  const graphEngine = new GraphEngine({ getProvider: deps.providerFactory, attribution: deps.attribution })

  const [balance, transactions] = await Promise.all([
    provider.getBalance(address),
    provider.getTransactions(address),
  ])
  // Investigator-facing depth counts intermediary hops; endpoints sit one
  // level beyond, so the crawl budget is depth+1 (engine hard-caps at 3).
  const graph = await graphEngine.crawl(address, chain.slug, {
    maxDepth: Math.min(depth + 1, 3),
    maxNodes: 25,
    maxEdgesPerNode: 8,
    minValueEth: 0.001,
  })
  const flowPaths = extractFlowPaths(graph)

  return {
    providerName: provider.name,
    transactions,
    walletStats: computeWalletStats(address, transactions, chain.nativeDecimals),
    balanceNative: formatUnits(balance.wei, balance.decimals),
    balanceSymbol: balance.symbol,
    graph,
    flowPaths,
  }
}

/**
 * Creates the investigation row immediately (status=running) and processes it
 * in the background. Clients poll GET /api/investigations/:id until the row
 * reaches completed|failed. Failures are recorded on the row, never silent.
 */
export function createInvestigation(
  input: CreateInvestigationInput,
  deps: PipelineDeps,
): Promise<{ id: string }> {
  const chain = getChain(input.chain) // throws UNKNOWN_CHAIN for bad slugs
  const address = assertValidAddress(input.address)
  const mode = input.mode === 'demo' ? 'demo' : 'live'

  return prisma.investigation
    .create({
      data: {
        caseId: input.caseId,
        chain: chain.slug,
        suspectAddress: address,
        mode,
        status: 'running',
        incidentType: input.incidentType,
        victimAmount: input.victimAmount,
        victimCurrency: input.victimCurrency,
      },
      select: { id: true },
    })
    .then(({ id }) => {
      void processInBackground(id, address, chain.slug, input.depth ?? 2, mode, deps)
      return { id }
    })
}

/** Demo runs resolve providers to the synthetic cluster — zero network, zero real attribution. */
function resolveModeDeps(
  mode: 'live' | 'demo',
  deps: PipelineDeps,
): PipelineDeps {
  if (mode === 'demo') {
    return {
      providerFactory: () => new DemoBlockchainProvider(),
      attribution: new DemoAttributionProvider(),
    }
  }
  return deps
}

async function processInBackground(
  id: string,
  address: string,
  chainSlug: string,
  depth: number,
  mode: 'live' | 'demo',
  deps: PipelineDeps,
): Promise<void> {
  const effective = resolveModeDeps(mode, deps)
  try {
    const outcome = await executePipeline(address, chainSlug, depth, effective)
    const riskConfig = loadRiskConfig()
    const { indicators, compositeScore, band } = runRiskAnalysis(
      { chain: chainSlug, address, transactions: outcome.transactions, graph: outcome.graph, flowPaths: outcome.flowPaths },
      riskConfig,
    )

    await prisma.$transaction([
      prisma.investigation.update({
        where: { id },
        data: {
          status: 'completed',
          riskScore: compositeScore,
          riskBand: band,
          completedAt: new Date(),
          summary: {
            provenance: mode === 'demo' ? 'demo' : 'on_chain',
            onChainSource: outcome.providerName,
            attributionSource: effective.attribution.name,
            balanceNative: outcome.balanceNative,
            balanceSymbol: outcome.balanceSymbol,
            walletStats: {
              ...outcome.walletStats,
              firstSeenAt: outcome.walletStats.firstSeenAt?.toISOString() ?? null,
              lastActivityAt: outcome.walletStats.lastActivityAt?.toISOString() ?? null,
            },
            limits: outcome.graph.limits,
            truncated: outcome.graph.truncated,
          },
        },
      }),
      prisma.riskIndicator.createMany({
        data: indicators.map((i) => ({
          investigationId: id,
          rule: i.rule,
          severity: i.severity,
          score: i.score,
          evidence: i.evidence,
          transactions: i.transactions as unknown as Prisma.InputJsonValue,
        })),
      }),
      prisma.graphSnapshot.create({
        data: {
          investigationId: id,
          nodes: outcome.graph.nodes as unknown as Prisma.InputJsonValue,
          edges: outcome.graph.edges as unknown as Prisma.InputJsonValue,
          depth,
        },
      }),
      // totalValueWei stores the value leaving the suspect along this path (first hop).
      prisma.flowPath.createMany({
        data: outcome.flowPaths.map((p) => ({
          investigationId: id,
          hops: p.hops as unknown as Prisma.InputJsonValue,
          totalValueWei: p.hops[0]?.totalValue ?? '0',
          endpointType: p.endpointEntityType ?? null,
        })),
      }),
    ])
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    await prisma.investigation
      .update({
        where: { id },
        data: { status: 'failed', completedAt: new Date(), summary: { error: message } },
      })
      .catch(() => undefined)
  }
}

export async function getInvestigationBundle(id: string) {
  const investigation = await prisma.investigation.findUnique({
    where: { id },
    include: {
      indicators: true,
      graphSnapshot: true,
      flowPaths: true,
    },
  })
  if (!investigation) {
    throw new AppError(404, 'INVESTIGATION_NOT_FOUND', `No investigation with id ${id}`)
  }
  return investigation
}

export async function listInvestigations(page: number, pageSize: number) {
  const [total, items] = await Promise.all([
    prisma.investigation.count(),
    prisma.investigation.findMany({
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        caseId: true,
        chain: true,
        suspectAddress: true,
        mode: true,
        status: true,
        incidentType: true,
        riskScore: true,
        riskBand: true,
        createdAt: true,
        completedAt: true,
      },
    }),
  ])
  return { total, page, pageSize, items }
}

