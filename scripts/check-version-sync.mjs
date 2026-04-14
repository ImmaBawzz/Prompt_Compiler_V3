import { collectVersionState } from './release-automation.mjs';

const versionState = collectVersionState();
const issues = [];

for (const mismatch of versionState.versionMismatches) {
  issues.push(
    `${mismatch.relativePath}: version ${mismatch.actualVersion} does not match root version ${mismatch.expectedVersion}`
  );
}

for (const mismatch of versionState.dependencyMismatches) {
  issues.push(
    `${mismatch.relativePath}: ${mismatch.dependencyField}.${mismatch.packageName}=${mismatch.actualVersion} does not match root version ${mismatch.expectedVersion}`
  );
}

if (issues.length > 0) {
  console.error('Version synchronization check failed.');
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

console.log(`Version synchronization check passed for ${versionState.manifestPaths.length} manifests at ${versionState.rootVersion}.`);
