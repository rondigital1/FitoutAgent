import type { State } from '@fitoutagent/shared';
import { compare } from './planning';
import { eligible } from './optimizer';

/** Explicit basket edits preserve other picks and invalidate every prepared handoff. */
export function editBasketItem(s: State, productId: string, quantity: number) {
  if (!s.requirements || s.pending || !['compare', 'verify', 'complete'].includes(s.phase)) {
    throw new Error('Wait for basket preparation to finish before editing items.');
  }
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > 20) throw new Error('Choose a quantity from 1 to 20, or remove the item.');
  const offer = s.offers.find(o => o.id === productId);
  const item = s.requirements.items.find(i => i.id === offer?.checklistItemId);
  if (!offer || !item || (!s.selected.includes(productId) && !s.skippedItemIds.includes(item.id))) throw new Error('Unknown basket item.');
  if (quantity > 0 && !s.selected.includes(productId) && !eligible(offer, s.requirements)) throw new Error('This product is no longer eligible. Choose another product in Shop.');
  if (quantity === 0) {
    s.removedBasketProducts = [...(s.removedBasketProducts ?? []).filter(id => s.offers.find(o => o.id === id)?.checklistItemId !== item.id), productId];
    s.selected = s.selected.filter(id => s.offers.find(o => o.id === id)?.checklistItemId !== item.id);
    s.locks = s.locks.filter(id => s.offers.find(o => o.id === id)?.checklistItemId !== item.id);
    s.skippedItemIds = [...new Set([...s.skippedItemIds, item.id])];
  } else {
    s.removedBasketProducts = (s.removedBasketProducts ?? []).filter(id => id !== productId);
    item.quantity = quantity;
    s.skippedItemIds = s.skippedItemIds.filter(id => id !== item.id);
    if (!s.selected.includes(productId)) s.selected.push(productId);
  }
  s.approved = null; s.baskets = []; s.attempts = {}; s.phase = 'compare';
  s.replacement = s.selected.find(id => !s.offers.find(o => o.id === id)?.available) ?? null;
  compare(s);
  s.log.push(quantity ? `Updated ${item.label} to quantity ${quantity}.` : `Removed ${item.label} from the basket.`);
}
