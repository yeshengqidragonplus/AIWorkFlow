import { describe, it, expect } from 'vitest'
import { validateWorkflow } from './validate'
import { resolveValue } from './reference'
import { evaluateCondition } from './condition'
import { createEngine } from './stateMachine'
import { runWithMockHost } from './mockHost'
import type { Workflow, RefScope } from '../types'

const scope: RefScope = {
  inputs: { issueText: 'crash on save' },
  results: {
    n1: { nodeId: 'n1', status: 'success', output: { label: 'bug', score: 0.9 } },
  },
}

describe('reference', () => {
  it('整串单引用保留原始类型', () => {
    expect(resolveValue('{{n1.output}}', scope)).toEqual({ label: 'bug', score: 0.9 })
  })
  it('点路径访问', () => {
    expect(resolveValue('{{n1.output.label}}', scope)).toBe('bug')
  })
  it('字符串插值', () => {
    expect(resolveValue('类别是 {{n1.output.label}}', scope)).toBe('类别是 bug')
  })
  it('inputs 命名空间', () => {
    expect(resolveValue('{{inputs.issueText}}', scope)).toBe('crash on save')
  })
  it('未知引用 -> undefined', () => {
    expect(resolveValue('{{nope.output}}', scope)).toBeUndefined()
  })
})

describe('condition', () => {
  it('字符串相等', () => {
    expect(evaluateCondition('{{n1.output.label}} === "bug"', scope)).toBe(true)
  })
  it('数值比较', () => {
    expect(evaluateCondition('{{n1.output.score}} > 0.8', scope)).toBe(true)
  })
  it('逻辑与', () => {
    expect(evaluateCondition('{{n1.output.label}} === "bug" && {{n1.output.score}} > 0.5', scope)).toBe(true)
  })
  it('阻止注入裸标识符', () => {
    expect(() => evaluateCondition('process', scope)).toThrow()
  })
})

describe('validate', () => {
  it('检出缺失元数据与非法类型', () => {
    const bad = { name: '', description: '', version: '', nodes: [{ id: 'a', type: 'xxx', position: { x: 0, y: 0 }, data: {} }], edges: [] } as unknown as Workflow
    const r = validateWorkflow(bad)
    expect(r.valid).toBe(false)
    expect(r.errors.some((e) => e.includes('name'))).toBe(true)
    expect(r.errors.some((e) => e.includes('类型非法'))).toBe(true)
  })
  it('检出环', () => {
    const wf: Workflow = {
      name: 'c', description: 'd', version: '1.0.0',
      nodes: [
        { id: 'a', type: 'tool', position: { x: 0, y: 0 }, data: { toolName: 't' } },
        { id: 'b', type: 'tool', position: { x: 0, y: 0 }, data: { toolName: 't' } },
      ],
      edges: [
        { id: 'e1', source: 'a', target: 'b' },
        { id: 'e2', source: 'b', target: 'a' },
      ],
    }
    expect(validateWorkflow(wf).errors.some((e) => e.includes('环'))).toBe(true)
  })
})

// 混合软硬：硬 tool(read) → 软 llm 判断 → condition → 硬 delegate / 硬 tool（里程碑 5 形态）
const triage: Workflow = {
  name: 'triage-flow',
  description: '硬 read → 软 llm 分类 → 按类别硬执行',
  version: '1.0.0',
  inputs: [{ name: 'issueText', type: 'string', required: true }],
  nodes: [
    { id: 'read', type: 'tool', position: { x: 0, y: 0 }, data: { toolName: 'readIssue', params: { q: '{{inputs.issueText}}' }, exec: 'hard' } },
    { id: 'cls', type: 'llm', position: { x: 0, y: 1 }, data: { prompt: '判断 bug/feature: {{read.output}}', outputSchema: { type: 'object' } } },
    { id: 'cond', type: 'condition', position: { x: 0, y: 2 }, data: { expression: '{{cls.output.label}} === "bug"' } },
    { id: 'bug', type: 'expert', position: { x: -1, y: 3 }, data: { expertId: 'fixer', subtaskPrompt: '修复 {{inputs.issueText}}', exec: 'hard' } },
    { id: 'feat', type: 'tool', position: { x: 1, y: 3 }, data: { toolName: 'createFeatureRequest', params: { text: '{{inputs.issueText}}' }, exec: 'hard' } },
  ],
  edges: [
    { id: 'e1', source: 'read', target: 'cls' },
    { id: 'e2', source: 'cls', target: 'cond' },
    { id: 'e3', source: 'cond', target: 'bug', data: { branch: 'true' } },
    { id: 'e4', source: 'cond', target: 'feat', data: { branch: 'false' } },
  ],
}

describe('state machine (mock host)', () => {
  it('软硬交替：硬 tool 出 action，软 llm 出 prompt', () => {
    const engine = createEngine(triage)
    const s1 = engine.start({ issueText: 'crash' })
    // 第一个节点 read 是硬 tool → action
    expect(s1.action).toEqual({ type: 'tool', name: 'readIssue', params: { q: 'crash' } })
    expect(s1.nextPrompt).toBeUndefined()
    const s2 = engine.advance(s1.state, '问题正文')
    // 下一个 cls 是 llm → 软 prompt
    expect(s2.nextPrompt).toContain('判断 bug/feature')
    expect(s2.action).toBeUndefined()
  })

  it('分支裁剪 + 委派：condition=true 走 bug(expert delegate)，跳过 feat', () => {
    const { finalResult, trace } = runWithMockHost(triage, { issueText: 'crash' }, {
      runLlm: (_p, nodeId) => (nodeId === 'cls' ? JSON.stringify({ label: 'bug' }) : 'ok'),
      execAction: (action) => ({ ran: action.type }),
    })
    // 走过的硬动作里应有 delegate（bug 分支），不应有 createFeatureRequest
    const actions = trace.filter((t) => t.kind === 'action').map((t) => t.detail as { type: string; name?: string })
    expect(actions.some((a) => a.type === 'delegate')).toBe(true)
    expect(actions.some((a) => a.name === 'createFeatureRequest')).toBe(false)
    // finalResult 收集叶子节点输出，含 bug 不含 feat
    expect(Object.keys(finalResult as object)).toContain('bug')
    expect(Object.keys(finalResult as object)).not.toContain('feat')
  })

  it('state 可序列化、advance 可从持久化值恢复（无隐式内存依赖）', () => {
    const engine = createEngine(triage)
    let step = engine.start({ issueText: 'crash' })
    // 模拟每步把 state 序列化再反序列化（如 task 持久化）
    const roundtrip = (s: unknown) => JSON.parse(JSON.stringify(s))
    let guard = 0
    while (!step.done && guard++ < 50) {
      const out = step.action ? { ran: true } : JSON.stringify({ label: 'bug' })
      step = engine.advance(roundtrip(step.state), out)
    }
    expect(step.done).toBe(true)
  })

  it('缺少必填启动参数报错', () => {
    expect(() => createEngine(triage).start({})).toThrow('issueText')
  })
})
