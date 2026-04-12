import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveBriefFromPrompt, autoCompile, DEFAULT_AUTO_PROFILE } from '../auto-compile';
import { CompileTarget } from '../types';

// ---------------------------------------------------------------------------
// deriveBriefFromPrompt
// ---------------------------------------------------------------------------

test('deriveBriefFromPrompt returns a valid PromptBrief', () => {
  const brief = deriveBriefFromPrompt('A dark cinematic track for YouTube');
  assert.ok(typeof brief.id === 'string' && brief.id.startsWith('brief-auto-'));
  assert.ok(brief.title.length > 0);
  assert.ok(brief.concept.length > 0);
  assert.ok(Array.isArray(brief.targets) && brief.targets.length > 0);
  assert.ok(Array.isArray(brief.genres));
  assert.ok(Array.isArray(brief.mood));
  assert.ok(typeof brief.energy === 'number');
});

test('deriveBriefFromPrompt detects "youtube" target', () => {
  const brief = deriveBriefFromPrompt('A cinematic piece for YouTube');
  assert.ok(brief.targets.includes('youtube' as CompileTarget));
});

test('deriveBriefFromPrompt detects "music" → suno + udio targets', () => {
  const brief = deriveBriefFromPrompt('An upbeat music track');
  assert.ok(brief.targets.includes('suno' as CompileTarget));
  assert.ok(brief.targets.includes('udio' as CompileTarget));
});

test('deriveBriefFromPrompt detects mood keywords', () => {
  const brief = deriveBriefFromPrompt('A dark and melancholic ambient piece');
  assert.ok(brief.mood.includes('dark'));
  assert.ok(brief.mood.includes('melancholic'));
});

test('deriveBriefFromPrompt detects genre keywords', () => {
  const brief = deriveBriefFromPrompt('A lo-fi ambient track with jazz influences');
  assert.ok(brief.genres.some((g) => g === 'lo-fi' || g === 'ambient' || g === 'jazz'));
});

test('deriveBriefFromPrompt sets high energy for "energetic" input', () => {
  const brief = deriveBriefFromPrompt('An energetic high-energy festival banger');
  assert.ok(brief.energy! >= 80);
});

test('deriveBriefFromPrompt sets low energy for "chill" input', () => {
  const brief = deriveBriefFromPrompt('A chill relaxed afternoon vibe');
  assert.ok(brief.energy! <= 40);
});

test('deriveBriefFromPrompt extracts avoid constraints', () => {
  const brief = deriveBriefFromPrompt('A deep house track, avoid generic drops, no auto-tune');
  assert.ok(Array.isArray(brief.constraints) && brief.constraints!.length >= 1);
  assert.ok(brief.constraints!.some((c) => c.includes('avoid')));
});

test('deriveBriefFromPrompt uses defaults when no signals match', () => {
  const brief = deriveBriefFromPrompt('something');
  assert.deepEqual(brief.targets, ['suno', 'udio', 'flux']);
  assert.deepEqual(brief.genres, ['cinematic']);
  assert.deepEqual(brief.mood, ['expressive']);
});

// ---------------------------------------------------------------------------
// DEFAULT_AUTO_PROFILE
// ---------------------------------------------------------------------------

test('DEFAULT_AUTO_PROFILE has required BrandProfile fields', () => {
  assert.ok(typeof DEFAULT_AUTO_PROFILE.id === 'string');
  assert.ok(typeof DEFAULT_AUTO_PROFILE.brandName === 'string');
  assert.ok(typeof DEFAULT_AUTO_PROFILE.voice === 'string');
});

// ---------------------------------------------------------------------------
// autoCompile
// ---------------------------------------------------------------------------

test('autoCompile returns a valid AutoCompileResult', () => {
  const result = autoCompile({ prompt: 'A dark cinematic lo-fi track for YouTube' });
  assert.ok(result.derivedBrief);
  assert.ok(result.bundle);
  assert.ok(Array.isArray(result.hints));
  assert.ok(result.bundle.outputs.length > 0);
});

test('autoCompile result.derivedBrief concept equals the input prompt', () => {
  const prompt = 'An uplifting pop anthem';
  const result = autoCompile({ prompt });
  assert.equal(result.derivedBrief.concept, prompt);
});

test('autoCompile respects explicit targets override', () => {
  const result = autoCompile({ prompt: 'A song', targets: ['kling'] });
  assert.deepEqual(result.derivedBrief.targets, ['kling']);
});

test('autoCompile with autoRefine=false does not include refinedBundle', () => {
  const result = autoCompile({ prompt: 'A sparse piece', autoRefine: false });
  assert.equal(result.refinedBundle, undefined);
});

test('autoCompile with autoRefine=true includes refinedBundle when hints exist', () => {
  // Sparse input is likely to produce hints
  const result = autoCompile({ prompt: 'something', autoRefine: true });
  if (result.hints.length > 0) {
    assert.ok(result.refinedBundle, 'Expected refinedBundle when hints are present and autoRefine is true');
  } else {
    assert.equal(result.refinedBundle, undefined);
  }
});

test('autoCompile profileOverride is merged with DEFAULT_AUTO_PROFILE', () => {
  const result = autoCompile({
    prompt: 'A jazzy soul track',
    profileOverride: { brandName: 'MyBrand' }
  });
  assert.equal(result.bundle.profileId, 'profile-auto-default');
});

test('autoCompile produces no error-level diagnostics for a rich prompt', () => {
  const result = autoCompile({
    prompt: 'A dark cinematic lo-fi ambient track for YouTube and Suno with melancholic mood, avoid generic drops'
  });
  const errors = result.bundle.diagnostics.filter((d) => d.level === 'error');
  assert.equal(errors.length, 0);
});
