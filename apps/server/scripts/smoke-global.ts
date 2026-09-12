import { loadEnv } from '../src/load-env.ts';
loadEnv();
import { compositeDiscovery, activeDiscoverySources } from '../src/discovery/composite.ts';

async function main() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 7);
  const deadline = tomorrow.toISOString().slice(0, 10);
  const offers = await compositeDiscovery.discover({
    goal: 'furnish a small home office',
    budget: 150000,
    deadline,
    owned: [],
    items: [
      { id: 'desk', label: 'Desk', query: 'standing desk', quantity: 1, must: true },
      { id: 'chair', label: 'Chair', query: 'ergonomic office chair', quantity: 1, must: true },
    ],
  });
  console.log('sources', activeDiscoverySources());
  console.log('count', offers.length);
  for (const o of offers.slice(0, 8)) {
    console.log(JSON.stringify({
      name: o.name.slice(0, 90),
      priceCents: o.price,
      brand: o.brand,
      hasCheckout: Boolean(o.url),
      retailer: o.retailer,
    }));
  }
}
main().catch(e => { console.error(e); process.exit(1); });
