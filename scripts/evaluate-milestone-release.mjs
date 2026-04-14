import { evaluateMilestoneRelease, formatEvaluationSummary } from './release-automation.mjs';

const args = new Set(process.argv.slice(2));
const format = args.has('--json') ? 'json' : args.has('--github-output') ? 'github-output' : 'text';
const evaluation = evaluateMilestoneRelease();

if (format === 'json') {
  console.log(JSON.stringify(evaluation, null, 2));
  process.exit(0);
}

if (format === 'github-output') {
  if (!process.env.GITHUB_OUTPUT) {
    throw new Error('GITHUB_OUTPUT is required when using --github-output.');
  }

  const lines = [
    `eligible=${String(evaluation.eligible)}`,
    `reason=${evaluation.reason}`,
    `current_version=${evaluation.currentVersion}`,
    `next_version=${evaluation.nextVersion ?? ''}`,
    `pending_milestone_id=${evaluation.pendingMilestone?.id ?? ''}`,
    `pending_milestone_label=${evaluation.pendingMilestone?.label ?? ''}`,
    `last_released_milestone_id=${evaluation.lastReleasedMilestoneId ?? ''}`,
    `summary=${formatEvaluationSummary(evaluation)}`
  ];

  await import('node:fs').then(({ default: fs }) => {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`);
  });
  process.exit(0);
}

console.log(formatEvaluationSummary(evaluation));
