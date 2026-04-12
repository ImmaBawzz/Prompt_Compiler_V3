# Architecture

## System shape

```text
brief + profile + template pack
            ↓
      packages/core
            ↓
  diagnostics + outputs + scores
      ↙        ↓         ↘
extension     CLI        API
```

## Layers

### `packages/core`
Pure-ish domain engine:
- validation
- normalization
- style DNA derivation
- target builders
- scoring
- diagnostics
- export bundle preparation

### `packages/schemas`
Owns JSON contract references.

### `packages/cli`
Local command runner for compile/export tasks.

### `apps/extension`
VS Code UI layer:
- Prompt Studio webview
- commands
- workspace export
- artifact explorer

### `apps/api`
Hosted wrapper for the same compile flow.
Later this becomes the boundary for auth, sync, automation jobs, and entitlements.
Use adapter boundaries for hosted persistence so storage backends can change without route-level rewrites.

## Key rule
No target-building logic may live only in the extension or API.
If it affects compiled output semantics, it belongs in `packages/core`.
