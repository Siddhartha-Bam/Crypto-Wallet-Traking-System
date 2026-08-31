# FraudTrace Frontend

Frontend for the SIH 2026 Crypto Wallet Tracking System (Problem Statement 26183).

## What this is

This is the React frontend for a cryptocurrency wallet investigation platform. It provides a dashboard for cybercrime investigators to:

- Start new investigations from a suspect wallet address
- Visualize fund-flow graphs with n-hop tracing
- View risk scoring with explainable indicators
- Explore transaction evidence (ETH + token transfers)
- View attributed entities (exchanges, mixers, bridges)
- Generate investigation reports

The frontend is built with **React 19 + TypeScript + Vite + Ant Design + @xyflow/react (React Flow)**.

## Running the project

**No backend required for the demo.**

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173

The application runs entirely on **local mock data** by default. No FastAPI, PostgreSQL, Etherscan, blockchain RPC, or Gemini API keys needed.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_USE_MOCK_DATA` | `true` | Use local mock data. Set to `false` to connect to real backend. |
| `VITE_API_URL` | `/api` | Backend API base URL (only used when `VITE_USE_MOCK_DATA=false`). |

To connect to a real backend later:
```bash
# .env.local
VITE_USE_MOCK_DATA=false
VITE_API_URL=http://localhost:4000/api
```

Then start the backend (see root README.md).

## Project Structure

```
frontend/
├── src/
│   ├── api/
│   │   └── client.ts          # API client (switches between mock/real)
│   ├── components/
│   │   ├── investigation/     # Investigation page components
│   │   │   ├── AttributionPanel.tsx
│   │   │   ├── EvidenceTable.tsx
│   │   │   ├── FlowPathsPanel.tsx
│   │   │   ├── RiskPanel.tsx
│   │   │   └── WalletSummary.tsx
│   │   ├── PhasePlaceholder.tsx
│   │   └── ProvenanceBadge.tsx
│   ├── data/
│   │   └── mockData.ts        # Coherent mock investigation data
│   ├── graph/
│   │   └── TraceGraph.tsx     # React Flow fund-flow graph
│   ├── pages/
│   │   ├── DashboardPage.tsx  # Dashboard with stats + recent investigations
│   │   └── InvestigationPage.tsx  # Investigation form + results
│   ├── services/
│   │   └── mockApi.ts         # Mock API implementations (async, promise-based)
│   ├── types/
│   │   └── api.ts             # TypeScript types matching backend contracts
│   ├── App.tsx                # Routing + layout
│   ├── main.tsx               # Entry point
│   └── index.css              # Global styles
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── .env.example               # Environment template
└── README.md                  # This file
```

## Mock Data

Located in **`src/data/mockData.ts`**.

Contains one coherent investigation matching the backend demo scenario from the README:

```
16 victim wallets ──fan-in──▶ SUSPECT ──8.0 ETH──▶ Burner A ──7.6 ETH──▶ Burner B ──7.4 ETH──▶ DemoExchange X
                    │ ├──▶ DemoMixer M (1.0 ETH)
                    │ └──▶ DemoBridge B (0.4 ETH)
                    │ └──▶ peel-chain ×6 + 12-address fan-out
```

All data structures mirror the backend API types (`src/types/api.ts`):
- `DashboardStats` - dashboard metrics
- `InvestigationBundle` - full investigation result
- `GraphNode` / `GraphEdgeData` - fund-flow graph
- `RiskIndicator[]` - 9 risk rules with evidence
- `FlowPath[]` - suspect → attributed endpoint paths
- `WalletStats` - wallet analytics
- `TransactionRow` / `TokenTransferRow` - transaction evidence

**Key addresses:**
- Suspect: `0x742d35Cc6634C0532925a3b8D40d6b5c5F5dE8c1`
- Burner A: `0x8ba1f109551bD432803012645Hac136c772c3c4d`
- Burner B: `0x9ca2f209551bD432803012645Hac136c772c3c4e`
- DemoExchange X: `0x0dE7e0058E3F94F80c8C2d8b3a1C2e8f8e9A0b1C`
- DemoMixer M: `0x1eF8f1169F4aA5G91d9D3e9c4B2D3f9f9F0b1C2D`
- DemoBridge B: `0x2fA9a227aG5bB6H02e0E4f0D5C3E4a0a1B2C3D4E`

## Data / Service Layer

```
UI Components (pages, components)
         ↓
api/client.ts (apiGet, apiPost)
         ↓
┌─────────────────────────────┐
│ VITE_USE_MOCK_DATA=true     │ → services/mockApi.ts → data/mockData.ts
│ VITE_USE_MOCK_DATA=false    │ → fetch to VITE_API_URL (FastAPI)
└─────────────────────────────┘
```

**Key functions in `services/mockApi.ts`:**
- `mockGetStats()` → `DashboardStats`
- `mockCreateInvestigation(params)` → `{id, statusUrl}` (starts async progression)
- `mockGetInvestigation(id)` → `InvestigationBundle` (status: pending → running → completed)
- `mockGetTransactions(chain, address, type, page, pageSize)` → `TransactionsResponse`
- `mockGetInvestigationsList(page, pageSize)` → paginated investigations

All mock functions return `Promise<T>` with realistic delays to mimic real API behavior.

## Future Backend Integration

Current architecture (mock mode):
```
React UI
    ↓
api/client.ts (apiGet, apiPost)
    ↓
services/mockApi.ts
    ↓
data/mockData.ts
```

Future architecture (live mode):
```
React UI
    ↓
api/client.ts (apiGet, apiPost)  ← unchanged
    ↓
fetch → FastAPI (port 4000)
    ↓
PostgreSQL / Blockchain / ML / Gemini
```

**API Endpoints to Implement (from backend):**

| Frontend Call | Backend Endpoint | Description |
|---------------|------------------|-------------|
| `apiGet('/stats')` | `GET /api/stats` | Dashboard metrics |
| `apiPost('/investigations', body)` | `POST /api/investigations` | Create investigation |
| `apiGet('/investigations/:id')` | `GET /api/investigations/:id` | Poll investigation status + results |
| `apiGet('/wallet/:chain/:address/transactions?type=...')` | `GET /api/wallet/:chain/:address/transactions` | Transaction evidence |
| `apiGet('/investigations/:id/report')` | `GET /api/investigations/:id/report` | HTML report |
| `apiGet('/investigations/:id/report?format=json')` | `GET /api/investigations/:id/report?format=json` | JSON report |

**Types are already defined** in `src/types/api.ts` and match the backend OpenAPI contracts exactly.

## Pages Implemented

| Route | Page | Status |
|-------|------|--------|
| `/` | DashboardPage | ✅ Working |
| `/investigations` | InvestigationPage (form) | ✅ Working |
| `/investigations/:id` | InvestigationPage (results) | ✅ Working |
| `/explorer` | PhasePlaceholder | 🚧 Phase 4 |
| `/entities` | PhasePlaceholder | 🚧 Phase 3/4 |
| `/reports` | PhasePlaceholder | 🚧 Phase 5 |

## Handoff Notes for Frontend Developer

### To Modify Mock Data
Edit `src/data/mockData.ts` — all investigation data is centralized there. The investigation form creates new investigations that progress through `pending → running → completed` using the same mock data structure.

### To Add New UI Features
1. Components live in `src/components/investigation/` (investigation page) or `src/components/` (shared)
2. Pages live in `src/pages/`
3. Types are in `src/types/api.ts`
4. Graph visualization is in `src/graph/TraceGraph.tsx` (React Flow)

### To Connect Real Backend
1. Set `VITE_USE_MOCK_DATA=false` in `.env.local`
2. Set `VITE_API_URL` to your backend URL
3. Start backend (see root README.md)
4. The `api/client.ts` automatically switches to real fetch calls — **no component changes needed**

### Common Tasks
- **Change risk indicators**: Edit `mockRiskIndicators` in `mockData.ts`
- **Modify graph layout**: Edit `TraceGraph.tsx` deterministic layout logic
- **Add new transaction columns**: Edit `EvidenceTable.tsx` column definitions
- **Change color scheme**: Edit `App.tsx` theme token config

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Start dev server (port 5173)
npm run build        # Production build
npm run lint         # Run oxlint
npm run preview      # Preview production build
```

## Tech Stack

- React 19
- TypeScript
- Vite 8
- Ant Design 6
- React Router 7
- @xyflow/react 12 (React Flow)
- Oxlint

## License

SIH 2026 Prototype — Ministry of Home Affairs · I4C (CIS Division)