process.env.SHOPIFY_GLOBAL_CATALOG = '0';
process.env.ALLOW_MOCK_FALLBACK = '1';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, type State } from '@fitoutagent/shared';
import { promptImprover } from './discovery/improve-prompt';
import { smartDecomposer } from './discovery/decompose';
import { transition } from './workflow';
import { mockCart } from '../../extension/src/mock-cart';

test('Handle it for me improves the prompt, folds suggestions, and prepares baskets', async t => {
  const s = initialState('agent-auto');
  let improveMode: string | undefined;
  t.mock.method(promptImprover, 'improve', async (_state: State, mode: 'review' | 'agent' = 'review') => {
    improveMode = mode;
    return {
      prompt: 'Furnish a compact home office under $1500 with a desk, ergonomic chair, and lamp. I already have a monitor.',
      rationale: 'Clarified office essentials.',
    };
  });
  t.mock.method(smartDecomposer, 'decompose', async ({ goal }: { goal: string }) => {
    assert.match(goal, /desk/i);
    assert.match(goal, /chair/i);
    return {
      items: [
        { id: 'desk', label: 'Desk', query: 'desk', quantity: 1, must: true },
        { id: 'chair', label: 'Chair', query: 'office chair', quantity: 1, must: true },
      ],
      suggestions: [
        { id: 'lamp', label: 'Lamp', query: 'desk lamp', reason: 'Task lighting', defaultQty: 1 },
      ],
    };
  });

  await transition(s, {
    type: 'start',
    draft: { goal: 'home office under 1500, have monitor', selectionMode: 'agent', budget: null, deadline: null, owned: [] },
  }, async () => {});

  assert.equal(improveMode, 'agent');
  assert.equal(s.draft?.originalGoal, 'home office under 1500, have monitor');
  assert.match(s.draft?.goal ?? '', /desk/i);
  assert.ok(s.requirements?.items.some(i => i.id === 'lamp'), 'suggestions folded into agent checklist');
  assert.equal(s.suggestions.length, 0);
  assert.ok(['prepare', 'verify', 'complete', 'compare'].includes(s.phase), s.phase);

  const db = new Map<string, unknown>();
  const cart = mockCart({
    async get(k: string) { return db.get(k); },
    async set(k: string, v: unknown) { db.set(k, v); },
  });
  let guard = 0;
  while (s.pending && guard++ < 6) {
    const request = s.pending;
    await cart.prepare(request);
    const result = await cart.verify(request);
    await transition(s, { type: 'cart-result', result }, async () => {});
  }
  assert.ok(s.baskets.length >= 1 || s.phase === 'compare', `phase=${s.phase} baskets=${s.baskets.length}`);
});
