import { type Requirements, type State } from '@fitoutagent/shared';
import { activeDiscoverySources, compositeDiscovery } from './discovery/composite';
import { mockRefresh } from './mock-tools';
import { recoverSearch } from './recovery/run';
import { compare, nextBasket } from './planning';
import { fitVerifier } from './fit/verify';

type Emit = (s: State) => Promise<void>;

/** Phases: idle → checklist → discover → compare → prepare → verify → complete */
async function discover(s: State, requirements: Requirements, emit: Emit) {
  const checkpoint = async (phase: State['phase'], message: string) => {
    s.phase = phase; s.log.push(message); await emit(s);
  };

  for (const id of s.locks) {
    const o = s.offers.find(o => o.id === id);
    if (o && !requirements.items.some(i => i.id === o.checklistItemId && i.quantity > 0)) {
      throw new Error(`Unlock ${o.name} before removing its checklist line.`);
    }
  }

  s.requirements = requirements;
  s.searchRecovery = {};
  s.categorySearchHistory = {};
  s.searchingItemId = null;
  s.skippedItemIds = []; s.removedBasketProducts = [];
  s.suggestions = [];
  s.approved = null; s.pending = null; s.baskets = []; s.attempts = {};
  s.discoverySources = activeDiscoverySources();
  s.discoveryReports = [];

  await checkpoint(
    'discover',
    `Searching ${requirements.items.length} lines via ${s.discoverySources.join(', ')}.`,
  );

  const previousLocked = s.offers.filter(o => s.locks.includes(o.id));
  s.offers = await compositeDiscovery.discover(requirements, undefined, report => s.discoveryReports.push(report));
  // A disappeared locked product stays visible as unavailable until explicitly unlocked.
  for (const offer of previousLocked) if (!s.offers.some(o => o.id === offer.id)) {
    s.offers.push({ ...offer, available: false });
  }
  const hasMock = s.offers.some(o => o.source === 'Mock');
  s.offers = hasMock ? await mockRefresh.refresh(s.offers) : s.offers;
  await checkpoint('discover', `Checking product fit for ${s.offers.length} offers…`);
  s.offers = await fitVerifier.verify(requirements, s.offers);
  await recoverSearch(s, emit);
  await checkpoint('discover', 'Optimizing the whole basket for fit, quantities, budget and known costs…');
  s.log.push(`Fit assessment: ${s.offers.filter(o => o.fit?.status === 'verified').length} supported, ${s.offers.filter(o => o.fit?.status === 'rejected').length} rejected, ${s.offers.filter(o => o.fit?.status === 'unknown').length} need review.`);
  compare(s, true);
  s.replacement = s.selected.find(id => !s.offers.find(o => o.id === id)?.available) ?? null;
  await checkpoint('compare', s.replacement
    ? `Found ${s.offers.length} offers. A locked item is unavailable — unlock it to choose a replacement.`
    : `Found ${s.offers.length} offers. Review plans before preparing baskets.`);
  if (requirements.selectionMode === 'agent') {
    const plan = s.plans[0];
    if (!s.replacement && plan && !plan.issues.length && Object.values(s.searchRecovery ?? {}).every(result => result.status === 'resolved')) {
      s.approved = plan.id;
      s.selected = [...plan.productIds];
      s.phase = 'prepare';
      s.log.push('Your optimized basket is ready. Preparing shopping links automatically.');
      nextBasket(s);
      await emit(s);
    } else {
      s.log.push(`The agent needs help with: ${plan?.issues.join('; ') || Object.values(s.searchRecovery ?? {}).filter(result => result.status !== 'resolved').map(result => result.message).join('; ') || 'an unavailable locked product'}. Your matches are saved.`);
      await emit(s);
    }
  }

}

/** Preserve the generated list for correction or retry when discovery fails. */
export async function runDiscovery(s: State, requirements: Requirements, emit: Emit) {
  const lockedOffers = s.offers.filter(o => s.locks.includes(o.id));
  try {
    await discover(s, requirements, emit);
  } catch (error) {
    s.phase = 'checklist';
    s.offers = lockedOffers; s.plans = []; s.selected = lockedOffers.map(o => o.id); s.replacement = null;
    await emit(s);
    throw error;
  }
}
