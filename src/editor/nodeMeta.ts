// 节点类型的展示元信息 + 新建默认 data（与 contract-node-vocabulary.md 对齐）
import type { NodeType } from '../types'

export interface NodeMeta {
  type: NodeType
  label: string
  color: string
  defaultData: () => Record<string, unknown>
  // 主字段：在画布节点上展示
  summary: (data: Record<string, unknown>) => string
}

export const NODE_META: Record<NodeType, NodeMeta> = {
  tool: {
    type: 'tool', label: '工具 tool', color: '#2563eb',
    defaultData: () => ({ toolName: '', params: {}, exec: 'hard' }),
    summary: (d) => String(d.toolName || '(未命名工具)'),
  },
  skill: {
    type: 'skill', label: '技能 skill', color: '#7c3aed',
    defaultData: () => ({ skillName: '', args: {}, exec: 'hard' }),
    summary: (d) => String(d.skillName || '(未命名技能)'),
  },
  expert: {
    type: 'expert', label: '专家 expert', color: '#db2777',
    defaultData: () => ({ expertId: '', subtaskPrompt: '', exec: 'hard' }),
    summary: (d) => String(d.expertId || d.mode || '(未指定专家)'),
  },
  llm: {
    type: 'llm', label: 'LLM 判断', color: '#059669',
    defaultData: () => ({ prompt: '' }),
    summary: (d) => String(d.prompt || '(空提示)').slice(0, 30),
  },
  condition: {
    type: 'condition', label: '条件 condition', color: '#d97706',
    defaultData: () => ({ expression: '' }),
    summary: (d) => String(d.expression || '(空表达式)').slice(0, 30),
  },
  parallel: {
    type: 'parallel', label: '并发 parallel', color: '#6b7280',
    defaultData: () => ({}),
    summary: () => '占位 · 第一阶段不执行',
  },
}

export const NODE_ORDER: NodeType[] = ['tool', 'skill', 'expert', 'llm', 'condition', 'parallel']
