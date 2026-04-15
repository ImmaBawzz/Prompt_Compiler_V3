export type LearningSignalType = 'build' | 'test' | 'quality' | 'work-log' | 'feedback' | 'git-history' | 'self-eval';
export type LearningSignalOutcome = 'positive' | 'negative' | 'neutral';
export interface LearningSignal {
    signalId: string;
    type: LearningSignalType;
    source: string;
    outcome: LearningSignalOutcome;
    weight: number;
    capturedAt: string;
    metadata?: Record<string, string | number | boolean>;
}
export type BehavioralWeightDimension = 'self-modification-threshold' | 'code-change-confidence' | 'test-first-priority' | 'task-selection-breadth' | 'git-push-eagerness' | 'learning-cycle-frequency' | 'shadow-eval-strictness';
export type BehavioralWeightStatus = 'active' | 'candidate' | 'rolled_back';
export interface BehavioralWeight {
    dimension: BehavioralWeightDimension;
    currentValue: number;
    candidateValue?: number;
    status: BehavioralWeightStatus;
    sampleCount: number;
    updatedAt: string;
}
export type AgentActionType = 'modify-rule' | 'modify-system-prompt' | 'modify-task-loop' | 'add-task' | 'write-code' | 'git-commit' | 'git-push';
export interface AgentAction {
    actionType: AgentActionType;
    target: string;
    confidence: number;
    summary: string;
    beforeContent?: string;
    afterContent?: string;
    metadata?: Record<string, string | number | boolean>;
}
export interface SelfEvalScore {
    architecture: number;
    reliability: number;
    testDiscipline: number;
    taskSelection: number;
    safety: number;
    autonomy: number;
    maintainability: number;
    overall: number;
}
export interface OutcomeMetrics {
    buildPassed: boolean;
    testPassed: boolean;
    testsTotal: number;
    testsDelta: number;
    qualityScore: number;
    selfEvalScore: number;
}
export interface Agent2CycleResult {
    cycleId: string;
    startedAt: string;
    completedAt: string;
    dryRun: boolean;
    signalsConsumed: number;
    actionsPlanned: number;
    actionsApplied: number;
    metrics: OutcomeMetrics;
}
export interface Agent2LearnOpts {
    enableLearning?: boolean;
    maxWeightDelta?: number;
    minSampleSize?: number;
    cooldownMs?: number;
    lowerBound?: number;
    upperBound?: number;
    now?: string;
}
export declare const DEFAULT_BEHAVIORAL_WEIGHTS: Record<BehavioralWeightDimension, number>;
export declare function createDefaultBehavioralWeights(now?: string): BehavioralWeight[];
