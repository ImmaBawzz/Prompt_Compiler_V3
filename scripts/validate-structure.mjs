import fs from 'node:fs';
import path from 'node:path';

const required = [
  'README.md',
  'START_HERE.md',
  'agent/SYSTEM_PROMPT.md',
  'agent/TASK_BOARD.json',
  'docs/01_PRD.md',
  'docs/03_ARCHITECTURE.md',
  'apps/extension/src/extension.ts',
  'apps/api/src/server.ts',
  'packages/core/src/index.ts',
  'packages/cli/src/index.ts',
  'packages/schemas/prompt-brief.schema.json',
  'examples/brief.cinematic-afterglow.json'
];

const missing = required.filter((file) => !fs.existsSync(path.resolve(file)));

if (missing.length > 0) {
  console.error('Missing required files:');
  for (const file of missing) {
    console.error(` - ${file}`);
  }
  process.exit(1);
}

console.log('Structure validation passed.');
