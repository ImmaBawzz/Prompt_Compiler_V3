# API Spec

## Authentication (Phase 10)

All routes are public unless the server is configured with `authConfig: { bypassAuth: false }`.
When auth is enforced, protected routes require a valid `Authorization: Bearer <token>` header.

Protected routes: `/libraries/profile-assets` (GET + POST), `/libraries/profile-sync-manifest`, `/automation/jobs`.
Public routes: `/health`, `/session/bootstrap`, `/compile`, `/compile/refine`, `/compile/auto`, `/workflows/run`.

### Identity propagation

Callers may include these headers to scope identity:
- `x-account-id` — bound to `AuthContext.accountId`; validated against the request payload's `accountId` field on protected routes (account boundary enforcement returns 403 on mismatch)
- `x-workspace-id` — bound to `AuthContext.workspaceId`

### Error codes

| Code          | HTTP | Meaning                                     |
|---------------|------|---------------------------------------------|
| BAD_REQUEST   | 400  | Missing or malformed input                  |
| UNAUTHORIZED  | 401  | Missing or invalid bearer token             |
| FORBIDDEN     | 403  | Valid identity but lacks access             |
| VALIDATION_ERROR | 422 | Input passed parsing but failed domain checks |
| NOT_FOUND     | 404  | Resource does not exist                     |
| SERVER_ERROR  | 500  | Unexpected internal failure                 |

### Server configuration

```typescript
createServer({
  authConfig: {
    bypassAuth: false,          // enforce token validation
    apiKeys: ['your-api-key']   // static keys accepted as Bearer tokens
  }
})
```

Default (`bypassAuth` unset or true) — open pass-through for local dev.

## Workspace Governance Routes (Phase 12)

All workspace routes require the caller to be a member of the target workspace.
The `x-account-id` header identifies the caller's account for RBAC checks.

| Method | Path | Min Role | Description |
|--------|------|----------|-------------|
| GET | `/workspaces/:workspaceId/members` | viewer | List all workspace members |
| POST | `/workspaces/:workspaceId/members` | owner | Add a member with role |
| PATCH | `/workspaces/:workspaceId/members/:accountId` | owner | Update member role |
| DELETE | `/workspaces/:workspaceId/members/:accountId` | owner | Remove member |

Role hierarchy: `owner > editor > viewer`

### Add member request shape
```json
{ "accountId": "acct-123", "role": "editor" }
```

### Update role request shape
```json
{ "role": "viewer" }
```

## Base routes

### `POST /compile/auto`
Full automation from a single natural language prompt. Derives a `PromptBrief`, applies a default brand profile, compiles, and returns a complete `AutoCompileResult`. Optionally auto-applies refinement hints.

Request shape:
```json
{
  "prompt": "A dark cinematic lo-fi track for YouTube with heavy bass",
  "autoRefine": true,
  "targets": ["youtube", "suno"],
  "profileOverride": { "brandName": "MyBrand" }
}
```

Response shape:
```json
{
  "ok": true,
  "result": {
    "derivedBrief": {},
    "bundle": {},
    "hints": [],
    "refinedBundle": {}
  }
}
```

Only `prompt` is required. `autoRefine`, `targets`, and `profileOverride` are optional.

### `POST /compile/refine`
Applies `RefinementHint` objects to a brief and profile, then recompiles using the adjusted inputs.
Returns the same `CompilationBundle` shape as `POST /compile`, with an added `REFINEMENT_APPLIED` diagnostic.

Request shape:
```json
{
  "brief": {},
  "profile": {},
  "hints": [
    { "type": "add-constraint", "value": "no reverb tails", "note": "Improves clarity" }
  ]
}
```

### `POST /workflows/run`
Executes a `WorkflowRecipe` step-by-step against a base brief and profile.
Each step can override fields and apply refinement hints independently.
Failed steps are marked without halting the remaining steps.

Request shape:
```json
{
  "recipe": { "id": "...", "name": "...", "steps": [] },
  "brief": {},
  "profile": {}
}
```

Response shape:
```json
{
  "ok": true,
  "result": {
    "recipeId": "...",
    "completedAt": "...",
    "steps": [
      { "stepId": "step-1", "status": "succeeded", "bundle": {} }
    ]
  }
}
```

### `GET /health`
Returns service status.

### `GET /session/bootstrap`
Returns the hosted account/session bootstrap contract used to expose plan, entitlement, and feature flags without changing compiler semantics.

### `POST /libraries/profile-sync-manifest`
Builds a deterministic sync manifest for hosted profile libraries from posted brand profiles and template packs.

### `POST /libraries/profile-assets`
Upserts hosted profile-library documents for an account/workspace scope.

### `GET /libraries/profile-assets`
Returns a stored hosted profile-library document and a derived sync manifest for the same scope.

### `POST /automation/jobs`
Creates a queued automation job envelope after enforcing hosted capability checks from the shared entitlement model.

### `POST /compile`
Compiles a brief and profile into a `CompilationBundle`.

## Request shape

```json
{
  "brief": {},
  "profile": {},
  "options": {}
}
```

## Response shape

```json
{
  "ok": true,
  "result": {}
}
```

or

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "..."
  }
}
```

## Session bootstrap query

`GET /session/bootstrap` accepts optional query params:

- `plan=free|pro|studio`
- `mode=local|hosted`
- `accountId=...`
- `workspaceId=...`
- `entitlement=credits.compute` or `entitlements=credits.compute,...`
- `creditBalance=24`

It returns:

```json
{
  "ok": true,
  "result": {
    "account": {
      "accountId": "local-anonymous",
      "plan": "free",
      "mode": "local"
    },
    "entitlements": {
      "plan": "free",
      "mode": "local",
      "entitlements": ["free.local"],
      "features": []
    },
    "flags": {
      "localFirst": true,
      "hostedSyncEnabled": false,
      "workflowAutomationEnabled": false,
      "billingEnabled": false
    }
  }
}
```

The route is intentionally a seam for future auth, sync, billing, and automation wrappers. It does not gate or alter the local compile path.

## Profile sync manifest request

`POST /libraries/profile-sync-manifest` accepts:

```json
{
  "accountId": "acct-sync",
  "workspaceId": "workspace-1",
  "entitlements": ["free.local", "pro.creator"],
  "generatedAt": "2026-04-12T06:00:00.000Z",
  "profiles": [],
  "templatePacks": []
}
```

It returns a `ProfileLibrarySyncManifest` with deterministic asset ordering, checksums, and a cursor suitable for future hosted sync/pull workflows.

## Hosted profile library persistence

`POST /libraries/profile-assets` accepts:

```json
{
  "accountId": "acct-pro",
  "workspaceId": "workspace-1",
  "plan": "pro",
  "mode": "hosted",
  "entitlements": ["free.local", "pro.creator"],
  "profiles": [],
  "templatePacks": []
}
```

It requires hosted feature access to `profile.sync.managed` and writes an in-memory `HostedProfileLibraryDocument`.

`GET /libraries/profile-assets?accountId=...&workspaceId=...&plan=...&mode=...&entitlements=...` returns:

- the stored `HostedProfileLibraryDocument`
- a derived `ProfileLibrarySyncManifest` built from shared core logic

## Automation job request

`POST /automation/jobs` accepts:

```json
{
  "accountId": "acct-studio",
  "workspaceId": "workspace-1",
  "jobType": "compile-batch",
  "plan": "studio",
  "mode": "hosted",
  "entitlements": ["free.local", "pro.creator", "studio.team", "credits.compute"],
  "creditsRequested": 2,
  "inputSummary": {
    "bundleCount": 3
  }
}
```

The route derives the required hosted feature from the job type:

- `profile-library-sync` requires `automation.jobs`
- `compile-batch` requires `compute.batch`

If the feature is not enabled for the supplied plan/mode/entitlements, the API returns `403 FORBIDDEN`.

## Status + error codes

- `200` with `ok: true` for successful compile
- `200` with `ok: true` for session bootstrap responses
- `200` with `ok: true` for profile sync manifest responses
- `200` with `ok: true` for hosted profile library read/write responses
- `200` with `ok: true` for automation job envelope responses
- `400` with `BAD_REQUEST` for malformed JSON or missing `brief`/`profile`
- `400` with `BAD_REQUEST` for invalid `plan`, `mode`, `entitlement`, or `creditBalance` query values
- `400` with `BAD_REQUEST` for malformed manifest request bodies or missing `accountId`
- `403` with `FORBIDDEN` when hosted capability checks fail for an automation route
- `403` with `FORBIDDEN` when hosted profile sync entitlements are missing
- `422` with `VALIDATION_ERROR` when compile diagnostics contain errors
- `404` with `NOT_FOUND` for unknown routes
- `404` with `NOT_FOUND` when hosted profile library scope has no stored document
- `500` with `SERVER_ERROR` for unexpected failures

## Why the API exists early
Not because cloud is needed for MVP.
Because the compile contract should be externalizable from day one.

## Persistence boundary note
Hosted profile-library routes are wired through a storage adapter boundary (`profileLibraryStore`) so the current in-memory implementation can be replaced by durable storage later without route contract changes.
