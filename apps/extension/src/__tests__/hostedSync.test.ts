import test from 'node:test';
import assert from 'node:assert/strict';
import { entitlementsForPlan, safeParseState } from '../hostedSync';

test('entitlementsForPlan returns deterministic capability sets', () => {
  assert.deepEqual(entitlementsForPlan('free'), ['free.local']);
  assert.deepEqual(entitlementsForPlan('pro'), ['free.local', 'pro.creator']);
  assert.deepEqual(entitlementsForPlan('studio'), ['free.local', 'pro.creator', 'studio.team']);
});

test('safeParseState returns typed payload when JSON is valid', () => {
  const parsed = safeParseState<{ id: string }>('{"id":"profile-1"}');
  assert.deepEqual(parsed, { id: 'profile-1' });
});

test('safeParseState returns undefined for invalid JSON', () => {
  const parsed = safeParseState<{ id: string }>('not-json');
  assert.equal(parsed, undefined);
});
