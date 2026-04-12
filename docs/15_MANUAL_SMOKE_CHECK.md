# Manual Smoke Check

## CLI
- run `npm run sample:cli`
- confirm bundle JSON prints

## API
- run `npm run dev:api`
- open `/health`
- POST a brief/profile to `/compile`

## Extension
- build repo
- launch `Run Prompt Compiler Extension`
- open `Prompt Compiler: Open Studio`
- press Compile
- press Export Bundle
- confirm files appear under `.prompt-compiler/exports/`
