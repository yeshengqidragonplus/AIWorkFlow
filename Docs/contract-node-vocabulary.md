# 节点类型词汇表（Node Type Vocabulary）

> 状态：**契约（contract）** — 三方（编辑器 / 执行引擎 / QCode）共同依赖的唯一事实来源（single source of truth）。
> 任何一方改动此表，必须同步另两方。对应交接稿 §3.2 / §6。
>
> **执行模型（v2）**：引擎是有状态的状态机，不直接执行动作。每个节点在 `advance` 时产出
> **软**（`nextPrompt`，交给 LLM 走一个 turn）或 **硬**（`action`，宿主机械执行、不花 LLM turn）。
> 见 [引擎接口契约](contract-engine-interface.md)。

## 总览

| `type`      | 含义                     | 软/硬           | `data.exec` 默认 |
| ----------- | ------------------------ | --------------- | ---------------- |
| `tool`      | 调用一个 QCode 工具      | 可软可硬        | `hard`           |
| `skill`     | 运行一个技能             | 可软可硬        | `hard`           |
| `expert`    | 委派子专家并等待其汇报   | 可软可硬        | `hard`           |
| `llm`       | 让 LLM 做一次判断 / 生成 | **恒软**        | （忽略 exec）    |
| `condition` | 条件分支                 | 引擎内部，无 IO | —                |
| `parallel`  | 并发执行多分支           | ⏸ 占位，不执行  | —                |

> **软/硬由节点 `data.exec` 字段决定**（作者在编辑器中配置）。`llm` 恒为软；`condition`/`parallel` 是引擎内部节点，无 IO，不产出软硬指令。
> 约束（交接稿 §4.3）：第一阶段不做并发，`expert` 串行；`parallel` 仅编辑器占位，引擎遇到降级为直通或报错。

---

## 各节点 `data` 字段定义

图层字段由 React Flow 提供（`id` / `type` / `position` / `data`）。下表只定义 `data` 内部约定字段。

### `tool`
```ts
data: {
  toolName: string
  params?: Record<string, unknown>     // 值可含引用语法
  exec?: 'soft' | 'hard'               // 默认 'hard'
}
```
- **硬** → `action: { type:'tool', name: toolName, params }`，宿主直接调工具。
- **软** → `nextPrompt`：指示 LLM 自行使用该工具完成目标。

### `skill`
```ts
data: {
  skillName: string
  args?: Record<string, unknown>
  exec?: 'soft' | 'hard'               // 默认 'hard'
}
```
- **硬** → `action: { type:'skill', name: skillName, args }`。
- **软** → `nextPrompt`：指示 LLM 运行该技能。

### `expert`
```ts
data: {
  expertId?: string                    // 与 mode 二选一，至少一个
  mode?: string
  subtaskPrompt: string                // 可含引用语法
  exec?: 'soft' | 'hard'               // 默认 'hard'
}
```
- **硬** → `action: { type:'delegate', expert: expertId|mode, goal: subtaskPrompt }`。
- **软** → `nextPrompt`：让 LLM 自行展开该子任务。
- 子专家**只回结论摘要**，不回完整对话历史（交接稿 §4.3）。委派会触发父任务 dispose→reopen，宿主须在 reopen 时取回 `state` 并以摘要为 `lastOutput` 调 `advance`（§4.3）。

### `llm`
```ts
data: {
  prompt: string                       // 可含引用语法
  outputSchema?: object                // 可选 JSON Schema，约束结构化输出
}
```
- **恒软** → `nextPrompt: prompt`。宿主走一个 LLM turn，最终文本作为 `lastOutput` 喂回。

### `condition`
```ts
data: {
  expression: string                   // 布尔表达式，依据状态/上一轮输出求值
}
```
- **引擎内部求值**，不产出软/硬指令，不花宿主任何动作。结果决定走哪条出边（出边 `data.branch === 'true'|'false'`）。

### `parallel`（占位）
```ts
data: {}                               // 第一阶段无字段约定
```
- 引擎执行时降级为直通节点（串行遍历下游），或严格模式下抛 "parallel not supported in phase 1"。

---

## 节点结果对象（NodeResult）

每个节点结束后产出结果，写入工作流 `state.results`，供下游引用：
```ts
type NodeResult = {
  nodeId: string
  output: unknown          // 软节点=LLM最终文本/解析对象；硬节点=宿主执行结果；condition=布尔
  status: 'success' | 'error' | 'skipped'
  error?: string
}
```

详见 [引用语法](contract-reference-syntax.md) / [图 JSON Schema](contract-graph-schema.md) / [引擎接口](contract-engine-interface.md)。
