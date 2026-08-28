# Attribution Sources — Verification Log

Every record in the `AttributionRecord` table must be **manually verified against a real, publicly
accessible source before insertion**. Fabricated attribution is forbidden. This document is the audit
trail for the current seed (`backend/prisma/seed/attribution.seed.ts`, verified on **2026-08-25**).

Confidence policy:

| Confidence | Meaning |
|---|---|
| `HIGH` | Self-evident or official — e.g. an immutable contract documented by its own project |
| `MEDIUM` | Block-explorer name tag corroborated by multiple independent explorers, but no signed attestation from the entity itself |
| `LOW` / `UNKNOWN` | Weak/uncorroborated information (none currently seeded) |

---

## 1. Tornado Cash Router — `mixer` — HIGH

- **Address:** `0xd90e2f925DA726b50C4Ed8D0Fb90Ad053324F31b`
- **Source:** Official Tornado Cash documentation — https://docs.tornado.cash/general/tornado-cash-smart-contracts (“Tornado Router” row); corroborated by the Etherscan name tag “Tornado.Cash: Router” and live deposit/withdrawal activity visible on the address page.
- **Verification notes:** Router contract is immutable and documented by the project itself.
- **Caution during verification:** An address circulating from memory (`0xd90e…7667B`) did NOT verify; it was discarded. Only the docs-listed router was seeded.

## 2. Uniswap V2 Router02 — `defi` — HIGH

- **Address:** `0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D`
- **Source:** Official Uniswap deployment addresses — https://developers.uniswap.org/docs/protocols/v2/deployments (Mainnet V2Router02 row); matching Etherscan name tag “Uniswap V2: Router 2”.

## 3. Polygon PoS Bridge (RootChainManagerProxy) — `bridge` — HIGH

- **Address:** `0xA0c68C638235ee32657e8f720a23ceC1bFc77C77`
- **Source:** Official Polygon developer docs instructing `exit()` calls at exactly this address — https://docs.polygon.technology/pos/how-to/bridging/ethereum-polygon/matic-to-ethereum; independently corroborated by the peer-reviewed paper *“Tracing Cross-chain Transactions between EVM-based Blockchains: An Analysis of Ethereum-Polygon Bridges”* (Ledger journal / arXiv:2504.15449), which lists the same address as “Polygon (Matic): Bridge”.

## 4. Binance 14 (hot wallet) — `exchange` — MEDIUM

- **Address:** `0x28C6c06298d514Db089934071355E5743bf21d60`
- **Source:** Etherscan name tag “Binance 14” — https://etherscan.io/address/0x28C6c06298d514Db089934071355E5743bf21d60
- **Corroboration:** Same label on BscScan and BaseScan; Blockchain.com labels it “Exchange Binance: Hot Wallet”; extensive third-party press coverage of this specific wallet’s activity.
- **Why MEDIUM:** Explorer labels are community/explorer-maintained; Binance does not publish a signed attestation of this individual address.

## 5. Coinbase 1 — `exchange` — MEDIUM

- **Address:** `0x71660c4005BA85c37ccec55d0C4493E66Fe775d3`
- **Source:** Etherscan name tags “Coinbase 1” / “Coinbase Exchange” — https://etherscan.io/address/0x71660c4005BA85c37ccec55d0C4493E66Fe775d3
- **Why MEDIUM:** Long-standing explorer label without official attestation. Note: recent activity on this address is low; treat as legacy/deposit-style infrastructure.

---

## Rules for future records

1. Verify the address against a primary public source before writing the row. If you cannot cite it, do not add it.
2. Record the exact URL in `source` and set `lastVerified` to the date you checked.
3. Prefer `MEDIUM` for anything short of self-evident official documentation.
4. Re-check records periodically; explorer labels can change.
5. Demo-mode attributions (`DemoExchange X`, `DemoMixer M`, `DemoBridge B`) live in code
   (`src/attribution/DemoAttributionProvider.ts`), describe synthetic addresses only, and must never be copied into the real dataset.

**Last full review:** 2026-08-25
