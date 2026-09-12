import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, GoalDraft, restoreState } from '@fitoutagent/shared';
import { promptImprover } from './discovery/improve-prompt';
import { transition } from './workflow';

test('start over persists a reviewable prompt without running discovery', async t => {
  const s = initialState('restart');
  s.draft = GoalDraft.parse({ goal: 'office under $1500', selectionMode: 'agent' });
  s.phase = 'complete'; s.approved = 'essential'; s.revision = 7;
  t.mock.method(promptImprover, 'improve', async () => ({ prompt: 'Furnish an office under $1500 with suitable desks and chairs.', rationale: 'test' }));
  await transition(s, { type: 'start-over' }, async () => {});
  const saved = restoreState(s.id, JSON.parse(JSON.stringify(s)));
  assert.equal(saved.phase, 'idle');
  assert.equal(saved.draft?.goal, 'Furnish an office under $1500 with suitable desks and chairs.');
  assert.equal(saved.draft?.selectionMode, 'agent');
  assert.equal(saved.revision, 7);
  assert.deepEqual(saved.offers, []);
  assert.equal(saved.approved, null);
});

test('failed improvement leaves the current project intact', async t => {
  const s = initialState('restart'); s.draft = GoalDraft.parse({ goal: 'office' });
  const original = structuredClone(s);
  t.mock.method(promptImprover, 'improve', async () => { throw new Error('unavailable'); });
  await assert.rejects(transition(s, { type: 'start-over' }, async () => {}));
  assert.deepEqual(s, original);
});
