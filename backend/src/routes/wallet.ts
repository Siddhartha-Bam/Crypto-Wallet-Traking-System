import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express'
import { z } from 'zod'
import { assertValidAddress } from '../blockchain/address.js'
import {
  createBlockchainProvider,
  formatUnits,
  getChain,
} from '../blockchain/index.js'
import { computeWalletStats } from '../blockchain/stats.js'
import type { BlockchainProvider } from '../blockchain/types.js'
import { SeededAttributionProvider } from '../attribution/SeededAttributionProvider.js'
import type { AttributionProvider } from '../attribution/AttributionProvider.js'
import { GraphEngine } from '../graph/engine.js'
import { extractFlowPaths } from '../fundflow/paths.js'
import { loadRiskConfig } from '../risk/config.js'
import { runRiskAnalysis } from '../risk/rules.js'
import { AppError } from '../middleware/errors.js'

/** Express 4 does not catch rejections from async handlers — forward them explicitly. */
function wrap(handler: (req: Request, res: Response) => Promise<void>): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch(next)
  }
}

export interface WalletRouterDeps {
  providerFactory?: (chain: string) => BlockchainProvider
  attribution?: AttributionProvider
}

const RISK_DISCLAIMER =
  'The Investigative Risk Score is a pattern-based investigative aid derived from configurable heuristics over on-chain activity. It is NOT evidence of criminal activity and must not be treated as proof of wrongdoing.'

export function createWalletRouter(deps: WalletRouterDeps = {}): Router {
  const providerFactory = deps.providerFactory ?? createBlockchainProvider
  const attribution = deps.attribution ?? new SeededAttributionProvider()
  const graphEngine = new GraphEngine({ getProvider: providerFactory, attribution })

  const router = Router()

  const addressParamsSchema = z.object({
    chain: z.string().min(1),
    address: z.string().min(1),
  })

  const listQuerySchema = z.object({
    type: z.enum(['normal', 'token']).default('normal'),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(200).default(25),
    max: z.coerce.number().int().positive().max(10_000).optional(),
  })

  const graphQuerySchema = z.object({
    depth: z.coerce.number().int().min(1).max(3).default(2),
    maxNodes: z.coerce.number().int().min(2).max(60).default(25),
    maxEdgesPerNode: z.coerce.number().int().min(1).max(15).default(8),
    minValueEth: z.coerce.number().min(0).max(1000).default(0.001),
  })

  interface Target {
    provider: BlockchainProvider
    address: string
    chainSlug: string
    nativeDecimals: number
  }

  function resolveTarget(req: Request): Target {
    const parsed = addressParamsSchema.safeParse(req.params)
    if (!parsed.success) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid route parameters')
    }
    const chain = getChain(parsed.data.chain)
    const address = assertValidAddress(parsed.data.address)
    return {
      provider: providerFactory(chain.slug),
      address,
      chainSlug: chain.slug,
      nativeDecimals: chain.nativeDecimals,
    }
  }

  router.get(
    '/:chain/:address',
    wrap(async (req, res) => {
      const target = resolveTarget(req)

      const [balance, transactions] = await Promise.all([
        target.provider.getBalance(target.address),
        target.provider.getTransactions(target.address),
      ])

      const stats = computeWalletStats(target.address, transactions, target.nativeDecimals)

      res.json({
        meta: {
          provenance: 'on_chain' as const,
          source: target.provider.name,
          chain: target.chainSlug,
          retrievedAt: new Date().toISOString(),
          window: { requestedMax: transactions.length, analyzed: transactions.length },
        },
        address: target.address,
        chain: target.chainSlug,
        balance: {
          wei: balance.wei,
          native: formatUnits(balance.wei, balance.decimals),
          symbol: balance.symbol,
        },
        stats,
      })
    }),
  )

  router.get(
    '/:chain/:address/transactions',
    wrap(async (req, res) => {
      const query = listQuerySchema.safeParse(req.query)
      if (!query.success) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid query parameters', details: query.error.issues },
        })
        return
      }

      const target = resolveTarget(req)
      const max = query.data.max ?? 10_000
      const items =
        query.data.type === 'token'
          ? await target.provider.getTokenTransfers(target.address, max)
          : await target.provider.getTransactions(target.address, max)

      const totalItems = items.length
      const totalPages = Math.max(1, Math.ceil(totalItems / query.data.pageSize))
      const start = (query.data.page - 1) * query.data.pageSize

      res.json({
        meta: {
          provenance: 'on_chain' as const,
          source: target.provider.name,
          chain: target.chainSlug,
          retrievedAt: new Date().toISOString(),
          window: { requestedMax: max, analyzed: totalItems, truncated: totalItems >= max },
        },
        address: target.address,
        assetType: query.data.type,
        pagination: { page: query.data.page, pageSize: query.data.pageSize, totalItems, totalPages },
        items: items.slice(start, start + query.data.pageSize),
      })
    }),
  )

  router.get(
    '/:chain/:address/attribution',
    wrap(async (req, res) => {
      const target = resolveTarget(req)
      const results = await attribution.identify(target.address, target.chainSlug)
      res.json({
        meta: {
          provenance: 'attribution' as const,
          source: attribution.name,
          chain: target.chainSlug,
          retrievedAt: new Date().toISOString(),
        },
        address: target.address,
        attributed: results.length > 0,
        items: results.map((r) => ({
          ...r,
          disclaimer: r.confidence !== 'HIGH'
            ? 'Explorer-label corroboration only — no official attestation from the entity.'
            : undefined,
        })),
      })
    }),
  )

  router.get(
    '/:chain/:address/graph',
    wrap(async (req, res) => {
      const query = graphQuerySchema.safeParse(req.query)
      if (!query.success) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid query parameters', details: query.error.issues },
        })
        return
      }
      const target = resolveTarget(req)
      const graph = await graphEngine.crawl(target.address, target.chainSlug, query.data)
      res.json({
        meta: {
          provenance: 'on_chain' as const,
          source: target.provider.name,
          chain: target.chainSlug,
          retrievedAt: graph.generatedAt,
          notes: [
            'Node/edge structure derives from on-chain transfers.',
            'entityName/entityType/confidence fields on nodes originate from the seeded attribution dataset (provenance: attribution), never inferred from fund flow alone.',
          ],
        },
        graph,
      })
    }),
  )

  router.get(
    '/:chain/:address/risk',
    wrap(async (req, res) => {
      const query = graphQuerySchema.safeParse(req.query)
      if (!query.success) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid query parameters', details: query.error.issues },
        })
        return
      }
      const target = resolveTarget(req)

      const [transactions, graph] = await Promise.all([
        target.provider.getTransactions(target.address),
        graphEngine.crawl(target.address, target.chainSlug, query.data),
      ])
      const flowPaths = extractFlowPaths(graph)
      const { indicators, compositeScore, band } = runRiskAnalysis(
        { chain: target.chainSlug, address: target.address, transactions, graph, flowPaths },
        loadRiskConfig(),
      )

      res.json({
        meta: {
          provenance: 'inference' as const,
          source: 'risk_engine_v1',
          chain: target.chainSlug,
          retrievedAt: new Date().toISOString(),
          inputs: {
            onChainData: target.provider.name,
            attributionDataset: attribution.name,
            rulesConfig: 'src/config/risk-rules.json',
          },
        },
        address: target.address,
        investigativeRiskScore: {
          score: compositeScore,
          band,
          bands: loadRiskConfig().bands,
          disclaimer: RISK_DISCLAIMER,
        },
        indicators,
        fundFlowPaths: flowPaths,
      })
    }),
  )

  return router
}
