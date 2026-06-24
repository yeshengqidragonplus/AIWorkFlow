import { useCallback, useRef, useState } from 'react'
import {
  ReactFlow, Background, Controls, MiniMap, addEdge,
  useNodesState, useEdgesState,
  type Node, type Edge, type Connection, type OnConnect,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { nodeTypes } from './editor/WorkflowNodeView'
import { NODE_META, NODE_ORDER } from './editor/nodeMeta'
import { ConfigPanel } from './editor/ConfigPanel'
import { toWorkflow, fromWorkflow, type WorkflowMeta } from './editor/serialize'
import { validateWorkflow } from './engine/validate'
import { runWithMockHost } from './engine/mockHost'
import { SAMPLE } from './editor/sample'
import type { NodeType } from './types'

let idSeq = 100
const newId = () => `n${idSeq++}`

export default function App() {
  const init = fromWorkflow(SAMPLE)
  const [nodes, setNodes, onNodesChange] = useNodesState(init.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(init.edges)
  const [meta, setMeta] = useState<WorkflowMeta>(init.meta)
  const [selected, setSelected] = useState<Node | null>(null)
  const [output, setOutput] = useState<string>('')
  const wrapper = useRef<HTMLDivElement>(null)

  const onConnect: OnConnect = useCallback((c: Connection) => {
    // 源为 condition 时，提示选择分支
    const srcNode = nodes.find((n) => n.id === c.source)
    let data: Edge['data']
    let label: string | undefined
    if (srcNode?.type === 'condition') {
      const branch = window.confirm('这条边是「真」分支吗？(取消=假分支)') ? 'true' : 'false'
      data = { branch }
      label = branch
    }
    setEdges((eds) => addEdge({ ...c, data, label }, eds))
  }, [nodes, setEdges])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const type = e.dataTransfer.getData('application/node-type') as NodeType
    if (!type || !wrapper.current) return
    const bounds = wrapper.current.getBoundingClientRect()
    const position = { x: e.clientX - bounds.left - 80, y: e.clientY - bounds.top - 20 }
    setNodes((nds) => nds.concat({ id: newId(), type, position, data: NODE_META[type].defaultData() }))
  }, [setNodes])

  const updateNodeData = useCallback((id: string, data: Record<string, unknown>) => {
    setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data } : n)))
    setSelected((s) => (s && s.id === id ? { ...s, data } : s))
  }, [setNodes])

  const deleteNode = useCallback((id: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== id))
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id))
    setSelected(null)
  }, [setNodes, setEdges])

  const exportJson = () => {
    const wf = toWorkflow(meta, nodes, edges)
    const blob = new Blob([JSON.stringify(wf, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${meta.name || 'workflow'}.json`; a.click()
    URL.revokeObjectURL(url)
  }

  const importJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    file.text().then((txt) => {
      const wf = JSON.parse(txt)
      const loaded = fromWorkflow(wf)
      setMeta(loaded.meta); setNodes(loaded.nodes); setEdges(loaded.edges); setSelected(null)
    }).catch((err) => setOutput('导入失败: ' + err))
    e.target.value = ''
  }

  const validate = () => {
    const r = validateWorkflow(toWorkflow(meta, nodes, edges))
    setOutput(r.valid
      ? '✅ 校验通过' + (r.warnings.length ? '\n警告:\n' + r.warnings.join('\n') : '')
      : '❌ 校验失败:\n' + r.errors.join('\n') + (r.warnings.length ? '\n警告:\n' + r.warnings.join('\n') : ''))
  }

  const runMock = () => {
    try {
      const wf = toWorkflow(meta, nodes, edges)
      const inputs: Record<string, unknown> = {}
      for (const inp of wf.inputs ?? []) {
        const v = window.prompt(`启动参数 ${inp.name}${inp.required ? ' *' : ''}:`, String(inp.default ?? ''))
        if (v !== null) inputs[inp.name] = v
      }
      // 模拟宿主：condition 用到的 llm 默认回 {label:"bug"} 便于演示分支
      const { finalResult, trace } = runWithMockHost(wf, inputs, {
        runLlm: (p, id) => (p.includes('bug') || id ? JSON.stringify({ label: 'bug', text: p }) : p),
      })
      const lines = trace.map((t) =>
        t.kind === 'done' ? '— done —'
          : `#${t.step} [${t.kind === 'action' ? '硬' : '软'}] ${t.nodeId}: ${typeof t.detail === 'string' ? t.detail : JSON.stringify(t.detail)}`)
      setOutput('▶ mock 宿主执行轨迹:\n' + lines.join('\n') + '\n\nfinalResult:\n' + JSON.stringify(finalResult, null, 2))
    } catch (err) {
      setOutput('运行失败: ' + err)
    }
  }

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      {/* 左侧：节点面板 */}
      <aside style={{ width: 180, borderRight: '1px solid #e5e7eb', padding: 12, overflowY: 'auto' }}>
        <h3 style={{ fontSize: 13, margin: '0 0 8px' }}>节点（拖到画布）</h3>
        {NODE_ORDER.map((t) => (
          <div key={t} draggable
            onDragStart={(e) => e.dataTransfer.setData('application/node-type', t)}
            style={{ padding: '8px 10px', marginBottom: 6, borderRadius: 6, cursor: 'grab',
              borderLeft: `4px solid ${NODE_META[t].color}`, background: '#f9fafb', fontSize: 12 }}>
            {NODE_META[t].label}
          </div>
        ))}
      </aside>

      {/* 中间：画布 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '8px 12px', borderBottom: '1px solid #e5e7eb', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} placeholder="name" style={tb} />
          <input value={meta.version} onChange={(e) => setMeta({ ...meta, version: e.target.value })} placeholder="version" style={{ ...tb, width: 80 }} />
          <input value={meta.description} onChange={(e) => setMeta({ ...meta, description: e.target.value })} placeholder="description" style={{ ...tb, flex: 1 }} />
          <button onClick={validate} style={tbtn}>校验</button>
          <button onClick={runMock} style={{ ...tbtn, background: '#059669', color: '#fff' }}>▶ 运行(mock)</button>
          <button onClick={exportJson} style={tbtn}>导出 JSON</button>
          <label style={{ ...tbtn, cursor: 'pointer' }}>导入 JSON
            <input type="file" accept="application/json" onChange={importJson} style={{ display: 'none' }} />
          </label>
        </div>
        <div ref={wrapper} style={{ flex: 1 }} onDrop={onDrop} onDragOver={(e) => e.preventDefault()}>
          <ReactFlow
            nodes={nodes} edges={edges} nodeTypes={nodeTypes}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
            onNodeClick={(_, n) => setSelected(n)} onPaneClick={() => setSelected(null)}
            fitView>
            <Background />
            <Controls />
            <MiniMap />
          </ReactFlow>
        </div>
      </div>

      {/* 右侧：配置 + 输出 */}
      <aside style={{ width: 320, borderLeft: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, overflowY: 'auto', borderBottom: '1px solid #e5e7eb' }}>
          <ConfigPanel node={selected} onChange={updateNodeData} onDelete={deleteNode} />
        </div>
        <pre style={{ height: 240, margin: 0, padding: 12, overflow: 'auto', fontSize: 11, background: '#0f172a', color: '#e2e8f0' }}>
          {output || '校验 / 运行 输出区'}
        </pre>
      </aside>
    </div>
  )
}

const tb: React.CSSProperties = { padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 12, width: 120 }
const tbtn: React.CSSProperties = { padding: '5px 10px', border: '1px solid #d1d5db', borderRadius: 4, background: '#fff', fontSize: 12, cursor: 'pointer' }
