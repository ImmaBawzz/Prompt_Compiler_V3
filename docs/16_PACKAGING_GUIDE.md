# Packaging Guide

## Extension
Use `vsce` (bundled as dev dependency in `apps/extension`) to package the VS Code extension into a VSIX.

Typical flow:
```bash
npm ci
npm run build
cd apps/extension
npm run package        # runs: npx vsce package --no-dependencies
```

## Marketplace asset readiness

Before publishing to Marketplace, ensure:

1. `publisher` is set to your registered publisher ID (currently `local-dev` — change before publishing)
2. Extension `package.json` has `description`, `keywords`, `license`, `repository`, and `categories`
3. `galleryBanner` color is set (currently `#0d1117` dark theme)
4. `preview: false` is set for stable channel releases
5. Changelog reflects the packaged behavior
6. Screenshots/gifs for Prompt Studio and Artifact Explorer are prepared
7. An `icon.png` (128×128) is present in `apps/extension/` and referenced in package.json under `"icon"`

## Release channels

Prompt Compiler uses two release channels configured via `promptCompiler.releaseChannel` extension setting:

- `stable` (default) — production-ready features only
- `preview` — experimental and in-development features enabled

For a **pre-release** marketplace listing, use `vsce package --pre-release`.
For a **stable** listing, use `npm run package` from `apps/extension` (default).

## Local release artifact checks

1. Run `npm run verify` from repo root
2. Run API health check: `curl http://localhost:8787/health`
3. Compile/export once from Prompt Studio and verify Artifact Explorer updates
4. Validate generated `.prompt-compiler/exports` structure
5. Package extension with `npm run package` from `apps/extension`
6. Install the generated `.vsix` in Extension Development Host and re-run compile/export flow

## Product packaging
For private iteration, zip the full monorepo so the docs, examples, and agent files stay together.

