# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

Milestones 1–3 landed (see `Docs/workflow-engine-handoff.md` §5): contracts frozen,
React Flow editor MVP, and the state-machine engine MVP runnable standalone via a
mock host. Milestones 4–5 (real QCode host wiring) are out of this repo's scope.

## Commands

- `npm install` — install deps
- `npm run dev` — launch the visual editor (Vite, port 5173)
- `npm test` — run engine unit tests (Vitest)
- `npm run build` — typecheck + production build

## Architecture

Two decoupled layers (do not couple them):

- **Editor (`src/editor/`, `src/App.tsx`)** — React Flow canvas. Authors a workflow
  as `nodes[] + edges[]` JSON. Human-facing.
- **Engine (`src/engine/`)** — a **stateful state machine**, NOT a node executor.
  `createEngine(workflow)` exposes `start(inputs)` / `advance(state, lastOutput)`,
  returning per step either a `nextPrompt` (soft → LLM turn) or an `action`
  (hard → host executes directly), or `done` + `finalResult`. The engine never
  executes QCode tools itself. `state` is serializable with no implicit in-memory
  dependency, so it resumes from any persisted value (delegate dispose→reopen).
  - `stateMachine.ts` — the engine. `condition.ts` — safe in-engine expression eval.
  - `reference.ts` — `{{nodeId.output}}` resolution. `validate.ts` — graph/DAG checks.
  - `mockHost.ts` — drives the loop without QCode (milestone 3).

Contracts (single source of truth, must stay in sync with QCode) live in
`Docs/contract-*.md`: node vocabulary, graph schema, reference syntax, engine
interface. The old `dispatchNode` model is deprecated — see the engine interface doc.

## Project Purpose

AIWorkflow is a workflow-support tool for long-horizon AI work. It has two main parts:

1. **Visual workflow design** — an interface for authoring and visualizing workflows.
2. **AI-facing workflow tooling** — tools that let an AI agent drive, consume, and
   execute those workflows during long-running tasks.

Keep these two concerns separable: the design surface (human-authored) and the
execution/tooling surface (AI-consumed) are distinct layers and should not be
tightly coupled.

## Conventions

- Default to the latest Claude models when integrating AI capabilities.

<!--
TODO (fill in once the codebase exists):
- Build / lint / test commands, including running a single test
- High-level architecture spanning multiple files
- How the visual designer and the AI tooling layer communicate (data format /
  workflow schema shared between them)
-->
