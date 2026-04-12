# Prompt Compiler V3 — Start Here

This package is designed to be used with **VS Code + a coding agent**.

The goal is simple:

> Keep the agent moving until the current phase is complete, a real blocker exists, or you explicitly say “enough”.

## Use it in this order

1. Open the repository in VS Code
2. Read `README.md`
3. Paste `agent/SYSTEM_PROMPT.md` into your coding agent's instruction layer
4. Tell the agent:
   - read the required files in order
   - follow `agent/TASK_LOOP.md`
   - keep executing tasks until phase completion or I say stop
   - update `agent/TASK_BOARD.json` and `agent/WORK_LOG.md`
   - keep domain logic in `packages/core`
5. Run:

```bash
npm install
npm run validate:structure
npm run build
```

6. Launch the extension host from the included VS Code launch config

## Exact control phrases for the user

Use direct commands such as:

- `continue`
- `finish phase 1`
- `focus on extension UX`
- `skip API for now`
- `tighten tests`
- `enough`
- `stop after current task`

## What is improved in V3

Compared with the earlier starter, this package adds:

- a stronger **execution protocol** for the agent
- a clearer **product architecture** and ADRs
- a more substantial **compiler core**
- a real **CLI scaffold**
- a better **webview-based VS Code extension skeleton**
- a cleaner **local-first / hosted-later API strategy**
- richer **schemas, examples, and export conventions**
- more serious **quality gates, test strategy, and release planning**

## Reality check

No agent can literally act forever in the background without being invoked.
What this package does is give the agent a **persistent operational frame** so each session continues the same mission instead of resetting into chaos.
