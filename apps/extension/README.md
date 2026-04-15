# Prompt Compiler

**Compile one creative brief into AI prompts for every platform — Suno, Udio, FLUX, Kling, OpenAI, and more.**

Prompt Compiler takes a structured creative brief (mood, genre, BPM, imagery, brand style) and your brand profile, then outputs platform-specific prompts with diagnostics, scoring, and refinement hints — all from VS Code.

---

## Features

- **Multi-target compilation** — one brief → polished prompts for Suno, Udio, FLUX, Kling, YouTube, and generic targets
- **Style DNA** — extract brand voice, motifs, and mood from a profile, applied consistently across every output
- **Diagnostic scoring** — 4-dimension scorecard: clarity, specificity, style-consistency, and target-readiness
- **Auto-compile** — type a plain English description and get a full structured bundle
- **Refinement loops** — apply hints to iteratively improve outputs without re-entering your brief
- **Workflow recipes** — chain multiple compile/execute steps into reusable pipelines
- **Live execution** — send prompts directly to OpenAI and other providers (bring your own API key)
- **Streaming** — real-time token streaming from providers with abort control
- **Feedback & learning** — score outputs and let the compiler learn your preferences over time
- **Artifact Explorer** — browse compiled bundles, execution results, and learning timelines in a tree view
- **Marketplace** — install community template packs and brand profiles
- **Team workspaces** — RBAC, review/approval trails, and publish automation (Studio plan)

---

## Quick Start

1. Install the extension from the VS Code Marketplace
2. Open the Prompt Studio: `Cmd/Ctrl+Shift+P` → **Prompt Compiler: Open Studio**
3. Paste or edit a brief JSON in the left panel
4. Click **Compile** — outputs appear for each target platform
5. Export the bundle or send directly to a provider

---

## Hosted API (Pro features)

Some features — profile library sync, team workspaces, automation jobs — require a connection to the hosted API.

**To connect:**
1. Open VS Code settings → search for `Prompt Compiler`
2. Set `promptCompiler.hostedApiBaseUrl` to your API URL
3. Set your `x-account-id` header or configure a Bearer token

**Pricing:**
| Plan | Price | Features |
|---|---|---|
| Free | $0 | Local compile, CLI, default template pack |
| Pro | $9/mo | Profile library sync, premium templates, export presets |
| Studio | $29/mo | Team workspaces, RBAC, review trails, automation |

---

## Self-Hosting

The API runs on Node.js 22+ and stores data in SQLite. Start it locally:

```bash
git clone https://github.com/ImmaBawzz/Prompt_Compiler_V3
cd Prompt_Compiler_V3
npm ci && npm run build
npm run dev:api
```

The API starts on `http://localhost:8787` by default.

---

## Configuration

| Setting | Default | Description |
|---|---|---|
| `promptCompiler.hostedApiBaseUrl` | `http://localhost:8787` | Base URL for the Prompt Compiler API |
| `promptCompiler.releaseChannel` | `stable` | `stable` or `preview` for experimental features |

---

## CLI

```bash
# Compile a brief
npx prompt-compiler-cli --brief brief.json --profile profile.json

# Auto-compile from natural language
npx prompt-compiler-cli --prompt "upbeat cinematic track, 120 BPM, strings"

# Execute a compiled output
npx prompt-compiler-cli --execute --bundle bundle.json --provider openai
```

---

## Links

- [GitHub](https://github.com/ImmaBawzz/Prompt_Compiler_V3)
- [Issues](https://github.com/ImmaBawzz/Prompt_Compiler_V3/issues)
- [Changelog](https://github.com/ImmaBawzz/Prompt_Compiler_V3/blob/main/CHANGELOG.md)
