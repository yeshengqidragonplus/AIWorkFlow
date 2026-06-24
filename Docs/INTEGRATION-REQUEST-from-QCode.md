# AIWorkflow 改动请求（来自 QCode 集成方）

> 背景：QCode 侧的对接已完成并用**真实引擎**冒烟验证通过（`triage-flow` sample 跑通 `tool → llm → condition → delegate`，软/硬步骤、引用解析、条件分支全对）。引擎核心**无需改动**。本文只列 AIWorkflow 需要补的**一件主要事 + 几条约束**，让 QCode 能在运行时加载引擎。
>
> 配套：`Docs/workflow-engine-handoff.md` 已由 QCode 侧同步更新，重点看新增的 **§4.0 解耦原则：契约稳定 + 运行时加载**。

---

## 解耦模型（先对齐这个）

QCode 与 AIWorkflow 是**两个独立项目，进度可不同步**。靠两条解耦：

1. **冻结契约**是唯一稳定边界（`createEngine` + `EngineStep` 形状 + 图 JSON / 节点词汇 / 引用语法）。
2. **QCode 运行时加载引擎产物，不编译/不 import 你的源码**。你自行构建发布，QCode 按契约调用。

QCode 已实现 `WorkflowEngineProvider`：运行时动态 `import()` 一个引擎产物，找到 `createEngine`，适配后驱动。**所以你要给的是一个"能被动态 import 的构建产物"。**

---

## ★ 主要改动：产出一个运行时可加载的库产物（导出 `createEngine`）

现状：`package.json` 只有浏览器 app 构建（`tsc -b && vite build`），`tsconfig` 是 `noEmit`，**没有库产物**。源码 `src/engine/` 是纯 TS、无 React/浏览器依赖（已确认），可以单独打成库。

需要新增一个**库构建**，把 `src/engine/` 打成一个 **Node 兼容的 ESM 模块**，导出 `createEngine`（以及建议导出 `validateWorkflow`、相关类型）。两种做法任选：

### 做法 A：Vite library mode（你已有 Vite，最省事）

1. 新增引擎库入口 `src/engine/lib.ts`：
   ```ts
   export { createEngine } from './stateMachine'
   export { validateWorkflow } from './validate'
   export type { Workflow, EngineStep, WorkflowState, WorkflowAction } from '../types'
   ```
   注意：**只导出引擎，不要碰 `src/editor/` 或任何 React** —— 保证产物无 React 依赖。

2. 新增 `vite.lib.config.ts`：
   ```ts
   import { defineConfig } from 'vite'
   export default defineConfig({
     build: {
       lib: { entry: 'src/engine/lib.ts', formats: ['es'], fileName: () => 'engine.mjs' },
       outDir: 'dist-engine',
       emptyOutDir: true,
       target: 'node18',          // Node 兼容，非浏览器
       rollupOptions: { external: [] },  // 引擎无外部依赖，全部内联
     },
   })
   ```

3. `package.json` 加脚本与导出路径：
   ```jsonc
   "scripts": {
     "build:engine": "vite build --config vite.lib.config.ts"
   },
   "exports": {
     "./engine": "./dist-engine/engine.mjs"
   }
   ```

### 做法 B：tsup / esbuild（更轻，纯库场景常用）

```bash
npx tsup src/engine/lib.ts --format esm --out-dir dist-engine --target node18 --dts
```
产物同样是 `dist-engine/engine.mjs`（可选 `.d.ts`）。

### 验收标准

- 产物是**单个 ESM 文件**（如 `dist-engine/engine.mjs`），**Node 18+ 可直接 `import()`**，Mac/Win 通用。
- `const { createEngine } = await import('.../engine.mjs')` 能拿到函数。
- 产物**不含 React / @xyflow / 浏览器 API**。
- 把产物路径告诉 QCode（QCode 用一个配置项指向它）。

---

## 必须保持冻结的契约（不要改这些字段名/形状）

QCode 的适配器按这些结构对接，改了会断：

```ts
createEngine(workflow): {
  start(inputs: Record<string, unknown>): EngineStep
  advance(state: WorkflowState, lastOutput: unknown): EngineStep
}

EngineStep = {
  state: WorkflowState            // 不透明、可序列化、无隐式内存依赖
  nextPrompt?: string             // 软：交 LLM
  action?: WorkflowAction         // 硬：宿主直接执行
  done: boolean
  finalResult?: unknown           // QCode 会把非 string 的转成 JSON 字符串
}

WorkflowAction =
  | { type: 'delegate'; expert: string; goal: string }
  | { type: 'tool';     name: string;   params: Record<string, unknown> }
  | { type: 'skill';    name: string;   args: Record<string, unknown> }
```

- `state` 必须**可序列化、可从任意持久化值恢复**——QCode 在子专家委派（父任务 dispose→reopen）后，会用持久化的 state 调 `advance` 续跑。你已用 `JSON.parse(JSON.stringify())` 深拷贝，满足。
- 每步 `nextPrompt` 与 `action` **二选一**；`done` 时给 `finalResult`。

---

## 可选：CLI 备选传输（现在不必做）

若将来想要完全进程隔离，再加一个薄 CLI 入口即可（引擎核心不用改）：

```bash
aiworkflow start   --workflow <path.json> --inputs '<json>'   # 从 stdin 读更稳
aiworkflow advance --state '<json>' --last-output '<json>'
# 各自打印一个 EngineStep JSON 到 stdout；错误用非零退出码 + stderr
```

QCode 侧只需再加一个 CLI provider，契约和 runner 都不动。**当前主路是"插件/动态加载"，CLI 非必需。**

---

## 不需要你做的事（划清边界，避免重复）

- **工作流注册成 `.roo/skills` 技能**：QCode 侧做。
- **`nextPrompt` 注入 LLM、`action` 的真实执行（委派/工具/技能 dispatch）、state 持久化**：QCode 宿主做（`WorkflowExpertRunner` 的注入依赖）。
- 你只负责：**给定 workflow + state + lastOutput，算出下一步 `EngineStep`**，并把这个能力打成可运行时加载的产物。

---

## TL;DR

1. 新增引擎库入口 `src/engine/lib.ts`（只导出 `createEngine` 等，无 React）。
2. 新增库构建脚本，产出 Node 兼容的单文件 ESM `dist-engine/engine.mjs`。
3. 保持上面的契约字段不变。
4. 把产物路径给 QCode。
