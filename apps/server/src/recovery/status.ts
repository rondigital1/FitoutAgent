import { knownUnitCost, type ChecklistItem, type Offer, type Requirements, type SearchRecovery, type State } from '@fitoutagent/shared';
import { eligible } from '../optimizer';

export function suitable(offer: Offer, r: Requirements) {
  const quantity = r.items.find(item => item.id === offer.checklistItemId)?.quantity ?? 1;
  return eligible(offer, r) && offer.price !== null && (r.budget === null || knownUnitCost(offer)! * quantity <= r.budget)
    && (offer.fit?.status === 'verified' || offer.source === 'Mock');
}

export function unresolved(s: State, item: ChecklistItem) {
  return !s.offers.some(o => o.checklistItemId === item.id && suitable(o, s.requirements!));
}

export function finishRecovery(s: State, item: ChecklistItem, record: SearchRecovery) {
  const candidates = s.offers.filter(o => o.checklistItemId === item.id);
  if (!unresolved(s, item)) {
    record.status = 'resolved'; record.message = 'Found a suitable option without changing your requirements.';
  } else if (record.status === 'limit') {
    record.message = 'The automatic search limit was reached. Your requirements and products are saved; continue the search when ready.';
  } else if (record.attempts.some(a => a.outcome === 'source-error') || record.status === 'source-error') {
    record.status = 'source-error'; record.message = 'A retailer or fit service could not complete the search. Your requirements are unchanged. Retry when the service is available.';
  } else if (candidates.some(o => eligible(o, s.requirements!) && (o.price === null || o.fit?.status !== 'verified'))) {
    record.status = 'unverified'; record.message = 'Options were found, but product fit or price is still unconfirmed. Review the retailer evidence; no requirement was changed.';
  } else {
    const conflicts = [...new Set(candidates.flatMap(o => o.fit?.checks.filter(c => c.status === 'conflict').map(c => c.requirement) ?? []))];
    record.status = 'no-match';
    record.message = `No suitable match was found in the searches completed${conflicts.length ? `; conflicts included ${conflicts.join(', ')}` : ''}. To broaden the search, review which requirements you are willing to change. Nothing has been changed automatically.`.slice(0, 600);
  }
}
