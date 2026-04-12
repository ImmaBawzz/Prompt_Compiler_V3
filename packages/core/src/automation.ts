import { createHash } from 'node:crypto';
import { slugify } from './utils';
import { AutomationJobEnvelope, AutomationJobType, CreateAutomationJobInput, HostedFeatureKey } from './types';

export const AUTOMATION_JOB_TYPE_VALUES: readonly AutomationJobType[] = ['profile-library-sync', 'compile-batch'];

const AUTOMATION_JOB_FEATURES: Record<AutomationJobType, HostedFeatureKey> = {
  'profile-library-sync': 'automation.jobs',
  'compile-batch': 'compute.batch'
};

export function isAutomationJobType(value: string | null | undefined): value is AutomationJobType {
  return typeof value === 'string' && AUTOMATION_JOB_TYPE_VALUES.includes(value as AutomationJobType);
}

export function getRequiredFeatureForAutomationJob(jobType: AutomationJobType): HostedFeatureKey {
  return AUTOMATION_JOB_FEATURES[jobType];
}

function createJobId(jobType: AutomationJobType, accountId: string, createdAt: string): string {
  const hash = createHash('sha256').update(`${jobType}:${accountId}:${createdAt}`).digest('hex').slice(0, 12);
  return `job-${slugify(jobType)}-${hash}`;
}

export function createAutomationJobEnvelope(input: CreateAutomationJobInput): AutomationJobEnvelope {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const updatedAt = input.updatedAt ?? createdAt;

  return {
    jobId: input.jobId ?? createJobId(input.jobType, input.accountId, createdAt),
    jobType: input.jobType,
    status: 'queued',
    accountId: input.accountId,
    workspaceId: input.workspaceId,
    requiredFeature: getRequiredFeatureForAutomationJob(input.jobType),
    creditsReserved: input.creditsRequested ?? 0,
    createdAt,
    updatedAt,
    inputSummary: input.inputSummary ?? {},
    resultSummary: input.resultSummary,
    error: input.error ?? null
  };
}
