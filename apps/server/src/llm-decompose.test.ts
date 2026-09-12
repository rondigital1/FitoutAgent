import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { smartDecomposer } from './discovery/decompose';
import { initialState } from '@settlein/shared';
import { transition } from './workflow';

const env = { ...process.env };
beforeEach(() => {
  process.env.AGENT_API_KEY = 'test-only';
  delete process.env.OPENAI_API_KEY;
  delete process.env.AGENT_DECOMPOSE_MODEL;
  delete process.env.AGENT_MODEL;
  process.env.AGENT_BASE_URL = '';
});
afterEach(() => { process.env = { ...env }; });
const item = { id: 'reading-lamp', label: 'Reading lamp', query: 'adjustable reading lamp', quantity: 2, must: true, room: 'Bedroom' };
const input = { goal: 'Furnish an apartment', owned: [], budget: 100000, deadline: null };
const response = (value: unknown) => Response.json({
  id: 'resp_test',
  object: 'response',
  status: 'completed',
  output: [{
    id: 'msg_test',
    type: 'message',
    status: 'completed',
    role: 'assistant',
    content: [{ type: 'output_text', text: JSON.stringify(value), annotations: [] }],
  }],
});

for (const goal of ['Furnish an apartment', 'Set up an office', 'Go camping', 'Build a pottery studio']) {
  test(`${goal} uses generated types instead of a template`, async t => {
    const fetchMock = t.mock.method(globalThis, 'fetch', async (url: string | URL | Request, init?: RequestInit) => {
      assert.equal(String(url), 'https://api.openai.com/v1/responses');
      const body = JSON.parse(String(init?.body));
      assert.equal(body.model, 'gpt-5.6-luna');
      assert.equal(body.reasoning.effort, 'none');
      assert.equal(body.store, false);
      assert.equal(body.max_output_tokens, 1200);
      assert.equal(body.text.format.type, 'json_schema');
      assert.equal(body.text.format.strict, true);
      assert.equal(body.text.format.schema.additionalProperties, false);
      assert.deepEqual(body.text.format.schema.required, ['items', 'suggestions']);
      assert.equal(JSON.parse(body.input).goal, goal);
      return response({ items: [item], suggestions: [] });
    });
    const state = initialState('llm-test');
    await transition(state, { type: 'start', draft: { ...input, goal } }, async () => {});
    assert.deepEqual(state.requirements?.items, [item]);
    assert.equal(state.phase, 'checklist');
    assert.equal(fetchMock.mock.callCount(), 1);
  });
}

test('missing credentials fail without a network call or canned checklist', async t => {
  delete process.env.AGENT_API_KEY;
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => { throw new Error('unexpected request'); });
  await assert.rejects(smartDecomposer.decompose(input), /AGENT_API_KEY or OPENAI_API_KEY/);
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('provider errors preserve an empty draft for retry', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('private provider detail', { status: 429 }));
  const state = initialState('error');
  await assert.rejects(transition(state, { type: 'start', draft: input }, async () => {}), /HTTP 429/);
  assert.equal(state.draft, null);
  assert.equal(state.requirements, null);
});

test('surfaces incomplete structured responses', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({
    id: 'resp_incomplete',
    object: 'response',
    status: 'incomplete',
    incomplete_details: { reason: 'max_output_tokens' },
    output: [],
  }));
  await assert.rejects(smartDecomposer.decompose(input), /incomplete response \(max_output_tokens\)/);
});

test('surfaces model refusals without trying to parse them', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({
    id: 'resp_refusal',
    object: 'response',
    status: 'completed',
    output: [{
      id: 'msg_refusal',
      type: 'message',
      status: 'completed',
      role: 'assistant',
      content: [{ type: 'refusal', refusal: 'Cannot help with that request.' }],
    }],
  }));
  await assert.rejects(smartDecomposer.decompose(input), /refused by the model/);
});

for (const value of [
  { items: [], suggestions: [] },
  { items: [item, item], suggestions: [] },
  { items: [{ ...item, quantity: -1 }], suggestions: [] },
]) {
  test(`rejects invalid model output ${JSON.stringify(value)}`, async t => {
    t.mock.method(globalThis, 'fetch', async () => response(value));
    await assert.rejects(smartDecomposer.decompose(input));
  });
}

test('accepts OPENAI_API_KEY and removes duplicate or owned suggestions', async t => {
  delete process.env.AGENT_API_KEY;
  process.env.OPENAI_API_KEY = 'test-openai';
  const extra = { id: 'rug', label: 'Rug', query: 'area rug', reason: 'Comfort', defaultQty: 1 };
  t.mock.method(globalThis, 'fetch', async (_url: string | URL | Request, init?: RequestInit) => {
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer test-openai');
    return response({ items: [item], suggestions: [extra, extra, { ...extra, id: item.id }, { ...extra, id: 'desk', label: 'Desk', query: 'desk' }] });
  });
  const result = await smartDecomposer.decompose({ ...input, owned: ['desk'] });
  assert.deepEqual(result.suggestions, [extra]);
});
