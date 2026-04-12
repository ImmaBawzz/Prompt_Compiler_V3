/**
 * Phase 20 — API Input Validation Tests
 *
 * Verifies that the schema-based validators exported from @prompt-compiler/schemas
 * reject malformed inputs and accept valid inputs at critical API boundaries.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateBrief,
  validateProfile,
  validateExecutionRequest,
  validateFeedbackInput,
  schemaPaths
} from '@prompt-compiler/schemas';

// ---------------------------------------------------------------------------
// schemaPaths export
// ---------------------------------------------------------------------------

describe('schemaPaths', () => {
  test('exports well-known path constants', () => {
    assert.ok(schemaPaths.promptBrief.endsWith('prompt-brief.schema.json'));
    assert.ok(schemaPaths.brandProfile.endsWith('brand-profile.schema.json'));
    assert.ok(schemaPaths.automationJob.endsWith('automation-job.schema.json'));
  });
});

// ---------------------------------------------------------------------------
// validateBrief
// ---------------------------------------------------------------------------

describe('validateBrief', () => {
  const validBrief = {
    id: 'test-brief',
    title: 'My Brief',
    concept: 'A concept',
    targets: ['suno'],
    genres: ['cinematic'],
    mood: ['dark']
  };

  test('accepts a complete valid brief', () => {
    const result = validateBrief(validBrief);
    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
  });

  test('rejects a brief missing required id', () => {
    const bad = { ...validBrief, id: undefined };
    const result = validateBrief(bad);
    assert.equal(result.valid, false);
    assert.ok(result.errors.length > 0);
    assert.ok(result.errors.some((e) => e.includes('id') || e.includes("must have required property")));
  });

  test('rejects a brief with empty targets array', () => {
    const bad = { ...validBrief, targets: [] };
    const result = validateBrief(bad);
    assert.equal(result.valid, false);
    assert.ok(result.errors.length > 0);
  });

  test('rejects a brief when targets is not an array', () => {
    const bad = { ...validBrief, targets: 'suno' };
    const result = validateBrief(bad);
    assert.equal(result.valid, false);
  });

  test('rejects missing concept', () => {
    const { concept: _omit, ...rest } = validBrief;
    const result = validateBrief(rest);
    assert.equal(result.valid, false);
  });

  test('rejects non-object input', () => {
    const result = validateBrief('not-an-object');
    assert.equal(result.valid, false);
  });

  test('rejects null', () => {
    const result = validateBrief(null);
    assert.equal(result.valid, false);
  });

  test('accepts brief with optional energy field in range', () => {
    const result = validateBrief({ ...validBrief, energy: 7 });
    assert.equal(result.valid, true);
  });

  test('rejects brief with energy out of range', () => {
    const result = validateBrief({ ...validBrief, energy: 11 });
    assert.equal(result.valid, false);
  });
});

// ---------------------------------------------------------------------------
// validateProfile
// ---------------------------------------------------------------------------

describe('validateProfile', () => {
  const validProfile = {
    id: 'test-profile',
    brandName: 'Test Brand',
    voice: 'cinematic and dark'
  };

  test('accepts a complete valid profile', () => {
    const result = validateProfile(validProfile);
    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
  });

  test('rejects a profile missing brandName', () => {
    const { brandName: _omit, ...rest } = validProfile;
    const result = validateProfile(rest);
    assert.equal(result.valid, false);
    assert.ok(result.errors.length > 0);
  });

  test('rejects a profile missing voice', () => {
    const { voice: _omit, ...rest } = validProfile;
    const result = validateProfile(rest);
    assert.equal(result.valid, false);
  });

  test('rejects null', () => {
    const result = validateProfile(null);
    assert.equal(result.valid, false);
  });

  test('accepts profile with optional signatureMotifs', () => {
    const result = validateProfile({ ...validProfile, signatureMotifs: ['dark', 'cinematic'] });
    assert.equal(result.valid, true);
  });
});

// ---------------------------------------------------------------------------
// validateExecutionRequest
// ---------------------------------------------------------------------------

describe('validateExecutionRequest', () => {
  const validRequest = {
    content: 'A well-formed prompt.',
    target: 'suno',
    bundleId: 'bundle-123',
    profileId: 'profile-456',
    provider: { id: 'p1', type: 'dry-run' }
  };

  test('accepts a valid dry-run execution request', () => {
    const result = validateExecutionRequest(validRequest);
    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
  });

  test('accepts a valid openai-compatible execution request', () => {
    const result = validateExecutionRequest({
      ...validRequest,
      provider: { id: 'p2', type: 'openai-compatible', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' }
    });
    assert.equal(result.valid, true);
  });

  test('rejects a request missing content', () => {
    const { content: _omit, ...rest } = validRequest;
    const result = validateExecutionRequest(rest);
    assert.equal(result.valid, false);
    assert.ok(result.errors.length > 0);
  });

  test('rejects a request with empty-string content', () => {
    const result = validateExecutionRequest({ ...validRequest, content: '' });
    assert.equal(result.valid, false);
  });

  test('rejects a request missing provider', () => {
    const { provider: _omit, ...rest } = validRequest;
    const result = validateExecutionRequest(rest);
    assert.equal(result.valid, false);
  });

  test('rejects a provider with invalid type enum', () => {
    const result = validateExecutionRequest({
      ...validRequest,
      provider: { id: 'p3', type: 'unknown-type' }
    });
    assert.equal(result.valid, false);
  });

  test('rejects an invalid target enum value', () => {
    const result = validateExecutionRequest({ ...validRequest, target: 'not-a-target' });
    assert.equal(result.valid, false);
  });

  test('rejects temperature out of range', () => {
    const result = validateExecutionRequest({ ...validRequest, temperature: 3 });
    assert.equal(result.valid, false);
  });

  test('accepts execution policy with timeout/retry fields', () => {
    const result = validateExecutionRequest({
      ...validRequest,
      policy: {
        timeoutMs: 15000,
        maxRetries: 2,
        retryDelayMs: 300
      }
    });
    assert.equal(result.valid, true);
  });

  test('rejects execution policy with invalid negative timeout', () => {
    const result = validateExecutionRequest({
      ...validRequest,
      policy: {
        timeoutMs: -1
      }
    });
    assert.equal(result.valid, false);
  });
});

// ---------------------------------------------------------------------------
// validateFeedbackInput
// ---------------------------------------------------------------------------

describe('validateFeedbackInput', () => {
  const now = new Date().toISOString();
  const validFeedback = {
    feedbackId: 'fb-001',
    bundleId: 'bundle-123',
    profileId: 'profile-456',
    target: 'suno',
    score: 4,
    createdAt: now
  };

  test('accepts a complete valid feedback record', () => {
    const result = validateFeedbackInput(validFeedback);
    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
  });

  test('rejects feedback with score below minimum (1)', () => {
    const result = validateFeedbackInput({ ...validFeedback, score: 0 });
    assert.equal(result.valid, false);
  });

  test('rejects feedback with score above maximum (5)', () => {
    const result = validateFeedbackInput({ ...validFeedback, score: 6 });
    assert.equal(result.valid, false);
  });

  test('rejects feedback with non-integer score', () => {
    const result = validateFeedbackInput({ ...validFeedback, score: 3.5 });
    assert.equal(result.valid, false);
  });

  test('rejects feedback with invalid target', () => {
    const result = validateFeedbackInput({ ...validFeedback, target: 'unknown-target' });
    assert.equal(result.valid, false);
  });

  test('rejects feedback missing bundleId', () => {
    const { bundleId: _omit, ...rest } = validFeedback;
    const result = validateFeedbackInput(rest);
    assert.equal(result.valid, false);
  });

  test('accepts feedback with optional notes and acceptedAt', () => {
    const result = validateFeedbackInput({
      ...validFeedback,
      notes: 'Great output!',
      acceptedAt: now
    });
    assert.equal(result.valid, true);
  });
});

// ---------------------------------------------------------------------------
// Integration smoke: API /compile route rejects invalid brief via HTTP
// ---------------------------------------------------------------------------

describe('API /compile schema validation integration', () => {
  test('POST /compile with missing brief required fields returns 400 VALIDATION_ERROR', async () => {
    const { createServer } = await import('../server.js');
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address() as { port: number };
    const port = address.port;

    try {
      const body = JSON.stringify({
        brief: { id: '', title: '', concept: 'ok', targets: ['suno'], genres: ['g'], mood: ['m'] },
        profile: { id: 'p', brandName: 'Brand', voice: 'dark' }
      });

      const response = await fetch(`http://localhost:${port}/compile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body
      });

      // id and title are empty strings which violate minLength — schema rejects
      // (the server may catch as 400 or 422 — either satisfies the contract)
      assert.ok(
        response.status === 400 || response.status === 422,
        `Expected 400 or 422, got ${response.status}`
      );
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  test('POST /compile with valid brief and profile returns 200', async () => {
    const { createServer } = await import('../server.js');
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address() as { port: number };
    const port = address.port;

    try {
      const body = JSON.stringify({
        brief: {
          id: 'test-brief',
          title: 'My Brief',
          concept: 'A high-energy cinematic concept',
          targets: ['suno'],
          genres: ['cinematic'],
          mood: ['dark', 'intense']
        },
        profile: { id: 'p1', brandName: 'Test Brand', voice: 'cinematic and dark' }
      });

      const response = await fetch(`http://localhost:${port}/compile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body
      });

      assert.equal(response.status, 200);
      const data = await response.json() as { ok: boolean };
      assert.equal(data.ok, true);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  test('POST /execute with invalid provider type returns 400 VALIDATION_ERROR', async () => {
    const { createServer } = await import('../server.js');
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address() as { port: number };
    const port = address.port;

    try {
      const body = JSON.stringify({
        content: 'A prompt',
        target: 'suno',
        bundleId: 'b1',
        profileId: 'p1',
        provider: { id: 'prov', type: 'invalid-enum-value' }
      });

      const response = await fetch(`http://localhost:${port}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body
      });

      assert.equal(response.status, 400, `Expected 400 got ${response.status}`);
      const data = await response.json() as { ok: boolean; error?: { code: string } };
      assert.equal(data.ok, false);
      assert.equal(data.error?.code, 'VALIDATION_ERROR');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  test('POST /feedback with out-of-range score returns 400', async () => {
    const { createServer } = await import('../server.js');
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address() as { port: number };
    const port = address.port;

    try {
      const body = JSON.stringify({
        bundleId: 'b1',
        profileId: 'p1',
        target: 'suno',
        score: 9           // out of valid range 1-5
      });

      const response = await fetch(`http://localhost:${port}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body
      });

      assert.equal(response.status, 400, `Expected 400, got ${response.status}`);
      const data = await response.json() as { ok: boolean; error?: { code: string } };
      assert.equal(data.ok, false);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
