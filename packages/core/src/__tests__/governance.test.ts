import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isWorkspaceRole,
  canWrite,
  canAdmin,
  meetsMinRole,
  WORKSPACE_ROLE_VALUES
} from '../governance';

test('isWorkspaceRole: valid role values return true', () => {
  assert.equal(isWorkspaceRole('owner'), true);
  assert.equal(isWorkspaceRole('editor'), true);
  assert.equal(isWorkspaceRole('viewer'), true);
});

test('isWorkspaceRole: invalid values return false', () => {
  assert.equal(isWorkspaceRole('admin'), false);
  assert.equal(isWorkspaceRole(''), false);
  assert.equal(isWorkspaceRole(null), false);
  assert.equal(isWorkspaceRole(undefined), false);
  assert.equal(isWorkspaceRole(42), false);
});

test('WORKSPACE_ROLE_VALUES contains all three roles', () => {
  assert.deepEqual([...WORKSPACE_ROLE_VALUES].sort(), ['editor', 'owner', 'viewer']);
});

test('canWrite: owner and editor return true, viewer returns false', () => {
  assert.equal(canWrite('owner'), true);
  assert.equal(canWrite('editor'), true);
  assert.equal(canWrite('viewer'), false);
});

test('canAdmin: only owner returns true', () => {
  assert.equal(canAdmin('owner'), true);
  assert.equal(canAdmin('editor'), false);
  assert.equal(canAdmin('viewer'), false);
});

test('meetsMinRole: same role always meets itself', () => {
  assert.equal(meetsMinRole('owner', 'owner'), true);
  assert.equal(meetsMinRole('editor', 'editor'), true);
  assert.equal(meetsMinRole('viewer', 'viewer'), true);
});

test('meetsMinRole: higher role meets lower minimum', () => {
  assert.equal(meetsMinRole('owner', 'editor'), true);
  assert.equal(meetsMinRole('owner', 'viewer'), true);
  assert.equal(meetsMinRole('editor', 'viewer'), true);
});

test('meetsMinRole: lower role does not meet higher minimum', () => {
  assert.equal(meetsMinRole('viewer', 'editor'), false);
  assert.equal(meetsMinRole('viewer', 'owner'), false);
  assert.equal(meetsMinRole('editor', 'owner'), false);
});
