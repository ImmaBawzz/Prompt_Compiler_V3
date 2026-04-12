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

