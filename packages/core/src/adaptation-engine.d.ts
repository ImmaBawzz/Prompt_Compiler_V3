import { Agent2CycleResult, Agent2LearnOpts, AgentAction, BehavioralWeight, LearningSignal } from './agent2-types';
export declare function deriveBehavioralWeights(signals: LearningSignal[], currentWeights: BehavioralWeight[], opts?: Agent2LearnOpts): BehavioralWeight[];
export declare function proposeRuleEvolution(signals: LearningSignal[], currentRulesContent: string): AgentAction | null;
export declare function proposePromptMutation(signals: LearningSignal[], currentPromptContent: string, weights: BehavioralWeight[]): AgentAction | null;
export interface TaskPhaseSummary {
    id: string;
    status: 'done' | 'active' | 'todo' | 'blocked';
    title?: string;
}
export declare function generateTaskPriorities(signals: LearningSignal[], phases: TaskPhaseSummary[]): TaskPhaseSummary[];
export declare function detectDivergence(recentCycles: Agent2CycleResult[]): boolean;
export declare function shadowEvaluateProposal(proposal: AgentAction, historicalCycles: Agent2CycleResult[]): {
    score: number;
    safe: boolean;
};
