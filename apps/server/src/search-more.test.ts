import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, Requirements, Offer } from '@settlein/shared';
import { transition } from './workflow';
import { compositeDiscovery } from './discovery/composite';
import { fitVerifier } from './fit/verify';
import { categorySearchPlanner } from './discovery/category-search-plan';
import { compare } from './planning';

function setup() {
  const s = initialState('more');
  s.phase = 'compare';
  s.requirements = Requirements.parse({ goal: 'office', budget: 50000, items: [
    { id: 'desk', label: 'Desk', query: 'compact desk', quantity: 1 },
    { id: 'chair', label: 'Chair', query: 'chair', quantity: 1 },
  ] });
  s.offers = ['desk', 'chair'].map(id => Offer.parse({ id, checklistItemId: id, name: id, retailer: 'Shopify', nativeId: id, price: 10000, available: true, url: null, shipping: null, tax: null, arrival: null }));
  s.selected = ['desk', 'chair']; s.locks = ['desk'];
  compare(s);
  return s;
}
const emit = async () => {};

test('search expands only the requested category, checks fit and preserves choices', async t => {
  const s = setup();
  t.mock.method(categorySearchPlanner, 'plan', async () => ({ query: 'compact desk alternative', sources: ['BestBuy'], reason: 'Different source' }));
  s.offers.push({ ...s.offers[0], id: 'old-alternative' });
  t.mock.method(compositeDiscovery, 'discover', async (...[r, _issue, _report, options]: Parameters<typeof compositeDiscovery.discover>) => {
    assert.deepEqual(r.items, [{ ...s.requirements!.items[0], query: 'compact desk alternative' }]);
    assert.deepEqual(options?.sources, ['BestBuy']);
    assert.equal(options?.limit, 10);
    const extra = { ...s.offers[0], id: 'new-desk' };
    return [s.offers[0], extra, extra];
  });
  t.mock.method(fitVerifier, 'verify', async (_r: Requirements, offers: Offer[]) => {
    assert.deepEqual(offers.map(o => o.id), ['new-desk']);
    return offers;
  });
  await transition(s, { type: 'search-more', checklistItemId: 'desk' }, emit);
  assert.deepEqual(s.offers.map(o => o.id), ['desk', 'chair', 'new-desk']);
  assert.deepEqual(s.selected, ['desk', 'chair']);
  assert.deepEqual(s.locks, ['desk']);
  assert.equal(s.phase, 'compare');
  assert.match(s.log.at(-1)!, /found 1 different option/);
});

test('no results and retailer failures keep the existing basket and allow retry', async t => {
  for (const failure of ['empty', 'throw', 'report']) {
    const s = setup();
    t.mock.method(categorySearchPlanner, 'plan', async () => ({ query: 'desk', sources: ['BestBuy'], reason: 'Different source' }));
    const before = structuredClone(s.offers);
    t.mock.method(compositeDiscovery, 'discover', async (...[_r, _issue, report]: Parameters<typeof compositeDiscovery.discover>) => {
      if (failure === 'throw') throw new Error('offline');
      if (failure === 'report') report?.({ source: 'Shopify', offerCount: 0, issues: [{ checklistItemId: 'desk', message: 'offline' }] });
      return [];
    });
    await transition(s, { type: 'search-more', checklistItemId: 'desk' }, emit);
    assert.deepEqual(s.offers, before);
    assert.deepEqual(s.selected, ['desk', 'chair']);
    assert.equal(s.phase, 'compare');
    assert.match(s.log.at(-1)!, failure === 'empty' ? /No different options/ : /failed/);
    t.mock.restoreAll();
  }
});

test('search rejects unknown, skipped, approved, paused and busy categories', async () => {
  for (const mode of ['unknown', 'skipped', 'approved', 'paused', 'busy']) {
    const s = setup();
    if (mode === 'skipped') s.skippedItemIds = ['desk'];
    if (mode === 'approved') s.approved = 'essential';
    if (mode === 'paused') s.paused = true;
    if (mode === 'busy') s.phase = 'discover';
    await assert.rejects(transition(s, { type: 'search-more', checklistItemId: mode === 'unknown' ? 'missing' : 'desk' }, emit));
  }
});
