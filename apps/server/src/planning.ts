import { evaluate, type Retailer, type State } from '@fitoutagent/shared';

import { optimize } from './optimizer';
import { finishRecovery, unresolved } from './recovery/status';

/** Preserve explicit choices while offering whole-basket alternatives. */
export function compare(s: State, reset = false) {
  for (const [id, result] of Object.entries(s.searchRecovery ?? {})) {
    const item = s.requirements?.items.find(item => item.id === id);
    if (item && !unresolved(s, item)) finishRecovery(s, item, result);
    else if (result.status === 'locked' && !s.offers.some(o => o.checklistItemId === id && s.locks.includes(o.id))) {
      result.status = 'unverified'; result.message = 'The product is unlocked. Retry the search to find a suitable replacement.';
    }
  }
  const r = { ...s.requirements!, items: s.requirements!.items.filter(item => !s.skippedItemIds.includes(item.id)) };
  const recommended = optimize(r, s.offers, s.locks, 'fit');
  if (reset || !s.selected.length) s.selected = recommended.productIds;
  const current = evaluate('essential', reset ? 'Recommended basket' : 'Your basket', s.offers.filter(o => s.selected.includes(o.id)), r);
  current.explanation = reset ? recommended.explanation : 'Your current choices. Apply a recommendation to replace unlocked products.';
  if (s.locks.some(id => !s.selected.includes(id))) current.issues.push('A locked product is missing. Unlock it before replacing it.');
  s.plans = [current, recommended, optimize(r, s.offers, s.locks, 'cost'), optimize(r, s.offers, s.locks, 'stores')];
}

export function nextBasket(s: State) {
  const retailers = [...new Set(
    s.selected
      .map(id => s.offers.find(o => o.id === id)?.retailer)
      .filter((r): r is Retailer => Boolean(r)),
  )];

  const retailer = retailers.find(r => !s.baskets.some(b => b.retailer === r && b.verified));
  if (!retailer) {
    s.phase = 'complete';
    s.pending = null;
    s.log.push('All requested baskets prepared/verified. No purchase made.');
    return;
  }

  const attempt = (s.attempts[retailer] ?? 0) + 1;
  if (attempt > 2) {
    s.pending = null;
    s.log.push(`${retailer}: retry limit reached. Change constraints to create a new plan.`);
    return;
  }
  s.attempts[retailer] = attempt;
  s.pending = {
    id: `${s.id}-${s.revision}-${retailer}-${attempt}`,
    operation: 'prepare-and-verify',
    retailer,
    lines: s.selected.flatMap(id => {
      const o = s.offers.find(o => o.id === id)!;
      const item = s.requirements!.items.find(i => i.id === o.checklistItemId)!;
      if (o.retailer !== retailer) return [];
      return [{ id: o.id, quantity: item.quantity, owner: 'fitoutagent' as const }];
    }),
  };
}
