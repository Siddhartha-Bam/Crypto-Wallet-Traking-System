import { Card, Empty, Space, Tag, Typography } from 'antd'
import type { FlowPath } from '../../types/api'

function short(address: string): string {
  return `${address.slice(0, 8)}…${address.slice(-6)}`
}

export default function FlowPathsPanel({ paths }: { paths: FlowPath[] }) {
  return (
    <Card title="Fund-Flow Paths (suspect → attributed endpoints)" styles={{ body: { paddingTop: 12 } }}>
      {paths.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No path from the suspect reached an attributed entity within the trace window" />
      ) : (
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          {paths.map((p, idx) => (
            <div key={idx} style={{ border: '1px solid #2a313c', borderRadius: 8, padding: 12 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                {p.hops.map((hop, i) => (
                  <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {i > 0 && <span style={{ color: '#6b7280' }}>→</span>}
                    <Typography.Text code style={{ fontSize: 11 }}>
                      {short(hop.from)}
                    </Typography.Text>
                  </span>
                ))}
                <span style={{ color: '#6b7280' }}>→</span>
                <Tag color="purple">{p.endpointEntityName ?? short(p.endpointAddress)}</Tag>
              </div>
              <div style={{ marginTop: 8, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                {p.hops.map((hop, i) => (
                  <Typography.Text key={i} type="secondary" style={{ fontSize: 11 }} code copyable={{ text: hop.sampleTxHash }}>
                    hop {i + 1}: {hop.totalValue} {hop.asset} · tx {hop.sampleTxHash.slice(0, 16)}…
                  </Typography.Text>
                ))}
                <Tag>{p.intermediaryCount} intermediary wallet(s)</Tag>
              </div>
            </div>
          ))}
        </Space>
      )}
    </Card>
  )
}
