import { promptBudget, promptOwned } from './discovery/apartment';
import { initialState, evaluate, type ChecklistItem, type Decision, type Requirements, type State } from '@fitoutagent/shared';
import { activeDiscoverySources } from './discovery/composite';
import { smartDecomposer } from './discovery/decompose';
import { editBasketItem } from './edit-basket-item';
import { replaceBasketProduct } from './replace-basket-product';
import { promptImprover } from './discovery/improve-prompt';
import { searchMore } from './search-more';
import { retryRecovery } from './recovery/retry';
import { runDiscovery } from './product-discovery';
import { compare, nextBasket } from './planning';
import { eligible } from './optimizer';

type Emit = (s: State) => Promise<void>;

export async function transition(s: State, d: Decision, emit: Emit) {
  const checkpoint = async (phase: State['phase'], message: string) => {
    s.phase = phase; s.log.push(message); await emit(s);
  };
  if (d.type === 'sync') return;
  if (d.type === 'pause') { s.paused = true; s.log.push('Paused by you.'); return; }
  if (d.type === 'resume') { s.paused = false; return; }
  if (s.paused) throw new Error('Resume before making a decision.');

  if (d.type === 'start-over') {
    if (!s.draft || s.pending) throw new Error('Wait for the current operation before starting over.');
    const improved = await promptImprover.improve(s, 'review');
    const draft = {
      ...s.draft,
      ...(s.requirements ? { budget: s.requirements.budget, deadline: s.requirements.deadline, owned: s.requirements.owned, zip: s.requirements.zip } : {}),
      originalGoal: s.draft.originalGoal ?? s.draft.goal,
      goal: improved.prompt,
    };
    const revision = s.revision;
    Object.assign(s, initialState(s.id), { revision, draft, searchingItemId: null, categorySearchHistory: {}, removedBasketProducts: [] });
    s.log.push(improved.rationale ? `Improved prompt ready: ${improved.rationale}` : 'Your improved prompt is ready. Review it, then run your new search.');
    return;
  }

  if (d.type === 'start' || d.type === 'revise-goal') {
    if (d.type === 'start' && (s.requirements || s.draft)) throw new Error('Use constraint updates for an existing setup.');
    if (s.pending) throw new Error('Wait for the outstanding basket operation.');
    const rawGoal = d.draft.goal;
    d.draft = {
      ...d.draft,
      originalGoal: d.draft.originalGoal ?? rawGoal,
      budget: d.draft.budget ?? promptBudget(d.draft.goal),
      owned: [...new Set([...d.draft.owned, ...promptOwned(d.draft.goal)])],
    };

    // Handle-it-for-me: improve the prompt before checklist + discovery.
    if (d.draft.selectionMode === 'agent') {
      s.draft = d.draft;
      await checkpoint('checklist', 'Improving your prompt for autonomous shopping…');
      const improved = await promptImprover.improve({ ...s, draft: d.draft }, 'agent');
      if (improved.prompt && improved.prompt !== d.draft.goal) {
        d.draft = {
          ...d.draft,
          originalGoal: d.draft.originalGoal ?? rawGoal,
          goal: improved.prompt,
          budget: d.draft.budget ?? promptBudget(improved.prompt),
          owned: [...new Set([...d.draft.owned, ...promptOwned(improved.prompt)])],
        };
        s.log.push(improved.rationale
          ? `Prompt improved: ${improved.rationale}`
          : 'Prompt improved for autonomous shopping.');
        s.log.push(`Using: ${improved.prompt}`);
      } else if (improved.rationale) {
        s.log.push(improved.rationale);
      }
    }

    const { items, suggestions } = await smartDecomposer.decompose({
      goal: d.draft.goal,
      owned: d.draft.owned,
      budget: d.draft.budget,
      deadline: d.draft.deadline,
    });
    // Agent mode: fold optional suggestions into the checklist so shopping runs without HITL.
    const agentItems = d.draft.selectionMode === 'agent' && suggestions.length
      ? [
          ...items,
          ...suggestions
            .filter(sug => !items.some(i => i.id === sug.id))
            .slice(0, 3)
            .map(sug => ({
              id: sug.id,
              label: sug.label,
              query: sug.query,
              quantity: sug.defaultQty,
              must: false as const,
            })),
        ].slice(0, 12)
      : items;
    s.offers = []; s.plans = []; s.selected = []; s.skippedItemIds = []; s.removedBasketProducts = []; s.locks = []; s.replacement = null;
    s.draft = d.draft;
    s.requirements = { ...d.draft, items: agentItems };
    s.suggestions = d.draft.selectionMode === 'agent' ? [] : suggestions;
    s.approved = null; s.pending = null; s.baskets = []; s.attempts = {};
    s.discoverySources = activeDiscoverySources();
    s.searchRecovery = {};
    s.discoveryReports = [];
    await checkpoint(
      'checklist',
      d.draft.selectionMode === 'agent'
        ? `Autonomous checklist ready (${agentItems.length} items). Searching products…`
        : `Checklist ready (${items.length} items)${suggestions.length ? `, ${suggestions.length} optional add-ons` : ''}.`,
    );
    if (d.draft.selectionMode === 'agent') await runDiscovery(s, s.requirements, emit);
    return;
  }

  if (d.type === 'reopen-basket') {
    if (!s.requirements || s.pending || !['compare', 'verify', 'complete'].includes(s.phase)) throw new Error('Wait for basket preparation to finish.');
    s.approved = null; s.baskets = []; s.attempts = {}; s.phase = 'compare';
    compare(s);
    return;
  }

  if (d.type === 'edit-basket-item') {
    editBasketItem(s, d.productId, d.quantity);
    return;
  }

  if (d.type === 'replace-basket-product') {
    replaceBasketProduct(s, d.productId, d.replacementId);
    return;
  }

  if (d.type === 'retry-recovery') {
    await retryRecovery(s, d.checklistItemId, emit);
    return;
  }

  if (d.type === 'search-more') {
    await searchMore(s, d.checklistItemId, emit);
    return;
  }

  if (d.type === 'edit-checklist') {
    if (!s.requirements || s.pending) throw new Error('Wait for the current operation before editing.');
    s.approved = null; s.baskets = []; s.attempts = {}; s.plans = []; s.replacement = null;
    s.phase = 'checklist';
    return;
  }
  if (d.type === 'skip-item' || d.type === 'restore-item') {
    if (s.phase !== 'compare' || s.approved || s.pending || !s.requirements) {
      throw new Error('Edit products before preparing links.');
    }
    const item = s.requirements.items.find(item => item.id === d.checklistItemId);
    if (!item) throw new Error('Unknown checklist item.');
    if (d.type === 'skip-item') {
      if (s.offers.some(offer => offer.checklistItemId === item.id)) {
        throw new Error('Only categories with no products can be skipped.');
      }
      s.skippedItemIds = [...new Set([...s.skippedItemIds, item.id])];
      s.log.push(`Skipped ${item.label}; excluded from this basket.`);
    } else {
      s.skippedItemIds = s.skippedItemIds.filter(id => id !== item.id);
      s.log.push(`Restored ${item.label} to the shopping list.`);
    }
    compare(s);
    return;
  }
  if (d.type === 'apply-plan') {
    if (s.phase !== 'compare' || s.approved || !s.requirements) throw new Error('Edit products before preparing links.');
    const plan = s.plans.find(p => p.id === d.planId);
    if (!plan || s.locks.some(id => !plan.productIds.includes(id))) throw new Error('Plan violates locks.');
    const unchanged = plan.productIds.length === s.selected.length && plan.productIds.every(id => s.selected.includes(id));
    s.selected = [...plan.productIds];
    s.replacement = s.selected.find(id => !s.offers.find(o => o.id === id)?.available) ?? null;
    compare(s);
    s.log.push(unchanged ? `${plan.label} uses the same products as your current basket. Locked choices are preserved.` : `Applied ${plan.label}; your product choices are updated and locks preserved.`);
    return;
  }
  if (d.type === 'select') {
    if (s.phase !== 'compare' || s.approved) throw new Error('Edit products before preparing links.');
    const offer = s.offers.find(o => o.id === d.productId && s.requirements && eligible(o, s.requirements));
    if (!offer) throw new Error('Choose an available product without a known fit or delivery conflict.');
    const previous = s.offers.find(o => s.selected.includes(o.id) && o.checklistItemId === offer.checklistItemId);
    if (previous && s.locks.includes(previous.id) && previous.id !== offer.id) throw new Error('Unlock the current choice first.');
    s.selected = [...s.selected.filter(id => s.offers.find(o => o.id === id)?.checklistItemId !== offer.checklistItemId), offer.id];
    s.replacement = s.selected.find(id => !s.offers.find(o => o.id === id)?.available) ?? null;
    compare(s);
    return;
  }

  if (d.type === 'add-suggestion') {
    if (s.phase !== 'checklist' || !s.requirements) throw new Error('No checklist draft to edit.');
    const sug = s.suggestions.find(x => x.id === d.suggestionId);
    if (!sug) throw new Error('Unknown suggestion.');
    if (s.requirements.items.some(i => i.id === sug.id)) throw new Error('Already on checklist.');
    const item: ChecklistItem = {
      id: sug.id,
      label: sug.label,
      query: sug.query,
      quantity: sug.defaultQty,
      must: false,
    };
    s.requirements = { ...s.requirements, items: [...s.requirements.items, item] };
    s.suggestions = s.suggestions.filter(x => x.id !== d.suggestionId);
    s.log.push(`Added suggestion: ${sug.label}.`);
    return;
  }

  if (d.type === 'dismiss-suggestion') {
    if (s.phase !== 'checklist') throw new Error('No checklist draft to edit.');
    const before = s.suggestions.length;
    s.suggestions = s.suggestions.filter(x => x.id !== d.suggestionId);
    if (s.suggestions.length === before) throw new Error('Unknown suggestion.');
    s.log.push('Dismissed a suggestion.');
    return;
  }

  if (d.type === 'confirm-checklist') {
    if (s.phase !== 'checklist' || !s.requirements || !s.draft) throw new Error('Confirm only after drafting a checklist.');
    if (s.pending) throw new Error('Wait for the outstanding basket operation.');
    const items = d.items?.length ? d.items : s.requirements.items;
    if (!items.length) throw new Error('Checklist is empty.');
    const requirements: Requirements = { ...s.draft, items, budget: d.budget === undefined ? s.draft.budget : d.budget, deadline: d.deadline === undefined ? s.draft.deadline : d.deadline };
    if (new Set(items.map(item => item.id)).size !== items.length) throw new Error('Checklist item IDs must be unique.');
    s.draft = { ...s.draft, budget: requirements.budget, deadline: requirements.deadline };
    await runDiscovery(s, requirements, emit);
    return;
  }

  if (d.type === 'constraints') {
    if (s.pending) throw new Error('Wait for the outstanding basket operation.');
    let requirements = d.requirements;
    if (!requirements.items.length) {
      const { items, suggestions } = await smartDecomposer.decompose({
        goal: requirements.goal,
        owned: requirements.owned,
        budget: requirements.budget,
        deadline: requirements.deadline,
      });
      requirements = { ...requirements, items };
      s.draft = {
        selectionMode: requirements.selectionMode ?? s.draft?.selectionMode,
        goal: requirements.goal,
        budget: requirements.budget,
        deadline: requirements.deadline,
        zip: requirements.zip,
        owned: requirements.owned,
      };
      s.requirements = requirements;
      s.suggestions = suggestions;
      s.approved = null; s.pending = null; s.baskets = []; s.attempts = {};
      await checkpoint('checklist', `Checklist updated (${items.length} items).`);
      return;
    }
    s.draft = {
      selectionMode: requirements.selectionMode ?? s.draft?.selectionMode,
      goal: requirements.goal,
      budget: requirements.budget,
      deadline: requirements.deadline,
      zip: requirements.zip,
      owned: requirements.owned,
    };
    await runDiscovery(s, requirements, emit);
    return;
  }

  if (d.type === 'lock') {
    if (s.approved) throw new Error('Update constraints before editing an approved plan.');
    if (!s.selected.includes(d.productId)) throw new Error('Only selected products can be locked.');
    s.locks = s.locks.includes(d.productId) ? s.locks.filter(id => id !== d.productId) : [...s.locks, d.productId];
    compare(s);
  } else if (d.type === 'replace') {
    if (!s.replacement || s.locks.includes(s.replacement)) throw new Error('Explicitly unlock the unavailable product first.');
    const old = s.offers.find(o => o.id === s.replacement)!;
    const replacement = s.offers.find(o => o.id === d.productId && o.checklistItemId === old.checklistItemId && s.requirements && eligible(o, s.requirements));
    if (!replacement) throw new Error('Invalid replacement.');
    s.selected = s.selected.map(id => id === old.id ? replacement.id : id);
    s.replacement = null; compare(s); s.log.push(`Replacement selected: ${replacement.name}.`);
  } else if (d.type === 'approve') {
    if (s.phase !== 'compare' || s.replacement) throw new Error('Resolve replacement before approving.');
    const p = s.plans.find(p => p.id === d.planId);
    if (!p || !s.requirements) throw new Error('Unknown plan.');
    if (!p.productIds.length) throw new Error('Add an item before preparing shopping links.');
    const checked = evaluate(p.id, p.label, s.offers.filter(o => p.productIds.includes(o.id)), s.requirements, s.skippedItemIds);
    if (checked.issues.length || s.locks.some(id => !p.productIds.includes(id))) throw new Error('Plan violates constraints or locks.');
    s.selected = p.productIds; s.approved = p.id;
    await checkpoint('prepare', 'Approved. Preparing merchant checkout links (no payment).');
    nextBasket(s);
  } else if (d.type === 'cart-result') {
    const request = s.pending;
    if (!request || request.id !== d.result.id || request.retailer !== d.result.retailer) throw new Error('Stale or mismatched browser result.');
    const verified = d.result.verified && request.lines.every(wanted => d.result.lines.some(actual =>
      (actual.id === wanted.id || actual.id.replace(/^Shopify:/, '') === wanted.id.replace(/^Shopify:/, ''))
      && actual.owner === 'fitoutagent' && actual.quantity === wanted.quantity));
    const result = { ...d.result, verified };
    s.baskets = [...s.baskets.filter(b => b.retailer !== result.retailer), result];
    s.pending = null;
    await checkpoint('verify', verified
      ? `${result.retailer} contents verified${result.checkoutUrl ? ' · checkout link ready' : ''}.`
      : `${result.retailer} verification failed; other baskets preserved. Retry available (maximum 2 attempts).`);
    if (verified || (s.requirements?.selectionMode === 'agent' && (s.attempts[result.retailer] ?? 0) < 2)) nextBasket(s);
  } else if (d.type === 'retry') {
    if (!s.approved || s.pending || s.phase !== 'verify') throw new Error('No failed basket to retry.');
    nextBasket(s);
  }
}
