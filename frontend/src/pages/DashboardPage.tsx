import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Card, Col, Empty, Row, Space, Statistic, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { apiGet } from '../api/client'
import type { DashboardStats, RecentInvestigation } from '../types/api'

const riskBandColor: Record<string, string> = {
  low: 'green',
  medium: 'gold',
  high: 'volcano',
  critical: 'red',
}

const statusColor: Record<string, string> = {
  completed: 'green',
  running: 'processing',
  pending: 'default',
  failed: 'error',
}

function shortAddress(address: string): string {
  return address.length > 16 ? `${address.slice(0, 8)}…${address.slice(-6)}` : address
}

const recentColumns: ColumnsType<RecentInvestigation> = [
  {
    title: 'Created',
    dataIndex: 'createdAt',
    width: 180,
    render: (v: string) => new Date(v).toLocaleString(),
  },
  { title: 'Chain', dataIndex: 'chain', width: 110 },
  {
    title: 'Suspect address',
    dataIndex: 'suspectAddress',
    render: (v: string) => <Typography.Text code>{shortAddress(v)}</Typography.Text>,
  },
  {
    title: 'Mode',
    dataIndex: 'mode',
    width: 90,
    render: (mode: string) =>
      mode === 'demo' ? <Tag color="purple">DEMO</Tag> : <Tag color="blue">LIVE</Tag>,
  },
  {
    title: 'Status',
    dataIndex: 'status',
    width: 120,
    render: (status: string) => (
      <Tag color={statusColor[status] ?? 'default'}>{String(status).toUpperCase()}</Tag>
    ),
  },
  {
    title: 'Risk band',
    dataIndex: 'riskBand',
    width: 110,
    render: (band: string | null) =>
      band ? <Tag color={riskBandColor[band] ?? 'default'}>{String(band).toUpperCase()}</Tag> : '—',
  },
]

export default function DashboardPage() {
  const navigate = useNavigate()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    apiGet<DashboardStats>('/stats', controller.signal)
      .then(setStats)
      .catch((err: unknown) => {
        if ((err as Error).name !== 'AbortError') setError((err as Error).message)
      })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [])

  if (error) {
    return (
      <Alert
        type="error"
        showIcon
        message="Unable to reach the API"
        description={`${error}. Verify the backend is running on port 4000.`}
      />
    )
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <div>
        <Typography.Title level={3} style={{ marginBottom: 4 }}>
          Investigation Dashboard
        </Typography.Title>
        <Typography.Text type="secondary">
          Metrics are derived exclusively from stored investigations. No synthetic numbers are shown.
        </Typography.Text>
      </div>

      <Row gutter={16}>
        <Col xs={24} sm={8}>
          <Card loading={loading}>
            <Statistic title="Total investigations" value={stats?.totals.investigations ?? 0} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card loading={loading}>
            <Statistic title="Active (pending/running)" value={stats?.totals.active ?? 0} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card loading={loading}>
            <Statistic
              title="High-risk wallets"
              value={stats?.totals.highRiskWallets ?? 0}
              valueStyle={{ color: stats && stats.totals.highRiskWallets > 0 ? '#d4380d' : undefined }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={24}>
          <Card title="Chain distribution" loading={loading}>
            {stats && stats.chainDistribution.length > 0 ? (
              <Space wrap size="middle">
                {stats.chainDistribution.map((c) => (
                  <Tag key={c.chain} color="geekblue">
                    {c.chain}: {c.count}
                  </Tag>
                ))}
              </Space>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No investigations recorded yet" />
            )}
          </Card>
        </Col>
      </Row>

      <Card title="Recent investigations" loading={loading}>
        <Table<RecentInvestigation>
          rowKey="id"
          size="small"
          columns={recentColumns}
          dataSource={stats?.recentInvestigations ?? []}
          pagination={false}
          rowClassName={() => 'clickable-row'}
          onRow={(record) => ({ onClick: () => navigate(`/investigations/${record.id}`), style: { cursor: 'pointer' } })}
          locale={{ emptyText: 'No investigations yet — start one from the Investigation screen' }}
        />
      </Card>
    </Space>
  )
}
