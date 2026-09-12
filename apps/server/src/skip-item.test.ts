import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, restoreState, Requirements, Offer } from '@fitoutagent/shared';
import { transition } from './workflow';
import { compare } from './planning';

const emit = async () => {};
function setup() {
  const s = initialState('skip');
  s.phase = 'compare';
  s.requirements = Requirements.parse({ goal: 'office', budget: 50000, items: [
    { id: 'desk', label: 'Desk', query: 'desk', quantity: 2 },
    { id: 'chair', label: 'Chair', query: 'chair', quantity: 1 },
  ] });
  s.offers = [Offer.parse({ id: 'Shopify:desk', checklistItemId: 'desk', name: 'Desk', retailer: 'Shopify', nativeId: 'desk', url: 'https://example.com/desk', price: 10000, shipping: null, tax: null, arrival: null, available: true })];
  compare(s);
  return s;
}

test('skip persists, undo restores validation, and only found products reach the basket', async () => {
  let s = setup();
  await assert.rejects(transition(s, { type: 'approve', planId: 'essential' }, emit), /constraints/);
  await transition(s, { type: 'skip-item', checklistItemId: 'chair' }, emit);
  s = restoreState(s.id, JSON.parse(JSON.stringify(s)));
  assert.deepEqual(s.skippedItemIds, ['chair']);
  assert.ok(s.plans.every(plan => plan.issues.length === 0));
  assert.equal(s.plans[0].subtotal, 20000);
  await transition(s, { type: 'restore-item', checklistItemId: 'chair' }, emit);
  assert.ok(s.plans[0].issues.includes('Missing Chair'));
  await transition(s, { type: 'skip-item', checklistItemId: 'chair' }, emit);
  await transition(s, { type: 'approve', planId: 'essential' }, emit);
  assert.deepEqual(s.pending?.lines, [{ id: 'Shopify:desk', quantity: 2, owner: 'fitoutagent' }]);
  await assert.rejects(transition(s, { type: 'restore-item', checklistItemId: 'chair' }, emit), /before preparing/);
});

test('skip rejects products with offers and unknown categories, and cannot approve an empty basket', async () => {
  const s = setup();
  await assert.rejects(transition(s, { type: 'skip-item', checklistItemId: 'desk' }, emit), /no products/);
  await assert.rejects(transition(s, { type: 'skip-item', checklistItemId: 'unknown' }, emit), /Unknown/);
  s.offers = [];
  await transition(s, { type: 'skip-item', checklistItemId: 'desk' }, emit);
  await transition(s, { type: 'skip-item', checklistItemId: 'chair' }, emit);
  assert.ok(s.plans[0].issues.some(issue => issue.includes('at least one product')));
  await assert.rejects(transition(s, { type: 'approve', planId: 'essential' }, emit), /Add an item before preparing shopping links/);
});
