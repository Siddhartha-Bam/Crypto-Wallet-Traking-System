# Real-Time Crypto Fraud Attribution System — Backend Documentation

**SIH 2026 · Problem Statement 26183**

*Real-Time Identification of Fraud-Linked Cryptocurrency Exchanges from Victim-Reported Suspect Wallet Addresses through Automated Blockchain Analytics*

Ministry of Home Affairs · I4C (CIS Division) · Theme: Blockchain & Cybersecurity

---

## 1. High-Level Architecture & Overview

### 1.1 Executive Summary

This backend implements a **Real-Time Crypto Fraud Attribution System** designed for law-enforcement investigators. Given a suspect wallet address on Ethereum, the system:

1. **Validates** the address (EIP-55 checksum) and chain
2. **Retrieves** real transaction history from Etherscan V2 (free tier) with an optional raw-RPC fallback for balances/block timestamps
3. **Builds** a bounded fund-flow graph via outflow-directed BFS with hard caps (depth ≤ 3, nodes ≤ 60, edges-per-node ≤ 15)
4. **Attributes** known entities (exchanges, mixers, bridges, DeFi) from a curated PostgreSQL dataset where every record cites a verifiable public source
5. **Runs** an explainable rule-based **Investigative Risk Score** (9 configurable rules)
6. **Persists** the full investigation and generates a 14-section exportable report (HTML/JSON)

**Two modes exist and are never mixed:**
| Mode | Data Source | Labelling |
|------|-------------|-----------|
| `LIVE` | Etherscan V2 + public RPC fallback | Green `ON-CHAIN FACT` badges |
| `DEMO` | Deterministic synthetic cluster (`src/demo/`) | Purple banner + "DEMO / SEEDED INTELLIGENCE" watermark |

**Provenance discipline (core design rule):** Every API envelope carries a machine-readable provenance tag:
- `on_chain` — Verified blockchain data (source provider + retrieval timestamp)
- `attribution` — Entity label from seeded dataset — always with citation + confidence + last-verified date
- `inference` — Output of risk/fund-flow heuristics — accompanied by "not evidence of crime" disclaimer
- `demo` — Synthetic presentation data; isolated from live data at the pipeline level

**Attribution is NEVER inferred merely because funds reached an address.** Unlisted endpoints render as "unknown".

### 1.2 System Architecture

```mermaid
flowchart TD
    Client[Investigator UI / curl] -->|HTTPS /api| GW[Express 4 + Helmet + CORS + RateLimit]
    GW -->|validated| Health[/health/]
    GW -->|validated| Stats[/stats/]
    GW -->|validated| Wallet[/wallet/:chain/:address*]
    GW -->|validated| Inv[/investigations/]
    
    Health --> DB[(PostgreSQL via Prisma)]
    Stats --> DB
    
    Wallet --> BCP[BlockchainProvider Factory]
    BCP -->|primary| ESP[EtherscanProvider]
    BCP -->|fallback| RPC[RpcProvider]
    ESP -->|throttle 350ms| Etherscan[(Etherscan V2 API)]
    RPC -->|JSON-RPC| RPCEndpoint[(Public RPC)]
    ESP -->|TTL Cache 15s| BalanceCache
    ESP -->|TTL Cache 60s| TxCache
    ESP -->|TTL Cache 60s| TokenCache
    
    Inv --> Pipe[Pipeline Orchestrator]
    Pipe -->|async background| BCP
    Pipe -->|attribution| AP[AttributionProvider]
    AP -->|seeded| SA[SeededAttributionProvider]
    AP -->|demo| DA[DemoAttributionProvider]
    SA --> DB
    DA -.->|synthetic| DemoData[(In-memory)]
    
    Pipe --> GE[GraphEngine]
    GE -->|BFS crawl| BCP
    GE -->|attribution| AP
    GE --> FF[fundflow/paths]
    FF --> RE[RiskEngine]
    RE -->|config| RiskConfig[risk-rules.json]
    Pipe --> DB[Persist: Investigation, Indicators, GraphSnapshot, FlowPath]
    Pipe --> RB[ReportBuilder]
    RB --> HTML[HTML Report]
    RB --> JSON[JSON Report]
```

**Request Flow Detail:**

```
Client Request
    │
    ▼
Express Middleware Stack
    ├── httpLogger (pino-http) — structured JSON logs, redacted auth/cookies
    ├── helmet() — security headers (CSP, HSTS, etc.)
    ├── cors(origin allowlist, credentials)
    ├── express.json({ limit: '100kb' }) — body parser with size cap
    └── rateLimit(window=60s, max=120) — draft-7 standard headers
    │
    ▼
Route Handlers (zod-validated)
    ├── /api/health → checkDatabase() + provider config status
    ├── /api/stats → dashboard aggregates from Investigation table
    ├── /api/wallet/:chain/:address → on-demand intelligence
    │     ├── GET / → balance + stats (computeWalletStats)
    │     ├── GET /transactions → paginated history (normal/token)
    │     ├── GET /attribution → seeded dataset lookup
    │     ├── GET /graph → GraphEngine.crawl() bounded BFS
    │     └── GET /risk → GraphEngine + RiskEngine composite
    └── /api/investigations → async pipeline
          ├── POST / → create row (status=running) → 202 {id, statusUrl}
          │         background: executePipeline → GraphEngine → RiskEngine → persist
          ├── GET / → paginated list
          ├── GET /:id → full bundle (indicators, graph, paths)
          └── GET /:id/report?format=html|json → ReportBuilder
```

### 1.3 Core Technology Choices

| Category | Choice | Rationale |
|----------|--------|-----------|
| **Runtime** | Node.js ≥ 20 (ESM) | LTS, native fetch, top-level await, `import attributes` for JSON config |
| **Framework** | Express 4 | Minimal, well-understood, middleware ecosystem; no opinionated DI needed at this scale |
| **Language** | TypeScript 7 (strict) | Compile-time safety for external API boundaries (Etherscan, RPC, DB); `noUncheckedIndexedAccess` catches missing null checks |
| **Validation** | Zod 3 | Schema-as-code for env, route params, query, body; single source of truth; infers TS types |
| **Database** | PostgreSQL 14+ + Prisma 6 | Relational integrity for investigations/indicators/graph/paths; Prisma = type-safe queries, migrations, zero SQL injection surface |
| **Logging** | Pino + pino-http | Structured JSON, sub-millisecond overhead, built-in redaction (`req.headers.authorization`, `*.apiKey`), child loggers |
| **Caching** | In-process `TtlCache` + `Throttle` | Zero external deps; Etherscan free tier ~3 req/s → 350 ms minimum interval; 500-entry LRU bounds memory |
| **Testing** | Vitest | Native ESM, fast, Jest-compatible API; 48 tests covering units, providers (mocked), pipeline, reports |
| **Security** | Helmet + CORS allowlist + rate-limit + 100 kB body cap + Prisma parameterization | Defense-in-depth; no auth yet (stub ready) but transport + input hardening complete |
| **Demo Data** | Deterministic synthetic cluster | Zero network, reproducible CI, visible `0xdemohash-*` markers; never mixes with live data |

---

## 2. Project Structure & Directory Layout

```
backend/
├── .env.example                 # Environment template
├── package.json                 # Dependencies, scripts (dev, build, test, db:*)
├── tsconfig.json                # Strict TS config (ES2022, NodeNext, noUncheckedIndexedAccess)
├── vitest.config.ts             # Test config (globals, environment: node)
├── prisma/
│   ├── schema.prisma            # Database models (Investigation, WalletSnapshot, AttributionRecord, RiskIndicator, GraphSnapshot, FlowPath)
│   └── seed/
│       └── attribution.seed.ts  # Seeds 5 verified attribution records
├── src/
│   ├── server.ts                # App bootstrap, graceful shutdown (SIGINT/SIGTERM)
│   ├── app.ts                   # Express factory, middleware stack, route mounting
│   ├── config/
│   │   ├── env.ts               # Zod-validated env (fail-fast on boot)
│   │   └── risk-rules.json      # Risk rule thresholds, scores, severity, bands
│   ├── middleware/
│   │   ├── logger.ts            # Pino + pino-http (redaction, custom log levels)
│   │   └── errors.ts            # AppError class, Zod/413/500 handlers, structured error envelope
│   ├── database/
│   │   └── prisma.ts            # PrismaClient singleton (dev global), checkDatabase()
│   ├── blockchain/
│   │   ├── index.ts             # Factory + re-exports (createBlockchainProvider, types, utils)
│   │   ├── types.ts             # Domain types: Balance, Transaction, TokenTransfer, BlockchainProvider interface, SourceMeta
│   │   ├── chains.ts            # Chain registry (Ethereum only for MVP)
│   │   ├── address.ts           # EIP-55 checksum (keccak256), validation
│   │   ├── units.ts             # BigInt-based formatUnits (no float)
│   │   ├── stats.ts             # computeWalletStats — pure aggregation
│   │   ├── EtherscanProvider.ts # Primary provider (throttled, cached, V2 multichain)
│   │   ├── RpcProvider.ts       # Fallback (balance + block timestamp only)
│   │   └── ResilientProvider.ts # Per-method failover on 429/502/503
│   ├── attribution/
│   │   ├── types.ts             # AttributionResult, EntityType, Confidence
│   │   ├── AttributionProvider.ts # Interface (name, identify)
│   │   ├── SeededAttributionProvider.ts # Postgres-backed, 5-min TTL cache
│   │   └── DemoAttributionProvider.ts # 3 synthetic records (exchange/mixer/bridge)
│   ├── graph/
│   │   ├── types.ts             # GraphNode, GraphEdge, GraphResult, GraphCrawlOptions
│   │   └── engine.ts            # GraphEngine — bounded BFS, edge aggregation, attribution enrichment
│   ├── fundflow/
│   │   └── paths.ts             # extractFlowPaths — DFS from suspect to attributed endpoints
│   ├── risk/
│   │   ├── config.ts            # Zod schema + loadRiskConfig() (cached)
│   │   └── rules.ts             # 9 rule functions + runRiskAnalysis (composite + bands)
│   ├── investigations/
│   │   └── pipeline.ts          # createInvestigation, background process, getInvestigationBundle, listInvestigations
│   ├── reports/
│   │   ├── types.ts             # InvestigationBundleData (report input shape)
│   │   └── reportBuilder.ts     # buildReportJson + buildReportHtml (14 sections)
│   ├── demo/
│   │   └── DemoBlockchainProvider.ts # Deterministic synthetic cluster (16 victims → suspect → peel/fan/layering → exchange/mixer/bridge)
│   └── routes/
│       ├── health.ts            # GET /api/health
│       ├── stats.ts             # GET /api/stats
│       ├── wallet.ts            # GET /api/wallet/:chain/:address*
│       └── investigations.ts    # POST/GET /api/investigations*
├── dist/                        # Compiled output (gitignored)
├── tests/
│   ├── *.test.ts                # 48 tests (units, providers, intelligence, cache, demo+report, health, investigations)
└── node_modules/
```

### 2.1 Architectural Pattern

**Layered Architecture with Dependency Injection via Factory Functions**

```
┌─────────────────────────────────────────────────────────────┐
│                     HTTP Layer (Express)                    │
│  Middleware → Route Handlers (zod) → AppError / Response   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  Application / Orchestration                │
│  createWalletRouter(deps?) → createInvestigationsRouter    │
│  Pipeline: executePipeline → GraphEngine → RiskEngine      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                       Domain Layer                          │
│  BlockchainProvider  •  AttributionProvider  •  GraphEngine │
│  RiskEngine  •  ReportBuilder  •  FundFlowExtractor         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Infrastructure Layer                     │
│  EtherscanProvider  •  RpcProvider  •  ResilientProvider   │
│  SeededAttributionProvider (Prisma)  •  Demo* Providers    │
│  TtlCache  •  Throttle  •  PrismaClient                     │
└─────────────────────────────────────────────────────────────┘
```

**Why this pattern fits:**
- **Testability:** Every layer accepts dependencies (`WalletRouterDeps`, `PipelineDeps`) → swap real providers for fakes in tests
- **Separation of concerns:** HTTP logic never touches blockchain calls; domain logic never knows about Express
- **Single chain MVP:** Chain registry (`chains.ts`) isolates chain-specific config; adding Polygon/BSC = 1 file edit
- **No over-abstraction:** No interfaces for single implementations (e.g., `RiskEngine` is a plain function, not a class with one impl)

---

## 3. Configuration, Environment & Setup

### 3.1 Prerequisites

- **Node.js ≥ 20** (ESM, native `fetch`, `import attributes`)
- **npm ≥ 10**
- **PostgreSQL ≥ 14** (local or managed)
- **Etherscan API key (free)** — required for LIVE mode: https://etherscan.io/apis
- **Optional:** Public RPC endpoint (e.g., `https://eth.llamarpc.com`) for balance fallback

### 3.2 Environment Variables (`.env`)

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `NODE_ENV` | No | `development` | `development \| test \| production` — controls log level, Prisma logging |
| `PORT` | No | `4000` | HTTP server port |
| `CORS_ORIGIN` | No | `http://localhost:5173` | Comma-separated allowlist for CORS (frontend dev server) |
| `DATABASE_URL` | **Yes** | — | PostgreSQL connection string (`postgresql://user:pass@host:5432/db?schema=public`) |
| `BLOCKCHAIN_API_KEY` | No* | — | Free Etherscan key; **required for LIVE mode** |
| `RPC_URL` | No | — | Public JSON-RPC endpoint for balance/block fallback |
| `ETHERSCAN_BASE_URL` | No | `https://api.etherscan.io/v2/api` | Etherscan V2 multichain endpoint (single key covers all EVM) |
| `ETHERSCAN_MIN_INTERVAL_MS` | No | `350` | Throttle between Etherscan calls (free tier ~3 req/s → 350 ms headroom) |
| `WALLET_TX_WINDOW` | No | `10000` | Max transactions fetched per address (provider caps at 1000/call) |
| `RATE_LIMIT_WINDOW_MS` | No | `60000` | Rate-limit window (ms) |
| `RATE_LIMIT_MAX` | No | `120` | Max requests per window |

*Demo mode works without `BLOCKCHAIN_API_KEY`.

**Validation:** `src/config/env.ts` uses Zod `safeParse` on boot. Invalid config throws immediately with readable message:
```typescript
throw new Error(`Invalid environment configuration -> PORT: must be positive; DATABASE_URL: required`)
```

### 3.3 Local Setup (Step-by-Step)

```bash
# 1. PostgreSQL setup (as superuser)
psql -U postgres -c "CREATE ROLE crypto_app LOGIN PASSWORD 'crypto_app_dev' CREATEDB;"
psql -U postgres -c "CREATE DATABASE crypto_trace OWNER crypto_app;"

# 2. Backend
cd backend
cp .env.example .env
# Edit .env → set DATABASE_URL, BLOCKCHAIN_API_KEY (optional for demo)
npm install
npx prisma generate
npx prisma migrate dev    # Creates schema, prompts for migration name
npm run db:seed           # Inserts 5 verified attribution records
npm test                  # 48 tests (vitest)
npm run dev               # http://localhost:4000

# 3. Frontend (separate terminal)
cd ../frontend
npm install
npm run dev               # http://localhost:5173 (proxies /api → :4000)
```

**Verify:**
- `GET http://localhost:4000/api/health` → `{ "status": "ok", "services": { "database": "ok", ... } }`
- Frontend → Investigation page → Mode **DEMO** → enter any address → full pipeline runs offline

---

## 4. Deep Dive into Core Modules & Logic

### 4.1 Middleware Layer (`src/middleware/`)

#### `logger.ts`
- **Purpose:** Structured JSON logging with automatic redaction of secrets.
- **Implementation:** 
  - `pino` base logger: `debug` in dev, `info` in prod
  - Redacts: `req.headers.authorization`, `req.headers.cookie`, `*.password`, `*.apiKey`, `*.api_key`
  - `pino-http` integration: custom log level per response (error ≥500, warn ≥400, info otherwise)
  - `quietReqLogger: true` — avoids duplicate request lines
- **Why:** Single-line structured logs parse easily in ELK/Datadog; redaction prevents accidental secret leaks in logs.

#### `errors.ts`
- **Purpose:** Unified error envelope + typed domain errors.
- **Implementation:**
  - `AppError(status, code, message)` — explicit HTTP status + machine-readable code
  - `notFoundHandler` → 404 `{ error: { code: 'NOT_FOUND', message } }`
  - `errorHandler` (4-arg signature for Express):
    - `ZodError` → 400 `VALIDATION_ERROR` with field-level details
    - `AppError` → mapped status + code + message
    - `entity.too.large` (body-parser) → 413 `PAYLOAD_TOO_LARGE`
    - Unknown → 500 `INTERNAL_ERROR` + logged with full error object
- **Why:** Clients get consistent `{ error: { code, message, details? } }`; no stack traces leak; `AppError` lets domain code signal expected failures (e.g., `BLOCKCHAIN_NOT_CONFIGURED` 503) without try/catch noise.

### 4.2 Configuration Layer (`src/config/`)

#### `env.ts`
- **Purpose:** Single source of truth for runtime config; fail-fast validation.
- **Implementation:** Zod schema with `coerce.number()`, `enum`, `url()`, defaults. `safeParse` → throws on failure.
- **Why:** Misconfiguration (missing `DATABASE_URL`, invalid port) crashes at startup, not at first request. Type-safe `env` object used everywhere.

#### `risk-rules.json` + `config.ts`
- **Purpose:** Externalize risk thresholds so investigators can tune without code changes.
- **Implementation:** JSON file loaded via `import ... with { type: 'json' }`; validated by Zod `riskConfigSchema` at load time (cached).
- **Structure:**
  ```json
  {
    "bands": { "lowUpper": 29, "mediumUpper": 59, "highUpper": 79 },
    "rules": {
      "rapid_movement": { "enabled": true, "score": 20, "severity": "medium", "maxMedianHoldHours": 24, "minInflowEth": 0.05 },
      ...
    }
  }
  ```
- **Why:** Risk scoring is policy, not code. JSON + Zod = human-editable + validated. Restart required (acceptable for MVP).

### 4.3 Database Layer (`src/database/prisma.ts`)

- **Purpose:** PrismaClient singleton with dev-mode global caching (prevents connection exhaustion under `tsx watch`).
- **Implementation:**
  ```typescript
  declare global { var __prisma: PrismaClient }
  export const prisma = globalThis.__prisma ?? new PrismaClient({ log: dev ? ['warn','error'] : ['error'] })
  if (env.NODE_ENV !== 'production') globalThis.__prisma = prisma
  ```
- **Why:** Prisma recommends this pattern for dev hot-reload. `checkDatabase()` used by `/health`.

### 4.4 Blockchain Layer (`src/blockchain/`)

#### Domain Types (`types.ts`)
- **Purpose:** Normalized, provider-agnostic domain model.
- **Key Types:**
  - `Balance { address, chain, wei: string, symbol, decimals }` — wei as decimal string (no precision loss)
  - `Transaction { hash, from, to, valueWei, timestamp, blockNumber, gasUsedWei, gasPriceWei, feeWei, isError, input, nonce }`
  - `TokenTransfer { txHash, logIndex, from, to, contractAddress, tokenSymbol, tokenDecimals, amountRaw, amount, timestamp, blockNumber }`
  - `BlockchainProvider` interface — 4 methods: `getBalance`, `getTransactions`, `getTokenTransfers`, `getBlockTimestamp`
  - `SourceMeta { provenance: 'on_chain', source, chain, retrievedAt, window? }` — attached to every wallet response

#### Chain Registry (`chains.ts`)
- **Purpose:** Single source for chain metadata (Etherscan chainId, native symbol/decimals).
- **MVP:** Only Ethereum (`etherscanChainId: 1`). Adding a chain = add entry + ensure provider supports it.
- **Error:** `UNKNOWN_CHAIN` (400) for unsupported slugs.

#### Address Utils (`address.ts`)
- **Purpose:** EIP-55 checksum + validation.
- **Implementation:** `keccak256` from `js-sha3`; `toChecksumAddress` implements EIP-55 exactly; `assertValidAddress` validates format + returns checksummed form.
- **Why:** Prevents silent bugs from case-mismatched addresses; rejects malformed input at API boundary.

#### Units (`units.ts`)
- **Purpose:** Base-unit → human decimal **without floating point**.
- **Algorithm:** String padding + slice, no `Number()` on large ints.
  ```typescript
  // formatUnits('123456789', 6) → '123.456789'
  const padded = digits.padStart(decimals + 1, '0')
  const intPart = padded.slice(0, -decimals)
  const fracPart = padded.slice(-decimals).replace(/0+$/, '')
  ```
- **Why:** Financial values must not lose precision; JS `Number` has 53-bit mantissa (~9e15) but wei is up to 1e18.

#### Stats (`stats.ts`)
- **Purpose:** Pure aggregation over normalized transactions (used by wallet route + pipeline).
- **Algorithm:** Single pass over `Transaction[]`:
  - Tracks `incomingWei`, `outgoingWei`, `failedTxCount`, `counterparties` (Set), `firstSeenAt`, `lastActivityAt`
  - Direction determined by comparing `from`/`to` to subject address (lowercased)
  - Self-transfers ignored
- **Why:** Pure function = testable, reusable, no side effects.

#### EtherscanProvider (`EtherscanProvider.ts`)
- **Purpose:** Primary on-chain data source (balances, txs, ERC-20 transfers, block timestamps).
- **Key Features:**
  - **Throttle:** `Throttle(350ms)` serializes all outbound calls → respects free-tier ~3 req/s
  - **Caching:** `TtlCache` per method (balance 15s, txs 60s, token 60s, block timestamps permanent)
  - **Error mapping:** HTTP 429 → `PROVIDER_RATE_LIMITED`; `message: 'NOTOK'` with rate-limit text → same; "no transactions found" → `[]` (not error)
  - **Etherscan V2:** Uses `chainid` query param (multichain ready)
  - **Mapping:** Raw rows → normalized `Transaction`/`TokenTransfer` with checksummed addresses, `Date` timestamps, `BigInt` fee calc
- **Why:** Etherscan is the most reliable free indexer; throttle+cache prevents 429s; V2 endpoint future-proofs for multichain.

#### RpcProvider (`RpcProvider.ts`)
- **Purpose:** Raw JSON-RPC fallback (balance + block timestamp only).
- **Limitations:** Explicitly throws `PROVIDER_UNSUPPORTED` (501) for `getTransactions`/`getTokenTransfers` — public RPCs cannot index address history.
- **Why:** Balance queries are cheap on RPC; avoids burning Etherscan quota for simple balance checks.

#### ResilientProvider (`ResilientProvider.ts`)
- **Purpose:** Per-method failover from primary (Etherscan) to fallback (RPC) on provider-side failures.
- **Logic:** Only falls back on `AppError` with status ∈ {429, 502, 503}. Primary error re-thrown if fallback also fails or cannot help.
- **Name:** Composed (`etherscan_v2+rpc:host`) for provenance.
- **Why:** Increases availability without hiding errors; fallback only for methods it can actually serve.

#### Factory (`index.ts`)
- **`createBlockchainProvider(chainSlug)`** — validates chain, checks `BLOCKCHAIN_API_KEY`, returns `ResilientBlockchainProvider(Etherscan, Rpc?)`. Throws `BLOCKCHAIN_NOT_CONFIGURED` (503) if key missing.

### 4.5 Attribution Layer (`src/attribution/`)

#### Types (`types.ts`)
- **`AttributionResult`**: `{ address, chain, entityName, entityType, confidence: 'HIGH'|'MEDIUM'|'LOW'|'UNKNOWN', source, lastVerified, notes? }`
- **EntityType enum:** `exchange | broker | processor | bridge | defi | mixer | gambling | unknown_service`
- **Constraint:** Every record **must** have a real, citable public source. Fabrication forbidden.

#### Provider Interface (`AttributionProvider.ts`)
- `readonly name: string`
- `identify(address, chain): Promise<AttributionResult[]>`

#### SeededAttributionProvider (`SeededAttributionProvider.ts`)
- **Purpose:** Production attribution backed by `attribution_record` table.
- **Implementation:** 
  - Loads all rows into `Map<chain:address, AttributionResult>` (cached 5 min)
  - `identify()` → exact match or `[]` (unknown)
  - `identifyMany()` → batch lookup for graph enrichment
- **Why:** Small curated dataset (5 records in seed) = quality over quantity. Cache avoids N+1 on graph crawl.

#### DemoAttributionProvider (`DemoAttributionProvider.ts`)
- **Purpose:** Labels 3 synthetic addresses (exchange/mixer/bridge) for demo mode.
- **Isolation:** Only reachable via `mode: 'demo'` investigations; never mixed with live data.
- **Source citation:** Explicitly marked `Synthetic demo dataset (SIH 26183 presentation)`.

### 4.6 Graph Layer (`src/graph/`)

#### Types (`types.ts`)
- **`GraphNode`**: `{ id (lowercase), address (checksummed), chain, role: 'suspect'|'intermediary'|'attributed_entity', depth, txCountAnalyzed?, balanceNative?, balanceSymbol?, entityName?, entityType?, attributionConfidence?, attributionSource? }`
- **`GraphEdge`**: `{ id, source, target, direction: 'in'|'out'|'internal', asset, assetContract?, assetDecimals?, transactionCount, totalValue (human), firstSeen, lastSeen, sampleTxHashes[] }`
- **`GraphResult`**: Full crawl output + `truncated` flag + `limits` + `generatedAt`

#### Engine (`engine.ts`)
- **Algorithm:** Bounded BFS (outflow-directed)
- **Hard caps (compile-time constants):**
  - `MAX_DEPTH_HARD_CAP = 3`
  - `MAX_NODES_HARD_CAP = 60`
  - `MAX_EDGES_PER_NODE_HARD_CAP = 15`
  - `SAMPLE_HASH_LIMIT = 3` per edge
- **Flow:**
  1. Start at suspect (depth 0, role `suspect`)
  2. For each node at depth < maxDepth:
     - Fetch transactions + token transfers (parallel)
     - Accumulate edges (native + token) via `upsert()` — aggregates by `from|to|asset`
     - Select outflow candidates: `asset === nativeSymbol && totalValue ≥ minValueEth`
     - Sort by volume desc, take `maxEdgesPerNode`
     - For each candidate target:
       - Query attribution
       - If attributed → `role: 'attributed_entity'` (terminal, never expanded)
       - Else → `role: 'intermediary'`, enqueue at depth+1
  3. Enrich suspect + attributed nodes with balances (best-effort)
  4. Build edges from accumulators with direction relative to suspect
- **Truncation:** `truncated: true` if hard caps hit — **never silent**.
- **Why BFS outflow-directed:** Fraud trails follow fund *movement* from suspect toward cash-out (exchanges/mixers/bridges). Inflow counterparties recorded as `direction: 'in'` edges for fan-in analysis but never expanded (would explode graph).
- **Why attributed entities are terminals:** Expanding an exchange hot wallet's millions of depositors is meaningless for attribution.

### 4.7 Fund Flow Layer (`src/fundflow/paths.ts`)

- **Purpose:** Extract suspect→attributed-endpoint paths for report + risk rules.
- **Algorithm:** DFS over outgoing edges (`direction !== 'in'`):
  - Terminal = node with `role === 'attributed_entity' && entityType`
  - Tracks `intermediaryCount` (nodes with `role === 'intermediary'`)
  - Max 10 paths (`MAX_PATHS`)
  - Returns `FlowPath[]` with ordered hops (from, to, asset, value, sampleTxHash, timestamps)
- **Why DFS not BFS:** We want complete paths to endpoints, not shortest paths. Depth guarded by crawl's `maxDepth + 1`.

### 4.8 Risk Layer (`src/risk/`)

#### Config (`config.ts`)
- Validated JSON → `RiskRulesConfig` with bands + 9 rules.
- Each rule: `{ enabled, score (0-100), severity, ...params }`

#### Rules (`rules.ts`)
- **Input:** `RiskAnalysisInput { chain, address, transactions[], graph, flowPaths[] }`
- **Output:** `RiskIndicator[]` + `compositeScore` (sum capped at 100) + `band`
- **9 Rules:**
  1. **rapid_movement** — ≥50% of inflow forwarded within `maxMedianHoldHours` (default 24h)
  2. **high_volume_pass_through** — outflow/inflow ratio ∈ [0.8, 1.2] + min outflow ETH
  3. **fan_out** — ≥ `minCounterparties` distinct outbound addresses
  4. **fan_in** — ≥ `minCounterparties` distinct inbound addresses
  5. **peel_chain** — ≥ `minSequentialTransfers` successive non-increasing outbound amounts
  6. **layering** — ≥ `minIntermediaryDepth` intermediaries on any flow path
  7. **exchange_exposure** — path reaches `entityType: exchange|broker`
  8. **mixer_exposure** — path reaches `entityType: mixer`
  9. **cross_chain_exposure** — path reaches `entityType: bridge`
- **Evidence:** Human-readable string + up to 3 sample transaction hashes per indicator.
- **Composite:** Sum of triggered rule scores, capped at 100 → bands: Low (0-29), Medium (30-59), High (60-79), Critical (80-100).
- **Why rule-based (not ML):** Explainable, auditable, configurable, zero training data needed, deterministic. Each indicator cites specific on-chain evidence.

### 4.9 Investigations Pipeline (`src/investigations/pipeline.ts`)

- **Entry:** `createInvestigation(input, deps)` → creates row `status: 'running'` → returns `{ id }` immediately (202)
- **Background:** `processInBackground()` → `executePipeline()` → persists in single transaction:
  - `Investigation` update: `status: 'completed'`, `riskScore`, `riskBand`, `completedAt`, `summary` (JSON)
  - `RiskIndicator` createMany
  - `GraphSnapshot` create (nodes/edges JSON)
  - `FlowPath` createMany (hops JSON + `totalValueWei` + `endpointType`)
- **Demo mode:** Swaps providers to `DemoBlockchainProvider` + `DemoAttributionProvider` — zero network.
- **Failure handling:** Catches any error → updates row `status: 'failed'` + `summary: { error }` — **never silent**.

### 4.10 Reports (`src/reports/reportBuilder.ts`)

- **14 Sections:**
  1. Case information
  2-3. Wallet summary & transaction statistics
  4. Fund-flow paths (table per path with hops)
  5. Attributed entities (table with confidence + source)
  6. Risk indicators (rule, severity, score, evidence)
  7. Investigative Risk Score (band + disclaimer)
  8. Evidence — all referenced transaction hashes
  9. Attribution sources (unique citations)
  10. Limitations (7-8 items, mode-aware)
  11. Recommended investigative actions (rule→action map)
  12. Disclaimer
- **Outputs:** `buildReportJson()` → structured object; `buildReportHtml()` → printable HTML with embedded CSS.
- **Why HTML + JSON:** HTML for investigators (print to PDF); JSON for downstream tooling.

### 4.11 Demo Cluster (`src/demo/DemoBlockchainProvider.ts`)

- **Deterministic synthetic data:** Fixed addresses (`0xa11ce1...`, `0xb0b57a...`, etc.), fixed timestamps (epoch `2026-08-20`), fixed amounts.
- **Scenario:**
  ```
  16 victims ──fan-in──▶ SUSPECT ──8.0 ETH──▶ Burner A ──7.6 ETH──▶ Burner B ──7.4 ETH──▶ DemoExchange X
                    │ ├──▶ DemoMixer M (1.0 ETH)          └─▶ DemoBridge B (0.4 ETH)
                    │ └──▶ peel-chain ×6 + 12-address fan-out
  ```
- **All 9 risk rules trigger.** Hashes marked `0xdemohash-******`.
- **Why:** Offline presentation, CI reproducibility, zero flakiness.

---

## 5. API Reference & Data Flow

### 5.1 Endpoints Overview

| Group | Endpoint | Description |
|-------|----------|-------------|
| **Health** | `GET /api/health` | Liveness + dependency config status |
| **Stats** | `GET /api/stats` | Dashboard metrics from Investigation table |
| **Wallet Intelligence** | `GET /api/wallet/:chain/:address` | Balance + stats |
| | `GET /api/wallet/:chain/:address/transactions` | Paginated history (normal/token) |
| | `GET /api/wallet/:chain/:address/attribution` | Seeded dataset lookup |
| | `GET /api/wallet/:chain/:address/graph` | Bounded fund-flow graph |
| | `GET /api/wallet/:chain/:address/risk` | Risk indicators + composite score |
| **Investigations** | `POST /api/investigations` | Start async investigation (202) |
| | `GET /api/investigations` | Paginated list |
| | `GET /api/investigations/:id` | Full bundle |
| | `GET /api/investigations/:id/report` | HTML/JSON report |

### 5.2 Key Workflow: Investigation Lifecycle

```
POST /api/investigations
  │
  ├─→ zod validation (CreateInvestigationInput)
  │
  ├─→ getChain(chain) → throws UNKNOWN_CHAIN (400)
  │
  ├─→ assertValidAddress(address) → throws INVALID_ADDRESS (400)
  │
  ├─→ prisma.investigation.create({ status: 'running', ... })
  │        │
  │        └─→ returns { id } → 202 { id, statusUrl: "/api/investigations/:id" }
  │
  └─→ processInBackground(id, ...) [non-blocking]
           │
           ├─→ resolveModeDeps(mode) → live: real providers | demo: synthetic
           │
           ├─→ executePipeline(address, chain, depth, deps)
           │       ├─→ providerFactory(chain) → ResilientBlockchainProvider
           │       ├─→ getBalance + getTransactions (parallel)
           │       ├─→ GraphEngine.crawl(maxDepth=depth+1, maxNodes=25, ...)
           │       │       ├─→ BFS with hard caps
           │       │       ├─→ attribution.identify() on each candidate
           │       │       └─→ balance enrichment (best-effort)
           │       ├─→ extractFlowPaths(graph)
           │       ├─→ loadRiskConfig()
           │       ├─→ runRiskAnalysis({ transactions, graph, flowPaths }, config)
           │       └─→ returns PipelineOutcome
           │
           ├─→ prisma.$transaction([
           │       investigation.update({ status: 'completed', riskScore, riskBand, summary }),
           │       riskIndicator.createMany(indicators),
           │       graphSnapshot.create(nodes, edges),
           │       flowPath.createMany(paths)
           │   ])
           │
           └─→ on error: investigation.update({ status: 'failed', summary: { error } })
```

**Polling:** Client calls `GET /api/investigations/:id` until `status === 'completed' | 'failed'`.

### 5.3 Error Handling Strategy

- **Contract:** All errors → `{ error: { code: string, message: string, details?: any[] } }`
- **Codes:**
  - `VALIDATION_ERROR` (400) — Zod failures (params, query, body)
  - `INVALID_ADDRESS` (400) — Malformed EVM address
  - `UNKNOWN_CHAIN` (400) — Unsupported chain slug
  - `BLOCKCHAIN_NOT_CONFIGURED` (503) — Missing `BLOCKCHAIN_API_KEY` for live mode
  - `PROVIDER_RATE_LIMITED` (429) — Etherscan 429 or rate-limit message
  - `PROVIDER_UNAVAILABLE` (503) — Network/timeout to provider
  - `PROVIDER_HTTP_ERROR` (502) — Non-2xx from provider
  - `PROVIDER_ERROR` (502) — Provider returned error payload
  - `PROVIDER_UNSUPPORTED` (501) — Method not implemented (e.g., RPC history)
  - `NOT_FOUND` (404) — Resource not found
  - `REPORT_NOT_READY` (409) — Investigation not completed
  - `INVESTIGATION_NOT_FOUND` (404)
  - `INTERNAL_ERROR` (500) — Unhandled exception (logged)
  - `RATE_LIMITED` (429) — Express rate-limit
  - `PAYLOAD_TOO_LARGE` (413) — Body > 100 kB
- **Why this contract:** Machine-readable `code` enables client-side handling (retry, UI messages); `details` for validation; no stack traces; consistent across all failure modes.

---

## 6. Database & Data Models

### 6.1 Paradigm & ORM

- **PostgreSQL 14+** — relational, ACID, JSONB support for flexible snapshots
- **Prisma 6** — type-safe client, migrations, zero SQL injection (parameterized only)

### 6.2 Schema Breakdown

```prisma
model Investigation {
  id             String   @id @default(cuid())
  caseId         String?  // optional external reference (NCRP ack #) — never PII
  chain          String   // "ethereum"
  suspectAddress String
  mode           String   @default("live")  // "live" | "demo" — NEVER mixed
  status         String   @default("pending") // pending | running | completed | failed
  incidentType   String?
  victimAmount   String?  // decimal string (no float)
  victimCurrency String?
  riskScore      Int?
  riskBand       String?  // low | medium | high | critical
  summary        Json?    // wallet snapshot + pipeline summary
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  completedAt    DateTime?

  indicators    RiskIndicator[]
  graphSnapshot GraphSnapshot?
  flowPaths     FlowPath[]

  @@unique([chain, suspectAddress, createdAt])
  @@index([status])
  @@index([riskBand])
}

model WalletSnapshot {
  id            String   @id @default(cuid())
  address       String
  chain         String
  balanceWei    String
  txCount       Int
  firstSeen     DateTime?
  lastActivity  DateTime?
  inVolumeWei   String
  outVolumeWei  String
  counterparties Int
  source        String   // "etherscan_v2" | "rpc:<host>"
  fetchedAt     DateTime @default(now())

  @@unique([address, chain, fetchedAt])
  @@index([address, chain])
}

model AttributionRecord {
  id           String   @id @default(cuid())
  address      String
  chain        String
  entityName   String
  entityType   String   // exchange | broker | processor | bridge | defi | mixer | gambling | unknown_service
  confidence   String   // HIGH | MEDIUM | LOW | UNKNOWN
  source       String   // citation (URL or doc reference)
  lastVerified DateTime
  notes        String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@unique([address, chain])
  @@index([entityType])
  @@index([entityName])
}

model RiskIndicator {
  id              String        @id @default(cuid())
  investigationId String
  investigation   Investigation @relation(fields: [investigationId], references: [id], onDelete: Cascade)
  rule            String
  severity        String       // info | low | medium | high
  score           Int
  evidence        String
  transactions    Json         // string[] of tx hashes

  @@index([investigationId])
}

model GraphSnapshot {
  id              String        @id @default(cuid())
  investigationId String        @unique
  investigation   Investigation @relation(fields: [investigationId], references: [id], onDelete: Cascade)
  nodes           Json
  edges           Json
  depth           Int
  generatedAt     DateTime      @default(now())
}

model FlowPath {
  id              String        @id @default(cuid())
  investigationId String
  investigation   Investigation @relation(fields: [investigationId], references: [id], onDelete: Cascade)
  hops            Json          // [{ from, to, txHash, valueWei, timestamp }]
  totalValueWei   String        // value leaving suspect on first hop
  endpointType    String?       // attributed_entity | unknown | suspect_only

  @@index([investigationId])
}
```

### 6.3 Critical Data Design Decisions

| Decision | Rationale |
|----------|-----------|
| **`cuid()` IDs** | Collision-resistant, sortable, no sequential leak |
| **`wei` as `String`** | Avoids 53-bit `Number` limit; Prisma `BigInt` not universally supported |
| **`victimAmount` as `String`** | Decimal precision for INR/USD; no float |
| **`mode` column on Investigation** | Enforces live/demo isolation at DB level; `summary.provenance` mirrors it |
| **`summary` + `graphSnapshot` + `flowPaths` as JSON** | Snapshot-at-completion; schema evolves without migrations; GraphEngine types are the contract |
| **`AttributionRecord.@@unique([address, chain])`** | One canonical label per address per chain; updates = re-verification |
| **`confidence` + `source` + `lastVerified` required** | Attribution provenance discipline — every record citable |
| **Cascade deletes** | Investigation deletion removes all children (indicators, graph, paths) — no orphans |
| **Indexes on `status`, `riskBand`, `investigationId`** | Dashboard queries + investigation detail lookups |

---

## 7. Middleware, Security & Performance Considerations

### 7.1 Security Mechanisms

| Layer | Mechanism | Configuration |
|-------|-----------|---------------|
| **Transport** | Helmet | Default CSP, HSTS, X-Frame-Options, etc. |
| **CORS** | Allowlist | `CORS_ORIGIN` split by comma; `credentials: true` |
| **Rate Limiting** | express-rate-limit | Window: `RATE_LIMIT_WINDOW_MS` (default 60s), Max: `RATE_LIMIT_MAX` (default 120), draft-7 headers |
| **Body Size** | express.json | `limit: '100kb'` |
| **Input Validation** | Zod on every route | Params, query, body — fail-fast with `VALIDATION_ERROR` |
| **Address Sanitization** | `assertValidAddress` | EIP-55 checksum + format check at boundary |
| **SQL Injection** | Prisma only | Parameterized queries; no raw SQL |
| **Secret Redaction** | Pino redaction | `req.headers.authorization`, `req.headers.cookie`, `*.password`, `*.apiKey`, `*.api_key` |
| **Secrets Management** | `.env` (gitignored) | No secrets in code; `dotenv` loads at startup |
| **Auth** | Stub ready | No auth implemented; middleware slot exists for future SSO/JWT |

### 7.2 Performance Optimizations

| Technique | Implementation | Impact |
|-----------|----------------|--------|
| **Provider Throttling** | `Throttle(350ms)` serializes Etherscan calls | Prevents 429s on free tier (~3 req/s) |
| **TTL Caching** | `TtlCache` per method (balance 15s, txs 60s, tokens 60s, blocks permanent) | Reduces repeated API calls; 500-entry LRU bounds memory |
| **Parallel Fetching** | `Promise.all([getBalance, getTransactions])` in wallet route + pipeline | Cuts latency ~50% |
| **Connection Pooling** | Prisma default pool (10 connections) | Handles concurrent investigations |
| **Async Pipeline** | `POST /investigations` returns 202 immediately; background processing | No request timeout on long crawls |
| **Hard Caps** | GraphEngine: depth≤3, nodes≤60, edges/node≤15 | Guarantees termination, bounds memory/CPU |
| **Batch Attribution** | `identifyMany()` in GraphEngine | Single DB round-trip per crawl |

---

## 8. Edge Cases & Known Trade-offs

### 8.1 Technical Debt & Structural Limitations

| Area | Limitation | Why Accepted |
|------|------------|--------------|
| **Single Chain** | Only Ethereum (`chains.ts` has one entry) | MVP scope; provider interface (`BlockchainProvider`) is chain-agnostic — adding Polygon/BSC = 1 registry entry + provider support |
| **Provider Window** | Etherscan caps at 1,000 txs/call; `WALLET_TX_WINDOW` default 10,000 but truncated | Free tier limitation; `truncated: true` flagged in response `meta.window.truncated`; investigator aware |
| **Attribution Dataset** | Only 5 seeded records (2 exchange, 1 mixer, 1 bridge, 1 DeFi) | Quality over quantity — each row manually verified with citation; `UNKNOWN` ≠ "not an exchange" |
| **No Fiat Valuation** | Token transfers aggregated but not USD/INR-valued | Requires price oracle + historical prices; out of MVP scope |
| **No Streaming/Indexer** | "Real-time" = on-demand fresh queries + 15-60s cache | Simpler ops; acceptable for investigative (not trading) use case |
| **No Auth** | All endpoints public | Prototype for SIH demo; middleware slot ready for JWT/OIDC |
| **In-Process Cache** | `TtlCache` not shared across workers | Horizontal scaling needs Redis; single-instance MVP |
| **Demo/Live Isolation** | Enforced at pipeline level (`resolveModeDeps`) but not at DB schema level | `mode` column + `summary.provenance` = sufficient; demo never writes to live tables |
| **Risk Score Calibration** | Thresholds heuristic, not statistically validated | Config-driven (`risk-rules.json`); investigators can tune; labeled "Investigative Risk Score" with disclaimer |

### 8.2 Edge Cases Handled

| Edge Case | Handling |
|-----------|----------|
| **Self-transfers** | Ignored in stats + graph (`from === to` skipped) |
| **Zero-value transfers** | Skipped in graph accumulation |
| **Failed transactions** | Counted in `failedTxCount`; excluded from volume/counterparty calc |
| **Missing `to` (contract creation)** | Treated as outbound to `null`; excluded from graph |
| **Token decimals = 0** | `formatUnits` handles `decimals === 0` |
| **Negative amounts** | `formatUnits` preserves sign |
| **Etherscan "no transactions found"** | Returns `[]` not error |
| **Rate limit mid-crawl** | `ResilientProvider` falls back to RPC for balance; graph crawl fails with `PROVIDER_RATE_LIMITED` → investigation marked `failed` |
| **Attribution cache stale** | 5-min TTL; `identifyMany` reloads if expired |
| **Graph truncation** | `truncated: true` in result; `limits` echoes caps used |
| **Demo mode address not in cluster** | Returns empty transactions, zero balance — behaves like unknown live address |
| **Report requested before completion** | 409 `REPORT_NOT_READY` |

### 8.3 Design Compromises & Rationale

1. **JSON columns for GraphSnapshot/FlowPath** vs normalized tables
   - *Trade-off:* Query flexibility vs schema rigidity
   - *Decision:* JSON — GraphEngine types evolve; snapshot = point-in-time artifact; no ad-hoc SQL needed

2. **In-process throttle + cache** vs Redis
   - *Trade-off:* Simplicity vs horizontal scalability
   - *Decision:* In-process — single instance MVP; Redis adds ops burden; migration path clear

3. **Rule-based risk** vs ML
   - *Trade-off:* Explainability vs detection power
   - *Decision:* Rules — auditable, configurable, zero training data, deterministic; ML would require labeled fraud data (unavailable)

4. **Etherscan V2 only** vs multi-provider (Alchemy, Infura, Blockscout)
   - *Trade-off:* Vendor lock-in vs dev velocity
   - *Decision:* Etherscan V2 free tier + multichain; `BlockchainProvider` interface makes swapping trivial

5. **Synchronous `getBlockTimestamp` per block** vs batch
   - *Trade-off:* Simplicity vs RPC calls
   - *Decision:* Cached permanently (block timestamps immutable); low cardinality in practice

6. **No WebSocket/push** for investigation status
   - *Trade-off:* Real-time UX vs complexity
   - *Decision:* Polling (`GET /investigations/:id`) — simple, works with any client, 2-3s latency acceptable

---

## Appendix: Key File Reference Map

| Feature | Primary Files |
|---------|---------------|
| App bootstrap | `src/server.ts`, `src/app.ts` |
| Config/Env | `src/config/env.ts`, `src/config/risk-rules.json` |
| Middleware | `src/middleware/logger.ts`, `src/middleware/errors.ts` |
| Database | `src/database/prisma.ts`, `prisma/schema.prisma` |
| Blockchain providers | `src/blockchain/*.ts` |
| Attribution | `src/attribution/*.ts` |
| Graph crawl | `src/graph/engine.ts`, `src/graph/types.ts` |
| Fund flow paths | `src/fundflow/paths.ts` |
| Risk engine | `src/risk/rules.ts`, `src/risk/config.ts` |
| Investigation pipeline | `src/investigations/pipeline.ts` |
| Reports | `src/reports/reportBuilder.ts`, `src/reports/types.ts` |
| Demo data | `src/demo/DemoBlockchainProvider.ts`, `src/attribution/DemoAttributionProvider.ts` |
| Routes | `src/routes/*.ts` |
| Tests | `tests/*.test.ts` |

---

*Documentation generated from codebase as of SIH 2026 prototype. All implementations in `backend/src/` — this document reflects actual code, not aspirational design.*