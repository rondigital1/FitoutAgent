import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, Requirements } from '@settlein/shared';
import { categorySearchPlanner } from './discovery/category-search-plan';

const env = { ...process.env };
beforeEach(() => {
  process.env.AGENT_API_KEY = 'test';
  process.env.BESTBUY_API_KEY = 'test';
  process.env.SHOPIFY_GLOBAL_CATALOG = '1';
});
afterEach(() => { process.env = { ...env }; });
function setup() {
  const s = initialState('plan');
  s.requirements = Requirements.parse({ goal: 'office', budget: 50000, items: [{ id: 'monitor', label: 'Monitor', query: '27 inch 4K monitor', quantity: 1 }] });
  return s;
}

test('agent receives original constraints and configured sources and returns a search strategy', async t => {
  const s = setup();
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    const input = JSON.parse(body.input);
    assert.equal(input.item.query, '27 inch 4K monitor');
    assert.ok(input.availableSources.includes('BestBuy'));
    assert.equal(input.budget, 50000);
    assert.equal(body.text.format.strict, true);
    return Response.json({ status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify({ query: '27 inch UHD 4K monitor', sources: ['BestBuy'], reason: 'Electronics specialist' }), annotations: [] }] }] });
  });
  const plan = await categorySearchPlanner.plan(s, s.requirements!.items[0]);
  assert.deepEqual(plan.sources, ['BestBuy']);
  assert.equal(plan.query, '27 inch UHD 4K monitor');
});

test('agent cannot dispatch searches to unavailable platforms', async t => {
  const s = setup();
  t.mock.method(globalThis, 'fetch', async () => Response.json({ status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify({ query: 'monitor', sources: ['UnsupportedPlatform'], reason: 'Try another platform' }), annotations: [] }] }] }));
  await assert.rejects(categorySearchPlanner.plan(s, s.requirements!.items[0]), /unavailable retailer/);
});
