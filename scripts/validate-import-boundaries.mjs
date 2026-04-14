import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SCAN_DIRS = ['apps', 'packages'];
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs']);
const FORBIDDEN_PATTERNS = [
  /from\s+['"]@prompt-compiler\/core\/dist\//,
  /import\(['"]@prompt-compiler\/core\/dist\//,
  /from\s+['"]@prompt-compiler\/schemas\/dist\//,
  /import\(['"]@prompt-compiler\/schemas\/dist\//
];

/**
 * Keep module boundaries stable across workspace build order.
 * Internal dist-path imports fail when dependent packages haven't built yet.
 */
function walk(dirPath, out) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'dist' || entry.name === 'node_modules' || entry.name.startsWith('.')) {
      continue;
    }

    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, out);
      continue;
    }

    if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      out.push(fullPath);
    }
  }
}

const files = [];
for (const dir of SCAN_DIRS) {
  const full = path.join(ROOT, dir);
  if (fs.existsSync(full)) {
    walk(full, files);
  }
}

const violations = [];
for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (FORBIDDEN_PATTERNS.some((pattern) => pattern.test(line))) {
      violations.push({
        file: path.relative(ROOT, file).replace(/\\/g, '/'),
        line: i + 1,
        source: line.trim()
      });
    }
  }
}

if (violations.length > 0) {
  console.error('Import boundary validation failed.');
  console.error('Use public package entry points instead of internal dist paths.');
  for (const violation of violations) {
    console.error(` - ${violation.file}:${violation.line}`);
    console.error(`   ${violation.source}`);
  }
  process.exit(1);
}

console.log('Import boundary validation passed.');
