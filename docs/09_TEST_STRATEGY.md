# Test Strategy

## Priority order
1. compiler core tests
2. schema validation checks
3. CLI smoke checks
4. extension smoke flow
5. API route smoke checks

## Reasoning
The core owns product truth.
If the core is unstable, UI polish is cosmetic.

## What to test first
- brief/profile validation
- target output presence
- warnings on weak input
- export bundle shape

## Current implemented smoke checks
- core compiler unit tests in `packages/core/src/__tests__/compiler.test.ts`
- API + CLI parity smoke tests in `apps/api/src/__tests__/parity.smoke.test.ts`
