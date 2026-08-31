import { Router } from 'express'
import { prisma } from '../database/prisma.js'

export const statsRouter = Router()

/**
 * GET /api/stats
 * Dashboard metrics derived exclusively from stored investigations.
 * Returns zeros until real investigations exist — never synthetic numbers.
 */
statsRouter.get('/', async (_req, res) => {
  const [totalInvestigations, activeInvestigations, highRiskCount, chainGroups, recent] = await Promise.all([
    prisma.investigation.count(),
    prisma.investigation.count({ where: { status: { in: ['pending', 'running'] } } }),
    prisma.investigation.count({ where: { riskBand: { in: ['high', 'critical'] } } }),
    prisma.investigation.groupBy({ by: ['chain'], _count: { _all: true } }),
    prisma.investigation.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        caseId: true,
        chain: true,
        suspectAddress: true,
        mode: true,
        status: true,
        riskScore: true,
        riskBand: true,
        createdAt: true,
      },
    }),
  ])

  res.json({
    totals: {
      investigations: totalInvestigations,
      active: activeInvestigations,
      highRiskWallets: highRiskCount,
    },
    chainDistribution: chainGroups.map((g) => ({ chain: g.chain, count: g._count._all })),
    recentInvestigations: recent,
  })
})
