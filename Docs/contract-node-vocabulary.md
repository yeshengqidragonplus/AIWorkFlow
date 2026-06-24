# 节点类型词汇表（Node Type Vocabulary）

> 状态：**契约（contract）** — 三方（编辑器 / 执行引擎 / QCode）共同依赖的唯一事实来源（single source of truth）。
> 任何一方改动此表，必须同步另两方。对应交接稿 §3.2 / §6。

## 总览

| `type`      | 含义                     | 执行落地方（dispatch）        | 第一阶段状态 |
| ----------- | ------------------------ | ----------------------------- | ------------ |
| `tool`      | 调用一个 QCode 工具      | QCode                         | ✅ 启用       |
| `skill`     | 运行一个技能             | QCode                         | ✅ 启用       |
| `expert`    | 派生子专家并等待其汇报   | QCode（**串行**）             | ✅ 启用（串行）|
| `llm`       | 让 LLM 做一次判断 / 生成 | QCode                         | ✅ 启用       |
| `condition` | 条件分支                 | 引擎自身求值                  | ✅ 启用       |
| `parallel`  | 并发执行多分支           | QCode                         | ⏸ 占位，不执行 |

> 约束（交接稿 §4.3）：第一阶段不做并发。`expert` 串行实现；`parallel` 仅在编辑器占位，引擎遇到时降级为串行或报错（见各节）。

---

## 各节点 `data` 字段定义

所有节点共享的图层字段由 React Flow 提供（`id` / `type` / `position` / `data`）。下表只定义 `data` 内部约定字段。

### `tool`
```ts
data: {
  toolName: string          // QCode 工具名，必填
  params?: Record<string, unknown>  // 工具入参，值可含引用语法
}
```

### `skill`
```ts
data: {
  skillName: string         // 技能名，必填
  args?: Record<string, unknown>
}
```

### `expert`
```ts
data: {
  expertId?: string         // 专家标识 或
  mode?: string             // 专家 mode（二选一，至少一个）
  subtaskPrompt: string     // 派给子专家的任务描述，必填，可含引用语法
}
```
> 子专家**只回传结论摘要**，不回传完整对话历史（交接稿 §4.3）。

### `llm`
```ts
data: {
  prompt: string            // 必填，可含引用语法
  outputSchema?: object     // 可选，JSON Schema，约束 LLM 结构化输出
}
```

### `condition`
```ts
data: {
  expression: string        // 布尔表达式，依据上游节点输出求值（见引用语法）
}
```
> 由**引擎自身**求值，不走 QCode dispatch。求值结果决定走哪条出边：
> - 出边 `data.branch === 'true'` / `'false'` 区分真假分支。

### `parallel`（占位）
```ts
data: {
  // 第一阶段无字段约定。编辑器可创建，引擎执行时降级为串行遍历其分支，
  // 或在严格模式下抛出 "parallel not supported in phase 1"。
}
```

---

## 节点结果对象（nodeResult）

每个节点执行后产出一个结果对象，写入执行上下文，供下游引用：
```ts
type NodeResult = {
  nodeId: string
  output: unknown          // 节点产出（工具返回值 / LLM 文本或结构化对象 / 子专家摘要 / 条件布尔值）
  status: 'success' | 'error' | 'skipped'
  error?: string
}
```

详见 [数据引用语法](contract-reference-syntax.md) 与 [图 JSON Schema](contract-graph-schema.md)。
