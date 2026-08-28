import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Alert,
  Button,
  Card,
  Col,
  Form,
  Input,
  InputNumber,
  Row,
  Segmented,
  Select,
  Space,
  Spin,
  Statistic,
  Tag,
  Typography,
} from 'antd'
import { apiGet, apiPost } from '../api/client'
import type { CreateInvestigationResponse, InvestigationBundle } from '../types/api'
import ProvenanceBadge from '../components/ProvenanceBadge'
import WalletSummary from '../components/investigation/WalletSummary'
import RiskPanel from '../components/investigation/RiskPanel'
import FlowPathsPanel from '../components/investigation/FlowPathsPanel'
import AttributionPanel from '../components/investigation/AttributionPanel'
import EvidenceTable from '../components/investigation/EvidenceTable'
import TraceGraph from '../graph/TraceGraph'

interface FormValues {
  address: string
  chain: string
  mode: 'live' | 'demo'
  caseId?: string
  victimAmount?: number
  victimCurrency: 'INR' | 'USD'
  incidentType?: string
  depth: number
}

const INCIDENT_OPTIONS = [
  { value: 'upi_fraud', label: 'UPI / digital payment fraud' },
  { value: 'otp_scam', label: 'OTP / phishing scam' },
  { value: 'investment_scam', label: 'Investment / trading scam' },
  { value: 'extortion', label: 'Extortion / sextortion' },
  { value: 'impersonation', label: 'Impersonation' },
  { value: 'other', label: 'Other' },
]

const STATUS_TAGS: Record<string, { color: string; text: string }> = {
  pending: { color: 'default', text: 'QUEUED' },
  running: { color: 'processing', text: 'ANALYZING' },
  completed: { color: 'green', text: 'COMPLETED' },
  failed: { color: 'error', text: 'FAILED' },
}

export default function InvestigationPage() {
  const { id: routeId } = useParams()
  const navigate = useNavigate()
  const [form] = Form.useForm()

  const [activeId, setActiveId] = useState<string | null>(routeId ?? null)
  const [bundle, setBundle] = useState<InvestigationBundle | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(async (id: string) => {
    try {
      setLoadError(null)
      const res = await apiGet<InvestigationBundle>(`/investigations/${id}`)
      setBundle(res)
    } catch (err) {
      setLoadError((err as Error).message)
    }
  }, [])

  // Poll while an investigation is in flight.
  useEffect(() => {
    if (!activeId) return
    void load(activeId)
    const timer = setInterval(() => {
      void load(activeId)
    }, 2500)
    return () => clearInterval(timer)
  }, [activeId, load])

  // Stop polling once terminal.
  useEffect(() => {
    if (bundle && (bundle.status === 'completed' || bundle.status === 'failed') && activeId) {
      // one final authoritative load already happened; interval cleared via key change below
    }
  }, [bundle, activeId])

  const inFlight = bundle?.status === 'pending' || bundle?.status === 'running'

  // Recreate the interval only while in flight.
  useEffect(() => {
    if (!inFlight || !activeId) return
    const timer = setInterval(() => void load(activeId), 2500)
    return () => clearInterval(timer)
  }, [inFlight, activeId, load])

  async function onSubmit(values: FormValues): Promise<void> {
    setSubmitting(true)
    setLoadError(null)
    try {
      const created = await apiPost<CreateInvestigationResponse>('/investigations', {
        address: values.address.trim(),
        chain: values.chain,
        mode: values.mode,
        caseId: values.caseId || undefined,
        victimAmount: values.victimAmount != null ? String(values.victimAmount) : undefined,
        victimCurrency: values.victimCurrency,
        incidentType: values.incidentType,
        depth: values.depth,
      })
      setBundle(null)
      setActiveId(created.id)
      navigate(`/investigations/${created.id}`, { replace: true })
    } catch (err) {
      setLoadError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  function reset(): void {
    setActiveId(null)
    setBundle(null)
    setLoadError(null)
    navigate('/investigations')
  }

  const statusTag = bundle ? STATUS_TAGS[bundle.status] : null

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Typography.Title level={3} style={{ marginBottom: 4 }}>
            New Investigation
          </Typography.Title>
          <Typography.Text type="secondary">
            Live analysis queries public blockchain data in real time. Every displayed fact carries a provenance tag.
          </Typography.Text>
        </div>
        {bundle && (
          <Button onClick={reset}>New search</Button>
        )}
      </div>

      {!activeId && (
        <Card>
          <Form<FormValues>
            form={form}
            layout="vertical"
            onFinish={onSubmit}
            initialValues={{ chain: 'ethereum', victimCurrency: 'INR', depth: 2, mode: 'live' }}
          >
            <Form.Item name="mode" label="Investigation mode" style={{ marginBottom: 16 }}>
              <Segmented
                options={[
                  { value: 'live', label: 'LIVE — real blockchain data' },
                  { value: 'demo', label: 'DEMO — seeded intelligence' },
                ]}
              />
            </Form.Item>
            <Row gutter={16}>
              <Col xs={24} md={12}>
                <Form.Item
                  name="address"
                  label="Suspect wallet address"
                  rules={[
                    { required: true, message: 'Address is required' },
                    { pattern: /^0x[0-9a-fA-F]{40}$/, message: 'Must be a valid EVM address (0x + 40 hex chars)' },
                  ]}
                >
                  <Input placeholder="0x…" allowClear />
                </Form.Item>
              </Col>
              <Col xs={12} md={4}>
                <Form.Item name="chain" label="Blockchain">
                  <Select
                    options={[{ value: 'ethereum', label: 'Ethereum' }]}
                    disabled
                  />
                </Form.Item>
              </Col>
              <Col xs={12} md={4}>
                <Form.Item name="depth" label="Trace depth" tooltip="How many intermediary hops to follow away from the suspect">
                  <InputNumber min={1} max={3} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col xs={12} md={4}>
                <Form.Item name="caseId" label="Case ID (optional)">
                  <Input placeholder="e.g. NCRP ack no." allowClear />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col xs={8} md={4}>
                <Form.Item name="victimAmount" label="Victim amount (optional)">
                  <InputNumber min={0} style={{ width: '100%' }} placeholder="e.g. 840000" />
                </Form.Item>
              </Col>
              <Col xs={8} md={4}>
                <Form.Item name="victimCurrency" label="Currency">
                  <Select options={[{ value: 'INR' }, { value: 'USD' }]} />
                </Form.Item>
              </Col>
              <Col xs={8} md={6}>
                <Form.Item name="incidentType" label="Incident type">
                  <Select options={INCIDENT_OPTIONS} allowClear placeholder="Select…" />
                </Form.Item>
              </Col>
              <Col xs={24} md={10} style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', paddingBottom: 24 }}>
                <Button type="primary" htmlType="submit" loading={submitting} size="large">
                  Start investigation
                </Button>
              </Col>
            </Row>
          </Form>
        </Card>
      )}

      {loadError && (
        <Alert
          type="error"
          showIcon
          message="Investigation request failed"
          description={loadError}
          closable
          onClose={() => setLoadError(null)}
        />
      )}

      {bundle && statusTag && (
        <Card>
          <Space size="middle" wrap>
            <Statistic title="Investigation ID" value={bundle.id.slice(-8)} />
            <Tag color={statusTag.color}>{statusTag.text}</Tag>
            {bundle.caseId && <Typography.Text>Case: {bundle.caseId}</Typography.Text>}
            {bundle.victimAmount && (
              <Typography.Text>
                Reported loss: {bundle.victimAmount} {bundle.victimCurrency}
              </Typography.Text>
            )}
            {bundle.incidentType && <Tag>{bundle.incidentType}</Tag>}
          </Space>
        </Card>
      )}

      {inFlight && (
        <Card>
          <div style={{ textAlign: 'center', padding: '48px 0' }}>
            <Spin size="large" />
            <Typography.Paragraph type="secondary" style={{ marginTop: 16 }}>
              Querying blockchain data, tracing fund flow and scoring risk — this can take up to a minute on free-tier API limits.
            </Typography.Paragraph>
          </div>
        </Card>
      )}

      {bundle?.status === 'failed' && (
        <Alert
          type="error"
          showIcon
          message="Analysis failed"
          description={bundle.summary?.error ?? 'Unknown error. Check backend logs.'}
        />
      )}

      {bundle?.status === 'completed' && bundle.graphSnapshot && (
        <>
          {bundle.mode === 'demo' && (
            <Alert
              type="warning"
              banner
              message="DEMO / SEEDED INTELLIGENCE"
              description="Every address, transaction hash, balance and entity in this investigation is synthetic presentation data. No live blockchain queries were made and nothing here refers to real-world activity."
              style={{ border: '1px solid #8b5cf6' }}
            />
          )}
          <WalletSummary bundle={bundle} />

          <Card
            title="Fund-Flow Trace Graph"
            extra={
              <ProvenanceBadge
                provenance="on_chain"
                source={`${bundle.summary?.onChainSource ?? ''}${bundle.summary?.attributionSource ? ` + ${bundle.summary.attributionSource}` : ''}`}
              />
            }
            styles={{ body: { paddingTop: 12 } }}
          >
            <TraceGraph
              nodes={bundle.graphSnapshot.nodes}
              edges={bundle.graphSnapshot.edges}
              suspectAddress={bundle.suspectAddress}
              isDemo={bundle.mode === 'demo'}
            />
            <Typography.Paragraph type="secondary" style={{ fontSize: 11, marginBottom: 0 }}>
              Blue = suspect · grey = intermediary · purple = attributed entity. Edge labels show aggregated transfer value and count. Node entity labels come from the seeded attribution dataset, never inferred.
            </Typography.Paragraph>
          </Card>

          <RiskPanel bundle={bundle} />
          <FlowPathsPanel paths={bundle.flowPaths} />
          <AttributionPanel entities={bundle.graphSnapshot.nodes} />
          <EvidenceTable chain={bundle.chain} address={bundle.suspectAddress} />

          <Card title="Investigation Report">
            <Space wrap>
              <Button type="primary" href={`/api/investigations/${bundle.id}/report`} target="_blank" rel="noopener noreferrer">
                Open printable report (HTML → PDF)
              </Button>
              <Button href={`/api/investigations/${bundle.id}/report?format=json`} download={`report-${bundle.id}.json`}>
                Export report (JSON)
              </Button>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                14-section report separating on-chain evidence from attribution intelligence and heuristic inference.
              </Typography.Text>
            </Space>
          </Card>
        </>
      )}
    </Space>
  )
}
