import type { DiscoveryTool, Offer, RefreshTool, Requirements } from '@fitoutagent/shared';

const OFFICE_PRICES: Record<string, number> = {
  desk: 18000,
  chair: 14500,
  lamp: 2800,
  'power-strip': 1800,
  storage: 4200,
};

function isMockOffer(o: Offer) {
  return !o.id.includes(':') && (o.id.endsWith('-0') || o.id.endsWith('-1'));
}

/** Deterministic mock catalog — used only when live adapters miss a checklist line (or no keys). */
export const mockDiscovery: DiscoveryTool = {
  async discover(r: Requirements) {
    const offers: Offer[] = [];
    r.items.forEach((item, i) => {
      const base = OFFICE_PRICES[item.id] ?? (5000 + i * 3000);
      for (const [variant, retailer] of [[0, 'Walmart'], [1, 'Shopify']] as const) {
        offers.push({
          id: `${item.id}-${variant}`,
          checklistItemId: item.id,
          name: `${item.label}${variant ? ' · Studio' : ' · Essential'}`,
          retailer,
          source: 'Mock',
          nativeId: `${item.id}-${variant}`,
          url: null,
          image: null,
          brand: null,
          price: base + variant * 2000,
          tax: null,
          shipping: null,
          arrival: r.deadline,
          available: true,
          match: variant === 0 ? 'exact' : 'alternative',
        });
      }
    });
    return offers;
  },
};

/**
 * Refresh costs/availability.
 * - Mock offers: demo theater (first Essential unavailable, 8% tax, $0 shipping, arrival=deadline)
 * - Live offers: do NOT invent unavailability; leave tax/shipping null unless known
 */
export const mockRefresh: RefreshTool = {
  async refresh(offers) {
    const mockOffers = offers.filter(isMockOffer);
    const firstEssential = mockOffers.find(o => o.id.endsWith('-0'));
    return offers.map(o => {
      if (!isMockOffer(o)) {
        return { ...o, shipping: o.shipping, tax: o.tax };
      }
      return {
        ...o,
        available: firstEssential ? o.id !== firstEssential.id : o.available,
        shipping: 0,
        tax: o.price === null ? null : Math.round(o.price * 0.08),
        arrival: o.arrival,
      };
    });
  },
};

export const discovery = mockDiscovery;
export const refresh = mockRefresh;
