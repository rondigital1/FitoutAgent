import { fetchRetailer, searchItems } from './runtime';
import { createSign } from 'node:crypto';
import type { DiscoveryTool, Offer, Requirements } from '@fitoutagent/shared';

/** FACT: Walmart Affiliate Marketing API — search/items, not cart.
 * https://walmart.io/apidocs/affiliates/affiliate-marketing-api
 */
const BASE = 'https://developer.api.walmart.com/api-proxy/service/affil/product/v2';

function httpsUrl(v: unknown): string | null {
  return typeof v === 'string' && v.startsWith('https://') ? v : null;
}

function dollarsToCents(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 && v !== '' ? Math.round(n * 100) : null;
}

function walmartHeaders(): Record<string, string> | null {
  const consumerId = process.env.WALMART_CONSUMER_ID;
  const keyVersion = process.env.WALMART_KEY_VERSION;
  const pem = process.env.WALMART_PRIVATE_KEY_PEM?.replace(/\\n/g, '\n');
  if (!consumerId || !keyVersion || !pem) return null;
  const timestamp = Date.now().toString();
  const signer = createSign('RSA-SHA256');
  signer.update(`${consumerId}\n${timestamp}\n${keyVersion}\n`);
  return {
    'WM_CONSUMER.ID': consumerId,
    'WM_CONSUMER.INTIMESTAMP': timestamp,
    'WM_SEC.KEY_VERSION': keyVersion,
    'WM_SEC.AUTH_SIGNATURE': signer.sign(pem, 'base64'),
  };
}

export function walmartEnabled() {
  return Boolean(process.env.WALMART_PUBLISHER_ID && process.env.WALMART_CONSUMER_ID && process.env.WALMART_KEY_VERSION && process.env.WALMART_PRIVATE_KEY_PEM);
}

async function searchItem(
  item: Requirements['items'][number],
  headers: Record<string, string>,
  publisherId: string,
  limit = 5,
): Promise<Offer[]> {
  const url = new URL(`${BASE}/search`);
  url.searchParams.set('publisherId', publisherId);
  url.searchParams.set('query', item.query);
  url.searchParams.set('numItems', String(limit));
  const res = await fetchRetailer(url, { headers });
  const data = await res.json() as Record<string, any>;
  const rows = (data.items ?? data.docs ?? data.response?.items ?? []) as Record<string, unknown>[];
  const offers: Offer[] = [];
  for (const raw of Array.isArray(rows) ? rows : []) {
    const nativeId = String(raw.itemId ?? raw.id ?? '');
    if (!nativeId) continue;
    const productUrl = raw.productUrl ?? raw.productPageUrl ?? raw.itemUrl;
    offers.push({
      id: `Walmart:${nativeId}`,
      checklistItemId: item.id,
      name: String(raw.name ?? raw.title ?? `Walmart ${nativeId}`),
      retailer: 'Walmart',
      nativeId,
      description: String(raw.longDescription ?? raw.shortDescription ?? "").replace(/<[^>]*>/g, " ").slice(0, 6000),
      merchant: typeof raw.sellerName === "string" ? raw.sellerName.slice(0, 300) : "walmart.com",
      url: typeof productUrl === 'string' && productUrl.startsWith('http') ? productUrl : null,
      image: httpsUrl(raw.largeImage ?? raw.mediumImage ?? raw.thumbnailImage),
      brand: typeof raw.brandName === 'string' ? raw.brandName : null,
      price: dollarsToCents(raw.salePrice ?? raw.price),
      shipping: null,
      tax: null,
      arrival: null,
      available: !/not available|out.of.stock|unavailable/i.test(String(raw.stock ?? raw.availabilityStatus ?? '')),
      match: 'alternative',
    });
  }
  return offers;
}

export const walmartAffiliateDiscovery: DiscoveryTool = {
  async discover(r: Requirements, onIssue, _onReport, options) {
    const headers = walmartHeaders();
    const publisherId = process.env.WALMART_PUBLISHER_ID;
    if (!headers || !publisherId) return [];
    return searchItems(r, item => searchItem(item, headers, publisherId, options?.limit), onIssue);
  },
};
