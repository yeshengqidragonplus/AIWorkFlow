# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

This repository is newly initialized and currently contains no source code. The
sections below capture the project's intent so future work stays aligned. Expand
this file with concrete commands and architecture once code lands — do not let it
drift from reality.

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
