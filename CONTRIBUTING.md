# Contributing to Prompt Compiler

Thank you for your interest in contributing. This document explains how to get started, the architecture rules you need to follow, and how to submit a change.

---

## Getting started

```bash
git clone https://github.com/ImmaBawzz/Prompt_Compiler_V3.git
cd Prompt_Compiler_V3
npm install
npm run build
npm run test
```

Run the full verification pass before opening a PR:

```bash
npm run verify
```

---

## Architecture rules

These are non-negotiable and enforced by reviewers:

1. **All domain and compiler logic lives in `packages/core`.** The extension, CLI, and API are thin wrappers. If a change affects compiled output semantics, it belongs in core.
2. **Do not duplicate types or logic** across core, CLI, and API.
3. **Schemas are contracts first.** Define or update the schema in `packages/schemas` before adding runtime behaviour that depends on a new shape.
4. **Keep exports deterministic.** The same inputs must always produce the same export folder structure and filenames.
5. **The local compile path must never be gated behind entitlement checks.** Free-tier local compilation is a product guarantee.

---

## Finding something to work on

- Check [open issues](https://github.com/ImmaBawzz/Prompt_Compiler_V3/issues) for bugs and accepted feature requests.
- Check the [roadmap](docs/08_ROADMAP.md) for phases that are marked as **Next** or **Planned**.
- Bug fixes and documentation improvements are always welcome without prior discussion.
- For new features, open an issue first to discuss approach before building.

---

## Making a change

1. Fork the repository and create a branch from `main`.
2. Name your branch descriptively: `fix/cli-output-contract` or `feat/refinement-hints`.
3. Make your change, keeping it focused on one thing.
4. Add or update tests for any new logic in `packages/core` or meaningful new API routes.
5. Run `npm run verify` and confirm it passes.
6. Push to your fork and open a pull request against `main`.

---

## Pull request checklist

Before opening a PR, confirm:

- [ ] `npm run verify` passes locally
- [ ] All domain logic additions are in `packages/core`, not in the extension or API
- [ ] New schemas or contract changes are reflected in `packages/schemas`
- [ ] Tests exist for new or changed logic
- [ ] Docs are updated if behaviour, routes, or contracts changed
- [ ] The PR description explains what changed and why

---

## Commit style

Use plain, imperative commit messages:

```
fix: align CLI response envelope on validation error
feat: add refinement hint derivation to compiler core
chore: update test fixtures for new output shape
docs: clarify export folder convention in data model doc
```

---

## Code style

- TypeScript strict mode is enforced. No `any` without justification.
- Prefer pure functions in `packages/core`.
- No silent swallowing of errors or diagnostics.
- Keep filenames and export paths deterministic and lowercase-hyphenated.

---

## Questions

Open a [discussion](https://github.com/ImmaBawzz/Prompt_Compiler_V3/discussions) if you are unsure about an approach before investing time in implementation.
