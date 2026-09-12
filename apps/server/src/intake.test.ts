import { beforeEach, afterEach, mock } from 'node:test';
import { smartDecomposer, ruleDecomposer } from './discovery/decompose';
beforeEach(() => { mock.method(smartDecomposer, 'decompose', ruleDecomposer.decompose); });
afterEach(() => mock.restoreAll());
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState } from '@fitoutagent/shared';
import { transition } from './workflow';
import { compositeDiscovery } from './discovery/composite';
import { mockDiscovery } from './mock-tools';
const emit = async () => {};

test('prompt-only apartment draft preserves unknown constraints and defers search', async (t) => {
  t.mock.method(compositeDiscovery, 'discover', mockDiscovery.discover);
  const s = initialState('apartment');
  await transition(s, { type: 'start', draft: {
    goal: 'Furnish an 800 sqft 2br apt for 2 people. We already have a sofa.',
    budget: null, deadline: null, owned: [],
  } }, emit);
  assert.equal(s.phase, 'checklist');
  assert.equal(s.offers.length, 0);
  assert.equal(s.requirements!.budget, null);
  assert.equal(s.requirements!.deadline, null);
  assert.equal(s.requirements!.items.find(i => i.id === 'bed')?.quantity, 2);
  assert.ok(!s.requirements!.items.some(i => i.id === 'sofa'));
  const items = s.requirements!.items.filter(i => i.id !== 'coffee-table').map(i => i.id === 'bed' ? { ...i, quantity: 1 } : i);
  await transition(s, { type: 'confirm-checklist', items, budget: 500000, deadline: null }, emit);
  assert.equal(s.phase, 'compare');
  assert.equal(s.requirements!.items.find(i => i.id === 'bed')?.quantity, 1);
  assert.ok(!s.offers.some(o => o.checklistItemId === 'coffee-table'));
  assert.ok(!s.plans[0].issues.some(i => i.includes('delivery')));
});


test('failed product search returns to an editable checklist', async (t) => {
  t.mock.method(compositeDiscovery, 'discover', async () => { throw new Error('Catalog unavailable'); });
  const s = initialState('retry-intake');
  await transition(s, { type: 'start', draft: { goal: 'Furnish a 2-bedroom apartment for a couple', budget: null, deadline: null, owned: [] } }, emit);
  assert.equal(s.requirements!.items.find(i => i.id === 'bed')?.quantity, 1);
  await assert.rejects(transition(s, { type: 'confirm-checklist', budget: 300000 }, emit), /Catalog unavailable/);
  assert.equal(s.phase, 'checklist');
  assert.equal(s.requirements!.budget, 300000);
  assert.equal(s.offers.length, 0);
});

for (const initialBudget of [null, 300000]) {
  test(`manual search accepts no budget and clears an existing ${initialBudget} limit`, async (t) => {
    t.mock.method(compositeDiscovery, 'discover', mockDiscovery.discover);
    const s = initialState('optional-budget');
    await transition(s, { type: 'start', draft: { goal: 'desk', budget: initialBudget, deadline: null, owned: [] } }, emit);
    await transition(s, { type: 'confirm-checklist', budget: null }, emit);
    assert.equal(s.phase, 'compare');
    assert.equal(s.requirements!.budget, null);
    assert.equal(s.draft!.budget, null);
    assert.ok(s.plans.length > 0);
    assert.ok(s.plans.every(plan => !plan.issues.some(issue => /budget/i.test(issue))));
  });
}
