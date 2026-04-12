# Packaging Guide

## Extension
Use `vsce` to package the VS Code extension into a VSIX.

Typical flow:
1. install `@vscode/vsce`
2. build the repo
3. package from `apps/extension`

Recommended commands:

```bash
npm ci
npm run verify
npm --workspace apps/extension run build
cd apps/extension
npx vsce package
```

## Marketplace asset readiness

Before publishing to Marketplace, ensure:

1. extension command titles are human-readable and consistent
2. extension `package.json` has clear `description`, `keywords`, and category fit
3. changelog reflects the packaged behavior
4. screenshots/gifs for Prompt Studio and Artifact Explorer are prepared
5. licensing and repository metadata are present

## Local release artifact checks

1. run `npm run verify`
2. run API health check on localhost after build
3. compile/export once from Prompt Studio
4. validate generated `.prompt-compiler/exports` structure
5. package extension and validate install in Extension Development Host

## Product packaging
For private iteration, zip the full monorepo so the docs, examples, and agent files stay together.
