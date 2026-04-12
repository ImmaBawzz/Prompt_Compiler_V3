import { CompilationBundle, BrandProfile, PromptBrief } from './types';
export interface ExportPlanFile {
    path: string;
    content: string;
}
export declare function createExportPlan(brief: PromptBrief, profile: BrandProfile, bundle: CompilationBundle): ExportPlanFile[];
