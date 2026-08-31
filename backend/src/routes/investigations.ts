import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express'
import { z } from 'zod'
import { createInvestigation, getInvestigationBundle, listInvestigations, type PipelineDeps } from '../investigations/pipeline.js'
import { buildReportHtml, buildReportJson } from '../reports/reportBuilder.js'
import type { InvestigationBundleData } from '../reports/types.js'
import { AppError } from '../middleware/errors.js'

function wrap(handler: (req: Request, res: Response) => Promise<void>): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch(next)
  }
}

export function createInvestigationsRouter(deps: PipelineDeps): Router {
  const router = Router()

  const createBodySchema = z.object({
    address: z.string().min(1),
    chain: z.string().default('ethereum'),
    mode: z.enum(['live', 'demo']).default('live'),
    caseId: z.string().max(100).optional(),
    victimAmount: z.string().regex(/^\d+(\.\d+)?$/, 'victimAmount must be a decimal number').optional(),
    victimCurrency: z.enum(['INR', 'USD']).default('INR'),
    incidentType: z
      .enum(['upi_fraud', 'otp_scam', 'investment_scam', 'extortion', 'impersonation', 'other'])
      .optional(),
    depth: z.coerce.number().int().min(1).max(3).default(2),
  })

  const listQuerySchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(10),
  })

  router.post(
    '/',
    wrap(async (req, res) => {
      const parsed = createBodySchema.safeParse(req.body)
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid investigation request',
            details: parsed.error.issues,
          },
        })
        return
      }
      // Invalid addresses/chains throw typed AppErrors inside createInvestigation.
      try {
        const { id } = await createInvestigation(parsed.data, deps)
        res.status(202).json({ id, statusUrl: `/api/investigations/${id}` })
      } catch (err) {
        if (err instanceof AppError) throw err
        throw err
      }
    }),
  )

  router.get(
    '/',
    wrap(async (req, res) => {
      const parsed = listQuerySchema.safeParse(req.query)
      if (!parsed.success) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid query parameters' } })
        return
      }
      const result = await listInvestigations(parsed.data.page, parsed.data.pageSize)
      res.json(result)
    }),
  )

  router.get(
    '/:id',
    wrap(async (req, res) => {
      const bundle = await getInvestigationBundle(req.params.id as string)
      res.json(bundle)
    }),
  )

  router.get(
    '/:id/report',
    wrap(async (req, res) => {
      const format = req.query.format === 'json' ? 'json' : 'html'
      const b = await getInvestigationBundle(req.params.id as string)
      if (b.status !== 'completed') {
        throw new AppError(409, 'REPORT_NOT_READY', 'Report is available once the investigation completes')
      }
      const data: InvestigationBundleData = {
        investigation: {
          id: b.id,
          caseId: b.caseId,
          chain: b.chain,
          suspectAddress: b.suspectAddress,
          mode: b.mode === 'demo' ? 'demo' : 'live',
          status: b.status,
          incidentType: b.incidentType,
          victimAmount: b.victimAmount,
          victimCurrency: b.victimCurrency,
          riskScore: b.riskScore,
          riskBand: b.riskBand,
          createdAt: b.createdAt,
          completedAt: b.completedAt,
          summary: (b.summary as InvestigationBundleData['investigation']['summary']) ?? null,
        },
        indicators: b.indicators.map((i) => ({
          rule: i.rule as never,
          severity: i.severity as never,
          score: i.score,
          evidence: i.evidence,
          transactions: (i.transactions as string[]) ?? [],
        })),
        graph: b.graphSnapshot
          ? {
              nodes: b.graphSnapshot.nodes as unknown as NonNullable<InvestigationBundleData['graph']>['nodes'],
              edges: b.graphSnapshot.edges as unknown as NonNullable<InvestigationBundleData['graph']>['edges'],
            }
          : null,
        flowPaths: b.flowPaths.map((fp) => ({
          hops: ((fp.hops as unknown as InvestigationBundleData['flowPaths']) ?? []) as never,
          endpointAddress: '',
          endpointEntityName: undefined,
          endpointEntityType: fp.endpointType ?? undefined,
          intermediaryCount: 0,
        })),
      }
      // FlowPath rows persist only the hop array; rebuild endpoint metadata from the graph.
      for (const path of data.flowPaths) {
        const lastHop = path.hops[path.hops.length - 1]
        if (lastHop) {
          path.endpointAddress = lastHop.to
          const node = data.graph?.nodes.find((n) => n.id === lastHop.to.toLowerCase())
          if (node?.entityName) {
            path.endpointEntityName = node.entityName
            path.endpointConfidence = node.attributionConfidence
            path.endpointEntityType = node.entityType
            let intermediaries = 0
            for (const hop of path.hops) {
              const fromNode = data.graph?.nodes.find((n) => n.id === hop.from.toLowerCase())
              if (fromNode?.role === 'intermediary') intermediaries += 1
            }
            path.intermediaryCount = intermediaries
          }
        }
      }

      if (format === 'json') {
        res.setHeader('Content-Disposition', `attachment; filename="report-${b.id}.json"`)
        res.json(buildReportJson(data))
        return
      }
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.setHeader('Content-Disposition', `inline; filename="report-${b.id}.html"`)
      res.send(buildReportHtml(data))
    }),
  )

  return router
}
