# Compiler Specification

## Input contract
The compiler accepts:
- one `PromptBrief`
- one `BrandProfile`
- optional compile options

## Internal stages

1. validation
2. normalization
3. style DNA extraction
4. target output generation
5. scoring and diagnostics
6. bundle assembly

## Targets in the starter
- `suno`
- `udio`
- `flux`
- `kling`
- `youtube`
- `generic`

## Diagnostic classes
- missing-field warnings
- overly vague brief warnings
- profile/brief tension warnings
- target coverage warnings

## Scoring dimensions
- clarity
- specificity
- style-consistency
- target-readiness

## Refinement loop

In addition to the base compile path, the compiler exposes a refinement flow:

1. After any compile, call `deriveRefinementHints(bundle)` to get actionable improvement hints.
2. Pass hints to `refinePromptBundle(brief, profile, { hints })` to apply adjustments and recompile.
3. The refined bundle includes a `REFINEMENT_APPLIED` diagnostic summarizing how many hints were applied.

### RefinementHint types

| type | effect |
|---|---|
| `add-constraint` | appends `value` to `brief.constraints` |
| `boost-specificity` | appends `value` to `brief.imagery` |
| `reduce-vagueness` | sets `brief.notes` from `value` if empty |
| `adjust-tone` | sets a `profile.toneWeights[key]` entry from `value` formatted as `"key:number"` |
| `add-target` | appends `value` as a new compile target |
| `remove-target` | removes the `target` (or `value`) from `brief.targets` |

## Workflow recipes

A `WorkflowRecipe` is a named sequence of `WorkflowStep` objects, each of which can override the base brief/profile and apply refinement hints before compiling.

Use `executeWorkflowRecipe(recipe, brief, profile)` to run all steps and receive a `WorkflowRunResult` with per-step `CompilationBundle` outputs.

