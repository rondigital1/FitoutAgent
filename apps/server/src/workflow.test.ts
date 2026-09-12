import { beforeEach, afterEach, mock } from 'node:test';
import { smartDecomposer, ruleDecomposer } from './discovery/decompose';
beforeEach(() => { mock.method(smartDecomposer, 'decompose', ruleDecomposer.decompose); });
afterEach(() => mock.restoreAll());
process.env.SHOPIFY_GLOBAL_CATALOG = '0';
process.env.ALLOW_MOCK_FALLBACK = '1';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, evaluate, type GoalDraft, type CartResult } from '@settlein/shared';
import { transition } from './workflow';
import { mockCart } from '../../extension/src/mock-cart';
import { activeDiscoverySources, compositeDiscovery } from './discovery/composite';

const draft: GoalDraft = {
  goal: 'Set up an office for two people under $1,500 by Friday. We already own laptops.',
  budget: 150000,
  deadline: '2026-09-18',
  owned: ['laptops'],
};
const emit = async () => {};

async function throughChecklist(addSuggestion = true) {
  const s = initialState('test');
  await transition(s, { type: 'start', draft }, emit);
  assert.equal(s.phase, 'checklist');
  assert.ok(s.requirements!.items.length >= 4);
  assert.ok(s.suggestions.length >= 1);
  if (addSuggestion) {
    const id = s.suggestions[0].id;
    await transition(s, { type: 'add-suggestion', suggestionId: id }, emit);
    assert.ok(s.requirements!.items.some(i => i.id === id));
    assert.ok(!s.suggestions.some(x => x.id === id));
  }
  await transition(s, { type: 'confirm-checklist' }, emit);
  return s;
}

test('start drafts checklist + suggestions; add then confirm runs discovery', async () => {
  const s = await throughChecklist(true);
  assert.equal(s.phase, 'compare');
  assert.equal(s.replacement, null);
  assert.ok(s.selected.includes('desk-1'));
  assert.equal(s.suggestions.length, 0);
});

test('dismiss suggestion removes it without adding to checklist', async () => {
  const s = initialState('test');
  await transition(s, { type: 'start', draft }, emit);
  const id = s.suggestions[0].id;
  await transition(s, { type: 'dismiss-suggestion', suggestionId: id }, emit);
  assert.ok(!s.suggestions.some(x => x.id === id));
  assert.ok(!s.requirements!.items.some(i => i.id === id));
});

test('complete workflow after checklist: replace, verify baskets', async () => {
  const s = await throughChecklist(false);
  assert.equal(s.plans[0].subtotal, 82400);
  assert.equal(s.plans[0].total, 88992);
  await transition(s, { type: 'approve', planId: 'essential' }, emit);
  const db = new Map<string, unknown>();
  const cart = mockCart({ async get(k) { return db.get(k); }, async set(k, v) { db.set(k, v); } });
  while (s.pending) {
    const request = s.pending;
    await cart.prepare(request); await cart.prepare(request);
    const result = await cart.verify(request);
    assert.equal(result.lines.filter(l => l.owner === 'existing').length, 1);
    await transition(s, { type: 'cart-result', result }, emit);
  }
  assert.equal(s.phase, 'complete');
  assert.equal(s.baskets.length, 2);
});

test('locks survive replans and require explicit unlock for replacement', async () => {
  const s = await throughChecklist(false);
  s.offers.find(o => o.id === 'desk-0')!.available = true;
  await transition(s, { type: 'select', productId: 'desk-0' }, emit);
  await transition(s, { type: 'lock', productId: 'desk-0' }, emit);
  await transition(s, {
    type: 'constraints',
    requirements: { ...draft, items: s.requirements!.items.map(i => ({ ...i })), budget: 160000 },
  }, emit);
  assert.deepEqual(s.locks, ['desk-0']);
  await assert.rejects(transition(s, { type: 'replace', productId: 'desk-1' }, emit));
  await transition(s, { type: 'lock', productId: 'desk-0' }, emit);
  await transition(s, { type: 'replace', productId: 'desk-1' }, emit);
  assert.equal(s.replacement, null);
});

test('unknown cost is not zero; budget and late arrival block approval', async () => {
  const s = await throughChecklist(false);
  const offers = s.offers.filter(o => s.selected.includes(o.id));
  const r = s.requirements!;
  // Missing tax/shipping keeps the final total unknown while exposing a known lower bound
  offers[0].tax = null;
  offers[0].shipping = null;
  assert.equal(evaluate('x', 'x', offers, r).total, null);
  assert.ok(evaluate('x', 'x', offers, { ...r, budget: 1 }).issues.includes('Over budget'));
  offers[0].arrival = '2099-01-01';
  assert.ok(evaluate('x', 'x', offers, { ...r, deadline: '2026-09-20' }).issues.some(i => i.includes('arrives after')));
});

test('verification rejects missing lines, bounds retries and retains partial successes', async () => {
  const s = await throughChecklist(false);
  await transition(s, { type: 'approve', planId: 'essential' }, emit);
  const first = s.pending!;
  await transition(s, { type: 'cart-result', result: { ...first, mock: true, verified: true, lines: first.lines } }, emit);
  for (let i = 0; i < 2; i++) {
    const request = s.pending!;
    const result: CartResult = { ...request, mock: true, verified: true, lines: [] };
    await transition(s, { type: 'cart-result', result }, emit);
    assert.equal(s.baskets.filter(b => b.verified).length, 1);
    await transition(s, { type: 'retry' }, emit);
  }
  assert.equal(s.pending, null);
  assert.equal(s.phase, 'verify');
});

test('pause stops decisions until resume', async () => {
  const s = await throughChecklist(false);
  await transition(s, { type: 'pause' }, emit);
  await assert.rejects(transition(s, { type: 'apply-plan', planId: 'optimized' }, emit));
  await transition(s, { type: 'resume' }, emit);
  await transition(s, { type: 'apply-plan', planId: 'optimized' }, emit);
});

test('composite discovery falls back to mock when live retailer env is unset', async () => {
  assert.deepEqual(activeDiscoverySources(), ['Mock']);
  const s = await throughChecklist(false);
  const offers = await compositeDiscovery.discover(s.requirements!);
  assert.ok(offers.length >= s.requirements!.items.length);
});
