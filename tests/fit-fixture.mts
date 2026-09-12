import { Offer } from '../packages/shared/src/index';
import { smartDecomposer } from '../apps/server/src/discovery/decompose';
import { compositeDiscovery } from '../apps/server/src/discovery/composite';
import { fitVerifier } from '../apps/server/src/fit/verify';

const decompose = smartDecomposer.decompose;
const discover = compositeDiscovery.discover;
const verify = fitVerifier.verify;
const isScenario = (goal: string) => goal.includes('fit scenario');
smartDecomposer.decompose = async input => isScenario(input.goal) ? { items: [
  { id: 'desk', label: 'Oak desk', query: 'oak desk', quantity: 2, must: true },
  { id: 'chair', label: 'Chair', query: 'chair', quantity: 1, must: true },
], suggestions: [] } : decompose(input);
compositeDiscovery.discover = async (r, ...rest) => isScenario(r.goal) ? [
  ['cover', 'desk', 'Desk cover', 100, 'a', 'rejected'],
  ['desk-a', 'desk', 'Oak desk A', 10000, 'a', 'verified'],
  ['desk-b', 'desk', 'Oak desk B', 11000, 'b', 'verified'],
  ['desk-unknown', 'desk', 'Desk material unconfirmed', 5000, 'b', 'unknown'],
  ['chair', 'chair', 'Chair', 10000, 'b', 'verified'],
].map(([id, line, name, price, merchant, status]) => Offer.parse({
  id, checklistItemId: line, name, price, merchant, source: 'Fixture', retailer: 'Shopify', nativeId: id,
  url: `https://example.com/${id}`, shipping: null, tax: null, available: true, arrival: null,
  description: name, fit: { status, summary: status === 'rejected' ? 'A cover is an accessory, not a desk.' : status === 'unknown' ? 'Material is missing.' : 'Retailer evidence supports this product.', assessedAt: '2026-09-12',
    checks: [{ requirement: line === 'desk' ? 'Oak desk' : 'Chair', status: status === 'rejected' ? 'conflict' : status === 'unknown' ? 'unknown' : 'supported', evidence: status === 'unknown' ? '' : name }] },
})) : discover(r, ...rest);
fitVerifier.verify = async (r, offers) => isScenario(r.goal) ? offers : verify(r, offers);
