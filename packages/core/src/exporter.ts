import { CompilationBundle, BrandProfile, PromptBrief } from './types';
import { slugify } from './utils';

export interface ExportPlanFile {
  path: string;
  content: string;
}

export function createExportPlan(brief: PromptBrief, profile: BrandProfile, bundle: CompilationBundle): ExportPlanFile[] {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const folder = `.prompt-compiler/exports/${stamp}-${slugify(brief.title)}`;

  const files: ExportPlanFile[] = [
    { path: `${folder}/brief.json`, content: JSON.stringify(brief, null, 2) + '\n' },
    { path: `${folder}/profile.json`, content: JSON.stringify(profile, null, 2) + '\n' },
    { path: `${folder}/compiled.json`, content: JSON.stringify(bundle, null, 2) + '\n' }
  ];

  for (const output of bundle.outputs) {
    const extension = output.format === 'markdown' ? 'md' : 'txt';
    files.push({
      path: `${folder}/outputs/${output.target}.${extension}`,
      content: output.content + '\n'
    });
  }

  return files;
}
