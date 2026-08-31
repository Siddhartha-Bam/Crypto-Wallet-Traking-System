import { useEffect, useState } from 'react'
import { Card, Segmented, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { apiGet } from '../../api/client'
import type {
  TokenTransferRow,
  TransactionRow,
  TransactionsResponse,
} from '../../types/api'

const PAGE_SIZE = 20

function short(address: string | null): string {
  if (!address) return '—'
  return `${address.slice(0, 8)}…${address.slice(-6)}`
}

export default function EvidenceTable({ chain, address }: { chain: string; address: string }) {
  const [assetType, setAssetType] = useState<'normal' | 'token'>('normal')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<TransactionsResponse<TransactionRow> | null>(null)
  const [tokenData, setTokenData] = useState<TransactionsResponse<TokenTransferRow> | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    apiGet<TransactionsResponse<TransactionRow>>(
      `/wallet/${chain}/${address}/transactions?type=${assetType}&page=${page}&pageSize=${PAGE_SIZE}`,
      controller.signal,
    )
      .then((res) => {
        if (assetType === 'normal') setData(res)
        else setTokenData(res as unknown as TransactionsResponse<TokenTransferRow>)
      })
      .catch((err: unknown) => {
        if ((err as Error).name !== 'AbortError') setError((err as Error).message)
      })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [chain, address, assetType, page])

  const active = assetType === 'normal' ? data : tokenData
  const meta = active?.meta

  const normalColumns: ColumnsType<TransactionRow> = [
    {
      title: 'Timestamp',
      dataIndex: 'timestamp',
      width: 170,
      render: (v: string) => new Date(v).toLocaleString(),
    },
    {
      title: 'Hash',
      dataIndex: 'hash',
      render: (h: string) => (
        <Typography.Text code copyable={{ text: h }} style={{ fontSize: 11 }}>
          {h.slice(0, 14)}…
        </Typography.Text>
      ),
    },
    {
      title: 'Direction',
      key: 'direction',
      width: 90,
      render: (_: unknown, row: TransactionRow) =>
        row.from?.toLowerCase() === address.toLowerCase() ? (
          <Tag color="orange">OUT</Tag>
        ) : (
          <Tag color="green">IN</Tag>
        ),
    },
    { title: 'From', dataIndex: 'from', render: short },
    { title: 'To', dataIndex: 'to', render: short },
    { title: 'Asset', key: 'asset', width: 70, render: () => 'ETH' },
    {
      title: 'Amount',
      dataIndex: 'valueWei',
      align: 'right',
      render: (v: string) => {
        try {
          return (Number(BigInt(v)) / 1e18).toFixed(6)
        } catch {
          return '—'
        }
      },
    },
    { title: 'Block', dataIndex: 'blockNumber', width: 110 },
  ]

  const tokenColumns: ColumnsType<TokenTransferRow> = [
    {
      title: 'Timestamp',
      dataIndex: 'timestamp',
      width: 170,
      render: (v: string) => new Date(v).toLocaleString(),
    },
    {
      title: 'Hash',
      dataIndex: 'txHash',
      render: (h: string) => (
        <Typography.Text code copyable={{ text: h }} style={{ fontSize: 11 }}>
          {h.slice(0, 14)}…
        </Typography.Text>
      ),
    },
    {
      title: 'Direction',
      key: 'direction',
      width: 90,
      render: (_: unknown, row: TokenTransferRow) =>
        row.from.toLowerCase() === address.toLowerCase() ? <Tag color="orange">OUT</Tag> : <Tag color="green">IN</Tag>,
    },
    { title: 'From', dataIndex: 'from', render: short },
    { title: 'To', dataIndex: 'to', render: short },
    { title: 'Asset', dataIndex: 'tokenSymbol', width: 80 },
    { title: 'Amount', dataIndex: 'amount', align: 'right' },
    { title: 'Block', dataIndex: 'blockNumber', width: 110 },
  ]

  return (
    <Card
      title="Evidence — Transaction Explorer"
      extra={
        <Segmented
          value={assetType}
          onChange={(v) => {
            setAssetType(v as 'normal' | 'token')
            setPage(1)
          }}
          options={[
            { label: 'ETH transfers', value: 'normal' },
            { label: 'Token transfers', value: 'token' },
          ]}
        />
      }
      styles={{ body: { paddingTop: 8 } }}
    >
      {error && <Typography.Text type="danger">{error}</Typography.Text>}
      {meta && (
        <Typography.Paragraph type="secondary" style={{ fontSize: 11 }}>
          Source: {meta.source} · retrieved {new Date(meta.retrievedAt).toLocaleString()}
          {meta.window?.truncated ? ' · window truncated at provider limit' : ''}
        </Typography.Paragraph>
      )}
      <Table<TransactionRow | TokenTransferRow>
        size="small"
        loading={loading}
        rowKey={(r) => ('hash' in r ? r.hash : r.txHash)}
        columns={assetType === 'normal' ? (normalColumns as ColumnsType<TransactionRow | TokenTransferRow>) : (tokenColumns as ColumnsType<TransactionRow | TokenTransferRow>)}
        dataSource={(active?.items ?? []) as (TransactionRow | TokenTransferRow)[]}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total: active?.pagination.totalItems ?? 0,
          onChange: setPage,
          showSizeChanger: false,
        }}
      />
    </Card>
  )
}
