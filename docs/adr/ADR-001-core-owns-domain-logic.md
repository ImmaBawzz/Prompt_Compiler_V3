# ADR-001 — Core Owns Domain Logic

## Decision
All compilation semantics live in `packages/core`.

## Why
This allows the extension, CLI, and API to share the same behavior and keeps the product scalable.
