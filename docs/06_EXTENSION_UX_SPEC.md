# Extension UX Spec

## Core view
`Prompt Studio`

The panel should let the user:
- paste or load a brief JSON
- paste or load a profile JSON
- compile
- inspect outputs
- export the bundle

## Secondary features
- open example brief
- open example profile
- reveal export folder
- compile active JSON file
- artifact explorer tree view for exported outputs
- sync push latest profile to hosted library API
- sync pull hosted library snapshot into an editor tab

## UX principles
- fast local loop
- minimal friction
- visible diagnostics
- deterministic exports
- no hidden magic

## Error principles
- fail loudly but clearly
- tell the user which field is broken
- never lose input text on compile error
