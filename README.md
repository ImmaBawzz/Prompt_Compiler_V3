# Prompt Compiler V3 — Master Package

A production-minded scaffold for building a **Prompt Compiler / Style Engine** that starts as a VS Code extension and expands into a reusable creative infrastructure product.

## Product thesis

Most creators do not have an imagination problem.
They have a **translation problem**.

One idea has to be rewritten repeatedly for:

- music generators
- image generators
- video generators
- metadata systems
- release packaging
- publishing workflows

This product turns one structured brief into many high-quality outputs while preserving brand voice and style DNA.

## What this repo includes

- **VS Code extension scaffold** with a Prompt Studio webview
- **shared compiler core** that owns all domain logic
- **local CLI** for compiling briefs outside the extension
- **API scaffold** for future sync, automation, and billing hooks
- **JSON schemas** for briefs, profiles, and template packs
- **examples** to test the compiler quickly
- **agent operating system** for autonomous build sessions
- **roadmap, architecture, ADRs, and quality docs**
- **CI scaffold** and task/status scripts

## Monorepo layout

- `apps/extension` — VS Code cockpit
- `apps/api` — hosted service and future automation edge
- `packages/core` — compiler engine and scoring logic
- `packages/schemas` — shared schemas and contracts
- `packages/cli` — local compile runner
- `examples` — realistic input/output examples
- `agent` — execution model for your coding agent
- `docs` — product, architecture, API, QA, release, and monetization docs

## Design rules

1. **All domain logic lives in `packages/core`**
2. The extension stays thin and calls the core
3. The API wraps the core instead of re-implementing it
4. Schemas define contracts before UI complexity does
5. Local-first usefulness beats cloud complexity for MVP
6. Every phase must leave the repo in a better, testable state

## Primary MVP flow

1. Open Prompt Studio in VS Code
2. Load or paste a brief JSON
3. Load or paste a brand profile JSON
4. Compile outputs for multiple targets
5. Review outputs and warnings
6. Export compiled artifacts into the workspace

## Suggested first implementation sequence

```bash
npm install
npm run validate:structure
npm run build
npm run test
```

Then:

- run the CLI sample
- launch the extension host
- compile from the Prompt Studio
- export the artifact bundle

## Recommended read order

1. `START_HERE.md`
2. `agent/SYSTEM_PROMPT.md`
3. `agent/RULES.md`
4. `agent/TASK_LOOP.md`
5. `agent/TASK_BOARD.json`
6. `docs/01_PRD.md`
7. `docs/03_ARCHITECTURE.md`
8. `docs/05_COMPILER_SPEC.md`
9. `docs/06_EXTENSION_UX_SPEC.md`

## Why this can become a real business

This is not meant to stay “a prompt box”.
It can expand into:

- profile libraries
- workflow packs
- style memory
- automation jobs
- release packaging
- publishing pipelines
- credits and subscriptions
- marketplace modules

The extension is the cockpit.
The compiler is the engine.
The automation layer becomes the labor.
