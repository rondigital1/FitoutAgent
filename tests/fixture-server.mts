import { promptImprover } from '../apps/server/src/discovery/improve-prompt';
promptImprover.improve = async state => `Find suitable products for ${state.draft!.goal}. Compare product fit, prices and available sellers.`;
import { categorySearchPlanner } from '../apps/server/src/discovery/category-search-plan';
categorySearchPlanner.plan = async (_state, item) => {
  await new Promise(resolve => setTimeout(resolve, 300));
  return { query: item.query, sources: ['ShopifyGlobalCatalog'], reason: 'Searching different marketplace products' };
};
// External-provider fixtures; requests still traverse the real HTTP workflow and persistence.
import { smartDecomposer, ruleDecomposer } from '../apps/server/src/discovery/decompose';
import { compositeDiscovery } from '../apps/server/src/discovery/composite';
import { mockDiscovery } from '../apps/server/src/mock-tools';
smartDecomposer.decompose = async input => {
  if (input.goal.includes('provider failure')) throw new Error('Checklist provider unavailable. Please retry.');
  return ruleDecomposer.decompose(input);
};
compositeDiscovery.discover = async (requirements, _onIssue, onReport, options) => {
  if (requirements.goal.includes('catalog failure')) throw new Error('Catalog unavailable. Please retry.');
  const offers = (await mockDiscovery.discover(requirements))
    .filter(o => !o.name.includes('No results item'))
    .map(o => ({ ...o, id: `Shopify:${o.id}`, retailer: 'Shopify' as const, available: true, url: `https://example.com/products/${o.id}` }));
  if (options && offers.length) offers.push({ ...offers[0], id: `${offers[0].id}:extra`, nativeId: `${offers[0].nativeId}:extra`, name: 'Additional category option' });
  if (requirements.goal.includes('mixed retailers')) {
    for (const offer of offers) {
      if (offer.checklistItemId === requirements.items[0].id) {
        Object.assign(offer, { retailer: 'Walmart', id: offer.id.replace('Shopify:', 'Walmart:'), merchant: 'Walmart' });
      }
    }
  }
  onReport?.({ source: 'ShopifyGlobalCatalog', offerCount: offers.length, issues: [] });
  if (requirements.goal.includes('retailer outage')) {
    onReport?.({ source: 'BestBuy', offerCount: 0, issues: [{ checklistItemId: requirements.items[0].id, message: 'Retailer returned HTTP 429' }] });
  }
  return offers;
};
await import('./fit-fixture.mts');
await import('../apps/server/src/index');
