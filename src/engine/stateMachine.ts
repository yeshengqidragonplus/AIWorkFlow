// 执行引擎 —— 有状态状态机（对接契约 §4.2，见 Docs/contract-engine-interface.md）
// 核心模型：LLM 为主、工作流为导演。引擎不直接执行动作，只在每个 turn 前被宿主调用，
// 返回下一步是「软」(nextPrompt 交 LLM) 还是「硬」(action 宿主机械执行)。
// state 必须可序列化、无隐式内存依赖：advance 可从任意持久化 state 恢复续跑（§4.3）。
import type {
  Workflow,
  WorkflowNode,
  WorkflowEdge,
  NodeResult,
  WorkflowState,
  EngineStep,
  WorkflowEngine,
  WorkflowAction,
  ExecMode,
} from '../types'
import { validateWorkflow } from './validate'
import { evaluateCondition } from './condition'
import { resolveValue, resolveData } from './reference'

function execMode(node: WorkflowNode): ExecMode {
  return (node.data.exec as ExecMode) === 'soft' ? 'soft' : 'hard'
}

export function createEngine(workflow: Workflow): WorkflowEngine {
  const validation = validateWorkflow(workflow)
  if (!validation.valid) {
    throw new Error('工作流校验失败:\n' + validation.errors.join('\n'))
  }
  const nodeById = new Map(workflow.nodes.map((n) => [n.id, n]))
  const incomingOf = (id: string) => workflow.edges.filter((e) => e.target === id)
  const isEntry = (id: string) => !workflow.edges.some((e) => e.target === id)

  // 入边是否启用：source 成功 + 分支匹配（condition 出边按所选 branch 裁剪）
  function edgeEnabled(e: WorkflowEdge, state: WorkflowState): boolean {
    const src = state.results[e.source]
    if (!src || src.status !== 'success') return false
    const srcNode = nodeById.get(e.source)
    if (srcNode?.type === 'condition' && e.data?.branch !== undefined) {
      const chosen = src.output === true ? 'true' : 'false'
      return e.data.branch === chosen
    }
    return true
  }

  // 节点是否被激活（可执行）：入口节点恒真；否则需有启用入边
  function isActivated(id: string, state: WorkflowState): boolean {
    if (isEntry(id)) return true
    return incomingOf(id).some((e) => edgeEnabled(e, state))
  }

  // 节点的所有上游是否都已结算（success/error/skipped）——保证拓扑序
  function upstreamSettled(id: string, state: WorkflowState): boolean {
    return incomingOf(id).every((e) => state.results[e.source] !== undefined)
  }

  // 找下一个待处理节点：上游已结算且自身未结算
  function nextPending(state: WorkflowState): WorkflowNode | null {
    for (const n of workflow.nodes) {
      if (state.results[n.id]) continue
      if (!upstreamSettled(n.id, state)) continue
      return n
    }
    return null
  }

  // 把未激活节点标记为 skipped，直到没有可推进的为止
  function skipInactive(state: WorkflowState): void {
    let changed = true
    while (changed) {
      changed = false
      for (const n of workflow.nodes) {
        if (state.results[n.id]) continue
        if (!upstreamSettled(n.id, state)) continue
        if (!isActivated(n.id, state)) {
          state.results[n.id] = { nodeId: n.id, output: undefined, status: 'skipped' }
          changed = true
        }
      }
    }
  }

  function buildSoftPrompt(node: WorkflowNode, state: WorkflowState): string {
    const { resolved } = resolveData(node.data, state)
    switch (node.type) {
      case 'llm':
        return String(resolved.prompt ?? '')
      case 'tool':
        return `请使用工具 \`${resolved.toolName}\` 完成此步骤，参数：${JSON.stringify(resolved.params ?? {})}`
      case 'skill':
        return `请运行技能 \`${resolved.skillName}\`，参数：${JSON.stringify(resolved.args ?? {})}`
      case 'expert':
        return `请展开以下子任务并给出结论摘要：${String(resolved.subtaskPrompt ?? '')}`
      default:
        return ''
    }
  }

  function buildAction(node: WorkflowNode, state: WorkflowState): WorkflowAction {
    const { resolved } = resolveData(node.data, state)
    switch (node.type) {
      case 'tool':
        return { type: 'tool', name: String(resolved.toolName), params: (resolved.params as Record<string, unknown>) ?? {} }
      case 'skill':
        return { type: 'skill', name: String(resolved.skillName), args: (resolved.args as Record<string, unknown>) ?? {} }
      case 'expert':
        return { type: 'delegate', expert: String(resolved.expertId ?? resolved.mode ?? ''), goal: String(resolved.subtaskPrompt ?? '') }
      default:
        throw new Error(`节点 ${node.id}(${node.type}) 不能作为硬动作`)
    }
  }

  // 终态：收集叶子节点（无出边）的成功输出作为 finalResult
  function computeFinalResult(state: WorkflowState): unknown {
    const out: Record<string, unknown> = {}
    for (const n of workflow.nodes) {
      const hasOut = workflow.edges.some((e) => e.source === n.id)
      const r = state.results[n.id]
      if (!hasOut && r?.status === 'success') out[n.id] = r.output
    }
    return out
  }

  // 从 current state 推进，处理所有引擎内部节点（condition/parallel/skip），
  // 直到遇到一个需要宿主参与的软/硬节点，或全部完成。
  function drive(state: WorkflowState): EngineStep {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      skipInactive(state)
      const node = nextPending(state)
      if (!node) {
        state.done = true
        state.currentNodeId = null
        state.finalResult = computeFinalResult(state)
        return { state, done: true, finalResult: state.finalResult }
      }

      // condition：引擎内部求值，无 IO
      if (node.type === 'condition') {
        try {
          const value = evaluateCondition(String(node.data.expression ?? ''), state)
          state.results[node.id] = { nodeId: node.id, output: value, status: 'success' }
        } catch (err) {
          state.results[node.id] = { nodeId: node.id, output: undefined, status: 'error', error: String(err) }
        }
        continue
      }

      // parallel：第一阶段不执行，降级为直通
      if (node.type === 'parallel') {
        state.results[node.id] = { nodeId: node.id, output: null, status: 'success' }
        continue
      }

      // tool / skill / expert / llm → 需要宿主参与，挂起
      state.currentNodeId = node.id
      if (node.type !== 'llm' && execMode(node) === 'hard') {
        return { state, action: buildAction(node, state), done: false }
      }
      return { state, nextPrompt: buildSoftPrompt(node, state), done: false }
    }
  }

  return {
    start(inputs) {
      const state: WorkflowState = {
        inputs: applyInputDefaults(workflow, inputs),
        results: {},
        currentNodeId: null,
        done: false,
      }
      return drive(state)
    },

    advance(prevState, lastOutput) {
      // 防御性深拷贝，保证无隐式内存依赖且不改写调用方持有的 state
      const state: WorkflowState = JSON.parse(JSON.stringify(prevState))
      if (state.done) {
        return { state, done: true, finalResult: state.finalResult }
      }
      const id = state.currentNodeId
      if (id) {
        // 把宿主回传的 lastOutput 记为当前节点的产出
        state.results[id] = parseOutput(id, nodeById.get(id), lastOutput)
        state.currentNodeId = null
      }
      return drive(state)
    },
  }
}

// llm 节点若声明 outputSchema 且 lastOutput 是 JSON 文本，尝试解析为对象
function parseOutput(id: string, node: WorkflowNode | undefined, lastOutput: unknown): NodeResult {
  if (node?.type === 'llm' && node.data.outputSchema && typeof lastOutput === 'string') {
    try {
      return { nodeId: id, output: JSON.parse(lastOutput), status: 'success' }
    } catch {
      // 非 JSON 文本则原样保留
    }
  }
  return { nodeId: id, output: lastOutput, status: 'success' }
}

function applyInputDefaults(wf: Workflow, provided: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...provided }
  for (const def of wf.inputs ?? []) {
    if (out[def.name] === undefined && def.default !== undefined) out[def.name] = def.default
    if (def.required && out[def.name] === undefined) throw new Error(`缺少必填启动参数: ${def.name}`)
  }
  return out
}

// 供宿主/工具内部解析引用（导出便于复用）
export { resolveValue }
