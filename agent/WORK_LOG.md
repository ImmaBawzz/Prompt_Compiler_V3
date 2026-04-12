# Work Log

## Template

- date:
- phase:
- completed:
- next:
- blockers:

- date: 2026-04-12
- phase: 20 / API input validation hardening
- completed:
  - opened Phase 20 to address identified gap: JSON schemas in packages/schemas existed but had zero runtime usage — API routes accepted arbitrary bodies via TypeScript casting only
  - installed `ajv@8` and `ajv-formats@3` into `packages/schemas`
  - normalized draft-07 schemas (execution-request, publish-job, feedback-record, marketplace-listing) to JSON Schema 2020-12 with `$defs` instead of `definitions`
  - rewrote `packages/schemas/src/index.ts` to export: `ValidationResult` type + 6 pre-compiled ajv 2020-12 validators (`validateBrief`, `validateProfile`, `validateFeedbackInput`, `validateExecutionRequest`, `validatePublishJob`, `validateMarketplaceListing`)
  - added `@prompt-compiler/schemas` dependency to `apps/api`
  - wired `validateBrief`/`validateProfile` into `POST /compile` — rejects before entitlement checks
  - wired `validateExecutionRequest` into `POST /execute` — catches bad `provider.type` enum, invalid target, out-of-range `temperature`, and empty `content`
  - wired `validateFeedbackInput` into `POST /feedback` — catches invalid score range (1-5), bad target enum, and missing required fields
  - created `apps/api/src/__tests__/inputValidation.test.ts` with 34 tests: 27 unit validator tests + 7 HTTP integration rejection/acceptance tests
  - full monorepo build and test suite green after changes:
    - API 97/97 (was 63/63 before Phase 20)
    - Extension 3/3
    - CLI 5/5
    - Core 100/100
  - no "unknown format" warnings — ajv-formats registered for date-time and uri handling
- next: continue next highest-value phase from backlog
- blockers: none

- date: 2026-04-12
- phase: 18 / surface parity, feedback UX, and hardening (phase-a alignment + p15-5 reopen)
- completed:
  - aligned governance state across task board and roadmap: moved stale `currentPhase` pointer to `phase-18-surface-parity-feedback-hardening`
  - normalized task semantics by converting prior phase-14..17 "skipped" tasks to "deferred" and reopening them as explicit phase-18 must-ship tasks (`P18-2`..`P18-9`)
  - added explicit status semantics in roadmap (`done`, `active`, `todo`, `deferred`) and marked phase 18 as active
  - implemented reopened feedback task (`P18-1` / former `P15-5`): `CompileOptions.scoreWeights` now flows into `buildScoreCard` in live compile path
  - added compile regression test proving score dimensions change when score weights are supplied
- next: implement `P18-2` (extension send-to-provider command + execution artifact persistence), then `P18-3` CLI execute parity
- blockers: none

- decision-note: next-release must-ship backlog
  - extension: send to provider, publish bundle, browse marketplace, execution artifacts, aggregate feedback view
  - CLI: execute with provider config, publish with publish-config, install listing
  - quality: cross-surface smoke tests + failure-path entitlement/config checks before release candidate

- date: 2026-04-12
- phase: 18 / surface parity, feedback UX, and hardening (p18-2 and p18-3)
- completed:
  - P18-2: added `promptCompiler.sendToProvider` extension command with output-target selection from exported `compiled.json`
  - P18-2: added provider mode selection (dry-run and OpenAI-compatible) and API `/execute` dispatch from extension
  - P18-2: execution results now persist into `.prompt-compiler/exports/<bundle>/executions/execution-<target>-<timestamp>.json`
  - P18-2: execution artifact files are appended to Artifact Explorer so results appear alongside bundle artifacts
  - P18-3: added CLI `--execute` and `--provider-config <path>` flow to post selected compiled output to API `/execute`
  - P18-3: added provider-config contract support (`apiBaseUrl`, `provider`, optional `target`, and optional execution params)
  - P18-3: added CLI integration test with mock `/execute` server covering execute flag and config path behavior
  - fixed parity regression by preserving legacy compile-only CLI response shape when `--execute` is not used
- next: implement P18-5 extension Publish Bundle command, then P18-6 CLI publish flow
- blockers: none

- date: 2026-04-12
- phase: 18 / surface parity, feedback UX, and hardening (p18-5 and p18-6)
- completed:
  - P18-5: added `promptCompiler.publishBundle` extension command with destination selection (dry-run or signed webhook)
  - P18-5: extension now calls API `/publish/jobs` and persists publish job artifacts to `.prompt-compiler/exports/<bundle>/publish-jobs/publish-<jobId>.json`
  - P18-5: persisted publish job artifacts are appended into Artifact Explorer alongside existing bundle artifacts
  - P18-6: added CLI `--publish` and `--publish-config <path>` flow for API `/publish/jobs`
  - P18-6: defined publish-config support (`apiBaseUrl`, `target`, optional payload/context fields)
  - P18-6: added CLI integration test with mock publish API route
  - hardened CLI network operations with explicit timeout on `/execute` and `/publish/jobs` requests
  - full repo test suite green after changes: API 60/60, Extension 3/3, CLI 4/4, Core 100/100
- next: implement P18-4 aggregate feedback surfacing in Artifact Explorer
- blockers: none

- date: 2026-04-12
- phase: 18 / surface parity, feedback UX, and hardening (p18-4 and p18-7)
- completed:
  - P18-4: added `promptCompiler.showFeedbackAggregate` extension command to fetch `/feedback/aggregate` per exported profile and persist aggregate artifact JSON under export folder
  - P18-4: feedback aggregate artifacts are surfaced in Artifact Explorer alongside compile/export execution/publish artifacts
  - P18-7: added `promptCompiler.browseMarketplace` extension command to list marketplace listings via `/marketplace/listings`, quick-pick selection, and install via `/marketplace/install`
  - P18-7: persisted marketplace install result artifacts into workspace and surfaced them in Artifact Explorer
  - updated extension manifest command contributions and artifact context menu entries for feedback aggregate and publish/marketplace flows
  - full repo test suite remains green after changes: API 60/60, Extension 3/3, CLI 4/4, Core 100/100
- next: implement P18-8 CLI install-listing flow, then finish P18-9 hardening smoke/failure-path suite
- blockers: none

- date: 2026-04-12
- phase: 18 / surface parity, feedback UX, and hardening (p18-8)
- completed:
  - P18-8: added CLI `--install-listing <id>` flow with optional `--marketplace-config <path>` for `/marketplace/install`
  - added marketplace config contract support in CLI (`apiBaseUrl`, `accountId`, optional `workspaceId`)
  - added CLI integration test with mock marketplace install route
  - CLI suite now covers compile, help, execute, publish, and install-listing paths (5 tests)
  - repo tests remain green after update: API 60/60, Extension 3/3, CLI 5/5, Core 100/100
- next: complete P18-9 hardening set (cross-surface smoke + failure-path checks)
- blockers: none

- date: 2026-04-12
- phase: 18 / surface parity, feedback UX, and hardening (p18-9 completion)
- completed:
  - added `apps/api/src/__tests__/phase18Hardening.test.ts` with end-to-end smoke checks for:
    - compile -> execute(dry-run) -> feedback -> aggregate
    - publish(dry-run) and marketplace list/install
  - added failure-path checks for:
    - execute live call without `credits.compute` entitlement returns 403
    - publish webhook call without required hosted entitlement returns 403
    - marketplace install for missing listing returns 404
  - full repo test suite green after hardening additions:
    - API 63/63
    - Extension 3/3
    - CLI 5/5
    - Core 100/100
  - phase 18 backlog fully completed; task board advanced to phase 19 release-candidate track
- next: execute P19-1 release checklist and packaging verification
- blockers: none

- date: 2026-04-12
- phase: 19 / release candidate and packaging (p19-1 and p19-2)
- completed:
  - ran release-grade verification path (`npm run build`, `npm run test`) with all workspaces green
  - generated extension VSIX artifact successfully:
    - `apps/extension/prompt-compiler-extension-0.3.0.vsix`
  - prepared release notes in `CHANGELOG.md` under `V3.2 (release candidate)` focused on provider, feedback, publish, and marketplace surfaces
  - captured updated verification snapshot in changelog (API 63, Extension 3, CLI 5, Core 100)
- next: complete P19-3 preview RC install smoke path and then P19-4 stable handoff command sequence
- blockers: none

- date: 2026-04-12
- phase: 19 / release candidate and packaging (p19-3 and p19-4)
- completed:
  - added extension LICENSE file to remove VSIX packaging interactivity and align marketplace packaging requirements
  - validated preview packaging command path with `npx vsce package --pre-release --no-dependencies`
  - captured VSIX artifact confirmation in extension folder (`prompt-compiler-extension-0.3.0.vsix`)
  - validated install smoke command path via VS Code CLI (`code --install-extension ... --force --verbose`) with successful exit code
  - updated release checklist with reproducible stable handoff command sequence from verify through tag push
  - marked phase 19 tasks complete in task board and synced roadmap release-candidate notes
- next: begin next planned phase after release handoff scope is defined
- blockers: none

- date: 2026-07-14
- phase: 14–17 / Provider Execution Bridge, Feedback Scoring Loop, Publishing Automation, Profile Marketplace
- completed:
  - P14-1/3: added `ProviderTarget`, `ExecutionRequest`, `ExecutionResult` types to `packages/core/src/types.ts`
  - P14-3: created `packages/core/src/execution.ts` — `executeCompiledOutput` with dry-run mode and generic OpenAI-compatible HTTP adapter (HMAC-free, provider-agnostic)
  - P14-2: added `POST /execute` route to `apps/api/src/server.ts` — dry-run free, live call gated behind `compute.batch` entitlement
  - P14-7: added `packages/schemas/execution-request.schema.json`; 7 new execution tests in `packages/core/src/__tests__/execution.test.ts`
  - P15-1/3/4: created `packages/core/src/feedback.ts` — `FeedbackRecord`, `createFeedbackRecord`, `deriveScoringWeightsFromFeedback`, `buildFeedbackAggregate`, `createInMemoryFeedbackStore`; weight derivation is pure and deterministic (normalized to sum 4.0; clamped 0.5..2.0)
  - P15-2: added `POST /feedback`, `GET /feedback`, `GET /feedback/aggregate` routes to API
  - P15-7: 17 tests in `packages/core/src/__tests__/feedback.test.ts`; added `packages/schemas/feedback-record.schema.json`
  - P16-1/3: created `packages/core/src/publishing.ts` — `PublishJob`, `createPublishJob`, `signWebhookPayload` (HMAC-SHA256), `dispatchPublishJob` (webhook + dry-run), `createInMemoryPublishJobStore`
  - P16-2/5: added `POST /publish/jobs` and `GET /publish/jobs/:jobId` routes — live dispatch gated behind `workspace.shared` entitlement
  - P16-7: 16 tests in `packages/core/src/__tests__/publishing.test.ts`; added `packages/schemas/publish-job.schema.json`
  - P17-1/3/4: created `packages/core/src/marketplace.ts` — `MarketplaceListingDocument`, `createMarketplaceListing` (validates payload shape per listingType), `canPublishToMarketplace`, `createInMemoryMarketplaceStore` (with `incrementInstallCount`)
  - P17-2/3/4: added `GET /marketplace/listings`, `POST /marketplace/listings` (pro.creator gate), `POST /marketplace/install` (merges payload into profile library + increments installCount) routes
  - P17-7: 17 tests in `packages/core/src/__tests__/marketplace.test.ts`; added `packages/schemas/marketplace-listing.schema.json`
  - all 4 new modules exported from `packages/core/src/index.ts`
  - all new store types added to `ServerOptions`; defaults to in-memory for zero-config startup
  - roadmap doc (docs/08_ROADMAP.md) updated with Phases 9–17 summaries
  - TASK_BOARD.json updated: Phases 14–17 all marked done; currentPhase advanced
  - 99 core tests pass; 60 API tests pass; full repo build clean
- next: extension and CLI surface for P14 (send to provider) + P15 (feedback UI) + P16 (publish command) + P17 (marketplace browse) — tracked as follow-on skipped tasks
- blockers: none

- date: 2026-04-12
- phase: 11 / durable hosted backend integration
- completed:
  - upgraded `apps/api/src/fileProfileLibraryStore.ts` with atomic writes (write-to-tmp + `fs.renameSync`) — prevents corrupt data on crash/kill
  - added `list(accountId)` method to `HostedProfileLibraryStore` interface; implemented in in-memory and file stores
  - created `apps/api/src/sqliteProfileLibraryStore.ts` — full SQLite adapter using Node.js built-in `node:sqlite` (no external deps)
  - updated server bootstrap to support `PROFILE_STORE_TYPE=sqlite` and `PROFILE_STORE_SQLITE=<path>` env vars
  - 7 new SQLite tests + 2 new file store tests; all 45 API tests pass
- next: Phase 12
- blockers: none

- date: 2026-04-12
- phase: 13 / packaging and release commercialization
- completed:
  - P13-1: added `local.compile` entitlement gate to POST /compile, POST /compile/refine, POST /compile/auto; added optional plan/mode/entitlements fields to all compile request types for forward compatibility
  - P13-1: added hosted-mode-only `workflow.recipes` entitlement gate to POST /workflows/run (only enforced when mode=hosted; local mode is always free)
  - P13-2: added `creditBalance?: number` to `ApiAutomationJobRequest`; added 402 credit balance check — if creditBalance < creditsRequested → reject with "Insufficient credits" before creating the job envelope
  - P13-3: added `promptCompiler.releaseChannel` configuration to extension manifest (stable/preview enum with descriptions)
  - P13-4: added marketplace-required fields to `apps/extension/package.json`: description, license, repository, homepage, bugs, keywords, categories (+ Machine Learning), galleryBanner (dark theme); updated `npm run package` script to `npx vsce package --no-dependencies`; added `@vscode/vsce@^3.0.0` as devDependency
  - P13-5: rewrote `docs/16_PACKAGING_GUIDE.md` with release channel section, vsce bundled usage, and asset readiness checklist; rewrote `docs/17_RELEASE_CHECKLIST.md` with entitlement enforcement checks, workspace member route checks, auth enforcement validation, and VSIX artifact upload step
  - all 60 API tests pass; 43 core tests pass; full repo build clean
- next: all four phases (10–13) are complete — repo is ready for review and GitHub push
- blockers: none


- completed:
  - created `packages/core/src/governance.ts` with `WorkspaceRole`, `WorkspaceMember`, `isWorkspaceRole`, `canWrite`, `canAdmin`, `meetsMinRole`, `WORKSPACE_ROLE_VALUES` — exported from core index
  - created `apps/api/src/workspaceMemberStore.ts` with `WorkspaceMemberStore` interface and in-memory implementation (addMember, getMember, listMembers, updateRole, removeMember)
  - added `requireWorkspaceRole(context, memberStore, workspaceId, minimumRole)` guard to `auth.ts`
  - added `workspaceMemberStore?: WorkspaceMemberStore` to `ServerOptions`; defaults to in-memory store
  - added 4 workspace membership routes with RBAC enforcement: GET/POST `/workspaces/:id/members`, PATCH/DELETE `/workspaces/:id/members/:accountId`
  - created `packages/core/src/__tests__/governance.test.ts` — 10 unit tests
  - created `apps/api/src/__tests__/workspaceGovernance.test.ts` — 15 tests (7 unit + 8 integration)
  - updated `docs/07_API_SPEC.md` with workspace governance route table and role hierarchy
  - 60 API tests pass; 43 core tests pass; full repo build clean
- next: Phase 13 — packaging and release commercialization
- blockers: none

- completed:
  - fixed TASK_BOARD.json malformed JSON (missing comma before Phase 9 entry)
  - added Phases 10–13 to TASK_BOARD.json with full task breakdowns; updated currentPhase to phase-10
  - created `apps/api/src/auth.ts` with `AuthContext`, `AuthConfig`, `AuthError`, `resolveAuthContext`, `requireAuth`, `requireOwnerAccess`
  - default behavior is bypass (backward-compatible with all existing routes and tests)
  - extended `ApiError.code` union to include `'UNAUTHORIZED'`
  - added `authConfig?: AuthConfig` to `ServerOptions` in `server.ts`
  - wired `resolveAuthContext` per-request in `createServer`; auth context resolved once and passed to all route handlers
  - wired `requireOwnerAccess` guards on: POST /libraries/profile-sync-manifest, POST /libraries/profile-assets, GET /libraries/profile-assets, POST /automation/jobs
  - identity propagation via `x-account-id` / `x-workspace-id` headers
  - created `apps/api/src/__tests__/auth.test.ts` — 22 tests (15 unit + 7 integration)
  - updated `docs/07_API_SPEC.md` with auth section, error code table, server config example
  - all 36 API tests pass; full repo build clean
- next: Phase 11 — durable hosted backend (atomic file writes + SQLite store adapter)
- blockers: none

## Initial seed

- date: 2026-04-12
- phase: 0 / package foundation
- completed: v3 repo scaffold, docs, agent protocol, core, cli, api, extension skeleton
- next: install dependencies, build, run CLI sample, test extension panel, tighten export UX
- blockers: none in scaffold package itself

- date: 2026-04-12
- phase: 1 / compiler core vertical slice
- completed: added core normalization stage, richer diagnostics (vague brief, profile tension, target coverage), expanded core tests, and regenerated compiled example fixture from the real compile path.
- next: execute phase 2 local UX tasks from the task board (starting with Prompt Studio surface and compile/export UX verification).
- blockers: none

- date: 2026-04-12
- phase: 9 / full automation from initial prompt
- completed:
  - added `AutoCompileRequest` and `AutoCompileResult` types to `packages/core/src/types.ts`
  - created `packages/core/src/auto-compile.ts` with `deriveBriefFromPrompt`, `DEFAULT_AUTO_PROFILE`, and `autoCompile`
  - `deriveBriefFromPrompt` uses heuristic keyword analysis to extract targets, genres, mood, energy, and constraints from a raw natural language string — no external services required
  - `autoCompile` chains derivation → compile → hint derivation → optional auto-refinement in a single call
  - exported new symbols from `packages/core/src/index.ts`
  - added `POST /compile/auto` route to `apps/api/src/server.ts`
  - added `--prompt "<text>"` and `--auto-refine` flags to `packages/cli/src/index.ts`
  - added "Auto Compile" panel section to Studio webview (`studioHtml.ts`, `app.js`, `app.css`) with single textarea and auto-refine checkbox
  - wired `autoCompile` message handler in `apps/extension/src/extension.ts`; result populates the derived brief textarea automatically
  - created 17-test suite in `packages/core/src/__tests__/auto-compile.test.ts` — all pass
  - all 35 core tests pass; 54 total across all workspaces pass; build clean
  - updated `docs/07_API_SPEC.md`, `docs/08_ROADMAP.md`, and `agent/TASK_BOARD.json`
- next: define phase 10 priorities
- blockers: none

- date: 2026-04-12
- phase: cross-cutting build reliability
- completed: resolved monorepo TypeScript build break by removing restrictive rootDir settings in app/cli tsconfigs; validated repo build and tests pass.
- next: continue phase 2 implementation and add UX-focused tests/smoke checks.
- blockers: none

- date: 2026-04-12
- phase: 2 / extension local UX
- completed: implemented Prompt Compiler Artifacts tree view, wired export writes to explorer state, added refresh/reveal commands and manifest contributions, and updated UX spec.
- next: complete P2-5 by improving copy/errors and restoring editor state between panel sessions.
- blockers: none

- date: 2026-04-12
- phase: 2 / extension local UX
- completed: shipped P2-5 polish with clearer JSON validation errors, Studio status messaging, and state restore across sessions; verified repo build/test remain green.
- next: start Phase 3 CLI/API parity work, beginning with argument flow hardening and shared error contract.
- blockers: none

- date: 2026-04-12
- phase: 3 / cli-api parity
- completed: hardened CLI argument flow (help, aliases, output file support, deterministic response envelope) and aligned API route responses to explicit error contract/status codes; updated API spec.
- next: add parity smoke tests that validate CLI/API compile consistency against the shared core path.
- blockers: none

- date: 2026-04-12
- phase: 3 / cli-api parity
- completed: added API and CLI parity smoke tests, refactored API server bootstrap for testability, and aligned package runtime entrypoints to transpiled outputs; repo build/test/status pass.
- next: begin phase 4 hardening tasks, starting with CI/workspace script tightening.
- blockers: none

- date: 2026-04-12
- phase: 4 / hardening and monetization seams
- completed: tightened CI with `npm run verify`, implemented template-pack preset behavior in core with tests, defined entitlement/billing boundaries, added release checklist, and expanded packaging guidance.
- next: prepare next roadmap phase based on product priorities (team workflows, hosted sync seams, and monetization enforcement boundaries).
- blockers: none

- date: 2026-04-12
- phase: 5 / hosted sync and account seams
- completed: added shared entitlement and hosted session bootstrap contracts in `packages/core`, exposed them through `GET /session/bootstrap` in the API, expanded tests, and advanced the task board into phase 5.
- next: define the hosted profile library sync manifest contract and then add automation job envelopes on the same shared-contract pattern.
- blockers: none

- date: 2026-04-12
- phase: 5 / hosted sync and account seams
- completed: added a versioned `ProfileLibrarySyncManifest` contract, schema path, deterministic checksum-based manifest builder in `packages/core`, and a `POST /libraries/profile-sync-manifest` API seam with tests.
- next: define automation job envelopes and queue state contracts, then wrap them with API capability checks.
- blockers: none

- date: 2026-04-12
- phase: 5 / hosted sync and account seams
- completed: added shared `AutomationJobEnvelope` contracts and schema, implemented API capability checks for hosted automation features, and completed the phase 5 hosted seam backlog.
- next: define the next roadmap phase after hosted seams, likely around richer hosted persistence or extension-driven sync UX.
- blockers: none

- date: 2026-04-12
- phase: 6 / hosted library persistence and sync touchpoints
- completed: added `HostedProfileLibraryDocument` contracts and merge helpers in core, added hosted profile-library read/write API seams with entitlement checks, and expanded API/core tests for persistence behavior.
- next: add extension-side hosted sync intent actions and then swap in-memory persistence for a storage adapter boundary.
- blockers: none

- date: 2026-04-12
- phase: 6 / hosted library persistence and sync touchpoints
- completed: added extension commands to push/pull hosted profile library state, added configurable hosted API base URL setting, and aligned extension UX docs/task board state.
- next: implement a storage adapter boundary so hosted profile-library persistence can move beyond in-memory maps without route rewrites.
- blockers: none

- date: 2026-04-12
- phase: 6 / hosted library persistence and sync touchpoints
- completed: extracted hosted profile-library persistence behind a `profileLibraryStore` adapter, updated server wiring to dependency injection, and added adapter tests while keeping route contracts unchanged.
- next: define phase 7 priorities (durable backend integration, auth middleware, and richer extension-hosted sync UX).
- blockers: none

- date: 2026-04-12
- phase: 7 / release automation and governance hardening
- completed: added tag-driven GitHub release workflow, replaced placeholder CLI/extension tests with concrete Node test suites, updated test/release docs, and configured main branch protection required checks.
- next: define phase 8 priorities around durable hosted storage backends and auth/account hardening.

- date: 2026-04-12
- phase: 8 / refinement loops, workflow recipes, and durable storage
- completed:
  - added `RefinementHint`, `RefinementContext`, `WorkflowRecipe`, `WorkflowStep`, `WorkflowRunResult` types to `packages/core`
  - implemented `deriveRefinementHints` and `refinePromptBundle` in `refinement.ts`
  - implemented `executeWorkflowRecipe` in `workflow.ts`
  - added `POST /compile/refine` and `POST /workflows/run` API routes
  - added `createFileHostedProfileLibraryStore` in `fileProfileLibraryStore.ts` (file-backed JSON adapter)
  - wired file adapter as default when `PROFILE_STORE_DIR` env var is set
  - updated Studio webview to show refinement hints after compile and added "Apply Hints & Refine" button
  - added `workflow-recipe.schema.json` to `packages/schemas`
  - added 8 refinement/workflow tests to core, 4 file adapter tests to API
  - fixed core test glob to run `*.test.js` not just `compiler.test.js`
  - updated roadmap, API spec, and compiler spec
  - all 37 tests pass; repo build clean
- next: define phase 9 priorities (auth middleware boundary, scoring refinement feedback, team workspace seams, or marketplace packaging improvements).
- blockers: none

- blockers: none
