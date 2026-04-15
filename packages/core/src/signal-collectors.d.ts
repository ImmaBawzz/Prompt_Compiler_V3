import { FeedbackRecord } from './types';
import { LearningSignal } from './agent2-types';
export declare function collectBuildResult(buildOutput: string): LearningSignal;
export declare function collectTestResult(testOutput: string, previousCount: number): LearningSignal;
export declare function collectCodeQuality(lintOutput: string, coveragePercent?: number): LearningSignal;
export declare function collectWorkLogSignals(workLogContent: string, lookbackDays: number): LearningSignal[];
export declare function collectProductFeedback(feedbackRecords: FeedbackRecord[]): LearningSignal[];
export interface GitHistorySnapshot {
    insertions: number;
    deletions: number;
    reverted?: boolean;
}
export declare function collectGitHistory(history: GitHistorySnapshot[]): LearningSignal[];
