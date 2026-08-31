import { Card, Empty, Result, Space, Typography } from 'antd'

interface PhasePlaceholderProps {
  title: string
  phase: string
}

/** Honest empty state for pages scheduled in a later build phase. */
export default function PhasePlaceholder({ title, phase }: PhasePlaceholderProps) {
  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Typography.Title level={3} style={{ marginBottom: 0 }}>
        {title}
      </Typography.Title>
      <Card>
        <Result
          icon={<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />}
          title="Not implemented in the current phase"
          subTitle={`Scheduled for ${phase}. This shell exists so navigation and layout can be verified early.`}
        />
      </Card>
    </Space>
  )
}
