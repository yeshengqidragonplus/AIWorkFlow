import { Handle, Position, type NodeProps } from '@xyflow/react'
import { NODE_META } from './nodeMeta'
import type { NodeType } from '../types'

// 所有 6 种节点共用此视图，按 type 取颜色/标题/主字段
export function WorkflowNodeView({ type, data, selected }: NodeProps) {
  const meta = NODE_META[type as NodeType]
  const d = data as Record<string, unknown>
  const exec = d.exec as string | undefined
  const showExec = type === 'tool' || type === 'skill' || type === 'expert'
  return (
    <div
      style={{
        borderLeft: `4px solid ${meta.color}`,
        background: '#fff',
        borderRadius: 6,
        padding: '8px 12px',
        minWidth: 160,
        boxShadow: selected ? `0 0 0 2px ${meta.color}` : '0 1px 3px rgba(0,0,0,.15)',
        fontSize: 12,
      }}
    >
      <Handle type="target" position={Position.Top} />
      <div style={{ fontWeight: 600, color: meta.color, display: 'flex', justifyContent: 'space-between' }}>
        <span>{meta.label}</span>
        {showExec && (
          <span style={{ fontSize: 10, color: exec === 'soft' ? '#059669' : '#b45309' }}>
            {exec === 'soft' ? '软' : '硬'}
          </span>
        )}
      </div>
      <div style={{ marginTop: 4, color: '#374151', wordBreak: 'break-all' }}>{meta.summary(d)}</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}

export const nodeTypes = {
  tool: WorkflowNodeView,
  skill: WorkflowNodeView,
  expert: WorkflowNodeView,
  llm: WorkflowNodeView,
  condition: WorkflowNodeView,
  parallel: WorkflowNodeView,
}
