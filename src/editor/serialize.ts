// React Flow 状态 <-> Workflow JSON 互转（格式即 React Flow 原生，见 contract-graph-schema.md）
import type { Node, Edge } from '@xyflow/react'
import type { Workflow, NodeType } from '../types'

export interface WorkflowMeta {
  name: string
  description: string
  version: string
}

export function toWorkflow(meta: WorkflowMeta, nodes: Node[], edges: Edge[]): Workflow {
  return {
    ...meta,
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type as NodeType,
      position: n.position,
      data: { ...(n.data as Record<string, unknown>) },
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? null,
      targetHandle: e.targetHandle ?? null,
      data: e.data as { branch?: 'true' | 'false' } | undefined,
    })),
  }
}

export function fromWorkflow(wf: Workflow): { meta: WorkflowMeta; nodes: Node[]; edges: Edge[] } {
  return {
    meta: { name: wf.name, description: wf.description, version: wf.version },
    nodes: wf.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: n.position,
      data: { ...n.data },
    })),
    edges: wf.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? undefined,
      targetHandle: e.targetHandle ?? undefined,
      data: e.data,
      label: e.data?.branch,
    })),
  }
}
