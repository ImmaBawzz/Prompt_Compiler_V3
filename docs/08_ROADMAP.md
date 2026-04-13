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
