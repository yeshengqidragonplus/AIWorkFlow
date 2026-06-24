// 模拟宿主 —— 在不接 QCode 时驱动状态机跑通控制流（里程碑 3）。
// 接入 QCode 时（里程碑 4）整体替换为真实宿主循环，引擎代码无需改动。
import type { Workflow, WorkflowAction, EngineStep } from '../types'
import { createEngine } from './stateMachine'

export interface MockHostHooks {
  // 软：模拟一个 LLM turn，返回 LLM「最终文本」
  runLlm?: (prompt: string, nodeId: string) => unknown
  // 硬：模拟宿主直接执行 action，返回执行结果
  execAction?: (action: WorkflowAction, nodeId: string) => unknown
}

export interface MockRunTrace {
  step: number
  nodeId: string | null
  kind: 'prompt' | 'action' | 'done'
  detail: string | WorkflowAction
  lastOutput?: unknown
}

export interface MockRunResult {
  finalResult: unknown
  trace: MockRunTrace[]
}

// 默认模拟实现：软返回占位文本，硬返回回显结构
const defaultRunLlm: NonNullable<MockHostHooks['runLlm']> = (prompt) => `[mock LLM] ${prompt}`
const defaultExecAction: NonNullable<MockHostHooks['execAction']> = (action) => ({ mock: action })

// 跑完整工作流。模拟宿主分发循环（见 contract-engine-interface.md）。
export function runWithMockHost(
  workflow: Workflow,
  inputs: Record<string, unknown> = {},
  hooks: MockHostHooks = {}
): MockRunResult {
  const runLlm = hooks.runLlm ?? defaultRunLlm
  const execAction = hooks.execAction ?? defaultExecAction
  const engine = createEngine(workflow)
  const trace: MockRunTrace[] = []

  let step: EngineStep = engine.start(inputs)
  let i = 0
  const MAX = 1000 // 防御性上限
  while (!step.done) {
    if (++i > MAX) throw new Error('mock host 超过最大步数，可能存在死循环')
    const nodeId = step.state.currentNodeId
    let lastOutput: unknown
    if (step.action) {
      lastOutput = execAction(step.action, nodeId ?? '')
      trace.push({ step: i, nodeId, kind: 'action', detail: step.action, lastOutput })
    } else {
      const prompt = step.nextPrompt ?? ''
      lastOutput = runLlm(prompt, nodeId ?? '')
      trace.push({ step: i, nodeId, kind: 'prompt', detail: prompt, lastOutput })
    }
    step = engine.advance(step.state, lastOutput)
  }
  trace.push({ step: i + 1, nodeId: null, kind: 'done', detail: 'done' })
  return { finalResult: step.finalResult, trace }
}
