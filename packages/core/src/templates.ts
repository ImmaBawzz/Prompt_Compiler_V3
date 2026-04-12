import { BrandProfile, CompileTarget, CompiledTargetOutput, PromptBrief, TemplatePack } from './types';

function join(values: string[] | undefined, separator = ', '): string {
  return (values ?? []).filter(Boolean).join(separator);
}

function sharedContext(brief: PromptBrief, profile: BrandProfile): string {
  return [
    `Title: ${brief.title}`,
    `Concept: ${brief.concept}`,
    `Genres: ${join(brief.genres)}`,
    `Mood: ${join(brief.mood)}`,
    brief.bpm ? `BPM: ${brief.bpm}` : '',
    brief.key ? `Key: ${brief.key}` : '',
    brief.vocals ? `Vocals: ${brief.vocals}` : '',
    brief.imagery?.length ? `Imagery: ${join(brief.imagery)}` : '',
    brief.structure?.length ? `Structure: ${join(brief.structure)}` : '',
    brief.constraints?.length ? `Constraints: ${join(brief.constraints)}` : '',
    `Brand voice: ${profile.voice}`,
    profile.signatureMotifs?.length ? `Signature motifs: ${join(profile.signatureMotifs)}` : '',
    profile.avoid?.length ? `Avoid: ${join(profile.avoid)}` : ''
  ].filter(Boolean).join('\n');
}

function getTargetTemplate(pack: TemplatePack | undefined, target: CompileTarget): Record<string, unknown> {
  return (pack?.templates?.[target] ?? {}) as Record<string, unknown>;
}

function getTemplateString(template: Record<string, unknown>, key: string): string | undefined {
  const value = template[key];
  return typeof value === 'string' ? value : undefined;
}

function getTemplateNumber(template: Record<string, unknown>, key: string): number | undefined {
  const value = template[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function applyBodyTemplate(
  rawContent: string,
  template: Record<string, unknown>,
  brief: PromptBrief,
  profile: BrandProfile,
  shared: string
): string {
  const bodyTemplate = getTemplateString(template, 'body');
  if (!bodyTemplate) {
    return rawContent;
  }

  const replacements: Record<string, string> = {
    title: brief.title,
    concept: brief.concept,
    sharedContext: shared,
    brandName: profile.brandName,
    genres: join(brief.genres),
    mood: join(brief.mood),
    base: rawContent
  };

  return bodyTemplate.replace(/\{\{\s*([a-zA-Z0-9]+)\s*\}\}/g, (_match, token) => replacements[token] ?? '');
}

function applyPrefixSuffix(content: string, template: Record<string, unknown>): string {
  const prefix = getTemplateString(template, 'prefix');
  const suffix = getTemplateString(template, 'suffix');
  return `${prefix ?? ''}${content}${suffix ?? ''}`;
}

function buildYoutubeHashtags(profile: BrandProfile, template: Record<string, unknown>): string {
  const defaultHashtags = [
    '#PromptCompiler',
    '#CreativeWorkflow',
    '#AIMusic',
    '#AIVideo',
    '#AIPrompt',
    `#${profile.brandName.replace(/\s+/g, '')}`
  ];

  const requestedCount = Math.max(1, Math.floor(getTemplateNumber(template, 'hashtagCount') ?? defaultHashtags.length));
  const selected = defaultHashtags.slice(0, requestedCount);

  return selected.join(' ');
}

export function buildTargetOutput(
  target: CompileTarget,
  brief: PromptBrief,
  profile: BrandProfile,
  templatePack?: TemplatePack
): CompiledTargetOutput {
  const shared = sharedContext(brief, profile);
  const template = getTargetTemplate(templatePack, target);

  switch (target) {
    case 'suno':
      return {
        target,
        title: `${brief.title} — Suno Prompt`,
        format: 'text',
        content: applyPrefixSuffix(
          applyBodyTemplate(
            `Create a musically coherent piece with the following identity:\n${shared}\n\nWrite it as a strong copy-paste music prompt with dense but musical phrasing, preserving originality and emotional identity.`,
            template,
            brief,
            profile,
            shared
          ),
          template
        )
      };
    case 'udio':
      {
        const separator = getTemplateString(template, 'separator') ?? ', ';

        return {
          target,
          title: `${brief.title} — Udio Tags`,
          format: 'tags',
          content: applyPrefixSuffix(
            applyBodyTemplate(
              [
                ...brief.genres,
                ...brief.mood,
                ...(brief.imagery ?? []),
                ...(profile.signatureMotifs ?? []),
                brief.key ?? '',
                brief.bpm ? `${brief.bpm} BPM` : ''
              ]
                .filter(Boolean)
                .join(separator),
              template,
              brief,
              profile,
              shared
            ),
            template
          )
        };
      }

    case 'flux':
      return {
        target,
        title: `${brief.title} — FLUX Prompt`,
        format: 'text',
        content: applyPrefixSuffix(
          applyBodyTemplate(
            `Cinematic image concept based on:\n${shared}\n\nDescribe a visually striking, emotionally resonant still image that preserves the creator's brand identity.`,
            template,
            brief,
            profile,
            shared
          ),
          template
        )
      };
    case 'kling':
      return {
        target,
        title: `${brief.title} — Kling Prompt`,
        format: 'text',
        content: applyPrefixSuffix(
          applyBodyTemplate(
            `Create a cinematic motion prompt. Include subject, setting, camera behavior, atmosphere, motion rhythm, and visual evolution.\n\n${shared}`,
            template,
            brief,
            profile,
            shared
          ),
          template
        )
      };
    case 'youtube':
      return {
        target,
        title: `${brief.title} — YouTube Copy`,
        format: 'markdown',
        content: applyPrefixSuffix(
          applyBodyTemplate(
            `## ${brief.title}\n${brief.concept}\n\nGenres: ${join(brief.genres)}\nMood: ${join(brief.mood)}\n\n${buildYoutubeHashtags(profile, template)}`,
            template,
            brief,
            profile,
            shared
          ),
          template
        )
      };
    case 'generic':
    default:
      return {
        target: 'generic',
        title: `${brief.title} — Generic Output`,
        format: 'text',
        content: applyPrefixSuffix(
          applyBodyTemplate(shared, template, brief, profile, shared),
          template
        )
      };
  }
}
