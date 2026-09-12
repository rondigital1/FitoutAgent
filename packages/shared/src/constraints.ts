import type { Offer, Plan, Requirements } from './index';

/** All three cost fields are per unit in cents. Missing components remain unknown. */
export function knownUnitCost(o: Offer): number | null {
  return o.price === null ? null : o.price + (o.shipping ?? 0) + (o.tax ?? 0);
}

export function merchantKey(o: Offer): string {
  if (o.merchant) return `${o.retailer}:${o.merchant.toLowerCase()}`;
  try { if (o.url) return `${o.retailer}:${new URL(o.url).hostname.toLowerCase()}`; } catch { /* legacy data */ }
  return `${o.retailer}:${o.source ?? o.retailer}`;
}

export function evaluate(id: string, label: string, offers: Offer[], r: Requirements, skippedItemIds: string[] = []): Plan {
  const issues: string[] = [];
  const warnings: string[] = [];
  let subtotal = 0;
  let knownCost = 0;
  let unknownPrice = false;
  let unknownExtras = false;
  const items = r.items.filter(item => !skippedItemIds.includes(item.id));
  offers = offers.filter(offer => items.some(item => item.id === offer.checklistItemId));
  if (!items.length) issues.push('Add at least one product before preparing shopping links');
  for (const item of items) {
    const matches = offers.filter(o => o.checklistItemId === item.id);
    const offer = matches[0];
    if (!offer) { issues.push(`Missing ${item.label}`); continue; }
    if (matches.length > 1) issues.push(`Multiple products selected for ${item.label}`);
    if (!offer.available) issues.push(`${offer.name} unavailable`);
    if (offer.fit?.status === 'rejected') issues.push(`${item.label}: product conflicts with requirements`);
    else if (offer.fit?.status !== 'verified') warnings.push(`${item.label}: product fit needs review`);
    if (r.deadline && offer.arrival && offer.arrival > r.deadline) issues.push(`${offer.name}: arrives after ${r.deadline}`);
    else if (r.deadline && !offer.arrival) warnings.push(`${item.label}: delivery date unconfirmed`);
    if (offer.price === null) unknownPrice = true;
    else {
      subtotal += offer.price * item.quantity;
      knownCost += knownUnitCost(offer)! * item.quantity;
    }
    if (offer.shipping === null || offer.tax === null) unknownExtras = true;
  }
  if (unknownPrice) issues.push('Some prices unknown; pick alternatives before approval');
  if (r.budget !== null && knownCost > r.budget) issues.push('Over budget');
  if (unknownExtras) warnings.push(r.budget === null ? 'Tax or shipping is unquoted. The final total is not yet confirmed.' : 'Tax or shipping is unquoted. The final total may exceed your budget.');
  return {
    id, label, productIds: offers.map(o => o.id),
    subtotal: unknownPrice ? null : subtotal,
    knownCost: unknownPrice ? null : knownCost,
    total: unknownPrice || unknownExtras || offers.length !== items.length ? null : knownCost,
    storeCount: new Set(offers.map(merchantKey)).size,
    issues, warnings,
  };
}
