import test from 'node:test';
import assert from 'node:assert/strict';
import { createAutomationJobEnvelope } from '../automation';
import { compilePromptBundle } from '../compiler';
import { buildHostedSessionBootstrap, resolveEntitlements } from '../entitlements';
import { upsertHostedProfileLibraryDocument } from '../libraries';
import { createProfileLibrarySyncManifest } from '../sync';
import { BrandProfile, PromptBrief } from '../types';

const brief: PromptBrief = {
  id: 'brief-1',
  title: 'Signal Bloom',
  concept: 'A poetic electronic anthem about memory becoming motion.',
  targets: ['suno', 'udio', 'flux'],
  genres: ['dreamwave', 'euphoric electronic'],
  mood: ['emotional', 'uplifting'],
  imagery: ['neon rain', 'glass sunrise'],
  structure: ['intro', 'drop', 'break']
};

const profile: BrandProfile = {
  id: 'profile-1',
  brandName: 'LJV',
  voice: 'poetic and exact',
  signatureMotifs: ['cosmic scale', 'heart pressure']
};

test('compilePromptBundle returns outputs for requested targets', () => {
  const result = compilePromptBundle(brief, profile, { includeGenericOutput: true });
  assert.equal(result.outputs.length, 4);
  assert.equal(result.outputs[0].target, 'suno');
  assert.ok(result.styleDNA.includes('LJV'));
});

test('compilePromptBundle returns no outputs when validation errors exist', () => {
  const result = compilePromptBundle({ ...brief, title: '' }, profile);
  assert.equal(result.outputs.length, 0);
  assert.ok(result.diagnostics.some((item) => item.level === 'error'));
});

test('compilePromptBundle normalizes whitespace and deduplicates style data', () => {
  const messyBrief = {
    ...brief,
    id: '  brief-1  ',
    title: '  Signal Bloom  ',
    targets: ['suno', 'suno', 'flux', 'invalid-target'] as unknown as PromptBrief['targets'],
    genres: [' dreamwave ', 'dreamwave', 'euphoric electronic'],
    mood: [' emotional ', 'uplifting', 'uplifting']
  } as PromptBrief;

  const messyProfile = {
    ...profile,
    brandName: '  LJV  ',
    signatureMotifs: ['cosmic scale', ' cosmic scale ', 'heart pressure']
  } as BrandProfile;

  const result = compilePromptBundle(messyBrief, messyProfile);
  assert.equal(result.briefId, 'brief-1');
  assert.equal(result.outputs.length, 2);
  assert.deepEqual(result.outputs.map((item) => item.target), ['suno', 'flux']);
  assert.equal(result.styleDNA.filter((item) => item === 'cosmic scale').length, 1);
});

test('compilePromptBundle emits profile tension and target coverage diagnostics', () => {
  const focusedBrief: PromptBrief = {
    ...brief,
    concept: 'Neon memory',
    targets: ['flux', 'suno'],
    genres: [],
    mood: [],
    imagery: [],
    notes: 'Use empty buzzwords to keep it broad.'
  };

  const focusedProfile: BrandProfile = {
    ...profile,
    avoid: ['empty buzzwords']
  };

  const result = compilePromptBundle(focusedBrief, focusedProfile);
  assert.ok(result.diagnostics.some((item) => item.code === 'BRIEF_CONCEPT_VAGUE'));
  assert.ok(result.diagnostics.some((item) => item.code === 'PROFILE_BRIEF_TENSION'));
  assert.ok(result.diagnostics.some((item) => item.code === 'TARGET_MUSIC_CONTEXT_THIN'));
  assert.ok(result.diagnostics.some((item) => item.code === 'TARGET_VISUAL_CONTEXT_THIN'));
});

test('compilePromptBundle applies template pack presets to outputs', () => {
  const templateResult = compilePromptBundle(
    { ...brief, targets: ['udio', 'youtube'] },
    profile,
    {
      includeGenericOutput: true,
      templatePack: {
        id: 'pack-1',
        name: 'Preset Pack',
        templates: {
          udio: { separator: ' | ', prefix: '[UD] ' },
          youtube: { hashtagCount: 3 },
          generic: { prefix: '[GENERIC] ', suffix: ' [/GENERIC]' }
        }
      }
    }
  );

  const udioOutput = templateResult.outputs.find((item) => item.target === 'udio');
  const youtubeOutput = templateResult.outputs.find((item) => item.target === 'youtube');
  const genericOutput = templateResult.outputs.find((item) => item.target === 'generic');

  assert.ok(udioOutput);
  assert.ok(udioOutput.content.startsWith('[UD] '));
  assert.ok(udioOutput.content.includes(' | '));

  assert.ok(youtubeOutput);
  const lastLine = youtubeOutput.content.split('\n').at(-1) ?? '';
  const youtubeHashtags = lastLine.match(/#[A-Za-z0-9]+/g) ?? [];
  assert.equal(youtubeHashtags.length, 3);

  assert.ok(genericOutput);
  assert.ok(genericOutput.content.startsWith('[GENERIC] '));
  assert.ok(genericOutput.content.endsWith(' [/GENERIC]'));
});

test('compilePromptBundle applies scoreWeights to scorecard dimensions', () => {
  const baseline = compilePromptBundle(brief, profile);
  const weighted = compilePromptBundle(brief, profile, {
    scoreWeights: {
      clarity: 0.5,
      specificity: 1.5,
      styleConsistency: 1,
      targetReadiness: 1
    }
  });

  assert.ok(weighted.scoreCard.clarity < baseline.scoreCard.clarity);
  assert.ok(weighted.scoreCard.specificity > baseline.scoreCard.specificity);
  assert.equal(weighted.scoreCard.styleConsistency, baseline.scoreCard.styleConsistency);
  assert.equal(weighted.scoreCard.targetReadiness, baseline.scoreCard.targetReadiness);
});

test('resolveEntitlements expands plan defaults and explicit grants deterministically', () => {
  const result = resolveEntitlements({
    plan: 'studio',
    mode: 'hosted',
    grantedEntitlements: ['credits.compute', 'free.local']
  });

  assert.deepEqual(result.entitlements, ['free.local', 'pro.creator', 'studio.team', 'credits.compute']);
  assert.equal(result.features.find((item) => item.key === 'local.compile')?.enabled, true);
  assert.equal(result.features.find((item) => item.key === 'automation.jobs')?.enabled, true);
  assert.equal(result.features.find((item) => item.key === 'compute.batch')?.enabled, true);
});

test('buildHostedSessionBootstrap preserves local-first access and exposes hosted billing flags', () => {
  const localBootstrap = buildHostedSessionBootstrap();
  assert.equal(localBootstrap.account.mode, 'local');
  assert.equal(localBootstrap.flags.localFirst, true);
  assert.equal(localBootstrap.flags.hostedSyncEnabled, false);
  assert.equal(localBootstrap.flags.billingEnabled, false);
  assert.equal(localBootstrap.usage, undefined);

  const hostedBootstrap = buildHostedSessionBootstrap({
    accountId: 'acct-studio',
    workspaceId: 'workspace-1',
    plan: 'studio',
    mode: 'hosted',
    grantedEntitlements: ['credits.compute'],
    creditBalance: 42
  });

  assert.equal(hostedBootstrap.account.accountId, 'acct-studio');
  assert.equal(hostedBootstrap.flags.hostedSyncEnabled, true);
  assert.equal(hostedBootstrap.flags.workflowAutomationEnabled, true);
  assert.equal(hostedBootstrap.flags.billingEnabled, true);
  assert.equal(hostedBootstrap.entitlements.creditBalance, 42);
  assert.equal(hostedBootstrap.usage?.creditsRemaining, 42);
  assert.equal(hostedBootstrap.usage?.summary, undefined);
});

test('buildHostedSessionBootstrap includes usage summary and quota snapshot when supplied', () => {
  const bootstrap = buildHostedSessionBootstrap({
    accountId: 'acct-usage',
    mode: 'hosted',
    plan: 'pro',
    creditBalance: 7,
    usageSummary: {
      accountId: 'acct-usage',
      totalEvents: 3,
      totalsByDomain: {
        execute: 2,
        publish: 0,
        'marketplace-install': 1,
        learning: 0
      },
      totalsByUnit: {
        request: 3,
        token: 0
      },
      mostRecentEventAt: '2026-04-13T00:00:00.000Z'
    },
    usageQuotas: {
      execute: { limit: 2, used: 2, remaining: 0, exhausted: true },
      publish: { limit: 0, used: 0, remaining: 0, exhausted: true },
      'marketplace-install': { limit: 3, used: 1, remaining: 2, exhausted: false },
      learning: { limit: 10, used: 0, remaining: 10, exhausted: false }
    }
  });

  assert.equal(bootstrap.usage?.summary?.totalEvents, 3);
  assert.equal(bootstrap.usage?.quotas?.execute.limit, 2);
  assert.equal(bootstrap.usage?.quotas?.execute.exhausted, true);
  assert.equal(bootstrap.usage?.quotas?.['marketplace-install'].remaining, 2);
  assert.equal(bootstrap.usage?.creditsRemaining, 7);
});

test('createProfileLibrarySyncManifest creates deterministic hosted sync assets', () => {
  const manifest = createProfileLibrarySyncManifest({
    accountId: 'acct-1',
    workspaceId: 'workspace-1',
    entitlements: ['free.local', 'pro.creator'],
    generatedAt: '2026-04-12T06:00:00.000Z',
    profiles: [
      {
        ...profile,
        id: 'profile-z',
        brandName: 'Zeta Signal',
        version: '7',
        updatedAt: '2026-04-12T05:00:00.000Z'
      }
    ],
    templatePacks: [
      {
        id: 'pack-a',
        name: 'Artist Pack',
        templates: { generic: { prefix: 'artist:' } },
        version: '2',
        updatedAt: '2026-04-11T22:00:00.000Z'
      }
    ]
  });

  assert.equal(manifest.manifestVersion, '1');
  assert.equal(manifest.cursor, '2026-04-12T06:00:00.000Z:2');
  assert.deepEqual(manifest.entitlements, ['free.local', 'pro.creator']);
  assert.deepEqual(
    manifest.assets.map((asset) => [asset.assetType, asset.assetId]),
    [
      ['brand-profile', 'profile-z'],
      ['template-pack', 'pack-a']
    ]
  );
  assert.equal(manifest.assets.every((asset) => asset.workspaceScoped), true);
  assert.equal(manifest.assets.every((asset) => asset.checksum.length === 64), true);
});

test('createAutomationJobEnvelope derives required feature and deterministic job id', () => {
  const job = createAutomationJobEnvelope({
    jobType: 'compile-batch',
    accountId: 'acct-batch',
    workspaceId: 'workspace-1',
    createdAt: '2026-04-12T06:15:00.000Z',
    creditsRequested: 3,
    inputSummary: { bundleCount: 5, target: 'youtube' }
  });

  assert.equal(job.status, 'queued');
  assert.equal(job.requiredFeature, 'compute.batch');
  assert.equal(job.creditsReserved, 3);
  assert.ok(job.jobId.startsWith('job-compile-batch-'));
  assert.deepEqual(job.inputSummary, { bundleCount: 5, target: 'youtube' });
});

test('upsertHostedProfileLibraryDocument merges by asset id and preserves deterministic order', () => {
  const first = upsertHostedProfileLibraryDocument(undefined, {
    accountId: 'acct-1',
    workspaceId: 'workspace-1',
    updatedAt: '2026-04-12T07:00:00.000Z',
    profiles: [
      { ...profile, id: 'profile-b', brandName: 'Beta', version: '1' },
      { ...profile, id: 'profile-a', brandName: 'Alpha', version: '1' }
    ],
    templatePacks: [
      {
        id: 'pack-b',
        name: 'Pack B',
        templates: { generic: { prefix: 'b' } },
        version: '1'
      }
    ]
  });

  const second = upsertHostedProfileLibraryDocument(first, {
    accountId: 'acct-1',
    workspaceId: 'workspace-1',
    updatedAt: '2026-04-12T08:00:00.000Z',
    profiles: [{ ...profile, id: 'profile-a', brandName: 'Alpha Updated', version: '2' }],
    templatePacks: [
      {
        id: 'pack-a',
        name: 'Pack A',
        templates: { generic: { prefix: 'a' } },
        version: '1'
      }
    ]
  });

  assert.equal(second.documentVersion, '1');
  assert.equal(second.updatedAt, '2026-04-12T08:00:00.000Z');
  assert.deepEqual(second.profiles.map((item) => item.id), ['profile-a', 'profile-b']);
  assert.equal(second.profiles[0].brandName, 'Alpha Updated');
  assert.deepEqual(second.templatePacks.map((item) => item.id), ['pack-a', 'pack-b']);
});
