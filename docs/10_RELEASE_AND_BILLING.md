# Release and Billing Strategy

## Initial product shape
- free local tier
- paid profile libraries and template packs later
- hosted sync and workflow automation later

## Likely pricing model
- Free: local compile, limited examples
- Pro: sync, presets, profile library, export packs
- Studio: automation jobs, team workspace, workflow recipes
- Credits: heavy hosted compile or transformation operations

## Billing rule
Billing should attach to hosted value, team value, or high-cost compute value.
Do not charge for what the local open-loop version already does well.

## Entitlement map

- `free.local`
	- local compile from extension, CLI, and API self-host usage
	- local export bundles
	- default template pack

- `pro.creator`
	- managed profile library sync
	- premium template packs/presets
	- export variants and branded packaging presets

- `studio.team`
	- shared workspace libraries
	- role-based access for profile/template assets
	- workflow recipes and review trails

- `credits.compute`
	- hosted heavy transforms and automation runs
	- batch operations and queued jobs

## Boundary rules

- Never gate core local compile path behind paid entitlements.
- Entitlements can gate hosted persistence, collaboration, and automation orchestration.
- Metering should only apply to hosted compute and storage, not local CPU usage.
- API auth/billing middleware should wrap routes externally and never alter core compiler semantics.

## Phase 5 execution seam

- `GET /session/bootstrap` is the first hosted contract seam.
- It exposes account plan, granted entitlements, and derived feature flags from shared core logic.
- It is safe to evolve behind auth middleware later because it does not change compile output semantics.
- `POST /libraries/profile-sync-manifest` extends that seam with deterministic hosted asset manifests for paid sync capabilities.
- `POST /automation/jobs` adds the first reusable API capability-check seam, enforcing `automation.jobs` or `compute.batch` before queued hosted work is accepted.
