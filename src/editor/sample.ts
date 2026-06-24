import type { Workflow } from '../types'

// 默认示例：硬 read → 软 llm 分类 → condition → 硬 delegate / 硬 tool（里程碑 5 闭环形态）
export const SAMPLE: Workflow = {
  name: 'triage-flow',
  description: '硬 read → 软 llm 分类 → 按类别硬执行',
  version: '1.0.0',
  inputs: [{ name: 'issueText', type: 'string', required: true, default: '保存时崩溃' }],
  nodes: [
    { id: 'read', type: 'tool', position: { x: 240, y: 0 }, data: { toolName: 'readIssue', params: { q: '{{inputs.issueText}}' }, exec: 'hard' } },
    { id: 'cls', type: 'llm', position: { x: 240, y: 120 }, data: { prompt: '判断这是 bug 还是 feature: {{read.output}}', outputSchema: { type: 'object', properties: { label: { type: 'string' } } } } },
    { id: 'cond', type: 'condition', position: { x: 240, y: 240 }, data: { expression: '{{cls.output.label}} === "bug"' } },
    { id: 'bug', type: 'expert', position: { x: 80, y: 360 }, data: { expertId: 'fixer', subtaskPrompt: '修复: {{inputs.issueText}}', exec: 'hard' } },
    { id: 'feat', type: 'tool', position: { x: 420, y: 360 }, data: { toolName: 'createFeatureRequest', params: { text: '{{inputs.issueText}}' }, exec: 'hard' } },
  ],
  edges: [
    { id: 'e1', source: 'read', target: 'cls' },
    { id: 'e2', source: 'cls', target: 'cond' },
    { id: 'e3', source: 'cond', target: 'bug', data: { branch: 'true' } },
    { id: 'e4', source: 'cond', target: 'feat', data: { branch: 'false' } },
  ],
}
