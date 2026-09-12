import { Offer, type DiscoveryReport, type DiscoveryTool, type Requirements } from '@fitoutagent/shared';
import { bestBuyDiscovery, bestBuyEnabled } from './bestbuy';
import { shopifyDiscovery, shopifyEnabled } from './shopify';
import { shopifyGlobalCatalogDiscovery, shopifyGlobalCatalogEnabled } from './shopify-global-catalog';
import { walmartAffiliateDiscovery, walmartEnabled } from './walmart-affiliate';
import { mockDiscovery } from '../mock-tools';

function liveParts(): { source: string; tool: DiscoveryTool }[] {
  return [
    { source: 'WalmartAffiliate', tool: walmartAffiliateDiscovery, enabled: walmartEnabled() },
    { source: 'BestBuy', tool: bestBuyDiscovery, enabled: bestBuyEnabled() },
    { source: 'ShopifyGlobalCatalog', tool: shopifyGlobalCatalogDiscovery, enabled: shopifyGlobalCatalogEnabled() },
    { source: 'ShopifyStorefront', tool: shopifyDiscovery, enabled: shopifyEnabled() },
  ].filter(part => part.enabled);
}

export function activeDiscoverySources(): string[] {
  const sources = liveParts().map(part => part.source);
  return process.env.ALLOW_MOCK_FALLBACK === '1' ? [...sources, 'Mock'] : sources;
}

export async function discoverProducts(r: Requirements, options?: { limit: number; sources?: string[] }) {
  const parts = liveParts().filter(part => !options?.sources || options.sources.includes(part.source));
  const allowMock = process.env.ALLOW_MOCK_FALLBACK === '1' && (!options?.sources || options.sources.includes('Mock'));
  if (!parts.length && !allowMock) {
    throw new Error('No product sources configured. Enable SHOPIFY_GLOBAL_CATALOG=1 or configure retailer credentials in the server .env, then restart the server.');
  }
  const results = await Promise.all(parts.map(async ({ source, tool }) => {
    const report: DiscoveryReport = { source, offerCount: 0, issues: [] };
    let raw: Offer[] = [];
    try {
      raw = await tool.discover(r, issue => report.issues.push(issue), undefined, options);
    } catch {
      report.issues.push({ checklistItemId: '', message: 'Search failed. Check retailer credentials and configuration.' });
    }
    const seen = new Set<string>();
    const offers = raw.flatMap(candidate => {
      const parsed = Offer.safeParse(candidate);
      if (!parsed.success || !r.items.some(item => item.id === candidate.checklistItemId)) {
        report.issues.push({ checklistItemId: candidate.checklistItemId ?? '', message: 'An invalid product response was skipped.' });
        return [];
      }
      const offer = parsed.data;
      // Offer identity includes the line and adapter; nativeId remains the merchant identifier.
      const id = `${source}:${encodeURIComponent(offer.checklistItemId)}:${encodeURIComponent(offer.nativeId)}`;
      if (seen.has(id)) return [];
      seen.add(id);
      return [{ ...offer, id, source }];
    });
    report.offerCount = offers.length;
    return { offers, report };
  }));
  const offers: Offer[] = results.flatMap(result => result.offers);
  const reports = results.map(result => result.report);
  const missing = r.items.filter(item => !offers.some(offer => offer.checklistItemId === item.id && offer.available));
  if (allowMock && missing.length) {
    const mock = await mockDiscovery.discover({ ...r, items: missing });
    offers.push(...mock);
    reports.push({ source: 'Mock', offerCount: mock.length, issues: [] });
  }
  return { offers, reports };
}

export const compositeDiscovery: DiscoveryTool = {
  async discover(r, _onIssue, onReport, options) {
    const result = await discoverProducts(r, options);
    result.reports.forEach(report => onReport?.(report));
    return result.offers;
  },
};
