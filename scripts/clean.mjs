import fs from 'node:fs';
import path from 'node:path';

const candidates = [
  'dist',
  'coverage',
  '.prompt-compiler-cache',
  'apps/extension/dist',
  'apps/api/dist',
  'packages/core/dist',
  'packages/schemas/dist',
  'packages/cli/dist'
];

for (const candidate of candidates) {
  fs.rmSync(path.resolve(candidate), { recursive: true, force: true });
}

console.log('Cleaned build artifacts.');
