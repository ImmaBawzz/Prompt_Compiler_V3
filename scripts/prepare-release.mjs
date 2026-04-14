import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import {
  applyVersion,
  buildReleaseBranchName,
  collectVersionState,
  evaluateMilestoneRelease,
  getManifestPaths,
  updateChangelog,
  updateReleaseState
} from './release-automation.mjs';

const args = new Set(process.argv.slice(2));
const modeArgument = [...args].find((value) => value.startsWith('--mode='));
const mode = modeArgument ? modeArgument.split('=')[1] : 'pr';
const skipVerify = args.has('--skip-verify');
const githubOutput = args.has('--github-output');

if (!['pr', 'direct'].includes(mode)) {
  throw new Error(`Unsupported release mode: ${mode}`);
}

const evaluation = evaluateMilestoneRelease();
if (!evaluation.eligible || !evaluation.pendingMilestone || !evaluation.nextVersion) {
  throw new Error(evaluation.reason);
}

if (!skipVerify) {
  execFileSync('npm', ['run', 'verify'], { stdio: 'inherit', shell: true });
}

const beforeVersionState = collectVersionState();
if (beforeVersionState.versionMismatches.length > 0 || beforeVersionState.dependencyMismatches.length > 0) {
  throw new Error('Refusing to prepare release while version synchronization check is failing.');
}

applyVersion(evaluation.nextVersion);

const releasedAt = new Date().toISOString().slice(0, 10);
const changelogResult = updateChangelog({
  currentVersion: evaluation.currentVersion,
  targetVersion: evaluation.nextVersion,
  milestone: evaluation.pendingMilestone,
  nextMilestone: evaluation.nextMilestone,
  releasedAt
});
updateReleaseState(evaluation.pendingMilestone.id, evaluation.nextVersion, releasedAt);

execFileSync('npm', ['install', '--package-lock-only', '--ignore-scripts'], { stdio: 'inherit', shell: true });

const output = {
  mode,
  milestoneId: evaluation.pendingMilestone.id,
  milestoneLabel: evaluation.pendingMilestone.label,
  version: evaluation.nextVersion,
  previousVersion: evaluation.currentVersion,
  tag: `v${evaluation.nextVersion}`,
  releaseBranch: buildReleaseBranchName(evaluation.nextVersion, evaluation.pendingMilestone.id),
  commitMessage: `release: ${evaluation.pendingMilestone.id} v${evaluation.nextVersion}`,
  prTitle: `release: ${evaluation.pendingMilestone.id} v${evaluation.nextVersion}`,
  releaseTitle: `${evaluation.pendingMilestone.id} v${evaluation.nextVersion}`,
  releasedAt,
  nextPreviewVersion: changelogResult.nextPreviewVersion,
  changedFiles: [...getManifestPaths(), 'CHANGELOG.md', 'release/state.json', 'package-lock.json']
};

if (githubOutput) {
  if (!process.env.GITHUB_OUTPUT) {
    throw new Error('GITHUB_OUTPUT is required when using --github-output.');
  }

  const lines = [
    `mode=${output.mode}`,
    `milestone_id=${output.milestoneId}`,
    `milestone_label=${output.milestoneLabel}`,
    `version=${output.version}`,
    `previous_version=${output.previousVersion}`,
    `tag=${output.tag}`,
    `release_branch=${output.releaseBranch}`,
    `commit_message=${output.commitMessage}`,
    `pr_title=${output.prTitle}`,
    `release_title=${output.releaseTitle}`,
    `released_at=${output.releasedAt}`,
    `next_preview_version=${output.nextPreviewVersion}`
  ];
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`);
}

console.log(JSON.stringify(output, null, 2));
