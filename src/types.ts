// 共享类型 —— 契约的 TypeScript 体现
// 唯一事实来源见 Docs/contract-*.md。三方（编辑器/引擎/QCode）共用。

export type NodeType =
  | 'tool'
  | 'skill'
  | 'expert'
  | 'llm'
  | 'condition'
  | 'parallel'

export interface WorkflowInput {
  name: string
  type: 'string' | 'number' | 'boolean' | 'object'
  required?: boolean
  default?: unknown
  description?: string
}

// 各节点 data 形状（见 contract-node-vocabulary.md）
export type ExecMode = 'soft' | 'hard'

export interface ToolData {
  toolName: string
  params?: Record<string, unknown>
  exec?: ExecMode // 默认 'hard'
}
export interface SkillData {
  skillName: string
  args?: Record<string, unknown>
  exec?: ExecMode // 默认 'hard'
}
export interface ExpertData {
  expertId?: string
  mode?: string
  subtaskPrompt: string
  exec?: ExecMode // 默认 'hard'
}
export interface LlmData {
  prompt: string
  outputSchema?: object
}
export interface ConditionData {
  expression: string
}
export type ParallelData = Record<string, never>

export type NodeData =
  | ToolData
  | SkillData
  | ExpertData
  | LlmData
  | ConditionData
  | ParallelData

export interface WorkflowNode {
  id: string
  type: NodeType
  position: { x: number; y: number }
  data: Record<string, unknown>
}

export interface WorkflowEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string | null
  targetHandle?: string | null
  data?: {
    branch?: 'true' | 'false'
  }
}

export interface Workflow {
  name: string
  description: string
  version: string
  inputs?: WorkflowInput[]
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
}

// 节点执行结果（见 contract-node-vocabulary.md）
export interface NodeResult {
  nodeId: string
  output: unknown
  status: 'success' | 'error' | 'skipped'
  error?: string
}

// 引用解析所需的最小作用域：启动参数 + 已完成节点产出
export interface RefScope {
  inputs: Record<string, unknown>
  results: Record<string, NodeResult>
}

// ---- 状态机接口（对接契约 §4.2，见 contract-engine-interface.md）----

// 硬动作：宿主直接执行，不花 LLM turn
export type WorkflowAction =
  | { type: 'delegate'; expert: string; goal: string }
  | { type: 'tool'; name: string; params: Record<string, unknown> }
  | { type: 'skill'; name: string; args: Record<string, unknown> }

// 引擎的不透明可序列化状态。宿主随 task 持久化，不解读内部。
export interface WorkflowState extends RefScope {
  currentNodeId: string | null // 正在等待 lastOutput 的节点
  done: boolean
  finalResult?: unknown
}

// 每步返回：nextPrompt（软）与 action（硬）二选一；done 时给 finalResult
export interface EngineStep {
  state: WorkflowState
  nextPrompt?: string
  action?: WorkflowAction
  done: boolean
  finalResult?: unknown
}

export interface WorkflowEngine {
  start(inputs: Record<string, unknown>): EngineStep
  advance(state: WorkflowState, lastOutput: unknown): EngineStep
}
