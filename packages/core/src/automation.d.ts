import { AutomationJobEnvelope, AutomationJobType, CreateAutomationJobInput, HostedFeatureKey } from './types';
export declare const AUTOMATION_JOB_TYPE_VALUES: readonly AutomationJobType[];
export declare function isAutomationJobType(value: string | null | undefined): value is AutomationJobType;
export declare function getRequiredFeatureForAutomationJob(jobType: AutomationJobType): HostedFeatureKey;
export declare function createAutomationJobEnvelope(input: CreateAutomationJobInput): AutomationJobEnvelope;
