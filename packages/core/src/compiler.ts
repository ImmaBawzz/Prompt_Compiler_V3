import { buildCompileDiagnostics } from './diagnostics';
import { normalizeBrief, normalizeProfile } from './normalizers';
import { buildScoreCard } from './scorers';
import { buildTargetOutput } from './templates';
import { uniqueClean } from './utils';
import { validateBrief, validateProfile } from './validators';
import {
  BrandProfile,
  CompilationBundle,
  CompileOptions,
  CompiledTargetOutput,
  Diagnostic,
  PromptBrief
} from './types';

function buildStyleDNA(brief: PromptBrief, profile: BrandProfile): string[] {
  return uniqueClean([
    profile.brandName,
    profile.voice,
    ...(profile.signatureMotifs ?? []),
    ...brief.genres,
    ...brief.mood,
    ...(brief.imagery ?? [])
  ]);
}

export function compilePromptBundle(
  brief: PromptBrief,
  profile: BrandProfile,
  options: CompileOptions = {}
): CompilationBundle {
  const normalizedBrief = normalizeBrief(brief);
  const normalizedProfile = normalizeProfile(profile);

  const diagnostics: Diagnostic[] = [
    ...validateBrief(normalizedBrief),
    ...validateProfile(normalizedProfile),
    ...buildCompileDiagnostics(normalizedBrief, normalizedProfile)
  ];

  const hasError = diagnostics.some((item) => item.level === 'error');
  if (hasError) {
    return {
      version: '0.3.0',
      generatedAt: new Date().toISOString(),
      briefId: normalizedBrief.id || 'unknown-brief',
      profileId: normalizedProfile.id || 'unknown-profile',
      styleDNA: [],
      diagnostics,
      scoreCard: buildScoreCard(normalizedBrief, normalizedProfile, options.scoreWeights),
      outputs: []
    };
  }

  const outputs: CompiledTargetOutput[] = normalizedBrief.targets.map((target) =>
    buildTargetOutput(target, normalizedBrief, normalizedProfile, options.templatePack)
  );

  if (options.includeGenericOutput) {
    outputs.push(buildTargetOutput('generic', normalizedBrief, normalizedProfile, options.templatePack));
  }

  if ((normalizedBrief.constraints?.length ?? 0) === 0) {
    diagnostics.push({ level: 'info', code: 'CONSTRAINTS_EMPTY', message: 'Adding constraints usually improves downstream output quality.' });
  }

  return {
    version: '0.3.0',
    generatedAt: new Date().toISOString(),
    briefId: normalizedBrief.id,
    profileId: normalizedProfile.id,
    styleDNA: buildStyleDNA(normalizedBrief, normalizedProfile),
    diagnostics,
    scoreCard: buildScoreCard(normalizedBrief, normalizedProfile, options.scoreWeights),
    outputs
  };
}
