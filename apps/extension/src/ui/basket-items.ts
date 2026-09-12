import { merchantKey, type Offer, type State } from '@settlein/shared';

export type BasketItem = { offer: Offer; quantity: number; categories: string[] };

/** Build the full intended basket even while retailer preparation is pending or failed. */
export function basketItems(state: State): BasketItem[] {
  const items = new Map<string, BasketItem>();
  for (const id of state.selected) {
    const offer = state.offers.find(offer => offer.id === id);
    if (!offer || state.skippedItemIds.includes(offer.checklistItemId)) continue;
    const category = state.requirements?.items.find(item => item.id === offer.checklistItemId);
    if (!category) continue;
    const key = `${merchantKey(offer)}:${offer.nativeId}`;
    const existing = items.get(key);
    if (existing) {
      existing.quantity += category.quantity;
      existing.categories.push(category.label);
    } else items.set(key, { offer, quantity: category.quantity, categories: [category.label] });
  }
  return [...items.values()];
}

export function sellerName(offer: Offer): string {
  if (offer.merchant) return offer.merchant;
  if (offer.retailer === 'Shopify' && offer.url) {
    try { return new URL(offer.url).hostname.replace(/^www\./, ''); } catch { /* older URLs */ }
  }
  return offer.retailer === 'BestBuy' ? 'Best Buy' : offer.retailer;
}
