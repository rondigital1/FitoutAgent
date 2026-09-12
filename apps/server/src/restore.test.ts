import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, restoreState, type State } from '@settlein/shared';

/**
 * Every State key, populated with a non-default, schema-valid value.
 *
 * Typed `Required<State>` on purpose: adding a field to State — optional or not —
 * breaks compilation here until it is represented, and the round-trip test below
 * then fails until restoreState() carries it. restoreState is a hand-maintained
 * allowlist, so without this pair a new field is silently dropped on every load
 * and on every STATE_SNAPSHOT the panel receives.
 */
const FULL: Required<State> = {
  id: 'thread-1',
  revision: 7,
  draft: {
    selectionMode: 'agent',
    goal: 'Furnish a studio',
    budget: 250000,
    deadline: '2026-01-15',
    zip: '94110',
    owned: ['sofa'],
  },
  requirements: {
    selectionMode: 'agent',
    goal: 'Furnish a studio',
    budget: 250000,
    deadline: '2026-01-15',
    zip: '94110',
    owned: ['sofa'],
    items: [{ id: 'desk', label: 'Desk', query: 'standing desk', quantity: 2, must: true, room: 'office' }],
  },
  suggestions: [{ id: 'lamp', label: 'Lamp', query: 'desk lamp', reason: 'Task lighting', defaultQty: 1 }],
  phase: 'compare',
  paused: true,
  offers: [{
    id: 'offer-1',
    checklistItemId: 'desk',
    name: 'Standing Desk',
    retailer: 'Shopify',
    nativeId: 'gid-1',
    source: 'ShopifyGlobalCatalog',
    description: 'A desk',
    variant: 'Oak',
    merchant: 'Desks Inc',
    fit: {
      status: 'verified',
      checks: [{ requirement: 'standing', status: 'supported', evidence: 'Height adjustable' }],
      summary: 'Matches',
      assessedAt: '2026-01-02T00:00:00.000Z',
    },
    url: 'https://example.com/desk',
    image: 'https://example.com/desk.png',
    brand: 'Acme',
    price: 40000,
    shipping: 1000,
    tax: 3000,
    arrival: '2026-01-10',
    available: true,
    match: 'exact',
  }],
  selected: ['offer-1'],
  skippedItemIds: ['rug'],
  searchingItemId: 'desk',
  searchRecovery: {
    desk: {
      status: 'no-match',
      message: 'No desk matched the budget after two attempts.',
      attempts: [{
        query: 'standing desk under $500',
        sources: ['shopify'],
        outcome: 'no-match',
        found: 0,
        reason: 'Every match exceeded the budget.',
      }],
    },
  },
  categorySearchHistory: { desk: ['standing desk'] },
  removedBasketProducts: ['offer-9'],
  locks: ['offer-1'],
  plans: [{
    id: 'essential',
    label: 'Recommended',
    productIds: ['offer-1'],
    subtotal: 40000,
    total: 44000,
    issues: ['over budget'],
    warnings: ['tax unconfirmed'],
    knownCost: 44000,
    storeCount: 1,
    explanation: 'Best fit',
  }],
  replacement: 'offer-1',
  approved: 'essential',
  pending: {
    id: 'cart-1',
    retailer: 'Shopify',
    lines: [{ id: 'offer-1', quantity: 2, owner: 'settlein' }],
    operation: 'prepare-and-verify',
  },
  baskets: [{
    id: 'cart-0',
    retailer: 'Walmart',
    verified: true,
    lines: [{ id: 'offer-2', quantity: 1, owner: 'settlein' }],
    mock: false,
    checkoutUrl: 'https://example.com/checkout',
  }],
  attempts: { Shopify: 1 },
  log: ['Checklist ready.'],
  discoverySources: ['ShopifyGlobalCatalog'],
  discoveryReports: [{ source: 'ShopifyGlobalCatalog', offerCount: 3, issues: [{ checklistItemId: 'desk', message: 'timed out' }] }],
};

/** restoreState() derives id from its argument, not from the snapshot. */
const DERIVED_FROM_ARGUMENT = new Set(['id']);

test('restoreState preserves every State field across a persist/emit round trip', () => {
  const persisted = JSON.parse(JSON.stringify(FULL));
  const restored = restoreState(FULL.id, persisted);

  for (const key of Object.keys(FULL) as (keyof State)[]) {
    if (DERIVED_FROM_ARGUMENT.has(key)) continue;
    assert.deepEqual(
      restored[key],
      FULL[key],
      `restoreState() dropped or altered "${key}". Add it to packages/shared/src/restore.ts.`,
    );
  }
  assert.equal(restored.id, FULL.id);
});

test('restoreState falls back to defaults for a corrupt snapshot instead of throwing', () => {
  const base = initialState('thread-2');
  assert.deepEqual(restoreState('thread-2', null), base);
  assert.deepEqual(restoreState('thread-2', 'not an object'), base);
  assert.deepEqual(restoreState('thread-2', { offers: 'nonsense', plans: 42 }), base);
});

test('restoreState keeps valid fields when a sibling field is corrupt', () => {
  const restored = restoreState(FULL.id, { ...JSON.parse(JSON.stringify(FULL)), offers: 'corrupt', attempts: 'corrupt' });
  assert.deepEqual(restored.offers, []);
  assert.deepEqual(restored.attempts, {});
  assert.deepEqual(restored.selected, FULL.selected);
  assert.deepEqual(restored.log, FULL.log);
});
