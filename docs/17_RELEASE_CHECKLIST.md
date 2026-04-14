# Release Checklist

## v0.4.0 plan
1. Scope: ship completed Phase 31 bounded learning safety work only; do not include Phase 32 autonomous mode changes.
2. Required evidence: `npm run verify` green, rollback lifecycle tests green, divergence alert tests green, hosted learning quota/metering tests green.
3. Packaging target: version bump root/app/package manifests from `0.3.0` to `0.4.0`, then build/package extension VSIX and tag `v0.4.0`.
4. Changelog target: summarize shadow evaluation, operator controls, rollback safety, and M3 gate completion.
5. Manual smoke priority: extension artifact context menu actions for learning candidate approve/discard/rollback and API `/admin/learning/shadow-evaluate` hosted smoke path.

## Automated milestone release flow
1. Source of truth: `release/milestones.json` defines M1-M5 gate mapping; `release/state.json` tracks the last released milestone.
2. Local evaluation: run `npm run release:evaluate -- --json` to confirm the next unreleased milestone is eligible.
3. PR-safe automation: run `.github/workflows/milestone-release.yml` with `mode=pr` to prepare version/changelog/state updates and open or update a release PR.
4. Direct automation: run `.github/workflows/milestone-release.yml` with `mode=direct` and `directConfirmation=RELEASE` from `main` only when an unattended commit/tag/push is desired.
5. Tag publish path: once a release tag exists, `.github/workflows/release.yml` packages the VSIX, creates the GitHub Release, optionally publishes the extension, optionally publishes npm packages, and optionally notifies a release webhook.
6. Required secrets for full automation: `VSCE_PAT` for marketplace publish, `NPM_TOKEN` for npm workspace publish, `RELEASE_WEBHOOK_URL` for external notifications.

## Preflight
1. Run `npm ci` in repo root.
2. Run `npm run verify` and ensure it passes.
3. Confirm `agent/TASK_BOARD.json` reflects current completion state.
4. Confirm `agent/WORK_LOG.md` has latest implementation notes.
5. Confirm extension `package.json` has `publisher`, `description`, `license`, `repository`, `keywords`.

## Product flow checks
1. Open Prompt Studio and run compile with sample brief/profile.
2. Export bundle and verify Artifact Explorer updates.
3. Run CLI compile and verify `ok/result` response envelope.
4. Run API `/health` and `/compile` smoke check.
5. Test workspace member routes: POST + GET `/workspaces/:id/members`.
6. Test auth enforcement: verify 401 from protected routes when keys configured.

## Packaging checks
1. Build extension (`npm run build` inside `apps/extension`).
2. Package extension (`npm run package` inside `apps/extension`).
3. Create preview package and run install smoke command:
   - `npx vsce package --pre-release --no-dependencies`
   - `code --install-extension apps/extension/prompt-compiler-extension-0.3.0.vsix --force --verbose`
4. Install VSIX in Extension Development Host and re-run compile/export flow.
5. Verify `releaseChannel` setting appears in VS Code settings UI.

## Entitlement enforcement checks
1. Confirm `POST /compile` without plan/entitlements → 200 (free tier default).
2. Confirm `POST /workflows/run` with `mode: hosted` and no studio.team entitlement → 403.
3. Confirm `POST /automation/jobs` with `creditBalance: 0` and `creditsRequested: 10` → 402.

## Documentation checks
1. Update `CHANGELOG.md` for included release scope.
2. Verify docs touched by behavior changes are current.
3. Confirm API contract docs match runtime response shape (auth section, workspace governance table).

## GitHub push readiness
1. Ensure working tree changes are intentional.
2. Ensure CI workflow uses `npm run verify`.
3. Ensure `release/milestones.json` and `release/state.json` reflect the intended milestone handoff.
4. Ensure milestone release workflow exists for PR/direct automation and tag release workflow exists for tag pushes (`v*`).
5. Prepare PR notes with:
   - completed tasks
   - verification results
   - known gaps and follow-ups

## Tag and release flow
1. Bump version across package.json files and update `CHANGELOG.md`.
2. Create and push tag: `git tag vX.Y.Z && git push origin vX.Y.Z`.
3. Confirm GitHub Release is auto-created from the tag workflow.
4. Upload VSIX artifact to the GitHub Release.

## Automated commands
1. Evaluate next milestone: `npm run release:evaluate -- --json`
2. Prepare PR-mode release changes locally: `npm run release:prepare`
3. Prepare direct-mode release changes locally: `npm run release:prepare:direct`
4. Trigger GitHub PR-mode automation: Actions -> `Milestone Release Automation` -> `mode=pr`
5. Trigger GitHub direct automation: Actions -> `Milestone Release Automation` -> `mode=direct`, `directConfirmation=RELEASE`

## Stable handoff commands (copy/paste sequence)
1. `npm ci`
2. `npm run verify`
3. `npm run build`
4. `npm run test`
5. `cd apps/extension && npm run package && cd ../..`
6. `code --install-extension apps/extension/prompt-compiler-extension-<VERSION>.vsix --force --verbose`
7. `git status`
8. `git add -A`
9. `git commit -m "release: v<VERSION>"`
10. `git tag v<VERSION>`
11. `git push origin main`
12. `git push origin v<VERSION>`

