import { type State } from '@fitoutagent/shared';
import { eligible } from './optimizer';
import { compare } from './planning';

export function replaceBasketProduct(s: State, productId: string, replacementId: string) {
  if (!s.requirements || s.pending || !['compare', 'verify', 'complete'].includes(s.phase)) {
    throw new Error('Wait for basket preparation to finish before replacing products.');
  }
  const current = s.offers.find(o => o.id === productId && s.selected.includes(o.id));
  const replacement = s.offers.find(o => o.id === replacementId);
  if (!current || !replacement || current.id === replacement.id ||
      current.checklistItemId !== replacement.checklistItemId || !eligible(replacement, s.requirements)) {
    throw new Error('Choose an available alternative from the same category without a fit or delivery conflict.');
  }
  // A direct replacement is an explicit user choice, including for locked picks.
  s.locks = s.locks.map(id => id === current.id ? replacement.id : id);
  s.selected = s.selected.map(id => id === current.id ? replacement.id : id);
  s.approved = null; s.baskets = []; s.attempts = {}; s.pending = null;
  s.phase = 'compare';
  s.replacement = s.selected.find(id => !s.offers.find(o => o.id === id)?.available) ?? null;
  compare(s);
  s.log.push(`Replaced ${current.name} with ${replacement.name}. Prepare new shopping links for the updated basket.`);
}
