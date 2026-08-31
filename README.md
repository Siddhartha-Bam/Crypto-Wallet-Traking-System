# Real-Time Crypto Fraud Attribution System

**SIH 2026 · Problem Statement 26183**
*Real-Time Identification of Fraud-Linked Cryptocurrency Exchanges from Victim-Reported Suspect Wallet Addresses through Automated Blockchain Analytics*

Ministry of Home Affairs · I4C (CIS Division) · Theme: Blockchain & Cybersecurity

> **Evidence-based prototype.** Every blockchain-derived claim shown in this system originates from a real
> public blockchain API or is explicitly labelled as seeded/demo data. The system never invents exchange
> names, transaction hashes, balances or relationships, and never claims to identify the person behind a wallet.

---

## What it does

An investigator enters a suspect wallet address. The system:

1. validates the address (EIP-55 checksum) and chain,
2. retrieves real transaction history from Etherscan V2 (free key),
3. builds a bounded fund-flow graph (outflow-directed BFS with hard caps),
4. attributes known entities (exchange / mixer / bridge / DeFi) from a small curated dataset where every
   record cites a verifiable public source,
5. runs an explainable rule-based **Investigative Risk Score**, and
6. presents everything in an investigator UI plus an exportable 14-section report.

Two modes exist and are never mixed:

| Mode | Data source | Labelling |
|---|---|---|
| `LIVE` | Etherscan V2 + public RPC fallback | Green `ON-CHAIN FACT` badges |
| `DEMO` | Deterministic synthetic cluster (`src/demo`) | Purple banner + graph watermark “DEMO / SEEDED INTELLIGENCE” |

### Provenance discipline (core design rule)

Every API envelope carries a machine-readable provenance tag, rendered as a badge in the UI:

| Tag | Meaning |
|---|---|
| `on_chain` | Verified blockchain data (source provider + retrieval timestamp attached) |
| `attribution` | Entity label from the seeded dataset — always with citation + confidence + last-verified date |
| `inference` | Output of risk/fund-flow heuristics — accompanied by a “not evidence of crime” disclaimer |
| `demo` | Synthetic presentation data; isolated from live data at the pipeline level |

Attribution is **never inferred merely because funds reached an address**. Unlisted endpoints render as
“unknown”. See [docs/ATTRIBUTION_SOURCES.md](docs/ATTRIBUTION_SOURCES.md) for every seeded record’s source.

---

## Architecture

```
frontend/ (Vite · React 19 · TypeScript · Ant Design · @xyflow/react)
   │  REST via dev proxy (/api → :4000)
backend/ (Node 20+ · Express 4 · TypeScript ESM · zod · pino)
   ├── blockchain/    BlockchainProvider abstraction
   │     ├── EtherscanProvider   (primary — balances, txs w/ timestamps, ERC-20 transfers, block times)
   │     ├── RpcProvider         (fallback — balance & block timestamps only)
   │     └── ResilientBlockchainProvider (per-method failover on 429/502/503)
   ├── attribution/   AttributionProvider abstraction
   │     ├── SeededAttributionProvider (Postgres-backed curated dataset)
   │     └── DemoAttributionProvider   (synthetic, demo mode only)
   ├── graph/         headless BFS crawl engine (depth/node/value caps, dedup, edge aggregation)
   ├── fundflow/      suspect→attributed-endpoint path extraction
   ├── risk/          9 explainable rules + composite score, config-driven (risk-rules.json)
   ├── investigations/ async pipeline orchestrator + persistence
   ├── reports/       14-section HTML/JSON report builder
   ├── demo/          deterministic synthetic cluster for demo mode
   └── database/      Prisma client (PostgreSQL)
```

**Stack:** PostgreSQL 18 + Prisma 6 · Express rate-limiting/helmet/CORS · Vitest (48 tests)

---

## Getting started

### Prerequisites
- Node.js ≥ 20, npm ≥ 10
- PostgreSQL ≥ 14 running locally

### Database setup (once)

```powershell
# using psql as superuser (adjust paths/password)
psql -U postgres -c "CREATE ROLE crypto_app LOGIN PASSWORD 'crypto_app_dev' CREATEDB;"
psql -U postgres -c "CREATE DATABASE crypto_trace OWNER crypto_app;"
```

### Backend

```powershell
cd backend
copy .env.example .env        # then edit values
npm install
npx prisma migrate dev        # creates schema
npm run db:seed               # inserts 5 verified attribution records
npm test                      # 48 tests
npm run dev                   # http://localhost:4000
```

`.env` keys:

| Key | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `BLOCKCHAIN_API_KEY` | Free Etherscan key (https://etherscan.io/apis). Required for LIVE mode; demo works without |
| `RPC_URL` | optional public RPC for balance fallback |
| `ETHERSCAN_MIN_INTERVAL_MS` | throttle (default 350 — free keys enforce ~3 req/s) |
| `WALLET_TX_WINDOW` | max transactions analysed per address (default 10 000, provider-capped at 1 000/call) |

### Frontend

```powershell
cd frontend
npm install
npm run dev                   # http://localhost:5173 (proxies /api to :4000)
```

Open **Investigation** in the sidebar. Use mode **DEMO** for an offline presentation-ready case;
use **LIVE** with any real Ethereum address (needs the API key).

---

## API reference

All responses are JSON with structured errors `{error:{code,message}}`. Inputs are zod-validated; addresses are checksummed.

| Method & path | Notes |
|---|---|
| `POST /api/investigations` | body: `{address, chain?, mode?: live\|demo, caseId?, victimAmount?, victimCurrency?, incidentType?, depth?}` → `202 {id,statusUrl}`; processed asynchronously |
| `GET /api/investigations` | paginated list |
| `GET /api/investigations/:id` | full bundle (status, summary, indicators, graph snapshot, flow paths) |
| `GET /api/investigations/:id/report?format=html\|json` | 14-section report (HTML opens printable/PDF view) |
| `GET /api/wallet/:chain/:address` | address intelligence snapshot |
| `GET /api/wallet/:chain/:address/transactions?type=normal\|token` | server-paginated history |
| `GET /api/wallet/:chain/:address/graph` | `?depth=1..3&maxNodes&maxEdgesPerNode&minValueEth` |
| `GET /api/wallet/:chain/:address/attribution` | seeded-dataset lookup (empty = unknown, never inferred) |
| `GET /api/wallet/:chain/:address/risk` | indicators + composite Investigative Risk Score |
| `GET /api/stats` · `GET /api/health` | dashboard metrics (DB-derived) · liveness + provider config |

### Risk engine

Rules live in [`backend/src/config/risk-rules.json`](backend/src/config/risk-rules.json) — thresholds,
scores and severities are editable without code changes. Composite = Σ scores capped at 100:

`0–29 Low · 30–59 Medium · 60–79 High · 80–100 Critical`

Rules: `rapid_movement`, `high_volume_pass_through`, `fan_out`, `fan_in`, `peel_chain`, `layering`,
`exchange_exposure`, `mixer_exposure`, `cross_chain_exposure`. Each indicator carries human-readable
evidence text plus sample transaction hashes.

The score is always labelled **Investigative Risk Score** with the disclaimer that it is a pattern-based
investigative aid, not proof of criminal activity.

---

## Demo scenario (deterministic)

`mode:'demo'` runs the identical pipeline over a fixed synthetic cluster — no network, same output every run:

```
16 victims ──fan-in──▶ SUSPECT ──8.0 ETH──▶ Burner A ──7.6 ETH──▶ Burner B ──7.4 ETH──▶ DemoExchange X
                        │ ├──▶ DemoMixer M (1.0 ETH)          └─▶ DemoBridge B (0.4 ETH)
                        │ └──▶ peel-chain ×6 + 12-address fan-out
```

Hashes carry a visible `0xdemohash-*` marker. All nine risk rules trigger; the generated report is stamped
**DEMO / SEEDED INTELLIGENCE** throughout.

---

## Security posture

zod validation on every route · helmet headers · CORS allowlist · express-rate-limit (120/min general)
· 100 kB body cap · Prisma parameterisation only · pino structured logs with secret redaction · secrets
only in gitignored `.env` · no personal data stored beyond optional case reference · auth middleware stub
ready for future SSO.

## Honest limitations (MVP)

- Single chain (Ethereum); provider windows cap at ~1 000 txs/address per call (truncation flagged).
- Attribution dataset is intentionally tiny (5 records) — quality over quantity; each row is manually sourced.
- Token transfers aggregated but not fiat-valued; USD/INR conversion not implemented.
- No streaming/indexer infrastructure; “real-time” = on-demand fresh queries + caching.
- The system does **not** deanonymise users, freeze funds, integrate NCRP/SAHYOG, or support Bitcoin/Tron/Solana yet
  (the provider interface makes those additions straightforward).

## Verification status

- Backend: **48/48 tests passing** (vitest; engines tested against fixtures, network mocked)
- Live checks performed during development: real balance/graph/risk on public addresses; free-key rate
  limit (3/s) discovered and throttled around; pass-through ratio anomaly caught by live probing and fixed.
