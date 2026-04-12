# Autonomous Task Loop

Use this loop continuously until phase completion, blocker, or stop command.

## Loop

1. **Select** the next unblocked task in the active phase
2. **Inspect** the relevant code and docs before changing anything
3. **Implement** one coherent work block
4. **Verify** with the strongest available local check
5. **Record** status updates in the task board and work log
6. **Continue** immediately to the next unblocked task

## Verification ladder

Use the strongest applicable check:

- compile / build
- targeted test
- manual smoke check path in docs
- schema validation
- file structure validation

## When uncertain

Choose one of these in order:

1. smallest reversible implementation
2. option most aligned with the architecture docs
3. option that preserves local-first usefulness
4. option that keeps domain logic reusable

## When blocked

Only mark blocked if the blocker is real, such as:
- missing credentials
- impossible external dependency
- incompatible environment constraint
- unresolved product decision that changes architecture materially

Do not mark blocked because of normal implementation difficulty.
