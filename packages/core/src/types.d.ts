export type CompileTarget = 'suno' | 'udio' | 'flux' | 'kling' | 'youtube' | 'generic';
export interface PromptBrief {
    id: string;
    title: string;
    concept: string;
    targets: CompileTarget[];
    genres: string[];
    mood: string[];
    energy?: number;
    bpm?: number;
    key?: string;
    vocals?: string;
    imagery?: string[];
    structure?: string[];
    constraints?: string[];
    notes?: string;
}
export interface BrandProfile {
    id: string;
    brandName: string;
    voice: string;
    signatureMotifs?: string[];
    preferredLanguage?: string;
    avoid?: string[];
    formatPreferences?: Record<string, string>;
    toneWeights?: Record<string, number>;
}
export interface TemplatePack {
    id: string;
    name: string;
    templates?: Record<string, Record<string, unknown>>;
}
export interface CompileOptions {
    includeGenericOutput?: boolean;
    templatePack?: TemplatePack;
}
export interface Diagnostic {
    level: 'info' | 'warning' | 'error';
    code: string;
    message: string;
}
export interface ScoreCard {
    clarity: number;
    specificity: number;
    styleConsistency: number;
    targetReadiness: number;
}
export interface CompiledTargetOutput {
    target: CompileTarget;
    title: string;
    format: 'text' | 'tags' | 'markdown';
    content: string;
}
export interface CompilationBundle {
    version: string;
    generatedAt: string;
    briefId: string;
    profileId: string;
    styleDNA: string[];
    diagnostics: Diagnostic[];
    scoreCard: ScoreCard;
    outputs: CompiledTargetOutput[];
}
