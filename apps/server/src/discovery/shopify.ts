import { fetchRetailer, searchItems } from './runtime';
import type { DiscoveryTool, Offer, Requirements } from '@settlein/shared';

/** FACT: Shopify Storefront API search + cart mutations.
 * https://shopify.dev/docs/api/storefront/latest/queries/search
 * https://shopify.dev/docs/storefronts/headless/building-with-the-storefront-api/cart/manage
 */
export function shopifyEnabled() {
  return Boolean(process.env.SHOPIFY_STORE_DOMAIN && process.env.SHOPIFY_STOREFRONT_TOKEN);
}

export async function storefront<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const shop = process.env.SHOPIFY_STORE_DOMAIN!;
  const token = process.env.SHOPIFY_STOREFRONT_TOKEN!;
  const res = await fetchRetailer(`https://${shop}/api/2026-07/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Storefront-Access-Token': token,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json() as { data?: T; errors?: unknown[] };
  if (!res.ok || json.errors?.length) throw new Error(`Shopify Storefront error: ${JSON.stringify(json.errors ?? res.status)}`);
  return json.data as T;
}

const SEARCH = `#graphql
  query Search($q: String!, $limit: Int!) {
    search(query: $q, types: PRODUCT, first: $limit) {
      nodes {
        ... on Product {
          title
          vendor
          description
          onlineStoreUrl
          featuredImage { url }
          variants(first: 5) {
            nodes { id title price { amount currencyCode } availableForSale image { url } }
          }
        }
      }
    }
  }`;

function httpsUrl(v: unknown): string | null {
  return typeof v === 'string' && v.startsWith('https://') ? v : null;
}

function dollarsToCents(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 && v !== '' ? Math.round(n * 100) : null;
}

async function searchItem(item: Requirements['items'][number], limit = 5): Promise<Offer[]> {
  const data = await storefront<{
    search: { nodes: Array<{
      title?: string;
      vendor?: string;
      description?: string;
      onlineStoreUrl?: string;
      featuredImage?: { url?: string } | null;
      variants?: { nodes: Array<{ id: string; title?: string; price?: { amount: string; currencyCode?: string }; availableForSale?: boolean; image?: { url?: string } | null }> };
    }> };
  }>(SEARCH, { q: item.query, limit });
  const offers: Offer[] = [];
  for (const node of data.search?.nodes ?? []) {
    for (const variant of node.variants?.nodes ?? []) {
      if (!variant?.id || (variant.price?.currencyCode && variant.price.currencyCode !== 'USD')) continue;
      offers.push({
        id: `Shopify:${variant.id}`,
        checklistItemId: item.id,
        name: node.title ?? variant.id,
        description: node.description?.slice(0, 6000),
        variant: variant.title?.slice(0, 500),
        merchant: process.env.SHOPIFY_STORE_DOMAIN,
        retailer: 'Shopify',
        nativeId: variant.id,
        url: node.onlineStoreUrl && node.onlineStoreUrl.startsWith('http') ? node.onlineStoreUrl : null,
        image: httpsUrl(variant.image?.url ?? node.featuredImage?.url),
        brand: node.vendor ?? null,
        price: dollarsToCents(variant.price?.amount),
        shipping: null,
        tax: null,
        arrival: null,
        available: variant.availableForSale !== false,
        match: 'alternative',
      });
    }
  }
  return offers;
}

export const shopifyDiscovery: DiscoveryTool = {
  async discover(r: Requirements, onIssue, _onReport, options) {
    if (!shopifyEnabled()) return [];
    return searchItems(r, item => searchItem(item, options?.limit), onIssue);
  },
};
