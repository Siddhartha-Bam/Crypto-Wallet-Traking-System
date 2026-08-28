import { Alert, Card, Col, List, Progress, Row, Tag, Typography } from 'antd'
import type { InvestigationBundle } from '../../types/api'

const BAND_COLORS: Record<string, string> = {
  low: '#52c41a',
  medium: '#faad14',
  high: '#fa8c16',
  critical: '#f5222d',
}

const SEVERITY_COLORS: Record<string, string> = {
  info: 'default',
  low: 'blue',
  medium: 'gold',
  high: 'volcano',
}

export default function RiskPanel({ bundle }: { bundle: InvestigationBundle }) {
  const score = bundle.riskScore ?? 0
  const band = bundle.riskBand ?? 'low'
  return (
    <Card title="Investigative Risk Score" styles={{ body: { paddingTop: 12 } }}>
      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
        message="Pattern-based investigative aid — NOT evidence of criminal activity"
      />
      <Row gutter={24} align="middle">
        <Col xs={24} sm={8} style={{ textAlign: 'center' }}>
          <Progress
            type="dashboard"
            percent={score}
            strokeColor={BAND_COLORS[band] ?? '#52c41a'}
            format={() => (
              <span>
                <Typography.Title level={2} style={{ margin: 0 }}>
                  {score}
                </Typography.Title>
                <Tag color={band === 'critical' ? 'red' : BAND_COLORS[band]}>{String(band).toUpperCase()}</Tag>
              </span>
            )}
          />
        </Col>
        <Col xs={24} sm={16}>
          <List
            size="small"
            dataSource={bundle.indicators}
            locale={{ emptyText: 'No risk indicators triggered for this wallet window' }}
            renderItem={(item) => (
              <List.Item>
                <div style={{ width: '100%' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Typography.Text strong style={{ fontSize: 13 }}>
                      {item.rule}
                    </Typography.Text>
                    <Tag color={SEVERITY_COLORS[item.severity]}>{item.severity.toUpperCase()}</Tag>
                    <Tag>+{item.score}</Tag>
                  </div>
                  <Typography.Paragraph type="secondary" style={{ marginTop: 4, marginBottom: 0, fontSize: 12 }}>
                    {item.evidence}
                  </Typography.Paragraph>
                  {item.transactions.length > 0 && (
                    <div style={{ marginTop: 4, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {item.transactions.slice(0, 3).map((h) => (
                        <Typography.Text key={h} code copyable style={{ fontSize: 10 }}>
                          {h.slice(0, 20)}…
                        </Typography.Text>
                      ))}
                    </div>
                  )}
                </div>
              </List.Item>
            )}
          />
        </Col>
      </Row>
    </Card>
  )
}
