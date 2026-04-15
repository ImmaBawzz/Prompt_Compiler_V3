# Roadmap

## Vision

See [99_VISION_AUTONOMY.md](99_VISION_AUTONOMY.md) for the current and future vision of autonomous development in Prompt Compiler V3. This document is the north star for both internal and external alignment, and should be reviewed at each major milestone.

## Status semantics

- done: implemented and verified
- active: currently in execution
- todo: planned and must-ship in the active phase
- deferred: intentionally moved out of a closed phase into a later active phase

## Ops continuity update (2026-04-13)

- Added `scripts/set-github-secrets.ps1` to provision `VSCE_PAT` and `RAILWAY_TOKEN` for `ImmaBawzz/Prompt_Compiler_V3`.
- Added `npm run ops:set-gh-secrets` wrapper to run the setup consistently.
- Script resolves secrets from CLI args, then env vars, and finally secure interactive prompts.
- This unblocks repeatable completion of manual external-token setup tasks in phase 35/36.

## Release automation update (2026-04-15)

- Added machine-readable milestone release policy in `release/milestones.json` and release progress state in `release/state.json`.
- Added local release automation scripts for milestone evaluation, version synchronization, and release preparation (`npm run release:evaluate`, `npm run release:prepare`, `npm run release:prepare:direct`).
- Added `.github/workflows/milestone-release.yml` to evaluate M1-M5 and either open a release PR or directly commit/tag/push from `main` when explicitly confirmed.
- Extended `.github/workflows/release.yml` so tag releases can also publish npm workspaces and notify an external webhook when configured.
- `npm run verify` now includes `npm run validate:versions` so workspace versions and internal dependency pins stay synchronized before any release cut.

## Phase 1
Working compiler core with tests and examples.

## Phase 2
Stable local extension flow and workspace export.

## Phase 3
CLI/API parity and tighter diagnostics.

## Phase 4
Preset packs, scoring refinements, extension packaging.

## Phase 5
Cloud sync, account model, billing seams, automation jobs.

## Phase 6
Hosted profile library persistence, extension sync touchpoints, and adapter boundaries for durable storage.

## Phase 7
Release automation, tag-driven GitHub releases, branch protection, and concrete test suite coverage.

## Phase 8
Refinement loops, workflow recipe execution, and durable file-based storage.

- `deriveRefinementHints` surfaces actionable improvement suggestions from a completed bundle.
- `refinePromptBundle` applies `RefinementHint` objects to the brief/profile before recompiling.
- `WorkflowRecipe` + `executeWorkflowRecipe` chains multi-step compile sequences.
- `createFileHostedProfileLibraryStore` replaces in-memory persistence with file-backed JSON storage.
- Studio panel surfaces hints after compile and allows one-click refinement.
- `POST /compile/refine` and `POST /workflows/run` API routes consume shared core logic.

## Phase 9
Full automation from a single natural language prompt.

- `deriveBriefFromPrompt` converts a raw string into a valid `PromptBrief` using heuristic keyword analysis (targets, mood, genre, energy, constraints). No external services required.
- `DEFAULT_AUTO_PROFILE` provides a sensible default `BrandProfile` so no profile file is needed.
- `autoCompile(request)` chains derivation → compile → hint derivation → optional auto-refinement in one call.
- `POST /compile/auto` API route accepts `{ prompt, autoRefine?, targets?, profileOverride? }` and returns a full `AutoCompileResult`.
- `--prompt "<text>"` CLI flag bypasses brief/profile files entirely and runs the full auto-compile pipeline.
- Studio panel "Auto Compile" section with a single textarea and optional auto-refine checkbox.
- 17 new tests cover all auto-compile paths in `packages/core`.

## Phase 10
Auth and account boundary hardening.

## Phase 11
Durable hosted backend integration.

## Phase 12
Team workflows and governance.

## Phase 13
Packaging and release commercialization.

## Phase 14 — Provider Execution Bridge
Close the gap from compiled output to actual AI provider submission.

- `ProviderTarget` and `ExecutionRequest` contracts define what a provider call looks like.
- `POST /execute` API route with `dry-run` mode (validate + estimate tokens, no call).
- Generic HTTP/OpenAI-compatible provider adapter consumable from core.
- Extension and CLI user-surface parity items moved to active phase 18.

## Phase 15 — Closed-Loop Feedback Scoring
Record outcome feedback per output and use it to improve future scoring weights per profile.

- `FeedbackRecord` type: `{ bundleId, outputTarget, score: 1..5, notes?, acceptedAt }`.
- `POST /feedback` route persists signals per profile in the hosted store.
- `deriveScoringWeightsFromFeedback` computes adjusted `ScoreWeights` from history.
- `CompileOptions.scoreWeights` now propagates learned weights into `buildScoreCard`.
- Artifact explorer aggregate-feedback UI remains in active phase 18.

## Phase 16 — Publishing Automation and Release Pipelines
Push accepted bundles to release destinations without leaving the tool.

- `PublishTarget` and `PublishJob` contracts mirror the automation job pattern.
- `POST /publish/jobs` route with entitlement gate (Studio tier).
- Generic signed-webhook publish adapter; extensible to platform APIs.
- Extension and CLI publish surfaces moved to active phase 18.

## Phase 17 — Shareable Profile Marketplace
Creators share and sell branded profiles and template packs.

- `MarketplaceListingDocument` contract and schema.
- `GET /marketplace/listings` (free) and `POST /marketplace/listings` (pro.creator gate).
- `POST /marketplace/install` pulls a listing into the user's profile library.
- Extension and CLI marketplace surfaces moved to active phase 18.
- Pure schema-validated JSON artifacts — no server-side execution required.

## Phase 18 — Surface Parity, Feedback UX, and Hardening
Complete the remaining user-surface and release-hardening backlog so backend capabilities are consistently accessible.

- Extension: Send to Provider, Publish Bundle, Browse Marketplace.
- CLI: `--execute`, `--publish`, and `--install-listing` flows with config support.
- Extension artifact explorer: execution-result persistence + aggregate feedback visibility.
- Hardening: cross-surface smoke tests and failure-path checks for entitlement/config errors.

## Phase 19 — Release Candidate and Packaging
Run release checklist, package verification, release notes, preview cut, and stable promotion after smoke validation.

- Pre-release packaging path validated with VSIX generation and install-command smoke check.
- Stable handoff command sequence documented in release checklist for reproducible cut and tag flow.

## Phase 20 — API Input Validation Hardening
Wire the existing JSON schema artifacts into runtime validation at critical API boundaries.

- `packages/schemas` upgraded from path-only exports to full ajv 2020-12 pre-compiled validators.
- Draft-07 schemas normalized to 2020-12 with `$defs` for consistent validator compilation.
- `ajv-formats` added for real `date-time` and `uri` format enforcement.
- Exported validators: `validateBrief`, `validateProfile`, `validateExecutionRequest`, `validateFeedbackInput`, `validatePublishJob`, `validateMarketplaceListing`.
- `POST /compile`: rejects malformed brief or profile with `VALIDATION_ERROR` before entitlement checks.
- `POST /execute`: rejects invalid execution request shape (bad `provider.type` enum, out-of-range `temperature`, etc.).
- `POST /feedback`: rejects feedback with invalid score range, invalid target enum, or missing required fields.
- 34 new tests in `apps/api/src/__tests__/inputValidation.test.ts` covering unit validators and HTTP integration rejection paths.
- API test count: 63 → 97.

## Phase 21 — Review, Approval, and Team Workflow Layer
Add bundle lifecycle state, reviewer collaboration, and publish approval gates so hosted team workflows have explicit control points instead of relying on ad hoc coordination.

- `BundleReviewRecord` + supporting comment/decision contracts live in `packages/core` and define `draft`, `in_review`, `changes_requested`, `approved`, and `published` states.
- New core helpers manage review submission, reviewer comments, approval/change-request decisions, and publish eligibility by workspace role.
- API routes: `POST /reviews/bundles`, `GET /reviews/bundles/:bundleId`, `POST /reviews/bundles/:bundleId/submit`, `POST /reviews/bundles/:bundleId/comments`, `POST /reviews/bundles/:bundleId/decisions`.
- Live workspace publish now requires both an approved review and an `editor` or `owner` membership in the target workspace; successful publish promotes the review record to `published`.
- Extension now exposes review commands for start/status/comment/decision flows and persists review artifacts under each export bundle for Artifact Explorer visibility.
- CLI now supports review lifecycle parity with start/status/comment/decision actions, review config support, and review-only mode using explicit bundle ids.

## Phase 22 — Commercial Readiness Layer
Add durable metering and entitlement-aware UX around hosted value so monetization hardening is built on explicit contracts rather than scattered route logic.

- Completed foundation (`P22-1`): core usage metering contracts (`UsageMeteringEvent`, filters, account summary) and an in-memory usage ledger store.
- Ledger domains start with hosted-value actions: `execute`, `publish`, and `marketplace-install`, with unit accounting by `request` or `token`.
- Next focus: persist metering events in API stores, wire route hooks, and surface entitlement-aware commercial UX.
- Keep the local-first core compile path ungated; meter only hosted compute, publish, marketplace, and shared-workspace value.

## Phase 23 — Entitlement-Aware UX Hints
Surface feature gates inside the extension and CLI with clear upgrade paths. When a user attempts an operation without entitlement (e.g., live execute, live publish), show a human-readable message with next steps instead of a raw 403 error.

- `EntitlementErrorFactory` in core generates user-friendly upgrade prompts for each feature gate.
- Extension webview buttons (Execute, Publish, Marketplace Browse, Marketplace Install) check entitlements before action and show contextual upgrade paths.
- CLI commands (--execute, --publish, --install-listing) render entitlement fail messages with clear next steps and pricing info.
- 8 extension/CLI entitlement UX integration tests ensure consistent messaging and error boundaries.

## Phase 24 — Live Provider Adapters
Replace mocked execution adapters with real HTTP integrations for provider APIs (OpenAI, Suno, FLUX, etc.). End-to-end execute flow works with at least one real provider; dry-run mode still works without credentials.

- Five provider adapters implemented and wired to `executeCompiledOutput()`: `OpenAI-compatible`, `Suno`, `Udio`, `FLUX`, `Kling` (plus existing `dry-run` for validation mode).
- Generic `makeHttpRequest()` utility handles HTTPS/HTTP parsing, stream-based response collection, and protocol-agnostic network error handling.
- Response parsing is provider-specific: OpenAI-compatible returns `choices[0].message.content`; Suno/Udio return music clip arrays; FLUX/Kling return media assets.
- Metadata enrichment: all responses include `requestId`, `executedAt`, `latencyMs`, and `estimatedTokens` for audit trail and cost tracking.
- Custom headers and API key fallback to environment variables supported for all providers.
- 9 end-to-end integration tests use mock HTTP servers to validate request serialization, response parsing, error propagation, and metadata correctness without requiring real credentials.
- API spec updated with `/execute` endpoint documentation including all provider types, error codes, and usage patterns.
- 257+ tests passing, fail 0; full monorepo build clean.

## Phase 25 — Execution Reliability Controls (done)
Add deterministic timeout and retry controls to provider execution so live calls are resilient under transient network instability while preserving local-first behavior.

- Added `ExecutionPolicy` to core request contracts with `timeoutMs`, `maxRetries`, and `retryDelayMs`.
- `makeHttpRequest()` now applies per-attempt timeouts and retry loops using shared policy inputs.
- `/execute` now validates and forwards `policy` through the execution schema and API request mapping.
- Added schema coverage for execution policy fields and validation constraints.
- Added core tests proving timeout behavior and successful retry recovery after a transient connection failure.
- Added HTTP status retry classification in execution transport: retries 408, 429, and 5xx; skips retries for non-retryable 4xx errors.
- Added tests proving 429 retry recovery and 401 no-retry behavior.
- CLI: `--policy-timeout`, `--policy-retries`, `--policy-retry-delay` flags forward policy in the execute payload; provider config JSON also accepts a `policy` field with CLI flags taking precedence.
- Extension: `sendToProvider` command offers an optional "Configure policy" step with InputBox prompts for timeoutMs, maxRetries, and retryDelayMs; policy is persisted in the execution artifact.

## Phase 26 — Durable Metering & Credit Enforcement (done)
Make usage metering durable and prepare reliable credit/quota enforcement for hosted operations.

- Added `createSqliteUsageLedgerStore()` in `apps/api/src/sqliteUsageLedgerStore.ts` with durable event persistence, indexed account/workspace queries, and summary support.
- API bootstrap now supports usage-ledger store selection via env flags: `USAGE_LEDGER_STORE_TYPE` and `USAGE_LEDGER_SQLITE`.
- Startup logging now reports both profile storage mode and usage storage mode.
- Added API tests in `apps/api/src/__tests__/sqliteUsageLedgerStore.test.ts` covering filters/summaries and persistence across store reopen.
- Added hard quota checks on metered hosted routes (`POST /execute`, `POST /publish/jobs`, `POST /marketplace/install`) using persisted usage summaries.
- Quota boundaries are now enforced per domain/plan before dispatching provider/publish/install work.
- Added API coverage for quota denial behavior on all three metered routes.
- `/session/bootstrap` now returns typed `usage` overview data including the current usage summary, per-domain quota snapshot, and remaining credits.
- Shared core contract now models bootstrap usage data and quota snapshots so API, CLI, and extension can consume the same shape without API-only assumptions.

## Phase 27 — Stripe Billing Integration (done)
Add Stripe-ready checkout, portal, and webhook seams that can persist account plan state and feed hosted bootstrap contracts.

- Added `BillingAccountStore` seam and in-memory implementation in `apps/api/src/billingAccountStore.ts`.
- Added `POST /billing/checkout` route that creates a Stripe-style checkout session envelope and stores pending plan state per account.
- Added `POST /billing/webhooks/stripe` route with HMAC signature verification and plan/status updates for checkout/session/subscription events.
- Added `POST /billing/portal` route that returns a Stripe-style customer portal URL for known billing customers.
- `GET /session/bootstrap` now overlays persisted billing plan and credit balance when an account has billing state in the billing store.
- Added API tests for checkout creation, invalid webhook signature rejection, webhook-driven plan activation, portal access, and bootstrap billing reflection.
- Added `createSqliteBillingAccountStore()` for durable billing account persistence with Stripe customer lookup and restart-safe account state.
- API startup now supports `BILLING_ACCOUNT_STORE_TYPE` and `BILLING_ACCOUNT_STORE_SQLITE` so billing storage can be switched to SQLite without changing route code.
- Added SQLite billing-store durability tests covering account lookup and persistence across store reopen.

## Phase 28 — Streaming Execution and Realtime Progress (active)
Deliver streamed execution with realtime progress events so clients can show live operation state while keeping metering and entitlement behavior consistent.

- Added `POST /execute/stream` SSE route that emits `started`, `progress`, and `completed` events for execution flows.
- Streaming route reuses execution validation plus hosted entitlement/quota checks before dispatching provider calls.
- Successful live streamed execution now records execute-domain usage events with the same metering semantics as `POST /execute`.
- Added API tests for dry-run stream events and live stream metering behavior in `apps/api/src/__tests__/phase28StreamingExecution.test.ts`.
- Next: extension live progress UX and CLI stream mode for cross-surface parity.

---

## Milestone-Track Summary (Phases 29–33)

The following five phases deliver the complete app experience and a progressively autonomous self-improvement system that learns from user interactions. Each phase closes with an explicit milestone release gate.

| Milestone | Phase | Description | Target |
|-----------|-------|-------------|--------|
| **M1** | 29 | Production hardening + M1 release | Weeks 1–2 |
| **M2** | 30 | Durable feedback + learning observability | Weeks 3–4 |
| **M3** | 31 | Bounded adaptation + safe learning gates | Weeks 5–7 |
| **M4** | 32 | Autonomous learning modes | Weeks 8–10 |
| **M5** | 33 | Beta tuning + GA readiness | Weeks 11–12 |

---

## Phase 29 — Production Hardening & M1 Release Gate
Complete the remaining Phase 28 cross-surface streaming UX, close all production blockers, and cut the first fully production-capable milestone release. This phase runs in two parallel lanes: streaming surface completion and ops hardening.

**Streaming parity (P28 closure):**
- Extension live progress webview for `POST /execute/stream`: real-time status badge, event log with provider timing, abort control.
- CLI `--stream` flag with SSE event parsing, human-readable stderr progress, clean JSON stdout result.
- Unified provider telemetry model: standardize `started/progress/completed` event shape and token-usage fields across all five provider adapters.
- Cross-surface streaming smoke and failure-path tests (dry-run, live-mock, timeout/abort, auth-error scenarios).

**Production blockers:**
- Stripe webhook hardening: idempotency key deduplication, explicit payload schema validation, and rejection tests for bad signatures and duplicate events.
- Quota pre-guard on `POST /execute`, `POST /publish/jobs`, `POST /marketplace/install`: enforce limits _before_ dispatching provider calls, not after; 402/429 tests.
- Secrets and environment documentation: `.env.example` file with all required keys; `docs/` deployment setup guide.
- SQLite schema versioning: `PRAGMA user_version` in all three DDLs; validated on app startup with version mismatch failure mode documented.

**M1 gate (must all pass before advancing):**
- `npm run test` green; streaming tests included.
- Extension VSIX packages cleanly; install + compile + stream smoke passes.
- Stripe safety test suite passes (8+ assertions).
- `.env.example` committed; schema version documented.

## Phase 30 — Durable Feedback Foundation & Learning Observability (M2)
Replace the in-memory feedback store with a durable SQLite adapter, add a complete learning audit trail, and surface learning metadata in session bootstrap and the extension. This is the data foundation that all subsequent autonomous learning depends on.

- Add `createSqliteFeedbackStore()` alongside the existing in-memory implementation; select via `FEEDBACK_STORE_TYPE` env flag (`memory` | `sqlite`).
- `feedback_records` table with indexed queries on `(profileId, createdAt)` and `(bundleId, createdAt)`.
- `weight_derivations` audit table: every call to `deriveScoringWeightsFromFeedback` appends a row with `derivedAt`, `inputRecordCount`, `priorWeights` (JSON), `newWeights` (JSON), `weightChanges` per dimension, and `trigger` (manual | scheduled | responsive).
- Extend `/session/bootstrap` with a `learning` block: `feedbackCount` per profile, `lastDerivedAt`, `currentWeights`, `pendingCandidates` count, `divergenceAlert` flag.
- Extension artifact explorer: add weight derivation timeline view (when weights last changed, by how much, from how many signals).
- Add learning metering domain to usage ledger: `domain: 'learning'`, `action: 'shadow-evaluation'`; add plan quota (free: 20 evals/month, pro: 200, studio: unlimited).
- Tests: SQLite feedback persistence, audit trail writes, bootstrap learning payload shape, learning quota enforcement.

**M2 gate:**
- Feedback outlasts API restart (SQLite confirmed via test).
- Every weight derivation produces an audit row.
- Bootstrap returns `learning` block with correct live values.
- Learning quota appears in bootstrap quota snapshot.

## Phase 31 — Bounded Learning Adaptation & Safe Gates (M3)
Add safety controls that prevent runaway or adversarial weight drift while still allowing the model to improve measurably from interaction signals. All learning from this point uses bounded, versioned, gate-controlled mutations.

**Bounded adaptation:**
- `LearnOpts` type: `{ maxWeightDelta: number; minSampleSize: number; decayFactor: number; cooldownMs: number; enableLearning: boolean }`.
- Modify `deriveScoringWeightsFromFeedback()` to accept `LearnOpts`; clamp per-dimension delta to `±maxWeightDelta`; require `minSampleSize` records before any update; skip if within `cooldownMs` of prior derivation.
- Recency weighting: feedback < 7 days → weight 1.0; 7–30 days → 0.7; > 30 days → 0.3.
- Default safe values: `maxWeightDelta: 0.05`, `minSampleSize: 5`, `cooldownMs: 86400000` (24 h).

**Divergence detection:**
- Track last 10 derivations in `weight_derivations`; compute coefficient of variation (stddev/mean) per dimension.
- Emit `learningDivergenceDetected` audit event when CV > 0.15 for any dimension.
- Bootstrap `divergenceAlert` flag set to `true` when any dimension exceeded threshold in the last 7 days.

**Weight versioning lifecycle:**
- Extend `HostedProfileLibraryDocument` with `weightVersions` array (`version`, `weights`, `derivedFrom` hash, `createdAt`, `status: 'candidate' | 'active' | 'rolled_back'`) and `activeWeightVersion` pointer.
- `weight_versions` SQLite table with FK to profile.
- New weights are always stored as `candidate`; promotion to `active` requires passing the evaluation gate.

**Shadow evaluation pipeline:**
- `POST /admin/learning/shadow-evaluate` compiles a bank of reference briefs with both candidate and baseline weights; compares scorecard averages.
- Promotion criteria: candidate average score must not regress beyond `-2%`; no divergence alert in prior 7 days; min 5 shadow compilations run.
- Costs: each hosted shadow evaluation consumes `1 request` from the `learning` quota domain.

**Operator controls (Extension):**
- `promptCompiler.approveLearningCandidate` — promotes candidate to active; logs approvedBy, approvedAt.
- `promptCompiler.discardLearningCandidate` — discards the selected candidate version from the pending set.
- `promptCompiler.rollbackWeights` — reverts active version to prior; creates audit entry.
- Weight history panel in Studio webview: list of versions, current active, shadow eval results.

**Tests:** bounds enforcement (delta clamp), divergence detection math, cooldown guard, shadow eval scoring comparison, promote/discard/rollback lifecycle, cost deduction.

**M3 gate:**
- Inject 3 low-score feedback records → derivation produces delta ≤ 0.05 on all dimensions.
- Inject oscillating signals → divergence alert fires.
- Rollback drill: promote candidate, rollback to prior, verify active version reverted.
- Shadow eval metering appears in usage ledger.

## Phase 32 — Autonomous Learning Modes (M4)
Enable fully autonomous self-improvement by adding configurable learning modes per workspace/profile, a scheduler, and a responsive auto-proposal pipeline. Autonomous mode activates only after all safety gates are stable.

**Learning mode enum (per profile):**
```
type LearningMode =
  | 'manual'         // User triggers derivation explicitly via extension command
  | 'manual-review'  // Candidates proposed automatically; require human approval
  | 'scheduled'      // Batch recompute on a configurable cron (default: daily)
  | 'responsive'     // Candidate created on each new feedback event
  | 'autonomous'     // Responsive + auto-promote when all gates pass
```
- `learningMode` field on `HostedProfileLibraryDocument`; default `'manual'` for all existing profiles.
- Admin and owner roles can change mode; viewer role is read-only.

**Scheduled batch learner:**
- `POST /admin/learning/batch-recompute` (admin-only, requires `admin` auth scope): iterates all profiles with mode ≠ `manual`; applies bounded derivation; stores candidate; logs summary per profile.
- Suitable for cron-job or Azure Functions timer trigger invocation.

**Responsive pipeline:**
- On `POST /feedback` (for profiles with mode `responsive` or `autonomous`): trigger async candidate derivation if cooldown + sample size gates pass; store candidate; emit `learning.candidateCreated` event.
- For `autonomous` mode: schedule shadow eval; if all promotion criteria pass within 72 h, auto-promote candidate to active; log `autoPromotedAt`.
- Safety override: if `divergenceAlert` is true on the profile, suspend auto-promotion and notify operator.

**Operator dashboard (Extension webview):**
- Pending candidates view: profile name, delta summary, shadow eval result, days pending.
- Recent promotions: last 10 auto-promoted or manually approved, with impact score.
- Divergence alerts panel: profiles currently suspended from autonomous promotion.
- Budget overview: learning credits consumed this period vs quota.
- Bulk actions: "Approve all safe candidates", "Suspend autonomous mode globally".

**Autonomous mode activation criteria:**
- Mode `autonomous` is only unlocked for a profile after: (a) at least one M3 milestone gate passed, (b) two consecutive promotion cycles completed without divergence alert, (c) post-promotion acceptance impact measured as ≥ 0% (no regression).

**Tests:** mode enum persistence, batch recompute across N profiles, responsive candidate on feedback, auto-promotion happy path, divergence suspension, dashboard data shape.

**M4 gate:**
- `manual-review` + `scheduled` + `responsive` modes all produce correct candidates under test.
- `autonomous` mode auto-promotes in test with mocked gates green, does NOT promote when divergence alert is set.
- Batch recompute for 5 profiles creates 5 candidates, no budget overrun.
- Dashboard data serializes correctly via API.

## Phase 33 — Beta Tuning & GA Readiness (M5)
Validate the autonomous learning system against real interaction data, tune thresholds, run security and privacy checks on all learning endpoints, complete the rollback drill, and cut the GA release.

- **Private beta collection:** Enable `responsive` mode for a selected cohort; collect feedback signals against real compiled outputs; measure acceptance uplift vs baseline over 14 days.
- **Threshold tuning:** Adjust `maxWeightDelta` default, divergence CV threshold, and promotion criteria based on false-positive divergence alerts and measured impact from beta.
- **Impact regression suite:** `POST /admin/learning/impact-report` compares acceptance rate before and after each autonomous promotion across the beta cohort; flag negative-impact promotions.
- **Security & privacy audit of learning endpoints:**
  - Confirm `POST /admin/learning/*` routes require `admin` auth scope; add integration tests.
  - Confirm audit log entries contain no PII beyond `accountId`; validate against `docs/11_SECURITY_PRIVACY.md`.
  - Add RBAC test: viewer cannot trigger learning operations.
- **Rollback drill:** Full end-to-end: autonomous promotion fires → rollback via extension command → verify prior weights active → re-promote → verify new weights active. Document in `docs/15_MANUAL_SMOKE_CHECK.md`.
- **GA release checklist:** Complete all items in `docs/17_RELEASE_CHECKLIST.md`; update `CHANGELOG.md`; tag and push `v1.0.0` release; verify GitHub Release is auto-created with VSIX artifact.

**M5 gate (GA go/no-go):**
- Beta acceptance uplift ≥ 0% (no regression from autonomous learning).
- Zero divergence alerts in production during beta period.
- Security audit passes; admin-scope tests for all learning routes green.
- Rollback drill documented and verified.
- `npm run test` green; `npm run build` clean; release checklist all-checked.
# Roadmap

## Status semantics

- done: implemented and verified
- active: currently in execution
- todo: planned and must-ship in the active phase
- deferred: intentionally moved out of a closed phase into a later active phase

## Phase 1
Working compiler core with tests and examples.

## Phase 2
Stable local extension flow and workspace export.

## Phase 3
CLI/API parity and tighter diagnostics.

## Phase 4
Preset packs, scoring refinements, extension packaging.

## Phase 5
Cloud sync, account model, billing seams, automation jobs.

## Phase 6
Hosted profile library persistence, extension sync touchpoints, and adapter boundaries for durable storage.

## Phase 7
Release automation, tag-driven GitHub releases, branch protection, and concrete test suite coverage.

## Phase 8
Refinement loops, workflow recipe execution, and durable file-based storage.

- `deriveRefinementHints` surfaces actionable improvement suggestions from a completed bundle.
- `refinePromptBundle` applies `RefinementHint` objects to the brief/profile before recompiling.
- `WorkflowRecipe` + `executeWorkflowRecipe` chains multi-step compile sequences.
- `createFileHostedProfileLibraryStore` replaces in-memory persistence with file-backed JSON storage.
- Studio panel surfaces hints after compile and allows one-click refinement.
- `POST /compile/refine` and `POST /workflows/run` API routes consume shared core logic.

## Phase 9
Full automation from a single natural language prompt.

- `deriveBriefFromPrompt` converts a raw string into a valid `PromptBrief` using heuristic keyword analysis (targets, mood, genre, energy, constraints). No external services required.
- `DEFAULT_AUTO_PROFILE` provides a sensible default `BrandProfile` so no profile file is needed.
- `autoCompile(request)` chains derivation → compile → hint derivation → optional auto-refinement in one call.
- `POST /compile/auto` API route accepts `{ prompt, autoRefine?, targets?, profileOverride? }` and returns a full `AutoCompileResult`.
- `--prompt "<text>"` CLI flag bypasses brief/profile files entirely and runs the full auto-compile pipeline.
- Studio panel "Auto Compile" section with a single textarea and optional auto-refine checkbox.
- 17 new tests cover all auto-compile paths in `packages/core`.

## Phase 10
Auth and account boundary hardening.

## Phase 11
Durable hosted backend integration.

## Phase 12
Team workflows and governance.

## Phase 13
Packaging and release commercialization.

## Phase 14 — Provider Execution Bridge
Close the gap from compiled output to actual AI provider submission.

- `ProviderTarget` and `ExecutionRequest` contracts define what a provider call looks like.
- `POST /execute` API route with `dry-run` mode (validate + estimate tokens, no call).
- Generic HTTP/OpenAI-compatible provider adapter consumable from core.
- Extension and CLI user-surface parity items moved to active phase 18.

## Phase 15 — Closed-Loop Feedback Scoring
Record outcome feedback per output and use it to improve future scoring weights per profile.

- `FeedbackRecord` type: `{ bundleId, outputTarget, score: 1..5, notes?, acceptedAt }`.
- `POST /feedback` route persists signals per profile in the hosted store.
- `deriveScoringWeightsFromFeedback` computes adjusted `ScoreWeights` from history.
- `CompileOptions.scoreWeights` now propagates learned weights into `buildScoreCard`.
- Artifact explorer aggregate-feedback UI remains in active phase 18.

## Phase 16 — Publishing Automation and Release Pipelines
Push accepted bundles to release destinations without leaving the tool.

- `PublishTarget` and `PublishJob` contracts mirror the automation job pattern.
- `POST /publish/jobs` route with entitlement gate (Studio tier).
- Generic signed-webhook publish adapter; extensible to platform APIs.
- Extension and CLI publish surfaces moved to active phase 18.

## Phase 17 — Shareable Profile Marketplace
Creators share and sell branded profiles and template packs.

- `MarketplaceListingDocument` contract and schema.
- `GET /marketplace/listings` (free) and `POST /marketplace/listings` (pro.creator gate).
- `POST /marketplace/install` pulls a listing into the user's profile library.
- Extension and CLI marketplace surfaces moved to active phase 18.
- Pure schema-validated JSON artifacts — no server-side execution required.

## Phase 18 — Surface Parity, Feedback UX, and Hardening
Complete the remaining user-surface and release-hardening backlog so backend capabilities are consistently accessible.

- Extension: Send to Provider, Publish Bundle, Browse Marketplace.
- CLI: `--execute`, `--publish`, and `--install-listing` flows with config support.
- Extension artifact explorer: execution-result persistence + aggregate feedback visibility.
- Hardening: cross-surface smoke tests and failure-path checks for entitlement/config errors.

## Phase 19 — Release Candidate and Packaging
Run release checklist, package verification, release notes, preview cut, and stable promotion after smoke validation.

- Pre-release packaging path validated with VSIX generation and install-command smoke check.
- Stable handoff command sequence documented in release checklist for reproducible cut and tag flow.

## Phase 20 — API Input Validation Hardening
Wire the existing JSON schema artifacts into runtime validation at critical API boundaries.

- `packages/schemas` upgraded from path-only exports to full ajv 2020-12 pre-compiled validators.
- Draft-07 schemas normalized to 2020-12 with `$defs` for consistent validator compilation.
- `ajv-formats` added for real `date-time` and `uri` format enforcement.
- Exported validators: `validateBrief`, `validateProfile`, `validateExecutionRequest`, `validateFeedbackInput`, `validatePublishJob`, `validateMarketplaceListing`.
- `POST /compile`: rejects malformed brief or profile with `VALIDATION_ERROR` before entitlement checks.
- `POST /execute`: rejects invalid execution request shape (bad `provider.type` enum, out-of-range `temperature`, etc.).
- `POST /feedback`: rejects feedback with invalid score range, invalid target enum, or missing required fields.
- 34 new tests in `apps/api/src/__tests__/inputValidation.test.ts` covering unit validators and HTTP integration rejection paths.
- API test count: 63 → 97.

## Phase 21 — Review, Approval, and Team Workflow Layer
Add bundle lifecycle state, reviewer collaboration, and publish approval gates so hosted team workflows have explicit control points instead of relying on ad hoc coordination.

- `BundleReviewRecord` + supporting comment/decision contracts live in `packages/core` and define `draft`, `in_review`, `changes_requested`, `approved`, and `published` states.
- New core helpers manage review submission, reviewer comments, approval/change-request decisions, and publish eligibility by workspace role.
- API routes: `POST /reviews/bundles`, `GET /reviews/bundles/:bundleId`, `POST /reviews/bundles/:bundleId/submit`, `POST /reviews/bundles/:bundleId/comments`, `POST /reviews/bundles/:bundleId/decisions`.
- Live workspace publish now requires both an approved review and an `editor` or `owner` membership in the target workspace; successful publish promotes the review record to `published`.
- Extension now exposes review commands for start/status/comment/decision flows and persists review artifacts under each export bundle for Artifact Explorer visibility.
- CLI now supports review lifecycle parity with start/status/comment/decision actions, review config support, and review-only mode using explicit bundle ids.

## Phase 22 — Commercial Readiness Layer
Add durable metering and entitlement-aware UX around hosted value so monetization hardening is built on explicit contracts rather than scattered route logic.

- Completed foundation (`P22-1`): core usage metering contracts (`UsageMeteringEvent`, filters, account summary) and an in-memory usage ledger store.
- Ledger domains start with hosted-value actions: `execute`, `publish`, and `marketplace-install`, with unit accounting by `request` or `token`.
- Next focus: persist metering events in API stores, wire route hooks, and surface entitlement-aware commercial UX.
- Keep the local-first core compile path ungated; meter only hosted compute, publish, marketplace, and shared-workspace value.

## Phase 23 — Entitlement-Aware UX Hints
Surface feature gates inside the extension and CLI with clear upgrade paths. When a user attempts an operation without entitlement (e.g., live execute, live publish), show a human-readable message with next steps instead of a raw 403 error.

- `EntitlementErrorFactory` in core generates user-friendly upgrade prompts for each feature gate.
- Extension webview buttons (Execute, Publish, Marketplace Browse, Marketplace Install) check entitlements before action and show contextual upgrade paths.
- CLI commands (--execute, --publish, --install-listing) render entitlement fail messages with clear next steps and pricing info.
- 8 extension/CLI entitlement UX integration tests ensure consistent messaging and error boundaries.

## Phase 24 — Live Provider Adapters
Replace mocked execution adapters with real HTTP integrations for provider APIs (OpenAI, Suno, FLUX, etc.). End-to-end execute flow works with at least one real provider; dry-run mode still works without credentials.

- Five provider adapters implemented and wired to `executeCompiledOutput()`: `OpenAI-compatible`, `Suno`, `Udio`, `FLUX`, `Kling` (plus existing `dry-run` for validation mode).
- Generic `makeHttpRequest()` utility handles HTTPS/HTTP parsing, stream-based response collection, and protocol-agnostic network error handling.
- Response parsing is provider-specific: OpenAI-compatible returns `choices[0].message.content`; Suno/Udio return music clip arrays; FLUX/Kling return media assets.
- Metadata enrichment: all responses include `requestId`, `executedAt`, `latencyMs`, and `estimatedTokens` for audit trail and cost tracking.
- Custom headers and API key fallback to environment variables supported for all providers.
- 9 end-to-end integration tests use mock HTTP servers to validate request serialization, response parsing, error propagation, and metadata correctness without requiring real credentials.
- API spec updated with `/execute` endpoint documentation including all provider types, error codes, and usage patterns.
- 257+ tests passing, fail 0; full monorepo build clean.
