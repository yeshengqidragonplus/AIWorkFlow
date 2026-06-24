// 工作流图校验 —— 见 Docs/contract-graph-schema.md
import type { Workflow, NodeType } from '../types'

export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

const NODE_TYPES: NodeType[] = ['tool', 'skill', 'expert', 'llm', 'condition', 'parallel']

// 各类型必填字段
const REQUIRED_FIELDS: Record<NodeType, string[]> = {
  tool: ['toolName'],
  skill: ['skillName'],
  expert: ['subtaskPrompt'],
  llm: ['prompt'],
  condition: ['expression'],
  parallel: [],
}

export function validateWorkflow(wf: Workflow): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // 1. 元数据
  if (!wf.name?.trim()) errors.push('name 必填')
  if (!wf.description?.trim()) errors.push('description 必填')
  if (!wf.version?.trim()) errors.push('version 必填')
  if (!Array.isArray(wf.nodes)) { errors.push('nodes 必须是数组'); return { valid: false, errors, warnings } }
  if (!Array.isArray(wf.edges)) { errors.push('edges 必须是数组'); return { valid: false, errors, warnings } }

  const ids = new Set<string>()
  for (const node of wf.nodes) {
    if (ids.has(node.id)) errors.push(`重复节点 id: ${node.id}`)
    ids.add(node.id)
    if (!NODE_TYPES.includes(node.type)) {
      errors.push(`节点 ${node.id} 类型非法: ${node.type}`)
      continue
    }
    for (const f of REQUIRED_FIELDS[node.type]) {
      if (node.data?.[f] === undefined || node.data?.[f] === '') {
        errors.push(`节点 ${node.id}(${node.type}) 缺少必填字段 ${f}`)
      }
    }
    if (node.type === 'expert') {
      if (!node.data?.expertId && !node.data?.mode) {
        errors.push(`节点 ${node.id}(expert) 须至少有 expertId 或 mode`)
      }
    }
    if (node.type === 'parallel') {
      warnings.push(`节点 ${node.id}(parallel) 第一阶段不执行，将降级为串行`)
    }
  }

  // 3. 边引用存在性
  for (const e of wf.edges) {
    if (!ids.has(e.source)) errors.push(`边 ${e.id} 的 source 不存在: ${e.source}`)
    if (!ids.has(e.target)) errors.push(`边 ${e.id} 的 target 不存在: ${e.target}`)
  }

  // 4. 无环检测
  if (hasCycle(wf)) errors.push('图中存在环，必须是 DAG')

  // 5. condition 出边 branch 成对
  for (const node of wf.nodes) {
    if (node.type !== 'condition') continue
    const out = wf.edges.filter((e) => e.source === node.id)
    const branches = new Set(out.map((e) => e.data?.branch))
    if (!branches.has('true') || !branches.has('false')) {
      warnings.push(`condition 节点 ${node.id} 出边缺少成对的 branch: 'true'/'false'`)
    }
  }

  return { valid: errors.length === 0, errors, warnings }
}

function hasCycle(wf: Workflow): boolean {
  const adj = new Map<string, string[]>()
  for (const n of wf.nodes) adj.set(n.id, [])
  for (const e of wf.edges) adj.get(e.source)?.push(e.target)
  const state = new Map<string, 0 | 1 | 2>() // 0未访问 1在栈 2完成
  const dfs = (id: string): boolean => {
    state.set(id, 1)
    for (const next of adj.get(id) ?? []) {
      const s = state.get(next) ?? 0
      if (s === 1) return true
      if (s === 0 && dfs(next)) return true
    }
    state.set(id, 2)
    return false
  }
  for (const n of wf.nodes) {
    if ((state.get(n.id) ?? 0) === 0 && dfs(n.id)) return true
  }
  return false
}
