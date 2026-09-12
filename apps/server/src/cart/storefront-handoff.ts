import type { CartRequest, CartResult, Offer } from '@fitoutagent/shared';
import { shopifyCart } from './shopify-cart';

export function isStorefrontRequest(request: CartRequest, offers: Offer[]) {
  return request.lines.length > 0 && request.lines.every(line =>
    offers.find(offer => offer.id === line.id)?.source === 'ShopifyStorefront');
}

/** Merge repeated variants for Shopify, then restore checklist identities after readback. */
export async function prepareStorefront(request: CartRequest, offers: Offer[]): Promise<CartResult> {
  const quantities = new Map<string, number>();
  const identities = new Map<string, string>();
  for (const line of request.lines) {
    const offer = offers.find(offer => offer.id === line.id);
    if (!offer || offer.source !== 'ShopifyStorefront') throw new Error('Product is not from the configured Shopify store');
    const id = `Shopify:${offer.nativeId}`;
    identities.set(line.id, id);
    quantities.set(id, (quantities.get(id) ?? 0) + line.quantity);
  }
  const remapped: CartRequest = {
    ...request,
    lines: [...quantities].map(([id, quantity]) => ({ id, quantity, owner: 'fitoutagent' })),
  };
  await shopifyCart.prepare(remapped);
  const result = await shopifyCart.verify(remapped);
  return {
    ...result,
    lines: result.verified ? request.lines : request.lines.filter(line => {
      const id = identities.get(line.id);
      return result.lines.some(actual => actual.id === id && actual.quantity === quantities.get(id));
    }),
  };
}
