# Release Checklist

## Preflight
1. Run `npm ci` in repo root.
2. Run `npm run verify` and ensure it passes.
3. Confirm `agent/TASK_BOARD.json` reflects current completion state.
4. Confirm `agent/WORK_LOG.md` has latest implementation notes.

## Product flow checks
1. Open Prompt Studio and run compile with sample brief/profile.
2. Export bundle and verify Artifact Explorer updates.
3. Run CLI compile and verify `ok/result` response envelope.
4. Run API `/health` and `/compile` smoke check.

## Packaging checks
1. Build extension (`npm --workspace apps/extension run build`).
2. Package extension (`npx vsce package` inside `apps/extension`).
3. Install VSIX in Extension Development Host and re-run compile/export flow.

## Documentation checks
1. Update `CHANGELOG.md` for included release scope.
2. Verify docs touched by behavior changes are current.
3. Confirm API contract docs match runtime response shape.

## GitHub push readiness
1. Ensure working tree changes are intentional.
2. Ensure CI workflow uses `npm run verify`.
3. Ensure release workflow exists for tag pushes (`v*`) and `workflow_dispatch`.
3. Prepare PR notes with:
- completed tasks
- verification results
- known gaps and follow-ups

## Tag and release flow
1. Bump version and update `CHANGELOG.md`.
2. Create and push tag: `git tag vX.Y.Z && git push origin vX.Y.Z`.
3. Confirm GitHub Release is auto-created from the tag workflow.
