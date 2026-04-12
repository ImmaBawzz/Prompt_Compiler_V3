<div align="center">

# Prompt Compiler

**Turn one creative brief into style-consistent outputs for every AI tool you use.**

[![CI](https://github.com/ImmaBawzz/Prompt_Compiler_V3/actions/workflows/ci.yml/badge.svg)](https://github.com/ImmaBawzz/Prompt_Compiler_V3/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-0.3.0--alpha-orange)](CHANGELOG.md)
[![Node 22+](https://img.shields.io/badge/node-%3E%3D22-green)](https://nodejs.org)

[Quick Start](#quick-start) · [VS Code Extension](#vs-code-extension) · [CLI](#cli) · [API](#api) · [Architecture](#architecture) · [Roadmap](#roadmap) · [Contributing](#contributing)

</div>

---

## The problem

Creators working across Suno, Udio, FLUX, Kling, YouTube, and similar tools face the same friction every session: one idea, rewritten from scratch five different ways, losing voice and style identity along the way.

Prompt Compiler fixes the translation problem.

Describe your creative intent once — as a structured brief with a brand profile — and the compiler produces polished, ready-to-paste outputs for every target, preserving your style DNA across all of them.

---

## What is included

| Package | Purpose |
|---|---|
| `apps/extension` | VS Code Prompt Studio — compile and export cockpit |
| `apps/api` | Local/hosted REST API wrapping the same core |
| `packages/core` | All compiler logic — validation, normalization, targets, scoring |
| `packages/schemas` | JSON schema contracts for briefs, profiles, and packs |
| `packages/cli` | Run compile from the terminal without the extension |
| `examples/` | Realistic input/output fixtures ready to run |

---

## Quick start

**Prerequisites:** Node.js >= 22, npm >= 10

```bash
git clone https://github.com/ImmaBawzz/Prompt_Compiler_V3.git
cd Prompt_Compiler_V3
npm install
npm run build
npm run test
```

Run the CLI sample immediately:

```bash
npm run sample:cli
```

---

## VS Code extension

Open Prompt Studio from the Command Palette:

```
Prompt Compiler: Open Studio
```

Inside the panel you can:

1. Paste or load a **brief** (your creative intent as JSON)
2. Paste or load a **brand profile** (your voice and style constraints)
3. Click **Compile** — outputs for all targets appear instantly
4. Click **Export Bundle** — a structured folder of artifacts is written to your workspace

The **Artifact Explorer** sidebar shows every exported bundle and lets you reveal or diff previous compilations.

### Running the extension locally

Press `F5` inside VS Code with the repo open to launch the Extension Development Host.

Or start TypeScript watch for active development:

```bash
npm run dev:extension
```

---

## CLI

```bash
# Compile using the example brief and profile
node packages/cli/dist/cli/src/index.js \
  --brief examples/brief.cinematic-afterglow.json \
  --profile examples/profile.ljv-signal-core.json \
  --include-generic

# Write the response envelope to a file
node packages/cli/dist/cli/src/index.js \
  --brief examples/brief.cinematic-afterglow.json \
  --profile examples/profile.ljv-signal-core.json \
  --output ./my-compile-result.json

# Export the full artifact bundle into the workspace
node packages/cli/dist/cli/src/index.js \
  --brief examples/brief.cinematic-afterglow.json \
  --profile examples/profile.ljv-signal-core.json \
  --export

# Show help
node packages/cli/dist/cli/src/index.js --help
```

### Response envelope shape

```json
{
  "ok": true,
  "result": {
    "version": "0.3.0",
    "briefId": "brief-cosmic-afterglow",
    "profileId": "profile-ljv-signal-core",
    "styleDNA": ["LJV", "poetic, technical, emotionally charged, never generic"],
    "diagnostics": [],
    "scoreCard": {
      "clarity": 80,
      "specificity": 85,
      "styleConsistency": 81,
      "targetReadiness": 91
    },
    "outputs": [
      { "target": "suno",    "format": "text",     "content": "..." },
      { "target": "udio",    "format": "tags",     "content": "..." },
      { "target": "flux",    "format": "text",     "content": "..." },
      { "target": "kling",   "format": "text",     "content": "..." },
      { "target": "youtube", "format": "markdown", "content": "..." }
    ]
  }
}
```

---

## API

Start the local API server:

```bash
npm run dev:api
# Listening on http://localhost:8788
```

### Routes

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Liveness check |
| `POST` | `/compile` | Compile brief + profile into a bundle |
| `GET` | `/session/bootstrap` | Resolve account entitlements and feature flags |
| `POST` | `/libraries/profile-sync-manifest` | Generate a versioned hosted sync manifest |
| `POST` | `/libraries/profile-assets` | Write a hosted profile library document |
| `GET` | `/libraries/profile-assets` | Read a hosted profile library document |
| `POST` | `/automation/jobs` | Queue a hosted automation job (Pro/Studio tier) |

#### POST /compile example

```bash
curl -s -X POST http://localhost:8788/compile \
  -H "Content-Type: application/json" \
  -d '{
    "brief": {
      "id": "b1",
      "title": "Signal Bloom",
      "concept": "An emotional anthem about memory becoming motion.",
      "targets": ["suno", "flux"]
    },
    "profile": {
      "id": "p1",
      "brandName": "LJV",
      "voice": "poetic and exact"
    }
  }'
```

---

## Output targets

| Target | Format | Description |
|---|---|---|
| `suno` | text | Music prompt with full identity, structure, and brand voice |
| `udio` | tags | Comma-separated genre and mood tag string |
| `flux` | text | Cinematic still-image concept with brand framing |
| `kling` | text | Temporal motion prompt with camera and atmosphere |
| `youtube` | markdown | Formatted description copy with hashtags |
| `generic` | text | Plain structured dump of all brief fields |

---

## Architecture

```
brief + profile + template pack
            |
      packages/core
  +-----------------------------+
  |  validate                   |
  |  normalize                  |
  |  style DNA extraction       |
  |  target builders            |
  |  scoring + diagnostics      |
  |  export bundle preparation  |
  +-----------------------------+
       |           |         |
   extension      CLI       API
```

**Core rule:** No target-building or scoring logic lives in the extension or API. If it affects compiled output, it belongs in `packages/core`.

### Compiler pipeline

1. **Validation** — required fields checked against schemas
2. **Normalization** — whitespace cleanup, deduplication, defaults applied
3. **Style DNA extraction** — brand name, voice, motifs, and brief signals merged into a shared DNA array
4. **Target output generation** — per-target builders produce the `outputs[]` array
5. **Scoring** — clarity, specificity, style-consistency, and target-readiness are scored heuristically
6. **Diagnostics** — vague brief warnings, profile/brief tension, and target coverage gaps are surfaced
7. **Bundle assembly** — a versioned `CompilationBundle` with all outputs, scores, and diagnostics

---

## Export folder structure

Every compile + export produces a deterministic, diffable folder:

```
.prompt-compiler/
  exports/
    <timestamp>-<brief-slug>/
      brief.json
      profile.json
      compiled.json
      outputs/
        suno.txt
        udio.txt
        flux.txt
        kling.txt
        youtube.md
```

---

## Brief schema

```jsonc
{
  "id": "brief-cosmic-afterglow",
  "title": "Cosmic Afterglow",
  "concept": "An emotional festival anthem where memory feels like starlight melting into sunrise.",
  "targets": ["suno", "udio", "flux", "kling", "youtube"],
  "genres": ["euphoric hardstyle", "dreamwave", "cinematic electronic"],
  "mood": ["uplifting", "emotional", "vast"],
  "bpm": 148,
  "key": "G minor",
  "imagery": ["cosmic dawn", "glass horizon"],
  "structure": ["atmospheric intro", "cinematic build", "euphoric drop"],
  "constraints": ["avoid generic EDM phrasing", "preserve emotional identity"]
}
```

See [`examples/brief.cinematic-afterglow.json`](examples/brief.cinematic-afterglow.json) and the full schema at [`packages/schemas/prompt-brief.schema.json`](packages/schemas/prompt-brief.schema.json).

## Brand profile schema

```jsonc
{
  "id": "profile-ljv-signal-core",
  "brandName": "LJV",
  "voice": "poetic, technical, emotionally charged, never generic",
  "signatureMotifs": ["cosmic scale", "heart-pressure emotion", "vast moving landscapes"],
  "avoid": ["corporate filler", "lazy hype words", "empty buzzwords"]
}
```

See [`examples/profile.ljv-signal-core.json`](examples/profile.ljv-signal-core.json) and the full schema at [`packages/schemas/brand-profile.schema.json`](packages/schemas/brand-profile.schema.json).

---

## Entitlements and tiers

| Capability | Free | Pro | Studio |
|---|:---:|:---:|:---:|
| Local compile (extension, CLI, self-hosted API) | Yes | Yes | Yes |
| Export bundles | Yes | Yes | Yes |
| Default template pack | Yes | Yes | Yes |
| Hosted profile library sync | — | Yes | Yes |
| Premium template packs | — | Yes | Yes |
| Automation jobs and batch runs | — | — | Yes |
| Shared workspace libraries | — | — | Yes |

The local compile path is never gated behind a paid tier.

---

## Development scripts

```bash
npm run build              # build all workspaces
npm run test               # run all test suites
npm run verify             # validate structure + clean + build + test + status
npm run status             # render task board phase state to stdout
npm run sample:cli         # run a full CLI compile with example fixtures
npm run dev:api            # start API server in watch mode
npm run dev:extension      # start extension TypeScript watch
npm run package:extension  # package the VS Code extension as .vsix
```

---

## Roadmap

| Phase | Status | Summary |
|---|---|---|
| 0 — Foundation | Done | Monorepo, docs, schemas, examples |
| 1 — Compiler Core | Done | Validation, normalization, targets, scoring, diagnostics |
| 2 — VS Code UX | Done | Prompt Studio, export, artifact explorer |
| 3 — CLI / API Parity | Done | Shared compile path, error contract, parity tests |
| 4 — Hardening | Done | Template packs, entitlement map, CI, packaging |
| 5 — Hosted Seams | Done | Session bootstrap, sync manifest, automation envelopes |
| 6 — Library Persistence | Done | Hosted profile library store with push/pull sync |
| 7 — Release Automation | Done | Tag releases, branch protection, concrete test suites |
| 8 — Refinement Loops | Done | Refinement hints, refine-and-recompile, workflow recipes |
| 9 — Auto Compile | Done | Single natural-language prompt to full compilation pipeline |
| 10 — Auth Boundary | Done | Bearer token middleware, bypassAuth config, protected routes |
| 11 — Durable Storage | Done | File and SQLite adapter seams for hosted persistence |
| 12 — Team Governance | Done | Workspace members, roles, owner access gates |
| 14 — Execution Bridge | Done | Provider execution contracts, /execute route, dry-run |
| 15 — Feedback Scoring | Done | FeedbackRecord, scoring weight derivation, /feedback route |
| 16 — Publishing | Done | PublishJob contracts, /publish/jobs with Studio gate |
| 17 — Marketplace | Done | Listing contracts, /marketplace routes, install flow |
| 18 — Parity and Hardening | Done | Extension/CLI surfaces, cross-surface tests, input validation |
| 19+ | Next | Release packaging, VSIX validation, stable 1.0 cut |

See [`docs/08_ROADMAP.md`](docs/08_ROADMAP.md) for detailed phase descriptions.

---

## Alpha status

This is an **alpha release (v0.3.0)**. The core compile path, VS Code extension, CLI, and API are functional and tested. Schemas and APIs may change before a 1.0 stable release. Hosted sync and automation features are seam-complete but depend on self-hosted infrastructure for now.

- Found a bug? [Open an issue](https://github.com/ImmaBawzz/Prompt_Compiler_V3/issues/new?template=bug_report.md)
- Have an idea? [Start a discussion](https://github.com/ImmaBawzz/Prompt_Compiler_V3/discussions)

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full contribution guide.

Core rules at a glance:
- All domain and compiler logic belongs in `packages/core`
- The extension UI and API stay thin wrappers over the core
- Add tests for new logic; keep exports deterministic
- All PRs require the CI check to pass before merge

---

## License

[MIT](LICENSE)

