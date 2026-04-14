# Changelog

All notable changes are documented here.
Version history follows [Semantic Versioning](https://semver.org).

---
## [Unreleased] — v0.5.0 Prep

### Planned Release Focus
- **M4 next**: Autonomous Learning Modes is the next milestone candidate once its gate is complete.
- **Release target**: `v0.5.0` remains provisional until the next milestone gate is complete.
---
## [0.4.0] — 2026-04-14 — M3

### Release Focus
- **M3 complete**: bounded learning safety gates completed and verified before autonomous modes unlock.
- **Automated milestone release**: promoted from the previous `[Unreleased]` block after all release gates passed.

### Planned Release Focus
- **M3 complete**: bounded learning safety gates completed and verified before autonomous modes unlock.
- **Release target**: `v0.4.0` will package the completed Phase 31 scope.

---
## [0.3.0] — 2026-04-12 — Alpha

### Summary

First public alpha release. All core compilation, VS Code extension, CLI, and API surfaces are functional and tested. The compiler core is feature-complete through auto-compile automation. Hosted sync seams, entitlement gates, governance boundaries, and a marketplace scaffold are in place.

### What is implemented

**Phase 0 — Repository Foundation**
- Monorepo scaffold: apps/, packages/, examples/, agent/, docs/, scripts/
- Agent autonomy operating system (task board, task loop, boot sequence, quality gate, definition of done)
- JSON schemas for briefs, profiles, template packs, sync manifests, automation jobs, hosted library documents, execution requests, feedback records, marketplace listings, publish jobs, and workflow recipes
- Realistic example fixtures ready to run

**Phase 1 — Compiler Core Vertical Slice**
- compilePromptBundle — single entry point for all compilation
- Validation, normalization, style DNA extraction stages
- Target builders: Suno, Udio, FLUX, Kling, YouTube, Generic
- Scoring: clarity, specificity, style-consistency, target-readiness
- Diagnostics: vague brief, profile/brief tension, target coverage warnings
- Template pack preset overlays

**Phase 2 — VS Code Local UX**
- Prompt Studio webview with compile, preview, export
- State restore across panel sessions
- Export bundle command with deterministic workspace output
- Artifact Explorer tree view with refresh and reveal
- Hosted sync push/pull commands (seam-level)
- Clear JSON validation error messages

**Phase 3 — CLI and API Parity**
- CLI with full argument flow: --brief, --profile, --include-generic, --export, --output, --help
- Shared success/error response envelope
- POST /compile route wired to shared core
- Typed error contract across CLI and API
- Parity smoke tests

**Phase 4 — Hardening and Monetization Seams**
- Template pack preset system with schema-validated packs
- Entitlement map: Free (free.local), Pro (pro.creator), Studio (studio.team), Credits (credits.compute)
- CI npm run verify: validate + clean + build + test + status
- Release checklist and packaging guide
- Extension VSIX packaging scaffold

**Phase 5 — Hosted Sync and Account Seams**
- resolveEntitlements and buildHostedSessionBootstrap shared core contracts
- GET /session/bootstrap API route
- ProfileLibrarySyncManifest with deterministic checksum-based asset manifests
- AutomationJobEnvelope with queue states and credit reservation
- POST /automation/jobs with hosted capability gate

**Phase 6 — Hosted Library Persistence and Sync Touchpoints**
- HostedProfileLibraryDocument contracts and upsertHostedProfileLibraryDocument in core
- POST/GET /libraries/profile-assets with entitlement checks
- profileLibraryStore adapter boundary (swappable backing)
- Extension sync push/pull commands and configurable hostedApiBaseUrl setting

**Phase 7 — Release Automation and Governance Hardening**
- Tag-driven GitHub release workflow (.github/workflows/release.yml)
- Branch protection on main: required CI check, PR review, no force push
- Real CLI test suite (packages/cli/src/__tests__/cli.test.ts)
- Real extension test suite (apps/extension/src/__tests__/hostedSync.test.ts)
- hostedSync.ts module extracted for isolated testability

**Phase 8 — Refinement Loops and Workflow Recipes**
- deriveRefinementHints surfaces actionable improvement suggestions from a compiled bundle
- refinePromptBundle applies RefinementHint objects before recompiling
- WorkflowRecipe and executeWorkflowRecipe chain multi-step compile sequences
- REFINEMENT_APPLIED diagnostic injected into refined bundles

**Phase 9 — Auto Compile**
- deriveBriefFromPrompt converts a raw string into a valid PromptBrief using heuristic analysis
- DEFAULT_AUTO_PROFILE default BrandProfile for no-profile-required flows
- autoCompile chains derivation, compile, hint derivation, and optional auto-refinement in one call
- POST /compile/auto API route accepts { prompt, autoRefine?, targets?, profileOverride? }
- POST /compile/refine API route applies hints and recompiles
- POST /workflows/run API route
- CLI --prompt flag for single-string compilation

**Phase 10 — Auth Boundary**
- resolveAuthContext middleware: Bearer token validation, x-account-id / x-workspace-id propagation
- bypassAuth configuration for local dev
- requireAuth and requireOwnerAccess middleware seams
- Protected routes: /libraries/*, /automation/jobs

**Phase 11 — Durable Storage Adapters**
- createFileHostedProfileLibraryStore: file-backed JSON persistence for profile library
- SQLite adapter seam for profile library
- Storage adapter pattern: all adapters implement the same interface as the in-memory store

**Phase 12 — Team Workspace Governance**
- WorkspaceMember with roles: owner, editor, viewer
- workspaceMemberStore adapter pattern
- GET/POST/PATCH/DELETE /workspaces/:workspaceId/members routes with owner access gate

**Phase 14 — Provider Execution Bridge**
- ProviderTarget and ExecutionRequest contracts
- createExecutionRequest core helper with dry-run support
- POST /execute API route with entitlement gate (pro.creator) and dry-run mode

**Phase 15 — Closed-Loop Feedback Scoring**
- FeedbackRecord type with score 1-5, notes, and acceptedAt
- recordFeedback and deriveScoringWeightsFromFeedback in core
- POST /feedback API route

**Phase 16 — Publishing Automation**
- PublishTarget and PublishJob contracts
- createPublishJob core helper
- POST /publish/jobs route with Studio-tier entitlement gate

**Phase 17 — Shareable Profile Marketplace**
- MarketplaceListingDocument contract and schema
- GET /marketplace/listings (free) and POST /marketplace/listings (pro.creator gate)
- POST /marketplace/install (pulls a listing into profile library)

**Phase 18 — Surface Parity and Hardening**
- Extension: Send to Provider, Publish Bundle, Browse Marketplace commands
- Extension Artifact Explorer: execution result persistence, feedback aggregate visibility
- CLI: --execute, --publish, --install-listing flows
- Cross-surface smoke tests and failure-path checks for entitlement and config errors
- API input validation hardening at compile and execute boundaries

### Test coverage at v0.3.0

| Workspace | Passing tests |
|---|---|
| packages/core | 100 |
| apps/api | 97 |
| packages/cli | 5 |
| apps/extension | 3 |
| **Total** | **205** |

All tests pass with zero failures.

---

## Earlier development (pre-public)

Internal iteration history is captured in agent/WORK_LOG.md.
