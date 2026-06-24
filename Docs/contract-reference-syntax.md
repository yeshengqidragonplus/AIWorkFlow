# 节点间数据引用语法（Reference Syntax）

> 状态：**契约（contract）**。对应交接稿 §3.2 注。三方统一。

## 语法

在任意节点 `data` 的字符串字段中（如 `tool.params` 的值、`llm.prompt`、`expert.subtaskPrompt`、`condition.expression`），可用双花括号引用上游节点的产出：

```
{{nodeId.output}}
{{nodeId.output.field}}        // 点路径访问对象字段
{{nodeId.output.list.0.name}}  // 数字段访问数组下标
{{inputs.paramName}}           // 引用工作流启动参数（顶层 inputs）
```

## 解析规则

1. **作用域**：只能引用**已执行完成**的上游节点（拓扑序在前）。引用未执行/不存在的 `nodeId` → 解析为 `undefined` 并记一条 warning。
2. **类型保留**：当整个字符串恰好是单个引用（如 `"{{n1.output}}"`）时，**保留原始类型**（对象/数组/数字），不强转字符串。
3. **字符串插值**：当引用嵌在文本中（如 `"结果是 {{n1.output}} 个"`），按 `String(value)` 插值。
4. **路径访问**：`a.b.0.c` 逐级取值，任一级缺失 → `undefined`。
5. **`inputs` 命名空间**：`{{inputs.x}}` 引用工作流顶层 `inputs` 的启动参数。

## `condition.expression`

表达式在一个仅暴露 `{ nodeId: NodeResult.output, inputs }` 的受限作用域内求值，返回布尔。建议实现为安全表达式求值（不直接 `eval` 任意代码）。示例：

```
{{classify.output.label}} === "bug"
{{review.output.score}} > 0.8
```

> 引擎对 `condition` 求值得到 `true`/`false`，据此选择出边（出边 `data.branch`）。
