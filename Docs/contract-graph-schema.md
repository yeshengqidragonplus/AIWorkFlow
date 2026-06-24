# 工作流图 JSON Schema（Graph Schema）

> 状态：**契约（contract）**。对应交接稿 §3.1 / §3.3。
> 格式直接复用 React Flow 原生 `nodes[] + edges[]`，外加工作流元数据顶层字段。一条工作流 = 一份 JSON。

## 顶层结构

```ts
type Workflow = {
  name: string              // 注册为技能时的展示名 / 触发名，必填
  description: string       // 技能描述，必填
  version: string           // 语义化版本，如 "1.0.0"
  inputs?: WorkflowInput[]  // 启动参数定义
  nodes: WorkflowNode[]     // React Flow 节点
  edges: WorkflowEdge[]     // React Flow 边
}

type WorkflowInput = {
  name: string
  type: 'string' | 'number' | 'boolean' | 'object'
  required?: boolean
  default?: unknown
  description?: string
}

type WorkflowNode = {
  id: string
  type: 'tool' | 'skill' | 'expert' | 'llm' | 'condition' | 'parallel'
  position: { x: number; y: number }
  data: Record<string, unknown>   // 按节点类型，见 contract-node-vocabulary.md
}

type WorkflowEdge = {
  id: string
  source: string            // 源节点 id
  target: string            // 目标节点 id
  sourceHandle?: string | null
  targetHandle?: string | null
  data?: {
    branch?: 'true' | 'false'   // 仅当 source 为 condition 节点时使用
  }
}
```

## 校验规则（引擎导入时强校验）

1. `name` / `description` / `version` 必填非空。
2. 每个 node 的 `type` 必须在词汇表内；`data` 必须满足该类型的必填字段（见 [节点词汇表](contract-node-vocabulary.md)）。
3. `edges` 的 `source` / `target` 必须指向存在的 node id。
4. 图必须**无环**（DAG）；存在环 → 校验失败。
5. `condition` 节点的出边应成对带 `branch: 'true' | 'false'`；缺失视为校验警告。
6. 入口节点 = 无入边的节点（允许多个，串行按拓扑序）。

## 配套 JSON Schema 文件

机器可校验的 JSON Schema 见 [`schema/workflow.schema.json`](../schema/workflow.schema.json)（随阶段 1/2 落地）。

## 示例

```json
{
  "name": "triage-flow",
  "description": "读取问题 → LLM 分类 → 按类别派工具",
  "version": "1.0.0",
  "inputs": [{ "name": "issueText", "type": "string", "required": true }],
  "nodes": [
    { "id": "n1", "type": "llm", "position": { "x": 0, "y": 0 },
      "data": { "prompt": "判断这是 bug 还是 feature: {{inputs.issueText}}", "outputSchema": { "type": "object", "properties": { "label": { "type": "string" } } } } },
    { "id": "n2", "type": "condition", "position": { "x": 0, "y": 120 },
      "data": { "expression": "{{n1.output.label}} === \"bug\"" } },
    { "id": "n3", "type": "tool", "position": { "x": -150, "y": 240 },
      "data": { "toolName": "createBugTicket", "params": { "text": "{{inputs.issueText}}" } } },
    { "id": "n4", "type": "tool", "position": { "x": 150, "y": 240 },
      "data": { "toolName": "createFeatureRequest", "params": { "text": "{{inputs.issueText}}" } } }
  ],
  "edges": [
    { "id": "e1", "source": "n1", "target": "n2" },
    { "id": "e2", "source": "n2", "target": "n3", "data": { "branch": "true" } },
    { "id": "e3", "source": "n2", "target": "n4", "data": { "branch": "false" } }
  ]
}
```
