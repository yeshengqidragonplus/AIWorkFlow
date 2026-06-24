# 引擎接口契约（Engine Interface）—— 有状态状态机

> 状态：**契约（contract）**。对应交接稿 §4.2。这是 QCode 宿主与引擎之间的核心边界。
> ⚠️ 旧的 `dispatchNode(node, context)` 入口**已作废**。

## 核心模型

LLM 为主，工作流为"导演"。引擎**不代替 LLM 执行动作**，而是被 QCode 宿主在每个 turn 前调用一次，返回"下一步该做什么"：要么让 LLM 干（软），要么让宿主机械执行（硬）。

## 接口

```ts
interface EngineStep {
  state: WorkflowState          // 不透明、可序列化；宿主随 task 持久化，不解读
  nextPrompt?: string           // 软：给 LLM 的指示文本
  action?: WorkflowAction       // 硬：结构化指令，宿主直接执行
  done: boolean
  finalResult?: unknown         // done 时给出
}

type WorkflowAction =
  | { type: 'delegate'; expert: string; goal: string }
  | { type: 'tool';     name: string;   params: Record<string, unknown> }
  | { type: 'skill';    name: string;   args: Record<string, unknown> }

interface WorkflowEngine {
  start(inputs: Record<string, unknown>): EngineStep
  advance(state: WorkflowState, lastOutput: unknown): EngineStep
}
```

`nextPrompt` 与 `action` **二选一**；`done === true` 时两者皆空，给 `finalResult`。

## 宿主分发循环

```
let { state, nextPrompt, action, done, finalResult } = workflow.start(inputs)
while (!done) {
  let lastOutput
  if (action) {
    lastOutput = await host.execute(action)        // 硬：直接执行，无 LLM turn
  } else if (nextPrompt) {
    lastOutput = await host.runOneTurn(nextPrompt)  // 软：注入 LLM（system 不变），收割最终文本
  }
  ;({ state, nextPrompt, action, done, finalResult } = workflow.advance(state, lastOutput))
}
finish(finalResult)
```

## 状态（WorkflowState）

```ts
interface WorkflowState {
  inputs: Record<string, unknown>
  results: Record<string, NodeResult>   // 已完成节点的产出
  currentNodeId: string | null          // 正在等待 lastOutput 的节点
  done: boolean
  finalResult?: unknown
}
```

## 关键约束（交接稿 §4.3）

- **无隐式内存依赖**：`advance` 必须能从任意持久化的 `state` 恢复续跑。引擎实例只静态持有工作流图（reopen 时从 skill JSON 重新加载），所有动态进度都在 `state` 里。
- **委派 reopen**：硬 `delegate` 会触发父任务 dispose→reopen。宿主须在 reopen 时取回 `state`、以子专家**摘要**为 `lastOutput` 调 `advance`。
- 第一阶段串行；`parallel` 不执行。

## 引擎构造

```ts
createEngine(workflow: Workflow): WorkflowEngine
```
工作流图是静态的（来自注册的 skill JSON），故作为构造参数传入，不进 `state`。
