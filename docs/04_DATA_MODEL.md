# Data Model

## Main entities

### PromptBrief
The user's creative intent.

### BrandProfile
Persistent voice and style constraints.

### TemplatePack
Optional output formatting overlays.

### CompilationBundle
The compiled result with metadata, diagnostics, scores, and target outputs.

### ProfileLibrarySyncManifest
The hosted sync envelope for versioned brand profiles and template packs. It carries account/workspace scope, entitlements, a sync cursor, and deterministic asset checksums so hosted persistence can evolve without changing compiler output contracts.

### HostedProfileLibraryDocument
The hosted persistence shape for profile and template assets scoped by account/workspace. It is the API-side state contract that powers sync reads and writes while still deriving manifests from shared core logic.

### AutomationJobEnvelope
The hosted job contract for queued sync or batch operations. It captures required capability, queue state, credit reservation, and compact input/result summaries without embedding compiler logic in the API.

## Output folder convention

```text
.prompt-compiler/
  exports/
    <timestamp>-<slug>/
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

## Why this matters
A deterministic export structure makes later automation, sync, Git tracking, and publishing workflows far easier.
