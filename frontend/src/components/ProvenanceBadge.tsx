import { Tag } from 'antd'
import type { Provenance } from '../types/api'

const CONFIG: Record<Provenance, { color: string; label: string }> = {
  on_chain: { color: 'green', label: 'ON-CHAIN FACT' },
  attribution: { color: 'purple', label: 'ATTRIBUTION' },
  inference: { color: 'orange', label: 'INFERENCE' },
}

/** Mandatory provenance marker rendered next to every data surface. */
export default function ProvenanceBadge({ provenance, source }: { provenance: Provenance; source?: string }) {
  const cfg = CONFIG[provenance]
  return (
    <Tag color={cfg.color} style={{ marginRight: 0 }}>
      {cfg.label}
      {source ? ` · ${source}` : ''}
    </Tag>
  )
}
