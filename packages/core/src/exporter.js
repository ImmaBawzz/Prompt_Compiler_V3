"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createExportPlan = createExportPlan;
const utils_1 = require("./utils");
function createExportPlan(brief, profile, bundle) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const folder = `.prompt-compiler/exports/${stamp}-${(0, utils_1.slugify)(brief.title)}`;
    const files = [
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
//# sourceMappingURL=exporter.js.map