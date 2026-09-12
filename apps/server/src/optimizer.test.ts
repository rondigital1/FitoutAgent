import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Offer, evaluate, initialState, restoreState, type Requirements } from '@fitoutagent/shared';
import { optimize } from './optimizer';
import { compare } from './planning';
import { transition } from './workflow';

const r: Requirements = { goal: 'office', budget: 10000, deadline: null, owned: [], items: [
  { id: 'desk', label: 'Desk', query: 'desk', quantity: 2, must: true },
  { id: 'chair', label: 'Chair', query: 'chair', quantity: 1, must: true },
] };
function offer(id: string, line: string, price: number | null, patch: Partial<Offer> = {}): Offer {
  return Offer.parse({ id, checklistItemId: line, name: id, retailer: 'Shopify', nativeId: id,
    url: 'https://store.example/item', price, shipping: 0, tax: 0, arrival: null, available: true,
    fit: { status: 'verified', checks: [], summary: 'fixture', assessedAt: '2026-09-12' }, ...patch });
}
const unknown = { status: 'unknown' as const, checks: [], summary: 'Missing dimensions', assessedAt: '' };
const rejected = { ...unknown, status: 'rejected' as const };

test('basket accounts for quantity and fees rather than cheapest sticker prices', () => {
  const offers = [offer('cheap-sticker', 'desk', 1000, { shipping: 2500 }), offer('delivered', 'desk', 2000), offer('chair', 'chair', 1500)];
  const plan = optimize(r, offers, [], 'cost');
  assert.deepEqual(plan.productIds, ['delivered', 'chair']);
  assert.equal(plan.total, 5500);
  assert.ok(evaluate('x', 'x', [offers[0], offers[2]], { ...r, budget: 8000 }).issues.includes('Over budget'));
});

test('fit-first recommendation rejects accessories and trades across lines to stay within budget', () => {
  const offers = [offer('cover', 'desk', 100, { fit: rejected }), offer('verified-desk', 'desk', 3000),
    offer('unconfirmed-desk', 'desk', 1000, { fit: unknown }), offer('verified-chair', 'chair', 5000), offer('unconfirmed-chair', 'chair', 2000, { fit: unknown })];
  const plan = optimize(r, offers, [], 'fit');
  assert.ok(!plan.productIds.includes('cover'));
  assert.ok(!plan.issues.length);
  assert.equal(plan.total, 7000);
  assert.deepEqual(plan.productIds, ['unconfirmed-desk', 'verified-chair']);
  assert.ok(plan.warnings?.some(w => w.includes('fit needs review')));
});

test('store consolidation uses merchant identity, without inventing a shipping discount', () => {
  const offers = [offer('desk-a', 'desk', 1000, { merchant: 'a' }), offer('desk-b', 'desk', 1100, { merchant: 'b' }), offer('chair-b', 'chair', 1000, { merchant: 'b' })];
  assert.equal(optimize(r, offers, [], 'cost').storeCount, 2);
  const plan = optimize(r, offers, [], 'stores');
  assert.equal(plan.storeCount, 1);
  assert.equal(plan.total, 3200);
});

test('unknown extras do not become a confirmed total; known lower bound still blocks over budget', () => {
  const offers = [offer('desk', 'desk', 1000, { tax: null }), offer('chair', 'chair', 1000, { shipping: null })];
  const plan = optimize(r, offers, [], 'fit');
  assert.equal(plan.total, null);
  assert.equal(plan.knownCost, 3000);
  assert.ok(plan.warnings?.some(w => w.includes('unquoted')));
  assert.ok(optimize({ ...r, budget: 2500 }, offers, [], 'fit').issues.includes('Over budget'));
});

test('locks, missing lines, late delivery and unknown prices cannot be hidden by optimization', () => {
  const offers = [offer('locked', 'desk', 10000, { fit: rejected }), offer('cheap', 'desk', 100), offer('late', 'chair', 100, { arrival: '2099-01-01' })];
  const plan = optimize({ ...r, deadline: '2026-10-01' }, offers, ['locked'], 'fit');
  assert.ok(plan.productIds.includes('locked'));
  assert.ok(plan.issues.some(i => i.includes('conflicts')));
  assert.ok(plan.issues.includes('Over budget'));
  assert.ok(plan.issues.includes('Missing Chair'));
  assert.ok(optimize(r, [offer('desk', 'desk', null)], [], 'cost').issues.some(i => i.includes('prices unknown')));
});

test('apply changes unlocked selections and approval revalidates fit; persistence keeps evidence and costs', async () => {
  const s = initialState('optimized'); s.requirements = r; s.phase = 'compare';
  s.offers = [offer('desk', 'desk', 1000), offer('chair', 'chair', 1000), offer('chair-alt', 'chair', 2000)];
  s.selected = ['desk', 'chair-alt']; s.locks = ['desk']; compare(s);
  await transition(s, { type: 'apply-plan', planId: 'optimized' }, async () => {});
  assert.deepEqual(s.selected, ['desk', 'chair']);
  assert.deepEqual(s.locks, ['desk']);
  const restored = restoreState(s.id, JSON.parse(JSON.stringify(s)));
  assert.equal(restored.offers[0].fit?.status, 'verified');
  assert.equal(restored.plans[0].knownCost, 3000);
  s.offers[1].fit = rejected;
  await assert.rejects(transition(s, { type: 'approve', planId: 'essential' }, async () => {}), /violates/);
  await assert.rejects(transition(s, { type: 'select', productId: 'chair' }, async () => {}), /conflict/);
});

test('failed searches and disappeared products never silently discard a lock', async t => {
  const { compositeDiscovery } = await import('./discovery/composite');
  const { fitVerifier } = await import('./fit/verify');
  const { runDiscovery } = await import('./product-discovery');
  const s = initialState('locked-search'); s.requirements = r; s.phase = 'compare';
  const locked = offer('locked-desk', 'desk', 1000);
  s.offers = [locked]; s.selected = [locked.id]; s.locks = [locked.id];
  const search = t.mock.method(compositeDiscovery, 'discover', async () => { throw new Error('outage'); });
  await assert.rejects(runDiscovery(s, r, async () => {}), /outage/);
  assert.deepEqual(s.locks, [locked.id]); assert.equal(s.offers[0].id, locked.id);
  search.mock.restore();
  t.mock.method(compositeDiscovery, 'discover', async () => [offer('new-desk', 'desk', 1000), offer('chair', 'chair', 1000)]);
  t.mock.method(fitVerifier, 'verify', async (_r: Requirements, offers: Offer[]) => offers);
  await runDiscovery(s, r, async () => {});
  assert.equal(s.replacement, locked.id);
  assert.ok(s.plans.every(plan => plan.productIds.includes(locked.id)));
  await transition(s, { type: 'lock', productId: locked.id }, async () => {});
  await transition(s, { type: 'apply-plan', planId: 'optimized' }, async () => {});
  assert.equal(s.replacement, null);
  assert.ok(s.selected.includes('new-desk'));
});
