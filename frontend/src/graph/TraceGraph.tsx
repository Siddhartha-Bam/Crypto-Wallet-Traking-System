import { useMemo } from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import { Tag, Typography } from 'antd'
import '@xyflow/react/dist/style.css'
import type { GraphEdgeData, GraphNode } from '../types/api'

const ROLE_COLORS: Record<GraphNode['role'], string> = {
  suspect: '#3b82d6',
  intermediary: '#6b7280',
  attributed_entity: '#a855f7',
}

type FlowNodeData = {
  node: GraphNode
  isDemo?: boolean
}

function TraceNode({ data }: NodeProps) {
  const { node } = data as unknown as FlowNodeData
  const color = ROLE_COLORS[node.role]
  return (
    <div
      style={{
        width: 230,
        border: `1.5px solid ${color}`,
        borderRadius: 8,
        background: '#161b22',
        padding: '10px 12px',
        boxShadow: node.role === 'suspect' ? `0 0 14px ${color}55` : undefined,
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: color }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
        <Typography.Text strong style={{ fontSize: 12 }}>
          {node.role === 'attributed_entity' ? node.entityName : `${node.address.slice(0, 8)}…${node.address.slice(-6)}`}
        </Typography.Text>
        {node.role === 'attributed_entity' && <Tag color="purple" style={{ marginRight: 0 }}>ENTITY</Tag>}
        {node.role === 'suspect' && <Tag color="blue" style={{ marginRight: 0 }}>SUSPECT</Tag>}
      </div>
      {node.role === 'attributed_entity' && (
        <Typography.Text type="secondary" code style={{ fontSize: 10, display: 'block', marginTop: 2 }}>
          {node.address.slice(0, 16)}…
        </Typography.Text>
      )}
      <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
        {node.balanceNative !== undefined && (
          <Typography.Text style={{ fontSize: 11 }}>
            ⛃ {node.balanceNative} {node.balanceSymbol}
          </Typography.Text>
        )}
        {node.txCountAnalyzed !== undefined && (
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>
            txs analyzed: {node.txCountAnalyzed}
          </Typography.Text>
        )}
        {node.entityType && (
          <Tag style={{ marginTop: 2, fontSize: 10 }} bordered>
            {node.entityType} · {node.attributionConfidence}
          </Tag>
        )}
      </div>
      <Handle type="source" position={Position.Right} style={{ background: color }} />
    </div>
  )
}

const nodeTypes = { trace: TraceNode }

export interface TraceGraphProps {
  nodes: GraphNode[]
  edges: GraphEdgeData[]
  suspectAddress?: string
  isDemo?: boolean
  onEdgeSelected?: (edge: GraphEdgeData) => void
}

/** Deterministic layout: columns by BFS depth, rows by value rank within the column. */
export default function TraceGraph({ nodes, edges, isDemo, onEdgeSelected }: TraceGraphProps) {
  const flowNodes = useMemo<Node[]>(() => {
    const byDepth = new Map<number, GraphNode[]>()
    for (const n of nodes) {
      const list = byDepth.get(n.depth) ?? []
      list.push(n)
      byDepth.set(n.depth, list)
    }
    const out: Node[] = []
    for (const [depth, group] of [...byDepth.entries()].sort((a, b) => a[0] - b[0])) {
      group.forEach((n, i) => {
        out.push({
          id: n.id,
          type: 'trace',
          position: { x: depth * 300, y: i * 150 },
          data: { node: n } satisfies FlowNodeData as never,
        })
      })
    }
    return out
  }, [nodes])

  const flowEdges = useMemo<Edge[]>(() => {
    return edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      animated: e.direction === 'out',
      label: `${e.totalValue} ${e.asset} ×${e.transactionCount}`,
      labelStyle: { fontSize: 10, fill: '#9ca3af' },
      labelBgStyle: { fill: '#101418' },
      style: {
        stroke:
          e.direction === 'out'
            ? '#3b82d6'
            : e.direction === 'in'
              ? '#4b5563'
              : '#374151',
        strokeWidth: 1.5,
      },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#4b5563' },
    }))
  }, [edges])

  return (
    <div style={{ position: 'relative', height: 520 }}>
      {isDemo && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 5,
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          <span
            style={{
              fontSize: 64,
              fontWeight: 800,
              color: 'rgba(168,85,247,0.08)',
              transform: 'rotate(-18deg)',
              whiteSpace: 'nowrap',
            }}
          >
            DEMO / SEEDED INTELLIGENCE
          </span>
        </div>
      )}
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.2}
        proOptions={{ hideAttribution: true }}
        onEdgeClick={(_, edge) => {
          const found = edges.find((e) => e.id === edge.id)
          if (found) onEdgeSelected?.(found)
        }}
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="#1f2937" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}

