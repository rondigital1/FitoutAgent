import { test } from 'node:test';
import assert from 'node:assert/strict';
import { restoreState, initialState, type Requirements } from '@settlein/shared';
import { transition } from './workflow';
import { smartDecomposer, ruleDecomposer } from './discovery/decompose';
import { compositeDiscovery } from './discovery/composite';
import { mockDiscovery } from './mock-tools';
import { verifyLinkHandoff } from './cart/link-handoff';

const emit = async () => {};
const draft = { goal: 'office for two', budget: 500000, deadline: null, owned: [] };

test('legacy snapshots missing collections restore without dropping a valid checklist', () => {
  const s = restoreState('legacy', { phase: 'checklist', requirements: { ...draft, items: [{ id: 'desk', label: 'Desk', query: 'desk', quantity: 1, must: true }] } });
  assert.equal(s.requirements?.items[0].label, 'Desk');
  assert.deepEqual(s.discoverySources, []);
  assert.deepEqual(s.suggestions, []);
  assert.equal(s.draft?.goal, draft.goal);
  assert.deepEqual(restoreState('legacy', { discoverySources: null }).discoverySources, []);
});

test('edit prompt, edit list, select products, prepare all links, then edit again', async (t) => {
  t.mock.method(smartDecomposer, 'decompose', ruleDecomposer.decompose);
  t.mock.method(compositeDiscovery, 'discover', async (r: Requirements) => (await mockDiscovery.discover(r)).map(o => ({ ...o, id: `Shopify:${o.id}`, retailer: 'Shopify' as const, url: `https://example.com/products/${o.id}` })));
  const s = initialState('full-recovery');
  await transition(s, { type: 'start', draft }, emit);
  await transition(s, { type: 'revise-goal', draft: { ...draft, goal: 'office with a desk' } }, emit);
  await transition(s, { type: 'confirm-checklist' }, emit);
  const alternative = s.offers.find(o => o.checklistItemId === s.requirements!.items[0].id && !s.selected.includes(o.id))!;
  await transition(s, { type: 'select', productId: alternative.id }, emit);
  assert.ok(s.selected.includes(alternative.id));
  await transition(s, { type: 'approve', planId: 'essential' }, emit);
  while (s.pending) {
    const result = verifyLinkHandoff(s.pending, s.offers);
    assert.ok(result.verified);
    assert.ok(result.lines.every(l => l.owner === 'settlein'));
    assert.equal(result.checkoutUrl, undefined);
    await transition(s, { type: 'cart-result', result }, emit);
  }
  assert.equal(s.phase, 'complete');
  await transition(s, { type: 'edit-checklist' }, emit);
  assert.equal(s.phase, 'checklist');
  assert.equal(s.approved, null);
  assert.equal(s.baskets.length, 0);
});
