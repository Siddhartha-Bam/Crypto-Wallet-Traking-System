import { Card, Col, Descriptions, Row, Statistic, Typography } from 'antd'
import type { InvestigationBundle } from '../../types/api'

export default function WalletSummary({ bundle }: { bundle: InvestigationBundle }) {
  const s = bundle.summary
  if (!s?.walletStats) return null
  const ws = s.walletStats
  return (
    <Card title="Wallet Summary" extra={<Typography.Text type="secondary">{s.onChainSource}</Typography.Text>}>
      <Row gutter={[16, 16]}>
        <Col xs={12} sm={8} md={4}>
          <Statistic title="Balance" value={s.balanceNative ?? '—'} suffix={s.balanceSymbol} precision={4} />
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Statistic title="Txs analyzed" value={ws.txCountAnalyzed} />
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Statistic title="Inflow" value={ws.incomingVolumeNative} suffix="ETH" precision={4} />
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Statistic title="Outflow" value={ws.outgoingVolumeNative} suffix="ETH" precision={4} />
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Statistic title="Counterparties" value={ws.counterpartyCount} />
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Statistic title="Failed txs" value={ws.failedTxCount} />
        </Col>
      </Row>
      <Descriptions size="small" column={{ xs: 1, md: 2 }} style={{ marginTop: 16 }}>
        <Descriptions.Item label="First activity">
          {ws.firstSeenAt ? new Date(ws.firstSeenAt).toLocaleString() : '—'}
        </Descriptions.Item>
        <Descriptions.Item label="Last activity">
          {ws.lastActivityAt ? new Date(ws.lastActivityAt).toLocaleString() : '—'}
        </Descriptions.Item>
        <Descriptions.Item label="Suspect address">
          <Typography.Text code copyable>
            {bundle.suspectAddress}
          </Typography.Text>
        </Descriptions.Item>
        {s.limits && (
          <Descriptions.Item label="Trace window">
            depth ≤ {s.limits.maxDepth}, ≤{s.limits.maxNodes} nodes
            {s.truncated ? ' · TRUNCATED' : ''}
          </Descriptions.Item>
        )}
      </Descriptions>
    </Card>
  )
}
