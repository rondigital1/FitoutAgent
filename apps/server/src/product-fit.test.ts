import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Offer, type Requirements } from '@fitoutagent/shared';
import { validateAssessment } from './fit/assessment';
import { fitVerifier } from './fit/verify';

const r: Requirements = { goal: 'Queen bed frame, no headboard', owned: [], budget: 50000, deadline: null,
  items: [{ id: 'bed', label: 'Queen bed frame without headboard', query: 'queen bed frame without headboard', quantity: 1, must: true }] };
const o = Offer.parse({ id: 'bed:1', checklistItemId: 'bed', name: 'Queen bed frame', description: 'Steel frame without headboard',
  retailer: 'Shopify', nativeId: '1', url: null, price: 10000, shipping: null, tax: null, arrival: null, available: true });
const good = { requirements: ['Bed frame', 'Queen size', 'No headboard'], offers: [{ id: o.id, checks: [
  { requirementIndex: 0, status: 'supported', evidence: 'bed frame' },
  { requirementIndex: 1, status: 'supported', evidence: 'Queen' },
  { requirementIndex: 2, status: 'supported', evidence: 'without headboard' },
] }] };
const env = { ...process.env };
beforeEach(() => { process.env.AGENT_API_KEY = 'test-only'; delete process.env.AGENT_BASE_URL; });
afterEach(() => { process.env = { ...env }; });

test('fit assessments retain requirement evidence and distinguish conflicts from unknowns', () => {
  assert.equal(validateAssessment(good, [o]).get(o.id)?.status, 'verified');
  const conflict = structuredClone(good); conflict.offers[0].checks[0].status = 'conflict'; conflict.offers[0].checks[0].evidence = 'Bed frame cover';
  const cover = { ...o, name: 'Bed frame cover' };
  assert.equal(validateAssessment(conflict, [cover]).get(o.id)?.status, 'rejected');
  const fabricated = structuredClone(good); fabricated.offers[0].checks[2].evidence = 'Guaranteed no headboard';
  const fit = validateAssessment(fabricated, [o]).get(o.id)!;
  assert.equal(fit.status, 'unknown'); assert.equal(fit.checks[2].evidence, '');
});

test('foreign IDs, duplicate assessments and missing requirement coverage are rejected', () => {
  const foreign = structuredClone(good); foreign.offers[0].id = 'invented';
  assert.throws(() => validateAssessment(foreign, [o]), /mismatched/);
  const duplicate = structuredClone(good); duplicate.offers.push(duplicate.offers[0]);
  assert.throws(() => validateAssessment(duplicate, [o]), /mismatched/);
  const incomplete = structuredClone(good); incomplete.offers[0].checks.pop();
  assert.throws(() => validateAssessment(incomplete, [o]), /coverage/);
});

test('Responses request uses structured output, retailer descriptions and original requirements', async t => {
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    assert.equal(body.store, false); assert.equal(body.text.format.strict, true);
    assert.equal(JSON.parse(body.input).offers[0].description, o.description);
    assert.equal(JSON.parse(body.input).goal, r.goal);
    return Response.json({ id: 'r', object: 'response', status: 'completed', output: [{ id: 'm', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: JSON.stringify(good), annotations: [] }] }] });
  });
  const [actual] = await fitVerifier.verify(r, [o]);
  assert.equal(actual.fit?.status, 'verified'); assert.equal(actual.match, 'exact');
});

test('provider failure preserves products as unverified, with no fallback exact match', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('private detail', { status: 429 }));
  const [actual] = await fitVerifier.verify(r, [o]);
  assert.equal(actual.id, o.id); assert.equal(actual.fit?.status, 'unknown');
  assert.ok(actual.fit?.summary.includes('failed')); assert.ok(!actual.fit?.summary.includes('private'));
});

test('missing credentials makes no request and never trusts a legacy exact flag', async t => {
  delete process.env.AGENT_API_KEY; delete process.env.OPENAI_API_KEY;
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new Error('unexpected'); });
  const [actual] = await fitVerifier.verify(r, [{ ...o, match: 'exact' }]);
  assert.equal(actual.fit?.status, 'unknown'); assert.equal(actual.match, 'alternative');
  assert.equal(fetch.mock.callCount(), 0);
});

test('all variants are assessed across batches and a failed batch preserves successful evidence', async t => {
  const offers = Array.from({ length: 21 }, (_, index) => ({ ...o, id: `variant-${index}` }));
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => {
    calls++;
    const input = JSON.parse(JSON.parse(String(init?.body)).input);
    if (calls === 2) return new Response('unavailable', { status: 503 });
    return Response.json({ id: 'r', object: 'response', status: 'completed', output: [{ id: 'm', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: JSON.stringify({ requirements: good.requirements,
      offers: input.offers.map((offer: { id: string }) => ({ ...good.offers[0], id: offer.id })) }), annotations: [] }] }] });
  });
  const checked = await fitVerifier.verify(r, offers);
  assert.equal(calls, 2);
  assert.equal(checked.filter(o => o.fit?.status === 'verified').length, 20);
  assert.equal(checked[20].fit?.status, 'unknown');
});
