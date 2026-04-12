# Quality Gate Checklist

Before closing a meaningful work block, verify:

- architecture still matches docs
- core logic stayed inside `packages/core`
- no duplicate types were introduced
- export paths remain deterministic
- warnings and diagnostics are not silently swallowed
- tests or smoke checks exist for new logic
- task board and work log were updated
