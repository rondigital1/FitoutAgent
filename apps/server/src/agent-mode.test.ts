import { test, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { Decision, initialState, restoreState, type Requirements } from '@settlein/shared';
import { smartDecomposer, ruleDecomposer } from './discovery/decompose';
import { compositeDiscovery } from './discovery/composite';
import { mockDiscovery } from './mock-tools';
import { transition } from './workflow';

afterEach(() => mock.restoreAll());
const emit = async () => {};
function fixtures() {
  mock.method(smartDecomposer, 'decompose', ruleDecomposer.decompose);
  return mock.method(compositeDiscovery, 'discover', async (requirements: Requirements) =>
    (await mockDiscovery.discover(requirements)).map(o => ({ ...o, id: `Shopify:${o.id}`, available: true })));
}
const start = (goal = 'office under $1500') => Decision.parse({ type: 'start', draft: { goal, selectionMode: 'agent' } });

test('agent path searches every line and automatically prepares the restored basket', async () => {
  const search = fixtures();
  const s = initialState('agent');
  await transition(s, start(), emit);
  assert.equal(search.mock.callCount(), 1);
  assert.equal(s.phase, 'prepare');
  assert.equal(s.selected.length, s.requirements!.items.length);
  assert.equal(s.approved, s.plans[0].id);
  assert.ok(s.pending);
  const restored = restoreState(s.id, JSON.parse(JSON.stringify(s)));
  assert.equal(restored.draft?.selectionMode, 'agent');
  assert.deepEqual(restored.selected, s.selected);
  s.pending = null;
  await transition(s, Decision.parse({ type: 'revise-goal', draft: { goal: 'camping under $1000', selectionMode: 'manual' } }), emit);
  assert.equal(s.phase, 'checklist');
  assert.equal(s.selected.length, 0);
  assert.equal(search.mock.callCount(), 1);
});

test('agent searches without a budget instead of interrupting for one', async () => {
  const search = fixtures();
  const s = initialState('budget');
  await transition(s, start('office'), emit);
  assert.equal(search.mock.callCount(), 1);
  assert.equal(s.requirements!.budget, null);
  assert.equal(s.phase, 'prepare');
  assert.ok(s.pending);
});

test('agent retries missing categories and never prepares an incomplete basket', async () => {
  fixtures();
  const search = mock.method(compositeDiscovery, 'discover', async () => []);
  const s = initialState('missing');
  await transition(s, start(), emit);
  assert.equal(search.mock.callCount(), 2);
  assert.equal(s.phase, 'compare');
  assert.equal(s.approved, null);
  assert.equal(s.pending, null);
  assert.ok(s.plans[0].issues.some(issue => issue.startsWith('Missing ')));
});

test('agent does not prepare an over-budget basket', async () => {
  fixtures();
  const s = initialState('over-budget');
  await transition(s, start('office under $1'), emit);
  assert.equal(s.phase, 'compare');
  assert.equal(s.pending, null);
  assert.ok(s.plans[0].issues.includes('Over budget'));
});

test('agent discovery failure persists an editable list that can be retried', async () => {
  fixtures();
  const search = mock.method(compositeDiscovery, 'discover', async () => { throw new Error('Catalog unavailable'); });
  const s = initialState('failure');
  await assert.rejects(transition(s, start(), emit), /Catalog unavailable/);
  assert.equal(s.phase, 'checklist');
  assert.equal(s.draft?.selectionMode, 'agent');
  assert.equal(s.requirements!.budget, 150000);
  assert.deepEqual(s.plans, []);
  search.mock.restore();
  await transition(s, { type: 'confirm-checklist' }, emit);
  assert.equal(s.phase, 'prepare');
});

test('old drafts use the manual path and invalid mode values are rejected', async () => {
  const search = fixtures();
  const s = initialState('legacy');
  await transition(s, Decision.parse({ type: 'start', draft: { goal: 'office under $1500' } }), emit);
  assert.equal(s.phase, 'checklist');
  assert.equal(search.mock.callCount(), 0);
  assert.equal(Decision.safeParse({ type: 'start', draft: { goal: 'office', selectionMode: 'other' } }).success, false);
});

test('agent retries a failed link preparation once and then stops', async () => {
  fixtures();
  const s = initialState('link-retry');
  await transition(s, start(), emit);
  const fail = async () => {
    const request = s.pending!;
    await transition(s, { type: 'cart-result', result: {
      id: request.id, retailer: request.retailer, mock: false, verified: false, lines: [], error: 'Temporary failure',
    } }, emit);
  };
  await fail();
  assert.ok(s.pending);
  await fail();
  assert.equal(s.pending, null);
  assert.equal(s.phase, 'verify');
});
