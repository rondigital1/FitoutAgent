import { fetchRetailer, searchItems } from './runtime';
import type { DiscoveryTool, Offer, Requirements } from '@fitoutagent/shared';

/**
 * FACT: Shopify Global Catalog MCP — cross-merchant product search (no store required).
 * https://shopify.dev/docs/agents/catalog/global-catalog
 * Endpoint: https://catalog.shopify.com/api/ucp/mcp
 * Auth: agent profile URL in meta.ucp-agent.profile (no Storefront token).
 * checkout_url on variants is a merchant cart permalink — not a multi-merchant session cart.
 */

const MCP_URL = 'https://catalog.shopify.com/api/ucp/mcp';
const DEFAULT_PROFILE = 'https://shopify.dev/ucp/agent-profiles/2026-08-25/valid-with-capabilities.json';

export function shopifyGlobalCatalogEnabled() {
  // Opt-in: set SHOPIFY_GLOBAL_CATALOG=1 (see root `.env` for local demo).
  return process.env.SHOPIFY_GLOBAL_CATALOG === '1';
}

type Variant = {
  id?: string;
  title?: string;
  price?: { amount?: number; currency?: string };
  checkout_url?: string;
  availability?: { available?: boolean };
  seller?: { name?: string; domain?: string; url?: string; id?: string };
};

type Product = {
  description?: string;
  id?: string;
  title?: string;
  url?: string;
  media?: Array<{ type?: string; url?: string }>;
  variants?: Variant[];
};

async function catalogCall(name: string, catalog: Record<string, unknown>) {
  const res = await fetchRetailer(MCP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'tools/call',
      id: 1,
      params: {
        name,
        arguments: {
          meta: { 'ucp-agent': { profile: process.env.SHOPIFY_UCP_AGENT_PROFILE || DEFAULT_PROFILE } },
          catalog,
        },
      },
    }),
  });
  const json = await res.json() as {
    result?: { isError?: boolean; structuredContent?: { products?: Product[]; product?: Product } };
    error?: { message?: string };
  };
  if (!res.ok || json.error || json.result?.isError) {
    throw new Error(json.error?.message ?? `Global Catalog HTTP ${res.status}`);
  }
  if (!json.result?.structuredContent || !Array.isArray(json.result.structuredContent.products)) throw new Error('Invalid catalog response');
  return json.result.structuredContent;
}

function httpsUrl(v: unknown): string | null {
  return typeof v === 'string' && v.startsWith('https://') ? v : null;
}

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", '#x27': "'",
};

/** Catalog search returns match-highlighted titles (`Anker <b>341</b> …`) and HTML
 * entities. Offer names are plain text, so strip both before they reach the panel. */
function plainText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, code: string) => {
      const named = ENTITIES[code.toLowerCase()] ?? ENTITIES[code];
      if (named) return named;
      const num = /^#x/i.test(code) ? parseInt(code.slice(2), 16) : /^#/.test(code) ? parseInt(code.slice(1), 10) : NaN;
      return Number.isInteger(num) && num >= 0 && num <= 0x10ffff ? String.fromCodePoint(num) : match;
    })
    .replace(/\s+/g, ' ')
    .trim();
  return text || null;
}

function pickVariant(p: Product): Variant | null {
  const variants = p.variants ?? [];
  const available = variants.find(v => v.availability?.available !== false && v.id && typeof v.price?.amount === 'number');
  return available ?? variants.find(v => v.id && typeof v.price?.amount === 'number') ?? null;
}

async function searchItem(item: Requirements['items'][number], zip?: string, limit = 5): Promise<Offer[]> {
  const content = await catalogCall('search_catalog', {
    query: item.query,
    filters: {
      available: true,
      ships_to: { country: 'US', ...(zip ? { postal_code: zip } : {}) },
    },
    context: { address_country: 'US', currency: 'USD', ...(zip ? { postal_code: zip } : {}), intent: item.label },
    pagination: { limit },
  });
  const products = content?.products ?? [];
  const offers: Offer[] = [];
  for (const p of products) {
    const variant = pickVariant(p);
    if (!variant?.id) continue;
    const amount = variant.price?.amount;
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0 || (variant.price?.currency && variant.price.currency !== 'USD')) continue;
    const checkout = httpsUrl(variant.checkout_url);
    const productUrl = httpsUrl(p.url);
    const seller = plainText(variant.seller?.name) ?? plainText(variant.seller?.domain);
    const title = plainText(p.title) ?? plainText(variant.title) ?? 'Product';
    offers.push({
      id: `Shopify:${variant.id}`,
      checklistItemId: item.id,
      name: seller ? `${title} · ${seller}` : title,
      retailer: 'Shopify',
      nativeId: variant.id,
      description: plainText(p.description)?.slice(0, 6000),
      variant: plainText(variant.title)?.slice(0, 500),
      merchant: (variant.seller?.domain ?? variant.seller?.id ?? variant.seller?.name)?.slice(0, 300),
      // Prefer checkout permalink for handoff; fall back to product page
      url: checkout ?? productUrl,
      image: httpsUrl(p.media?.find(m => m.type === 'image')?.url ?? p.media?.[0]?.url),
      brand: null,
      price: Math.round(amount), // already minor units (cents) per UCP
      shipping: null,
      tax: null,
      arrival: null,
      available: variant.availability?.available !== false,
      match: 'alternative',
    });
  }
  return offers;
}

export const shopifyGlobalCatalogDiscovery: DiscoveryTool = {
  async discover(r: Requirements, onIssue, _onReport, options) {
    if (!shopifyGlobalCatalogEnabled()) return [];
    return searchItems(r, item => searchItem(item, r.zip, options?.limit), onIssue);
  },
};
