import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, Requirements, Offer } from '@fitoutagent/shared';
import { transition } from './workflow';
import { compare } from './planning';

function setup() {
  const s = initialState('editable');
  s.requirements = Requirements.parse({ goal: 'office', budget: 50000, items: [
    { id: 'desk', label: 'Desk', query: 'desk', quantity: 2 },
    { id: 'chair', label: 'Chair', query: 'chair', quantity: 1 },
  ] });
  s.offers = ['desk', 'chair', 'alternative'].map(id => Offer.parse({ id, checklistItemId: id === 'alternative' ? 'desk' : id, name: id, retailer: 'Shopify', nativeId: id, price: 10000, shipping: 0, tax: 0, url: null, arrival: null, available: true }));
  s.selected = ['desk', 'chair']; s.locks = ['chair'];
  compare(s); s.approved = 'essential'; s.phase = 'complete';
  s.attempts = { Shopify: 1 };
  s.baskets = [{ id: 'old', retailer: 'Shopify', verified: true, mock: false, lines: [], checkoutUrl: 'https://example.com/old' }];
  return s;
}
const emit = async () => {};
const decision = { type: 'replace-basket-product' as const, productId: 'desk', replacementId: 'alternative' };

test('completed basket replacement preserves other choices, clears stale links and can be prepared again', async () => {
  const s = setup();
  await transition(s, decision, emit);
  assert.deepEqual(s.selected, ['alternative', 'chair']);
  assert.deepEqual(s.locks, ['chair']);
  assert.equal(s.approved, null);
  assert.deepEqual(s.baskets, []);
  assert.deepEqual(s.attempts, {});
  assert.equal(s.plans[0].subtotal, 30000);
  await transition(s, { type: 'approve', planId: 'essential' }, emit);
  assert.ok(s.pending?.lines.some(line => line.id === 'alternative' && line.quantity === 2));
  assert.ok(!s.pending?.lines.some(line => line.id === 'desk'));
});

test('invalid replacements and pending work leave the approved basket intact', async () => {
  for (const reason of ['unavailable', 'fit', 'category', 'unknown', 'pending', 'paused']) {
    const s = setup();
    if (reason === 'unavailable') s.offers[2].available = false;
    if (reason === 'fit') s.offers[2].fit = { status: 'rejected', summary: 'Wrong product', checks: [], assessedAt: '2026-09-12T00:00:00Z' };
    if (reason === 'category') s.offers[2].checklistItemId = 'chair';
    if (reason === 'pending') s.pending = { id: 'pending', retailer: 'Shopify', operation: 'prepare-and-verify', lines: [] };
    if (reason === 'paused') s.paused = true;
    const before = structuredClone(s);
    await assert.rejects(transition(s, { ...decision, replacementId: reason === 'unknown' ? 'missing' : 'alternative' }, emit));
    assert.deepEqual(s, before);
  }
});

test('basket quantity edits clear stale carts and prepare the exact new quantity', async () => {
  const s = setup();
  await transition(s, { type: 'edit-basket-item', productId: 'desk', quantity: 3 }, emit);
  assert.equal(s.plans[0].subtotal, 40000);
  assert.deepEqual(s.selected, ['desk', 'chair']);
  assert.equal(s.approved, null);
  assert.deepEqual(s.baskets, []);
  await transition(s, { type: 'approve', planId: 'essential' }, emit);
  assert.equal(s.pending?.lines.find(line => line.id === 'desk')?.quantity, 3);
});

test('remove every item without repopulating and restore the exact pick', async () => {
  const s = setup();
  for (const productId of ['desk', 'chair']) await transition(s, { type: 'edit-basket-item', productId, quantity: 0 }, emit);
  assert.deepEqual(s.selected, []);
  assert.equal(s.plans[0].subtotal, 0);
  assert.deepEqual(s.locks, []);
  assert.deepEqual(s.removedBasketProducts, ['desk', 'chair']);
  await transition(s, { type: 'edit-basket-item', productId: 'desk', quantity: 2 }, emit);
  assert.deepEqual(s.selected, ['desk']);
  assert.deepEqual(s.skippedItemIds, ['chair']);
  assert.equal(s.plans[0].subtotal, 20000);
});

test('invalid basket edits preserve the original state', async () => {
  for (const quantity of [-1, 21, 1.5, NaN]) {
    const s = setup(); const before = structuredClone(s);
    await assert.rejects(transition(s, { type: 'edit-basket-item', productId: 'desk', quantity }, emit));
    assert.deepEqual(s, before);
  }
  const s = setup();
  s.pending = { id: 'busy', retailer: 'Shopify', operation: 'prepare-and-verify', lines: [] };
  const before = structuredClone(s);
  await assert.rejects(transition(s, { type: 'edit-basket-item', productId: 'desk', quantity: 0 }, emit));
  assert.deepEqual(s, before);
});

test('reopening a completed basket preserves picks and allows shopping again', async () => {
  const s = setup();
  await transition(s, { type: 'reopen-basket' }, emit);
  assert.deepEqual(s.selected, ['desk', 'chair']);
  assert.deepEqual(s.locks, ['chair']);
  assert.equal(s.phase, 'compare');
  assert.equal(s.approved, null);
  assert.deepEqual(s.baskets, []);
  await transition(s, { type: 'select', productId: 'alternative' }, emit);
  assert.ok(s.selected.includes('alternative'));
});

test('an empty basket cannot prepare checkout links', async () => {
  const s = setup();
  for (const productId of ['desk', 'chair']) await transition(s, { type: 'edit-basket-item', productId, quantity: 0 }, emit);
  await assert.rejects(transition(s, { type: 'approve', planId: 'essential' }, emit), /Add an item/);
  assert.equal(s.pending, null);
});

test('explicit replacement transfers a locked pick and preserves quantity and other locks', async () => {
  const s = setup();
  s.locks.push('desk');
  await transition(s, decision, emit);
  assert.deepEqual(s.selected, ['alternative', 'chair']);
  assert.deepEqual(s.locks, ['chair', 'alternative']);
  assert.equal(s.requirements!.items[0].quantity, 2);
  assert.deepEqual(s.baskets, []);
  await transition(s, { type: 'approve', planId: 'essential' }, emit);
  assert.equal(s.pending?.lines.find(line => line.id === 'alternative')?.quantity, 2);
});
