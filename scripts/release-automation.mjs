import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const manifestPaths = [
  'package.json',
  'apps/api/package.json',
  'apps/extension/package.json',
  'packages/cli/package.json',
  'packages/core/package.json',
  'packages/schemas/package.json'
];

function resolveRepoPath(relativePath) {
  return path.join(repoRoot, relativePath);
}

export function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(resolveRepoPath(relativePath), 'utf8'));
}

export function writeJson(relativePath, value) {
  fs.writeFileSync(resolveRepoPath(relativePath), `${JSON.stringify(value, null, 2)}\n`);
}

export function readText(relativePath) {
  return fs.readFileSync(resolveRepoPath(relativePath), 'utf8');
}

export function writeText(relativePath, value) {
  fs.writeFileSync(resolveRepoPath(relativePath), value);
}

export function getManifestPaths() {
  return [...manifestPaths];
}

export function loadMilestoneConfig() {
  return readJson('release/milestones.json');
}

export function loadReleaseState() {
  return readJson('release/state.json');
}

export function loadTaskBoard() {
  return readJson('agent/TASK_BOARD.json');
}

export function readRootVersion() {
  return readJson('package.json').version;
}

export function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    throw new Error(`Unsupported semantic version: ${version}`);
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3])
  };
}

export function bumpMinor(version) {
  const parsed = parseVersion(version);
  return `${parsed.major}.${parsed.minor + 1}.0`;
}

export function compareMilestoneOrder(leftId, rightId) {
  return Number(leftId.replace(/\D/g, '')) - Number(rightId.replace(/\D/g, ''));
}

export function getMilestoneSequence(config) {
  return [...config.milestones].sort((left, right) => compareMilestoneOrder(left.id, right.id));
}

export function getPendingMilestone(config, releaseState) {
  const ordered = getMilestoneSequence(config);
  if (!releaseState.lastReleasedMilestoneId) {
    return ordered[0] ?? null;
  }

  const releasedIndex = ordered.findIndex((milestone) => milestone.id === releaseState.lastReleasedMilestoneId);
  if (releasedIndex === -1) {
    throw new Error(`Unknown lastReleasedMilestoneId: ${releaseState.lastReleasedMilestoneId}`);
  }

  return ordered[releasedIndex + 1] ?? null;
}

export function findPhase(taskBoard, phaseId) {
  const phase = taskBoard.phases.find((entry) => entry.id === phaseId);
  if (!phase) {
    throw new Error(`Phase not found in task board: ${phaseId}`);
  }

  return phase;
}

export function evaluateMilestoneRelease() {
  const config = loadMilestoneConfig();
  const releaseState = loadReleaseState();
  const taskBoard = loadTaskBoard();
  const currentVersion = readRootVersion();
  const pendingMilestone = getPendingMilestone(config, releaseState);

  if (!pendingMilestone) {
    return {
      eligible: false,
      reason: 'No pending milestone remains after the last released milestone.',
      currentVersion,
      lastReleasedMilestoneId: releaseState.lastReleasedMilestoneId,
      pendingMilestone: null,
      nextVersion: null,
      nextMilestone: null
    };
  }

  const phase = findPhase(taskBoard, pendingMilestone.phaseId);
  const taskMap = new Map(phase.tasks.map((task) => [task.id, task]));
  const taskGateResults = (pendingMilestone.taskGateIds ?? []).map((taskId) => {
    const task = taskMap.get(taskId);
    return {
      taskId,
      exists: Boolean(task),
      status: task?.status ?? 'missing',
      satisfied: task?.status === 'done'
    };
  });
  const phaseStatusSatisfied = phase.status === 'done';
  const allTaskGatesSatisfied = taskGateResults.every((result) => result.satisfied);
  const nextVersion = bumpMinor(currentVersion);
  const ordered = getMilestoneSequence(config);
  const nextMilestoneIndex = ordered.findIndex((milestone) => milestone.id === pendingMilestone.id) + 1;
  const upcomingMilestone = ordered[nextMilestoneIndex] ?? null;

  return {
    eligible: phaseStatusSatisfied && allTaskGatesSatisfied,
    reason: phaseStatusSatisfied && allTaskGatesSatisfied
      ? `Milestone ${pendingMilestone.id} is release-eligible.`
      : `Milestone ${pendingMilestone.id} is not release-eligible yet.`,
    currentVersion,
    nextVersion,
    lastReleasedMilestoneId: releaseState.lastReleasedMilestoneId,
    pendingMilestone: {
      ...pendingMilestone,
      phaseStatus: phase.status,
      taskGateResults
    },
    nextMilestone: upcomingMilestone
      ? {
          id: upcomingMilestone.id,
          label: upcomingMilestone.label
        }
      : null
  };
}

export function collectVersionState() {
  const manifests = getManifestPaths().map((relativePath) => ({
    relativePath,
    manifest: readJson(relativePath)
  }));
  const rootVersion = manifests[0].manifest.version;
  const internalPackageNames = new Set(
    manifests
      .map((entry) => entry.manifest.name)
      .filter((name) => typeof name === 'string' && name.length > 0)
  );

  const versionMismatches = manifests
    .filter((entry) => entry.manifest.version !== rootVersion)
    .map((entry) => ({
      relativePath: entry.relativePath,
      expectedVersion: rootVersion,
      actualVersion: entry.manifest.version
    }));

  const dependencyMismatches = [];
  for (const entry of manifests) {
    for (const dependencyField of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
      const dependencies = entry.manifest[dependencyField] ?? {};
      for (const [name, version] of Object.entries(dependencies)) {
        if (internalPackageNames.has(name) && version !== rootVersion) {
          dependencyMismatches.push({
            relativePath: entry.relativePath,
            dependencyField,
            packageName: name,
            expectedVersion: rootVersion,
            actualVersion: version
          });
        }
      }
    }
  }

  return {
    rootVersion,
    manifestPaths: manifests.map((entry) => entry.relativePath),
    versionMismatches,
    dependencyMismatches
  };
}

export function applyVersion(targetVersion) {
  const manifests = getManifestPaths().map((relativePath) => ({
    relativePath,
    manifest: readJson(relativePath)
  }));
  const internalPackageNames = new Set(
    manifests
      .map((entry) => entry.manifest.name)
      .filter((name) => typeof name === 'string' && name.length > 0)
  );

  for (const entry of manifests) {
    entry.manifest.version = targetVersion;

    for (const dependencyField of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
      const dependencies = entry.manifest[dependencyField];
      if (!dependencies) {
        continue;
      }

      for (const packageName of Object.keys(dependencies)) {
        if (internalPackageNames.has(packageName)) {
          dependencies[packageName] = targetVersion;
        }
      }
    }

    writeJson(entry.relativePath, entry.manifest);
  }

  return manifests.map((entry) => entry.relativePath);
}

export function buildReleaseBranchName(version, milestoneId) {
  return `release/v${version}-${milestoneId.toLowerCase()}`;
}

export function updateReleaseState(milestoneId, version, releasedAt) {
  const releaseState = loadReleaseState();
  const history = Array.isArray(releaseState.history) ? [...releaseState.history] : [];

  history.push({
    milestoneId,
    version,
    releasedAt,
    notes: 'Prepared by milestone-triggered release automation.'
  });

  writeJson('release/state.json', {
    ...releaseState,
    lastReleasedMilestoneId: milestoneId,
    history
  });
}

export function updateChangelog({ currentVersion, targetVersion, milestone, nextMilestone, releasedAt }) {
  const changelog = readText('CHANGELOG.md');
  const unreleasedHeaderPattern = /^## \[Unreleased\](?: — v\d+\.\d+\.\d+ Prep)?$/m;
  const currentHeadingMatch = changelog.match(unreleasedHeaderPattern);
  if (!currentHeadingMatch) {
    throw new Error('Unable to find the Unreleased changelog heading.');
  }

  const currentHeading = currentHeadingMatch[0];
  const headingIndex = changelog.indexOf(currentHeading);
  const afterHeadingIndex = headingIndex + currentHeading.length;
  const nextHeadingIndex = changelog.indexOf('\n## [', afterHeadingIndex);
  const unreleasedBody = changelog
    .slice(afterHeadingIndex, nextHeadingIndex === -1 ? changelog.length : nextHeadingIndex)
    .trim();
  const beforeUnreleased = changelog.slice(0, headingIndex).trimEnd();
  const afterUnreleased = nextHeadingIndex === -1 ? '' : changelog.slice(nextHeadingIndex).trimStart();
  const nextPreviewVersion = bumpMinor(targetVersion);

  const newUnreleasedBlock = [
    `## [Unreleased] — v${nextPreviewVersion} Prep`,
    '',
    '### Planned Release Focus',
    nextMilestone
      ? `- **${nextMilestone.id} next**: ${nextMilestone.label} is the next milestone candidate once its gate is complete.`
      : '- **Next release target**: define the next milestone scope before cutting another release.',
    `- **Release target**: \`v${nextPreviewVersion}\` remains provisional until the next milestone gate is complete.`
  ].join('\n');

  const releasedBlock = [
    `## [${targetVersion}] — ${releasedAt} — ${milestone.id}`,
    '',
    '### Release Focus',
    `- **${milestone.id} complete**: ${milestone.changelogFocus}.`,
    `- **Automated milestone release**: promoted from the previous \`[Unreleased]\` block after all release gates passed.`,
    '',
    unreleasedBody
  ].join('\n');

  const nextContents = [
    beforeUnreleased,
    '',
    newUnreleasedBlock,
    '',
    '---',
    '',
    releasedBlock,
    '',
    afterUnreleased
  ]
    .filter((value) => value.trim().length > 0)
    .join('\n');

  writeText('CHANGELOG.md', `${nextContents.trim()}\n`);

  return {
    previousVersion: currentVersion,
    targetVersion,
    nextPreviewVersion
  };
}

export function formatEvaluationSummary(evaluation) {
  if (!evaluation.pendingMilestone) {
    return evaluation.reason;
  }

  const gateSummary = evaluation.pendingMilestone.taskGateResults
    .map((gate) => `${gate.taskId}:${gate.status}`)
    .join(', ');

  return [
    `eligible=${evaluation.eligible}`,
    `pending=${evaluation.pendingMilestone.id}`,
    `phaseStatus=${evaluation.pendingMilestone.phaseStatus}`,
    `taskGates=${gateSummary}`,
    `nextVersion=${evaluation.nextVersion}`
  ].join(' ');
}
