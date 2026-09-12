import { Offer } from '../packages/shared/src/index';
import { smartDecomposer } from '../apps/server/src/discovery/decompose';
import { compositeDiscovery } from '../apps/server/src/discovery/composite';
import { categorySearchPlanner } from '../apps/server/src/discovery/category-search-plan';
import { fitVerifier } from '../apps/server/src/fit/verify';
// All external calls are fixture-controlled; enable one source so recovery can route to it.
process.env.SHOPIFY_GLOBAL_CATALOG = '1';
const decompose = smartDecomposer.decompose, discover = compositeDiscovery.discover, plan = categorySearchPlanner.plan, verify = fitVerifier.verify;
const scenario = (goal: string) => goal.includes('recovery scenario');
smartDecomposer.decompose = async input => scenario(input.goal) ? { items: [
  { id: 'bed', label: 'Queen steel bed frame', query: 'queen steel bed frame without headboard', quantity: 1, must: true },
  { id: 'chair', label: 'Chair', query: 'chair', quantity: 1, must: true },
], suggestions: [] } : decompose(input);
categorySearchPlanner.plan = async (s, item) => scenario(s.requirements!.goal) ? {
  query: s.searchRecovery?.[item.id]?.attempts.length ? 'steel platform bed' : 'steel bed base', sources: ['ShopifyGlobalCatalog'], reason: 'Try a more specific product phrase while keeping requirements',
} : plan(s, item);
function product(id: string) {
  return Offer.parse({ id, checklistItemId: id, name: id === 'bed' ? 'Recovered queen steel frame without headboard' : 'Chair', retailer: 'Shopify', source: 'ShopifyGlobalCatalog',
    nativeId: id, url: `https://example.com/${id}`, available: true, price: 10000, shipping: 0, tax: 0, arrival: null,
    fit: { status: 'verified', summary: 'Fixture fit evidence', checks: [], assessedAt: '2026-09-12' } });
}
compositeDiscovery.discover = async (r, issue, report, options) => {
  if (!scenario(r.goal)) return discover(r, issue, report, options);
  if (!options) return [product('chair')];
  await new Promise(resolve => setTimeout(resolve, 30));
  if (r.goal.includes('outage')) {
    report?.({ source: 'ShopifyGlobalCatalog', offerCount: 0, issues: [{ checklistItemId: 'bed', message: 'Retailer returned HTTP 503' }] });
    return [];
  }
  if (r.goal.includes('no match')) return [];
  return [product('bed')];
};
fitVerifier.verify = async (r, offers) => scenario(r.goal) ? offers : verify(r, offers);
