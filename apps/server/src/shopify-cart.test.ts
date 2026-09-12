import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import type { CartRequest, Offer } from '@fitoutagent/shared';
import { prepareStorefront } from './cart/storefront-handoff';
import { shopifyCart } from './cart/shopify-cart';

// Exercise the real cart adapter; only Shopify's HTTP responses are controlled.
const originalEnv = { ...process.env };
const variant = 'gid://shopify/ProductVariant/42';
const checkoutUrl = 'https://demo.myshopify.com/checkouts/test';
beforeEach(() => {
  process.env.SHOPIFY_STORE_DOMAIN = 'demo.myshopify.com';
  process.env.SHOPIFY_STOREFRONT_TOKEN = 'fixture-token';
});
afterEach(() => { process.env = { ...originalEnv }; });

function offer(id: string): Offer {
  return {
    id, checklistItemId: id, nativeId: variant, source: 'ShopifyStorefront',
    retailer: 'Shopify', name: 'Ceramic mug', url: null, image: null,
    brand: null, price: 1800, shipping: null, tax: null, arrival: null,
    available: true, match: 'alternative',
  };
}

function request(id: string): CartRequest {
  return {
    id, retailer: 'Shopify', operation: 'prepare-and-verify',
    lines: [
      { id: 'mugs', quantity: 2, owner: 'fitoutagent' },
      { id: 'extra-mug', quantity: 1, owner: 'fitoutagent' },
    ],
  };
}

function cart(quantity = 3) {
  return {
    id: 'gid://shopify/Cart/fixture', checkoutUrl,
    lines: { nodes: [{ quantity, merchandise: { id: variant } }] },
  };
}

test('Shopify HTTP cart creation aggregates duplicate variants and reads quantities back', async t => {
  const queries: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    assert.equal(url, 'https://demo.myshopify.com/api/2026-07/graphql.json');
    assert.equal((init.headers as Record<string, string>)['X-Shopify-Storefront-Access-Token'], 'fixture-token');
    assert.ok(init.signal);
    const body = JSON.parse(String(init.body));
    queries.push(body.query);
    if (body.query.includes('mutation CartCreate')) {
      assert.deepEqual(body.variables.lines, [{ merchandiseId: variant, quantity: 3 }]);
      return Response.json({ data: { cartCreate: { cart: cart(), userErrors: [] } } });
    }
    assert.equal(body.variables.id, cart().id);
    return Response.json({ data: { cart: cart() } });
  });
  const wanted = request('shopify-success');
  const result = await prepareStorefront(wanted, [offer('mugs'), offer('extra-mug')]);
  assert.equal(queries.length, 2);
  assert.equal(result.verified, true);
  assert.equal(result.mock, false);
  assert.equal(result.checkoutUrl, checkoutUrl);
  assert.deepEqual(result.lines, wanted.lines);
});

test('Shopify reduced quantity cannot be reported as a verified basket', async t => {
  t.mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    return Response.json({ data: body.query.includes('mutation CartCreate')
      ? { cartCreate: { cart: cart(1), userErrors: [] } } : { cart: cart(1) } });
  });
  const result = await prepareStorefront(request('shopify-short'), [offer('mugs'), offer('extra-mug')]);
  assert.equal(result.verified, false);
  assert.match(result.error!, /did not match/);
  assert.deepEqual(result.lines, []);
});

test('Shopify inventory user errors prevent a successful handoff', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({
    data: { cartCreate: { cart: null, userErrors: [{ message: 'Requested quantity is unavailable' }] } },
  }));
  await assert.rejects(
    prepareStorefront(request('shopify-stock'), [offer('mugs'), offer('extra-mug')]),
    /Requested quantity is unavailable/,
  );
});

test('Shopify missing cart on readback remains unverified', async t => {
  t.mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    return Response.json({ data: body.query.includes('mutation CartCreate')
      ? { cartCreate: { cart: cart(), userErrors: [] } } : { cart: null } });
  });
  const result = await prepareStorefront(request('shopify-missing'), [offer('mugs'), offer('extra-mug')]);
  assert.equal(result.verified, false);
  assert.match(result.error!, /missing on readback/);
});

test('Shopify readback HTTP failure remains unverified and retains the error', async t => {
  t.mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    return body.query.includes('mutation CartCreate')
      ? Response.json({ data: { cartCreate: { cart: cart(), userErrors: [] } } })
      : new Response('', { status: 429 });
  });
  const result = await prepareStorefront(request('shopify-throttle'), [offer('mugs'), offer('extra-mug')]);
  assert.equal(result.verified, false);
  assert.match(result.error!, /HTTP 429/);
});

test('Shopify verification without a prepared cart fails explicitly', async () => {
  const result = await shopifyCart.verify(request('never-prepared'));
  assert.equal(result.verified, false);
  assert.match(result.error!, /No prepared Shopify cart/);
});
