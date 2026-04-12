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

These are heuristic scores, not truths. Their purpose is triage, not authority.
