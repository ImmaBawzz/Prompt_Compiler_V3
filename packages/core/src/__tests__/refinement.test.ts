import test from 'node:test';
import assert from 'node:assert/strict';
import { compilePromptBundle } from '../compiler';
import { deriveRefinementHints, refinePromptBundle } from '../refinement';
import { BrandProfile, PromptBrief } from '../types';

const brief: PromptBrief = {
  id: 'brief-test',
  title: 'Signal Bloom',
  concept: 'An emotional cinematic piece.',
  targets: ['suno'],
  genres: ['dreamwave'],
  mood: ['emotional'],
  // No imagery, no structure, no constraints — triggers low specificity hints
};

const profile: BrandProfile = {
  id: 'profile-test',
  brandName: 'LJV',
  voice: 'poetic'
  // No motifs — triggers low style consistency hint
};

test('deriveRefinementHints returns hints for low-quality bundle', () => {
  const bundle = compilePromptBundle(brief, profile);
  const hints = deriveRefinementHints(bundle);
  assert.ok(hints.length > 0, 'Expected at least one hint for a sparse brief');
  assert.ok(hints.every((h) => typeof h.type === 'string'));
});

test('deriveRefinementHints returns empty array for error bundle', () => {
  const errBundle = compilePromptBundle({ ...brief, title: '' }, profile);
  const hints = deriveRefinementHints(errBundle);
  assert.equal(hints.length, 0, 'Error bundles should yield no hints');
});

test('refinePromptBundle with add-constraint hint appends the constraint', () => {
  const result = refinePromptBundle(brief, profile, {
    hints: [{ type: 'add-constraint', value: 'no reverb tails' }]
  });
  assert.ok(result.outputs.length > 0);
  assert.ok(
    result.diagnostics.some((d) => d.code === 'REFINEMENT_APPLIED'),
    'Expected REFINEMENT_APPLIED diagnostic'
  );
});

test('refinePromptBundle with no applicable hints still returns a valid bundle', () => {
  const result = refinePromptBundle(brief, profile, { hints: [] });
  assert.ok(result.outputs.length > 0);
  assert.ok(result.briefId);
});

test('refinePromptBundle with remove-target hint reduces outputs', () => {
  const multiBrief: PromptBrief = { ...brief, targets: ['suno', 'udio'] };
  const result = refinePromptBundle(multiBrief, profile, {
    hints: [{ type: 'remove-target', target: 'udio' }]
  });
  assert.ok(!result.outputs.some((o) => o.target === 'udio'), 'udio should be removed');
});
