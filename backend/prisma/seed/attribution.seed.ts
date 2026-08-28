/**
 * Curated attribution seed.
 *
 * RULES FOR THIS FILE:
 * 1. An address may only be added after manual verification against a real,
 *    publicly accessible source (official project docs, block explorer labels
 *    corroborated by multiple independent explorers, or peer-reviewed work).
 * 2. `source` must be a citation a reviewer can open and check in minutes.
 * 3. Confidence must be conservative:
 *      HIGH  = self-evident/official (immutable contract documented by its own project)
 *      MEDIUM = explorer name-tag corroborated by several independent explorers,
 *               but no official attestation from the entity itself
 * 4. `lastVerified` records when the last human check happened. Re-verify on reuse.
 *
 * Full verification notes: docs/ATTRIBUTION_SOURCES.md
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const VERIFIED_ON = new Date('2026-08-25T00:00:00Z')

interface SeedRecord {
  address: string
  chain: string
  entityName: string
  entityType: string
  confidence: string
  source: string
  lastVerified: Date
  notes?: string
}

const RECORDS: SeedRecord[] = [
  {
    address: '0xd90e2f925DA726b50C4Ed8D0Fb90Ad053324F31b',
    chain: 'ethereum',
    entityName: 'Tornado Cash Router',
    entityType: 'mixer',
    confidence: 'HIGH',
    source: 'https://docs.tornado.cash/general/tornado-cash-smart-contracts (official Tornado Cash docs); Etherscan name tag "Tornado.Cash: Router"',
    lastVerified: VERIFIED_ON,
    notes: 'Immutable router contract documented by the Tornado Cash project itself; deposits/withdrawals observable on Etherscan.',
  },
  {
    address: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
    chain: 'ethereum',
    entityName: 'Uniswap V2 Router02',
    entityType: 'defi',
    confidence: 'HIGH',
    source: 'https://developers.uniswap.org/docs/protocols/v2/deployments (official Uniswap deployment addresses)',
    lastVerified: VERIFIED_ON,
    notes: 'Official Uniswap documentation lists this as the mainnet Router02 deployment.',
  },
  {
    address: '0xA0c68C638235ee32657e8f720a23ceC1bFc77C77',
    chain: 'ethereum',
    entityName: 'Polygon PoS Bridge (RootChainManagerProxy)',
    entityType: 'bridge',
    confidence: 'HIGH',
    source: 'https://docs.polygon.technology/pos/how-to/bridging/ethereum-polygon/matic-to-ethereum (official Polygon docs); corroborated by Ledger/arXiv paper "Tracing Cross-chain Transactions between EVM-based Blockchains"',
    lastVerified: VERIFIED_ON,
    notes: 'Official Polygon documentation instructs users to call exit() on RootChainManager at exactly this address.',
  },
  {
    address: '0x28C6c06298d514Db089934071355E5743bf21d60',
    chain: 'ethereum',
    entityName: 'Binance 14 (hot wallet)',
    entityType: 'exchange',
    confidence: 'MEDIUM',
    source: 'Etherscan name tag https://etherscan.io/address/0x28C6c06298d514Db089934071355E5743bf21d60; corroborated by BscScan, BaseScan and Blockchain.com ("Exchange Binance: Hot Wallet")',
    lastVerified: VERIFIED_ON,
    notes: 'Explorer label widely corroborated across independent explorers; Binance has not published a signed attestation of this specific address.',
  },
  {
    address: '0x71660c4005BA85c37ccec55d0C4493E66Fe775d3',
    chain: 'ethereum',
    entityName: 'Coinbase 1',
    entityType: 'exchange',
    confidence: 'MEDIUM',
    source: 'Etherscan name tags "Coinbase 1" / "Coinbase Exchange" https://etherscan.io/address/0x71660c4005BA85c37ccec55d0C4493E66Fe775d3',
    lastVerified: VERIFIED_ON,
    notes: 'Long-standing explorer label for a Coinbase-operated address. Low recent activity; treat as legacy/deposit-style address.',
  },
]

async function main(): Promise<void> {
  console.log(`Seeding ${RECORDS.length} verified attribution records...`)
  for (const record of RECORDS) {
    await prisma.attributionRecord.upsert({
      where: { address_chain: { address: record.address, chain: record.chain } },
      update: {
        entityName: record.entityName,
        entityType: record.entityType,
        confidence: record.confidence,
        source: record.source,
        lastVerified: record.lastVerified,
        notes: record.notes,
      },
      create: record,
    })
    console.log(`  + ${record.entityName} (${record.entityType}, ${record.confidence})`)
  }
  console.log('Done.')
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
