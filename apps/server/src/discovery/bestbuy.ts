import { fetchRetailer, searchItems } from './runtime';
import type { DiscoveryTool, Offer, Requirements } from '@fitoutagent/shared';

/** FACT: Best Buy Products API — documented public search.
 * https://bestbuyapis.github.io/api-documentation/
 * affiliateAddToCartUrl is a deep link, not verified session cart prep.
 */
function httpsUrl(v: unknown): string | null {
  return typeof v === 'string' && v.startsWith('https://') ? v : null;
}

function dollarsToCents(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 && v !== '' ? Math.round(n * 100) : null;
}

export function bestBuyEnabled() {
  return Boolean(process.env.BESTBUY_API_KEY);
}

async function searchItem(item: Requirements['items'][number], key: string, limit = 5): Promise<Offer[]> {
  const q = item.query.trim().split(/\s+/).map(term => `search=${encodeURIComponent(term).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16)}`)}`).join('&');
  const url =
    `https://api.bestbuy.com/v1/products(${q})?apiKey=${encodeURIComponent(key)}&format=json&pageSize=${limit}` +
    `&show=sku,name,salePrice,url,affiliateAddToCartUrl,onlineAvailability,image,manufacturer,shortDescription,longDescription`;
  const res = await fetchRetailer(url);
  const data = await res.json() as { products?: Record<string, unknown>[] };
  const offers: Offer[] = [];
  for (const raw of data.products ?? []) {
    const sku = String(raw.sku ?? '');
    if (!sku) continue;
    const link = raw.affiliateAddToCartUrl ?? raw.url;
    offers.push({
      id: `BestBuy:${sku}`,
      checklistItemId: item.id,
      name: String(raw.name ?? `Best Buy ${sku}`),
      retailer: 'BestBuy',
      nativeId: sku,
      description: String(raw.longDescription ?? raw.shortDescription ?? '').replace(/<[^>]*>/g, ' ').slice(0, 6000),
      merchant: 'bestbuy.com',
      url: typeof link === 'string' && link.startsWith('http') ? link : null,
      image: httpsUrl(raw.image),
      brand: typeof raw.manufacturer === 'string' ? raw.manufacturer : null,
      price: dollarsToCents(raw.salePrice),
      shipping: null,
      tax: null,
      arrival: null,
      available: raw.onlineAvailability !== false,
      match: 'alternative',
    });
  }
  return offers;
}

export const bestBuyDiscovery: DiscoveryTool = {
  async discover(r: Requirements, onIssue, _onReport, options) {
    const key = process.env.BESTBUY_API_KEY;
    if (!key) return [];
    return searchItems(r, item => searchItem(item, key, options?.limit), onIssue);
  },
};
