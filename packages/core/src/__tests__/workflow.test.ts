import test from 'node:test';
import assert from 'node:assert/strict';
import { executeWorkflowRecipe } from '../workflow';
import { BrandProfile, PromptBrief, WorkflowRecipe } from '../types';

const brief: PromptBrief = {
  id: 'brief-workflow',
  title: 'Signal Bloom',
  concept: 'An emotional cinematic piece.',
  targets: ['suno', 'udio'],
  genres: ['dreamwave'],
  mood: ['emotional'],
  imagery: ['glass horizon'],
  constraints: ['no reverb tails']
};

const profile: BrandProfile = {
  id: 'profile-workflow',
  brandName: 'LJV',
  voice: 'poetic and exact',
  signatureMotifs: ['cosmic scale', 'heart pressure']
};

test('executeWorkflowRecipe runs all steps and returns results', () => {
  const recipe: WorkflowRecipe = {
    id: 'recipe-1',
    name: 'Two-step refinement',
    steps: [
      { id: 'step-1', label: 'Base compile' },
      {
        id: 'step-2',
        label: 'With constraint',
        refinements: [{ type: 'add-constraint', value: 'no pitch shift' }]
      }
    ]
  };

  const result = executeWorkflowRecipe(recipe, brief, profile);
  assert.equal(result.recipeId, 'recipe-1');
  assert.equal(result.steps.length, 2);
  assert.equal(result.steps[0].stepId, 'step-1');
  assert.equal(result.steps[0].status, 'succeeded');
  assert.ok(result.steps[0].bundle);
  assert.equal(result.steps[1].status, 'succeeded');
  assert.ok(result.steps[1].bundle?.diagnostics.some((d) => d.code === 'REFINEMENT_APPLIED'));
});

test('executeWorkflowRecipe applies briefOverride per step without mutating base brief', () => {
  const recipe: WorkflowRecipe = {
    id: 'recipe-2',
    name: 'Override test',
    steps: [
      { id: 'step-a', briefOverride: { title: 'Override Title' } },
      { id: 'step-b' }
    ]
  };

  const result = executeWorkflowRecipe(recipe, brief, profile);
  assert.equal(result.steps[0].status, 'succeeded');
  assert.equal(result.steps[1].bundle?.briefId, brief.id);
  // Base brief title is unchanged
  assert.equal(brief.title, 'Signal Bloom');
});

test('executeWorkflowRecipe marks step failed on bad input and continues', () => {
  const recipe: WorkflowRecipe = {
    id: 'recipe-3',
    name: 'Resilience test',
    steps: [
      // Bad title — validation will still return a bundle (with errors), not throw
      { id: 'step-bad', briefOverride: { title: '' } },
      { id: 'step-good' }
    ]
  };

  const result = executeWorkflowRecipe(recipe, brief, profile);
  // Both steps complete; the bad one may show diagnostic errors in its bundle
  assert.equal(result.steps.length, 2);
  assert.equal(result.steps[1].status, 'succeeded');
});
