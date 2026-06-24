import type { Node } from '@xyflow/react'
import type { NodeType } from '../types'

interface Props {
  node: Node | null
  onChange: (id: string, data: Record<string, unknown>) => void
  onDelete: (id: string) => void
}

// JSON 文本字段：编辑 params/args/outputSchema 这类对象
function JsonField({ label, value, onChange }: { label: string; value: unknown; onChange: (v: unknown) => void }) {
  return (
    <label style={{ display: 'block', marginBottom: 10 }}>
      <span style={lbl}>{label}</span>
      <textarea
        style={{ ...inp, fontFamily: 'monospace', minHeight: 56 }}
        defaultValue={JSON.stringify(value ?? {}, null, 2)}
        onBlur={(e) => {
          try { onChange(JSON.parse(e.target.value || '{}')) } catch { /* 忽略非法 JSON */ }
        }}
      />
    </label>
  )
}

function Text({ label, value, onChange, area }: { label: string; value: unknown; onChange: (v: string) => void; area?: boolean }) {
  return (
    <label style={{ display: 'block', marginBottom: 10 }}>
      <span style={lbl}>{label}</span>
      {area
        ? <textarea style={{ ...inp, minHeight: 56 }} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />
        : <input style={inp} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />}
    </label>
  )
}

function ExecToggle({ value, onChange }: { value: unknown; onChange: (v: string) => void }) {
  return (
    <label style={{ display: 'block', marginBottom: 10 }}>
      <span style={lbl}>执行方式 exec</span>
      <select style={inp} value={(value as string) || 'hard'} onChange={(e) => onChange(e.target.value)}>
        <option value="hard">硬 — 宿主直接执行 (action)</option>
        <option value="soft">软 — 交 LLM (nextPrompt)</option>
      </select>
    </label>
  )
}

export function ConfigPanel({ node, onChange, onDelete }: Props) {
  if (!node) return <div style={{ padding: 16, color: '#9ca3af', fontSize: 13 }}>选中一个节点以编辑其参数</div>
  const d = node.data as Record<string, unknown>
  const set = (patch: Record<string, unknown>) => onChange(node.id, { ...d, ...patch })
  const type = node.type as NodeType

  return (
    <div style={{ padding: 16, fontSize: 13 }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{type}</div>
      <div style={{ color: '#9ca3af', fontSize: 11, marginBottom: 12 }}>id: {node.id}</div>

      {type === 'tool' && <>
        <Text label="toolName *" value={d.toolName} onChange={(v) => set({ toolName: v })} />
        <JsonField label="params" value={d.params} onChange={(v) => set({ params: v })} />
        <ExecToggle value={d.exec} onChange={(v) => set({ exec: v })} />
      </>}
      {type === 'skill' && <>
        <Text label="skillName *" value={d.skillName} onChange={(v) => set({ skillName: v })} />
        <JsonField label="args" value={d.args} onChange={(v) => set({ args: v })} />
        <ExecToggle value={d.exec} onChange={(v) => set({ exec: v })} />
      </>}
      {type === 'expert' && <>
        <Text label="expertId" value={d.expertId} onChange={(v) => set({ expertId: v })} />
        <Text label="mode" value={d.mode} onChange={(v) => set({ mode: v })} />
        <Text label="subtaskPrompt *" value={d.subtaskPrompt} area onChange={(v) => set({ subtaskPrompt: v })} />
        <ExecToggle value={d.exec} onChange={(v) => set({ exec: v })} />
      </>}
      {type === 'llm' && <>
        <Text label="prompt *" value={d.prompt} area onChange={(v) => set({ prompt: v })} />
        <JsonField label="outputSchema (可选)" value={d.outputSchema} onChange={(v) => set({ outputSchema: v })} />
        <div style={{ fontSize: 11, color: '#9ca3af' }}>llm 恒为软（交 LLM）</div>
      </>}
      {type === 'condition' && <>
        <Text label="expression *" value={d.expression} area onChange={(v) => set({ expression: v })} />
        <div style={{ fontSize: 11, color: '#9ca3af' }}>{'例: {{cls.output.label}} === "bug"'}</div>
      </>}
      {type === 'parallel' && <div style={{ color: '#9ca3af' }}>并发占位，第一阶段不执行</div>}

      <button onClick={() => onDelete(node.id)} style={{ ...btn, background: '#ef4444', marginTop: 8 }}>删除节点</button>
    </div>
  )
}

const lbl: React.CSSProperties = { display: 'block', marginBottom: 4, color: '#6b7280', fontSize: 11 }
const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 12 }
const btn: React.CSSProperties = { padding: '6px 12px', border: 'none', borderRadius: 4, color: '#fff', cursor: 'pointer', fontSize: 12 }
