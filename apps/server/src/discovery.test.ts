import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { initialState, type Requirements, type Offer, type CartRequest } from '@fitoutagent/shared';
import { activeDiscoverySources, discoverProducts } from './discovery/composite';
import { fetchRetailer, searchItems } from './discovery/runtime';
import { transition } from './workflow';
import { isStorefrontRequest, prepareStorefront } from './cart/storefront-handoff';
import { shopifyCart } from './cart/shopify-cart';

const env = { ...process.env };
beforeEach(() => {
  for (const key of Object.keys(process.env)) {
    if (/^(SHOPIFY_|WALMART_|BESTBUY_|ALLOW_MOCK)/.test(key)) delete process.env[key];
  }
});
afterEach(() => { process.env = { ...env }; });
const r: Requirements = {
  goal: 'Office', budget: 100000, deadline: null, owned: [], zip: '10001',
  items: ['desk', 'second-desk'].map(id => ({ id, label: 'Desk', query: 'standing desk', quantity: 1, must: true })),
};
const product = { sku: 42, name: 'Standing desk', salePrice: 99.99, url: 'https://bestbuy.com/product/42', onlineAvailability: true };
const catalog = { result: { structuredContent: { products: [{ title: 'Desk &amp; stand', variants: [{ id: 'global-42', price: { amount: 12500, currency: 'USD' }, checkout_url: 'https://merchant.example/cart/42', seller: { name: 'Merchant' } }] }] } } };

test('no configuration never silently returns demo products', async () => {
  assert.deepEqual(activeDiscoverySources(), []);
  await assert.rejects(discoverProducts(r), /No product sources configured/);
  process.env.ALLOW_MOCK_FALLBACK = '1';
  assert.ok((await discoverProducts(r)).offers.length > 0);
});

test('all four adapters run together and duplicate SKUs remain separate checklist choices', async t => {
  process.env.BESTBUY_API_KEY = 'test';
  process.env.SHOPIFY_GLOBAL_CATALOG = '1';
  process.env.SHOPIFY_STORE_DOMAIN = 'store.myshopify.com';
  process.env.SHOPIFY_STOREFRONT_TOKEN = 'test';
  process.env.WALMART_CONSUMER_ID = 'test';
  process.env.WALMART_PUBLISHER_ID = 'test';
  process.env.WALMART_KEY_VERSION = '1';
  process.env.WALMART_PRIVATE_KEY_PEM = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const calls: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string | URL, init?: RequestInit) => {
    calls.push(String(url));
    assert.ok(init?.signal);
    if (String(url).includes('bestbuy')) {
      assert.match(String(url), /search=standing&search=desk/);
      return Response.json({ products: [product, product] });
    }
    if (String(url).includes('walmart')) {
      assert.ok((init?.headers as Record<string, string>)['WM_SEC.AUTH_SIGNATURE']);
      return Response.json({ items: [{ itemId: 9, name: 'Desk', salePrice: '100.50', stock: 'Out of Stock', productUrl: 'https://walmart.com/ip/9' }] });
    }
    const body = JSON.parse(String(init?.body));
    if (String(url).includes('catalog.shopify')) {
      assert.equal(body.params.arguments.catalog.context.postal_code, '10001');
      return Response.json(catalog);
    }
    assert.equal(body.variables.q, 'standing desk');
    return Response.json({ data: { search: { nodes: [{ title: 'Store desk', onlineStoreUrl: 'https://store.myshopify.com/products/desk', variants: { nodes: [{ id: 'gid://shopify/ProductVariant/42', price: { amount: '110', currencyCode: 'USD' }, availableForSale: true }] } }] } } });
  });
  const { offers, reports } = await discoverProducts(r);
  assert.equal(calls.length, 8);
  assert.equal(offers.length, 8);
  assert.equal(new Set(offers.map(o => o.id)).size, 8);
  assert.equal(reports.length, 4);
  assert.ok(reports.every(report => report.issues.length === 0 && report.offerCount === 2));
  assert.equal(offers.find(o => o.retailer === 'Walmart')?.available, false);
  assert.equal(offers.find(o => o.source === 'ShopifyGlobalCatalog')?.price, 12500);
  const s = initialState('two-desks');
  s.draft = r; s.requirements = r; s.phase = 'checklist';
  await transition(s, { type: 'confirm-checklist' }, async () => {});
  assert.equal(s.selected.length, 2);
  assert.equal(s.plans[0].subtotal, 19998);
});

test('one failed query preserves other queries and reports HTTP failure without secrets', async t => {
  process.env.BESTBUY_API_KEY = 'secret';
  let count = 0;
  t.mock.method(globalThis, 'fetch', async () => ++count === 1
    ? new Response('secret provider response', { status: 429 }) : Response.json({ products: [product] }));
  const { offers, reports } = await discoverProducts(r);
  assert.equal(offers.length, 1);
  assert.equal(reports[0].issues[0].checklistItemId, 'desk');
  assert.match(reports[0].issues[0].message, /HTTP 429/);
  assert.ok(!JSON.stringify(reports).includes('secret'));
});

test('MCP tool errors and invalid Walmart signing keys do not hide other retailers', async t => {
  process.env.SHOPIFY_GLOBAL_CATALOG = '1'; process.env.BESTBUY_API_KEY = 'test';
  for (const key of ['CONSUMER_ID', 'PUBLISHER_ID', 'KEY_VERSION', 'PRIVATE_KEY_PEM']) process.env[`WALMART_${key}`] = 'invalid';
  t.mock.method(globalThis, 'fetch', async (url: string | URL) => String(url).includes('bestbuy')
    ? Response.json({ products: [product] }) : Response.json({ result: { isError: true, content: [{ type: 'text', text: 'private detail' }] } }));
  const { offers, reports } = await discoverProducts(r);
  assert.equal(offers.length, 2);
  assert.equal(reports.filter(report => report.issues.length > 0).length, 2);
});

test('a successful empty search remains distinct from a provider failure', async t => {
  process.env.BESTBUY_API_KEY = 'test';
  t.mock.method(globalThis, 'fetch', async () => Response.json({ products: [] }));
  const result = await discoverProducts(r);
  assert.deepEqual(result.offers, []);
  assert.deepEqual(result.reports[0].issues, []);
});

test('request timeout is installed and surfaced as a retryable search issue', async t => {
  let timeout = 0;
  t.mock.method(AbortSignal, 'timeout', (ms: number) => { timeout = ms; return AbortSignal.abort(new DOMException('expired', 'TimeoutError')); });
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => { init.signal!.throwIfAborted(); return Response.json({}); });
  const issues: unknown[] = [];
  const offers = await searchItems(r, async () => { await fetchRetailer('https://example.com'); return []; }, issue => issues.push(issue));
  assert.equal(timeout, 12000);
  assert.deepEqual(offers, []);
  assert.match(JSON.stringify(issues), /timed out/);
});

test('concurrency is bounded to four searches per retailer', async () => {
  let active = 0; let peak = 0;
  await searchItems({ ...r, items: Array.from({ length: 10 }, (_, i) => ({ ...r.items[0], id: String(i) })) }, async () => {
    peak = Math.max(peak, ++active);
    await new Promise(resolve => setTimeout(resolve, 2));
    active--; return [];
  });
  assert.equal(peak, 4);
});

test('Storefront readback preserves scoped offer IDs and aggregates identical variants', async t => {
  const offers: Offer[] = r.items.map(item => ({ id: `store:${item.id}`, checklistItemId: item.id, name: 'Desk', retailer: 'Shopify', nativeId: 'gid://shopify/ProductVariant/42', source: 'ShopifyStorefront', url: null, image: null, brand: null, price: 10000, shipping: null, tax: null, arrival: null, available: true, match: 'alternative' }));
  const request = { id: 'cart', retailer: 'Shopify' as const, operation: 'prepare-and-verify' as const, lines: offers.map(o => ({ id: o.id, quantity: 1, owner: 'fitoutagent' as const })) };
  assert.ok(isStorefrontRequest(request, offers));
  assert.equal(isStorefrontRequest(request, offers.map(o => ({ ...o, source: 'ShopifyGlobalCatalog' }))), false);
  t.mock.method(shopifyCart, 'prepare', async (actual: CartRequest) => { assert.equal(actual.lines.length, 1); assert.equal(actual.lines[0].quantity, 2); });
  t.mock.method(shopifyCart, 'verify', async (actual: CartRequest) => ({ id: actual.id, retailer: 'Shopify', verified: true, mock: false, lines: actual.lines }));
  const result = await prepareStorefront(request, offers);
  assert.deepEqual(result.lines, request.lines);
});

test('category search contacts only the agent-selected source', async t => {
  process.env.BESTBUY_API_KEY = 'test';
  process.env.SHOPIFY_GLOBAL_CATALOG = '1';
  const calls: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string | URL) => {
    calls.push(String(url));
    return Response.json({ products: [product] });
  });
  const result = await discoverProducts({ ...r, items: [r.items[0]] }, { limit: 10, sources: ['BestBuy'] });
  assert.equal(calls.length, 1);
  assert.match(calls[0], /api.bestbuy.com/);
  assert.match(calls[0], /pageSize=10/);
  assert.deepEqual(result.reports.map(report => report.source), ['BestBuy']);
});
