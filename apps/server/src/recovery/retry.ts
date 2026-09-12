import type { State } from '@fitoutagent/shared';
import { compare } from '../planning';
import { recoverSearch } from './run';

export async function retryRecovery(s: State, itemId: string, emit: (s: State) => Promise<void>) {
  if (s.phase !== 'compare' || s.approved || s.pending || !s.requirements || s.skippedItemIds.includes(itemId)) {
    throw new Error('Edit products before retrying this category.');
  }
  if (!s.requirements.items.some(item => item.id === itemId)) throw new Error('Unknown checklist item.');
  const previous = [...s.selected];
  s.phase = 'discover'; s.searchingItemId = itemId;
  try {
    await recoverSearch(s, emit, [itemId]);
    compare(s, true);
    // Re-optimize only the requested line; never replace unrelated manual choices.
    const recovered = s.selected.filter(id => s.offers.find(o => o.id === id)?.checklistItemId === itemId);
    s.selected = [...previous.filter(id => s.offers.find(o => o.id === id)?.checklistItemId !== itemId), ...recovered];
    s.replacement = s.selected.find(id => !s.offers.find(o => o.id === id)?.available) ?? null;
    compare(s);
  } finally { s.phase = 'compare'; s.searchingItemId = null; }
  await emit(s);
}
