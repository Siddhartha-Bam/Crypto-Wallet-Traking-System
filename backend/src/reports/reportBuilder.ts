import type { InvestigationBundleData } from './types.js'

const esc = (v: unknown): string =>
  String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')

const shortAddr = (a?: string | null): string =>
  a ? `${a.slice(0, 10)}…${a.slice(-8)}` : '—'

function recommendationsFor(rules: string[]): string[] {
  const out = new Set<string>()
  const map: Record<string, string> = {
    exchange_exposure:
      'Known VASP exposure detected → consider the preservation/request process for relevant VASP records (KYC, logs) through authorised channels.',
    mixer_exposure:
      'Mixer interaction detected → downstream tracing beyond the mixer is unlikely to be conclusive; prioritise pre-mixer evidence and timestamps.',
    cross_chain_exposure:
      'Bridge interaction detected → continue tracing on the destination chain once access to that chain’s data is available.',
    layering:
      'Multiple intermediary wallets detected → consider expanding trace depth and requesting exchange-side records for the endpoint entity.',
    rapid_movement:
      'Rapid fund movement detected → prioritise precise transaction timestamps and downstream recipient correlation.',
    high_volume_pass_through:
      'Pass-through behaviour detected → treat intermediaries as leads; request records rather than assuming control by the suspect.',
    fan_in: 'Many inbound senders detected → consistent with a fraud collection address; consider victim outreach via authorised channels for corroborating complaints.',
    fan_out: 'Wide distribution detected → examine whether outbound addresses are further collection or cash-out points.',
    peel_chain: 'Peel-chain pattern detected → enumerate residual-balance descendants as potential controlled wallets.',
  }
  for (const r of rules) {
    const rec = map[r]
    if (rec) out.add(rec)
  }
  if (out.size === 0) out.add('No high-signal patterns detected in the analysed window; consider widening the trace window or depth.')
  return [...out]
}

export function buildReportJson(data: InvestigationBundleData): Record<string, unknown> {
  const s = data.investigation.summary
  return {
    document: 'Investigation Report',
    disclaimer:
      'This report is an investigative aid generated from on-chain data and heuristic analysis. It does not identify any natural person, does not assert that any crime occurred, and must not be treated as legal proof.',
    case_information: {
      investigation_id: data.investigation.id,
      case_id: data.investigation.caseId,
      incident_type: data.investigation.incidentType,
      reported_victim_amount: data.investigation.victimAmount
        ? `${data.investigation.victimAmount} ${data.investigation.victimCurrency}`
        : null,
      mode: data.investigation.mode,
      created_at: data.investigation.createdAt,
      completed_at: data.investigation.completedAt,
    },
    suspect_address: data.investigation.suspectAddress,
    chain: data.investigation.chain,
    investigation_timestamp: data.investigation.completedAt,
    wallet_summary: s
      ? {
          balance: `${s.balanceNative} ${s.balanceSymbol}`,
          on_chain_source: s.onChainSource,
          ...s.walletStats,
        }
      : null,
    transaction_statistics: s?.walletStats ?? null,
    fund_flow_paths: data.flowPaths,
    attributed_entities: (data.graph?.nodes ?? [])
      .filter((n) => n.role === 'attributed_entity')
      .map((n) => ({
        entity: n.entityName,
        type: n.entityType,
        address: n.address,
        chain: n.chain,
        confidence: n.attributionConfidence,
        source: n.attributionSource,
      })),
    risk_indicators: data.indicators,
    investigative_risk_score: {
      score: data.investigation.riskScore,
      band: data.investigation.riskBand,
      note: 'Configurable heuristic composite — not proof of wrongdoing.',
    },
    evidence_transactions: {
      description: 'Transaction hashes referenced by indicators, flow paths, and traced edges. All hashes originate from the on-chain provider named above.',
      hashes: [...new Set([
        ...data.indicators.flatMap((i) => i.transactions),
        ...data.flowPaths.flatMap((p) => p.hops.map((h) => h.sampleTxHash)),
        ...(data.graph?.edges ?? []).flatMap((e) => e.sampleTxHashes),
      ])],
    },
    attribution_sources: [
      ...new Set(
        (data.graph?.nodes ?? [])
          .filter((n) => n.role === 'attributed_entity')
          .map((n) => `${n.entityName}: ${n.attributionSource}`),
      ),
      data.investigation.mode === 'demo'
        ? 'Synthetic demo dataset (SIH 26183 presentation)'
        : `Seeded dataset: ${s?.attributionSource ?? 'n/a'}`,
    ],
    limitations: [
      'Analysis covers only the configured transaction window and trace depth; earlier or deeper activity is out of scope.',
      'Address history is sourced from Etherscan V2; provider windows may cap results (flagged as truncated where applicable).',
      'Entity attributions rely on a small curated dataset with cited public sources; absence of attribution ≠ absence of association.',
      'Token transfers are aggregated but not fiat-valued in this MVP.',
      'Single-chain analysis (Ethereum); bridge endpoints require separate follow-up.',
      'The risk score is heuristic and configurable; it indicates patterns, not guilt.',
      data.investigation.mode === 'demo'
        ? 'DEMO MODE: all transactions, balances and entities in this report are synthetic presentation data.'
        : undefined,
    ].filter(Boolean),
    recommended_actions: recommendationsFor(data.indicators.map((i) => i.rule)),
  }
}

export function buildReportHtml(data: InvestigationBundleData): string {
  const j = buildReportJson(data)
  const ci = j.case_information as Record<string, unknown>
  const ws = j.transaction_statistics as Record<string, unknown> | null
  const score = j.investigative_risk_score as Record<string, unknown>
  const entities = j.attributed_entities as Array<Record<string, unknown>>
  const indicators = data.indicators
  const paths = data.flowPaths
  const actions = j.recommended_actions as string[]
  const limitations = j.limitations as string[]
  const hashes = (j.evidence_transactions as { hashes: string[] }).hashes

  const bandColor: Record<string, string> = { low: '#16a34a', medium: '#d97706', high: '#ea580c', critical: '#dc2626' }

  const rows = (items: string[][]): string =>
    items.map((cells) => `<tr>${cells.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')

  return `<!doctype html>
<html><head><meta charset="utf-8"/>
<title>Crypto Investigation Report ${esc(ci.case_id ?? data.investigation.id)}</title>
<style>
  body{font-family:'Segoe UI',Arial,sans-serif;background:#f4f5f7;color:#111827;margin:0;padding:32px;}
  .page{max-width:900px;margin:0 auto;background:#fff;border-radius:10px;padding:40px;box-shadow:0 1px 6px rgba(0,0,0,.12);}
  h1{font-size:22px;margin:0 0 4px;}
  h2{font-size:15px;margin:28px 0 8px;padding-bottom:4px;border-bottom:2px solid #e5e7eb;text-transform:uppercase;letter-spacing:.04em;color:#374151;}
  table{width:100%;border-collapse:collapse;font-size:13px;}
  td,th{border:1px solid #e5e7eb;padding:6px 9px;text-align:left;vertical-align:top;}
  th{background:#f9fafb;width:220px;}
  .disclaimer{background:#fef3c7;border:1px solid #f59e0b;border-radius:6px;padding:10px 14px;font-size:12.5px;margin:14px 0 6px;}
  .demo{background:#ede9fe;border:1px solid #8b5cf6;border-radius:6px;padding:10px 14px;font-size:13px;font-weight:600;margin-bottom:10px;}
  .band{display:inline-block;padding:2px 10px;border-radius:999px;color:#fff;font-weight:700;}
  .mono{font-family:Consolas,monospace;font-size:11.5px;}
  ul{font-size:13px;line-height:1.55;padding-left:20px;} li{margin-bottom:4px;}
  .muted{color:#6b7280;font-size:12px;}
  @media print{body{background:#fff;padding:0}.page{box-shadow:none}}
</style></head><body><div class="page">
<h1>Real-Time Crypto Fraud Attribution — Investigation Report</h1>
<div class="muted">SIH 2026 · Problem 26183 prototype · generated ${esc(new Date().toISOString())}</div>
${data.investigation.mode === 'demo' ? '<div class="demo">DEMO / SEEDED INTELLIGENCE — every transaction, balance and entity below is synthetic presentation data.</div>' : ''}
<div class="disclaimer"><strong>Evidence vs inference:</strong> Sections 5–7 and 11 derive from on-chain facts retrieved from <em>${esc(String(j.wallet_summary ? (j.wallet_summary as Record<string, unknown>).on_chain_source : ''))}</em>. Section 8 is third-party attribution intelligence with cited sources. Sections 9–10 and 14 are heuristic inference.</div>

<h2>1–4 · Case information</h2>
<table><tbody>
<tr><th>Investigation ID</th><td>${esc(data.investigation.id)}</td></tr>
<tr><th>Case reference</th><td>${esc(ci.case_id ?? '—')}</td></tr>
<tr><th>Suspect address</th><td class="mono">${esc(data.investigation.suspectAddress)}</td></tr>
<tr><th>Chain</th><td>${esc(data.investigation.chain)}</td></tr>
<tr><th>Incident type</th><td>${esc(ci.incident_type ?? '—')}</td></tr>
<tr><th>Reported victim loss</th><td>${esc(ci.reported_victim_amount ?? '—')}</td></tr>
<tr><th>Created / completed</th><td>${esc(new Date(String(ci.created_at)).toLocaleString())} → ${esc(ci.completed_at ? new Date(String(ci.completed_at)).toLocaleString() : '—')}</td></tr>
<tr><th>Mode</th><td>${esc(String(ci.mode).toUpperCase())}</td></tr>
</tbody></table>

<h2>5–6 · Wallet summary &amp; transaction statistics</h2>
${
  ws
    ? `<table><tbody>
<tr><th>Balance</th><td>${esc(ws.balance)}</td></tr>
<tr><th>Transactions analyzed</th><td>${esc(ws.txCountAnalyzed)} (failed: ${esc(ws.failedTxCount)})</td></tr>
<tr><th>Inflow / Outflow</th><td>${esc(ws.incomingVolumeNative)} / ${esc(ws.outgoingVolumeNative)} ETH</td></tr>
<tr><th>Distinct counterparties</th><td>${esc(ws.counterpartyCount)}</td></tr>
<tr><th>First / last activity</th><td>${esc(ws.firstSeenAt ? new Date(String(ws.firstSeenAt)).toLocaleString() : '—')} / ${esc(ws.lastSeenAt ? new Date(String(ws.lastActivityAt)).toLocaleString() : '—')}</td></tr>
</tbody></table>`
    : '<p class="muted">Wallet summary unavailable.</p>'
}

<h2>7 · Fund-flow paths</h2>
${
  paths.length === 0
    ? '<p class="muted">No path from the suspect reached an attributed entity within the analysed window.</p>'
    : paths
        .map(
          (p) => `<table style="margin-bottom:10px"><thead><tr><th>Hop</th><th>Value</th><th>Sample transaction</th></tr></thead><tbody>
${rows(p.hops.map((h, i) => [`${i + 1}. ${shortAddr(h.from)} → ${shortAddr(h.to)}`, `${h.totalValue} ${h.asset}`, h.sampleTxHash]))}
<tr><th>Endpoint</th><td colspan="2">${esc(p.endpointEntityName ?? p.endpointAddress)} (${esc(p.endpointEntityType ?? '?')}, confidence ${esc(p.endpointConfidence ?? '?')}) · ${p.intermediaryCount} intermediary wallet(s)</td></tr>
</tbody></table>`,
        )
        .join('')
}

<h2>8 · Attributed entities (attribution intelligence)</h2>
${
  entities.length === 0
    ? '<p class="muted">None within window. Absence of attribution is not absence of association.</p>'
    : `<table><thead><tr><th>Entity</th><th>Type</th><th>Address</th><th>Confidence</th><th>Source</th></tr></thead><tbody>
${rows(entities.map((e) => [String(e.entity), String(e.type), String(e.address), String(e.confidence), String(e.source)]))}
</tbody></table>`
}

<h2>9 · Risk indicators (inference)</h2>
${
  indicators.length === 0
    ? '<p class="muted">No indicators triggered.</p>'
    : `<table><thead><tr><th>Rule</th><th>Severity</th><th>Score</th><th>Evidence</th></tr></thead><tbody>
${rows(indicators.map((i) => [i.rule, i.severity, String(i.score), i.evidence]))}
</tbody></table>`
}

<h2>10 · Investigative risk score</h2>
<p>Score <strong>${esc(score.score)}</strong> of 100 — <span class="band" style="background:${esc(bandColor[String(score.band)] ?? '#6b7280')}">${esc(String(score.band)).toUpperCase()}</span></p>
<p class="muted">${esc(score.note)}</p>

<h2>11 · Evidence — referenced transaction hashes</h2>
<p class="mono">${hashes.length ? hashes.map((h) => esc(h)).join('<br/>') : '—'}</p>

<h2>12 · Attribution sources</h2>
<ul>${(j.attribution_sources as string[]).map((src) => `<li class="mono" style="word-break:break-all">${esc(src)}</li>`).join('')}</ul>

<h2>13 · Limitations</h2>
<ul>${limitations.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>

<h2>14 · Recommended investigative actions</h2>
<ul>${actions.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>

<div class="disclaimer" style="margin-top:24px"><strong>Note:</strong> This document was produced by an automated prototype for training/presentation purposes. It does not deanonymise individuals, does not constitute legal advice, and its risk score is not proof of criminal activity.</div>
</div></body></html>`
}
