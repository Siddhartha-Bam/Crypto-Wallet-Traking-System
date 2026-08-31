import { Card, Descriptions, Empty, Space, Tag, Typography } from 'antd'
import type { GraphNode } from '../../types/api'

export default function AttributionPanel({ entities }: { entities: GraphNode[] }) {
  const attributed = entities.filter((n) => n.role === 'attributed_entity')
  return (
    <Card
      title="Attributed Entities"
      extra={<Tag color="purple">ATTRIBUTION · SEEDED DATASET</Tag>}
      styles={{ body: { paddingTop: 12 } }}
    >
      {attributed.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No attributed entity within the traced window. Unlisted addresses are shown as unknown — attribution is never inferred from fund flow alone." />
      ) : (
        <Space direction="vertical" size="small" style={{ width: '100%' }}>
          {attributed.map((n) => (
            <Card key={n.id} size="small">
              <Descriptions size="small" column={{ xs: 1, md: 2 }}>
                <Descriptions.Item label="Entity">
                  <Typography.Text strong>{n.entityName}</Typography.Text>
                </Descriptions.Item>
                <Descriptions.Item label="Type / Confidence">
                  <Space>
                    <Tag>{n.entityType}</Tag>
                    <Tag color={n.attributionConfidence === 'HIGH' ? 'green' : 'gold'}>
                      {n.attributionConfidence}
                    </Tag>
                  </Space>
                </Descriptions.Item>
                <Descriptions.Item label="Address">
                  <Typography.Text code copyable style={{ fontSize: 11 }}>
                    {n.address}
                  </Typography.Text>
                </Descriptions.Item>
                <Descriptions.Item label="Chain">{n.chain}</Descriptions.Item>
                <Descriptions.Item label="Source" span={2}>
                  <Typography.Paragraph style={{ marginBottom: 0, fontSize: 12 }}>
                    {n.attributionSource}
                  </Typography.Paragraph>
                </Descriptions.Item>
              </Descriptions>
            </Card>
          ))}
        </Space>
      )}
    </Card>
  )
}
