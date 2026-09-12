import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decomposeUserPrompt, rankUserPrompt, RankOffersSchema } from './discovery/prompts';

test('ranking retains requirements and variant evidence beyond old truncation limits', () => {
  const goal = `${'Shared home office. '.repeat(12)}Must fit a 40-inch space.`;
  const name = `${'Adjustable office desk with storage '.repeat(3)}48 inches wide`;
  const items = [{ id: 'desk', label: 'Desk', must: true, query: 'desk under 40 inches wide', quantity: 2 }];
  const payload = JSON.parse(rankUserPrompt({
    goal, budget: 50000, deadline: '2026-10-01', items,
    offers: [{ id: 'wide', checklistItemId: 'desk', name, price: 10000, available: true, retailer: 'Shopify' }],
  }));
  assert.equal(payload.goal, goal);
  assert.equal(payload.offers[0].name, name);
  assert.deepEqual(payload.items, items);
  assert.equal(payload.deadline, '2026-10-01');
  assert.equal(payload.offers[0].priceCents, 10000);
  assert.equal(payload.offers[0].shippingCents, null);
  assert.equal(payload.offers[0].taxCents, null);
  assert.equal(payload.offers[0].arrival, null);
});

test('ranking can abstain instead of requiring an unsuitable offer', () => {
  assert.deepEqual(RankOffersSchema.parse({
    rankings: [{ checklistItemId: 'desk', orderedOfferIds: [] }],
  }).rankings[0].orderedOfferIds, []);
});

test('checklist input preserves constraints and distinguishes unknown budget from zero', () => {
  for (const budget of [null, 0, 50000]) {
    const input = { goal: 'Queen bed frame without headboard. Already own a mattress.', owned: ['lamp'], budget, deadline: null };
    assert.deepEqual(JSON.parse(decomposeUserPrompt(input)), {
      goal: input.goal, owned: input.owned, budgetCents: budget, deadline: null,
    });
  }
});
