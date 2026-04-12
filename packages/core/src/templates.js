"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildTargetOutput = buildTargetOutput;
function join(values, separator = ', ') {
    return (values ?? []).filter(Boolean).join(separator);
}
function sharedContext(brief, profile) {
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
function buildTargetOutput(target, brief, profile) {
    const shared = sharedContext(brief, profile);
    switch (target) {
        case 'suno':
            return {
                target,
                title: `${brief.title} — Suno Prompt`,
                format: 'text',
                content: `Create a musically coherent piece with the following identity:\n${shared}\n\nWrite it as a strong copy-paste music prompt with dense but musical phrasing, preserving originality and emotional identity.`
            };
        case 'udio':
            return {
                target,
                title: `${brief.title} — Udio Tags`,
                format: 'tags',
                content: [
                    ...brief.genres,
                    ...brief.mood,
                    ...(brief.imagery ?? []),
                    ...(profile.signatureMotifs ?? []),
                    brief.key ?? '',
                    brief.bpm ? `${brief.bpm} BPM` : ''
                ].filter(Boolean).join(', ')
            };
        case 'flux':
            return {
                target,
                title: `${brief.title} — FLUX Prompt`,
                format: 'text',
                content: `Cinematic image concept based on:\n${shared}\n\nDescribe a visually striking, emotionally resonant still image that preserves the creator's brand identity.`
            };
        case 'kling':
            return {
                target,
                title: `${brief.title} — Kling Prompt`,
                format: 'text',
                content: `Create a cinematic motion prompt. Include subject, setting, camera behavior, atmosphere, motion rhythm, and visual evolution.\n\n${shared}`
            };
        case 'youtube':
            return {
                target,
                title: `${brief.title} — YouTube Copy`,
                format: 'markdown',
                content: `## ${brief.title}\n${brief.concept}\n\nGenres: ${join(brief.genres)}\nMood: ${join(brief.mood)}\n\n#PromptCompiler #CreativeWorkflow #AIMusic #AIVideo #AIPrompt #${profile.brandName.replace(/\s+/g, '')}`
            };
        case 'generic':
        default:
            return {
                target: 'generic',
                title: `${brief.title} — Generic Output`,
                format: 'text',
                content: shared
            };
    }
}
//# sourceMappingURL=templates.js.map