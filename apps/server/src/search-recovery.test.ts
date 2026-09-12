import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, Requirements, Offer, restoreState, type State, type DiscoveryReport, type ChecklistItem } from '@fitoutagent/shared';
import { compositeDiscovery } from './discovery/composite';
import { categorySearchPlanner } from './discovery/category-search-plan';
import { fitVerifier } from './fit/verify';
import { recoverSearch } from './recovery/run';
import { transition } from './workflow';
import { runDiscovery } from './product-discovery';

const env = { ...process.env };
beforeEach(() => { process.env.SHOPIFY_GLOBAL_CATALOG = '1'; process.env.BESTBUY_API_KEY = 'test'; process.env.ALLOW_MOCK_FALLBACK = '0'; delete process.env.SHOPIFY_STORE_DOMAIN; });
afterEach(() => { process.env = { ...env }; });
const emit = async () => {};
function setup() {
  const s = initialState('recovery'); s.phase = 'compare';
  s.requirements = Requirements.parse({ goal: 'Queen steel bed frame without headboard, and a chair', budget: 50000, deadline: '2026-10-01', owned: ['queen mattress'], items: [
    { id: 'bed', label: 'Queen steel bed frame', query: 'queen steel bed frame without headboard', quantity: 1 },
    { id: 'chair', label: 'Chair', query: 'chair', quantity: 1 },
  ] });
  s.offers = [product('chair')]; s.selected = ['chair']; s.locks = ['chair'];
  return s;
}
function product(id = 'bed', status: 'verified' | 'rejected' | 'unknown' = 'verified') {
  return Offer.parse({ id, checklistItemId: id === 'chair' ? 'chair' : 'bed', name: id, retailer: 'Shopify', source: 'ShopifyGlobalCatalog', nativeId: id,
    url: 'https://example.com/product', price: 10000, shipping: null, tax: null, arrival: '2026-09-20', available: true,
    fit: { status, summary: 'test evidence', assessedAt: '2026-09-12', checks: [{ requirement: 'Queen frame, no headboard', status: status === 'verified' ? 'supported' : status === 'rejected' ? 'conflict' : 'unknown', evidence: status === 'unknown' ? '' : id }] } });
}

test('recovery changes source, preserves requirements, rejects unsuitable hits and stops on a verified match', async t => {
  const s = setup(), original = structuredClone(s.requirements), chair = s.offers[0];
  t.mock.method(categorySearchPlanner, 'plan', async () => ({ query: 'platform bed', sources: ['BestBuy'], reason: 'Try a different phrase' }));
  let requests = 0;
  t.mock.method(compositeDiscovery, 'discover', async (r: Requirements, _issue: unknown, _report: unknown, options?: { sources?: string[] }) => {
    requests++;
    assert.equal(r.items.length, 1);
    assert.ok(r.items[0].query.includes(original!.items[0].query));
    assert.equal(r.deadline, original!.deadline);
    assert.deepEqual(options?.sources, [requests === 1 ? 'BestBuy' : 'ShopifyGlobalCatalog']);
    return [product(requests === 1 ? 'cover' : 'frame', requests === 1 ? 'rejected' : 'verified')];
  });
  t.mock.method(fitVerifier, 'verify', async (r: Requirements, offers: Offer[]) => { assert.deepEqual(r.items, [original!.items[0]]); return offers; });
  await recoverSearch(s, emit);
  assert.equal(requests, 2);
  assert.equal(s.searchRecovery?.bed.status, 'resolved');
  assert.deepEqual(s.requirements, original);
  assert.equal(s.offers.find(o => o.id === 'chair'), chair);
  assert.deepEqual(s.selected, ['chair']); assert.deepEqual(s.locks, ['chair']);
  assert.equal(s.offers.find(o => o.id === 'cover')?.fit?.status, 'rejected');
  assert.deepEqual(restoreState(s.id, JSON.parse(JSON.stringify(s))).searchRecovery, s.searchRecovery);
});

test('same query/source is never repeated and exhaustion asks only for an explicit requirements change', async t => {
  delete process.env.BESTBUY_API_KEY;
  const s = setup();
  t.mock.method(categorySearchPlanner, 'plan', async () => ({ query: 'platform bed', sources: ['ShopifyGlobalCatalog'], reason: 'same plan' }));
  const search = t.mock.method(compositeDiscovery, 'discover', async () => []);
  await recoverSearch(s, emit);
  assert.equal(search.mock.callCount(), 1);
  assert.equal(s.searchRecovery?.bed.status, 'no-match');
  assert.match(s.searchRecovery!.bed.message, /willing to change/);
  assert.equal(s.requirements!.items[0].query, 'queen steel bed frame without headboard');
});

test('source outages and fit-service failures preserve successes and do not ask to change requirements', async t => {
  const s = setup();
  t.mock.method(categorySearchPlanner, 'plan', async () => ({ query: 'platform bed', sources: ['BestBuy'], reason: 'alternate' }));
  t.mock.method(compositeDiscovery, 'discover', async (_r: Requirements, _issue: unknown, report?: (r: DiscoveryReport) => void) => {
    report?.({ source: 'BestBuy', offerCount: 0, issues: [{ checklistItemId: 'bed', message: 'Retailer returned HTTP 429' }] });
    return [product('candidate', 'unknown')];
  });
  t.mock.method(fitVerifier, 'verify', async (_r: Requirements, offers: Offer[]) => offers.map((o: Offer) => ({ ...o, fit: { ...o.fit!, failure: 'provider' as const } })));
  await recoverSearch(s, emit);
  assert.equal(s.searchRecovery?.bed.status, 'source-error');
  assert.doesNotMatch(s.searchRecovery!.bed.message, /willing to change/);
  assert.ok(s.offers.some(o => o.id === 'chair'));
  assert.equal(s.discoveryReports[0].issues[0].message, 'Retailer returned HTTP 429');
});

test('unverified live products trigger recovery and cannot finish agent mode automatically', async t => {
  const s = setup(); s.locks = []; s.requirements!.selectionMode = 'agent';
  t.mock.method(categorySearchPlanner, 'plan', async () => ({ query: 'platform bed', sources: ['BestBuy'], reason: 'alternate' }));
  const search = t.mock.method(compositeDiscovery, 'discover', async () => [product('candidate', 'unknown'), product('chair')]);
  t.mock.method(fitVerifier, 'verify', async (_r: Requirements, offers: Offer[]) => offers);
  await runDiscovery(s, s.requirements!, emit);
  assert.equal(search.mock.callCount(), 3);
  assert.equal(s.phase, 'compare'); assert.equal(s.approved, null); assert.equal(s.pending, null);
  assert.equal(s.searchRecovery?.bed.status, 'unverified');
});

test('unknown planner sources fall back to configured sources without broadening requirements', async t => {
  const s = setup();
  t.mock.method(categorySearchPlanner, 'plan', async () => ({ query: 'ignore original constraints', sources: ['ImaginaryStore'], reason: 'bad output' }));
  t.mock.method(compositeDiscovery, 'discover', async (r: Requirements, _issue: unknown, _report: unknown, options?: { sources?: string[] }) => {
    assert.ok(!options?.sources?.includes('ImaginaryStore'));
    assert.ok(r.items[0].query.includes(s.requirements!.items[0].query));
    return [product()];
  });
  t.mock.method(fitVerifier, 'verify', async (_r: Requirements, offers: Offer[]) => offers);
  await recoverSearch(s, emit);
  assert.equal(s.searchRecovery?.bed.status, 'resolved');
});

test('locks prevent recovery from replacing an unsuitable choice', async t => {
  const s = setup(); s.offers.push(product('bed', 'rejected')); s.locks.push('bed'); s.selected.push('bed');
  const search = t.mock.method(compositeDiscovery, 'discover', async () => []);
  await recoverSearch(s, emit);
  assert.equal(search.mock.callCount(), 0); assert.equal(s.searchRecovery?.bed.status, 'locked');
  assert.deepEqual(s.selected, ['chair', 'bed']);
});

test('recovery enforces a run-wide limit and serializes concurrent persistence writes', async t => {
  const s = setup(); s.offers = []; s.locks = [];
  s.requirements!.items = Array.from({ length: 10 }, (_, i) => ({ ...s.requirements!.items[0], id: `item-${i}` }));
  t.mock.method(categorySearchPlanner, 'plan', async (_s: State, item: ChecklistItem) => ({ query: item.query, sources: ['BestBuy'], reason: 'alternate' }));
  const search = t.mock.method(compositeDiscovery, 'discover', async () => []);
  let writing = false;
  await recoverSearch(s, async () => {
    assert.equal(writing, false); writing = true;
    await new Promise(resolve => setTimeout(resolve, 1)); writing = false;
  });
  assert.ok(search.mock.callCount() <= 12);
  assert.ok(Object.values(s.searchRecovery!).some(row => row.status === 'limit'));
});

test('explicit retry fills only the requested gap and preserves unrelated choices', async t => {
  const s = setup();
  t.mock.method(categorySearchPlanner, 'plan', async () => ({ query: 'platform frame', sources: ['BestBuy'], reason: 'alternate' }));
  t.mock.method(compositeDiscovery, 'discover', async () => [product()]);
  t.mock.method(fitVerifier, 'verify', async (_r: Requirements, offers: Offer[]) => offers);
  await transition(s, { type: 'retry-recovery', checklistItemId: 'bed' }, emit);
  assert.deepEqual(new Set(s.selected), new Set(['chair', 'bed']));
  assert.deepEqual(s.locks, ['chair']); assert.equal(s.phase, 'compare');
  await assert.rejects(transition(s, { type: 'retry-recovery', checklistItemId: 'missing' }, emit), /Unknown/);
  s.approved = 'essential';
  await assert.rejects(transition(s, { type: 'retry-recovery', checklistItemId: 'bed' }, emit), /Edit products/);
});
