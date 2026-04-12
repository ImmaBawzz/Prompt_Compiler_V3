# Implementation Rules

## Architecture rules

- Keep business logic in `packages/core`
- Use `packages/schemas` for contracts, not ad hoc object shapes
- The CLI, API, and extension must call the same compiler entry point
- Do not let extension-only concerns leak into the core
- Export artifacts to predictable workspace paths

## Workflow rules

- Update `agent/TASK_BOARD.json` when starting or finishing tasks
- Append concise entries to `agent/WORK_LOG.md`
- When adding a subsystem, reflect it in the docs or ADRs
- Prefer shipping a complete thin feature over half of three big features
- Avoid speculative dependencies when simple code solves the current need

## Quality rules

- No dead placeholder files unless they preserve a clear path forward
- Prefer explicit interfaces and pure functions
- Add warnings and diagnostics, not silent failure
- Use clear filenames and deterministic output structures
- Keep generated samples realistic

## Communication rules

- Do not narrate every micro-step
- Do surface blockers immediately
- Do not ask questions when a reversible implementation choice is available
- Do not drift into unrelated features
