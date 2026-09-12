import type { DiscoveryReport, State } from '@fitoutagent/shared';
import { compositeDiscovery } from './discovery/composite';
import { fitVerifier } from './fit/verify';
import { categorySearchPlanner } from './discovery/category-search-plan';
import { compare } from './planning';

/** Refresh one category with an agent-chosen search; keep selected products and other shelves. */
export async function searchMore(s: State, itemId: string, emit: (s: State) => Promise<void>) {
  if (s.phase !== 'compare' || s.approved || s.pending || !s.requirements) {
    throw new Error('Edit products before preparing links.');
  }
  const item = s.requirements.items.find(item => item.id === itemId);
  if (!item) throw new Error('Unknown checklist item.');
  if (s.skippedItemIds.includes(itemId)) throw new Error('Restore this category before searching again.');
  const requirements = { ...s.requirements, items: [item] };
  const count = s.offers.filter(o => o.checklistItemId === itemId).length;
  const reports: DiscoveryReport[] = [];
  s.phase = 'discover';
  s.searchingItemId = itemId;
  s.log.push(`Finding different ${item.label} options…`);
  try {
    await emit(s);
    const plan = await categorySearchPlanner.plan(s, item);
    s.log.push(`Search strategy for ${item.label}: ${plan.sources.join(', ')}; query: ${plan.query}. ${plan.reason}`);
    await emit(s);
    const found = await compositeDiscovery.discover({ ...requirements, items: [{ ...item, query: plan.query }] }, undefined, report => reports.push(report), {
      sources: plan.sources,
      limit: Math.min(20, Math.max(10, count + 5)),
    });
    const seen = new Set([...(s.categorySearchHistory?.[itemId] ?? []), ...s.offers.map(o => o.id)]);
    const fresh = found.filter(o => {
      if (o.checklistItemId !== itemId || seen.has(o.id)) return false;
      seen.add(o.id);
      return true;
    });
    const checked = await fitVerifier.verify(requirements, fresh);
    s.categorySearchHistory = { ...s.categorySearchHistory, [itemId]: [...new Set([...(s.categorySearchHistory?.[itemId] ?? []), ...s.offers.filter(o => o.checklistItemId === itemId).map(o => o.id), ...checked.map(o => o.id)])] };
    if (checked.length) s.offers = [...s.offers.filter(o => o.checklistItemId !== itemId || s.selected.includes(o.id) || s.locks.includes(o.id)), ...checked];
    const sourceNames = new Set([...s.discoveryReports.map(report => report.source), ...reports.map(report => report.source)]);
    s.discoveryReports = [...sourceNames].map(source => ({
      source,
      offerCount: s.offers.filter(offer => offer.source === source).length,
      issues: [
        ...(s.discoveryReports.find(report => report.source === source)?.issues.filter(issue => issue.checklistItemId !== itemId) ?? []),
        ...(reports.find(report => report.source === source)?.issues ?? []),
      ],
    }));
    compare(s);
    const issues = reports.flatMap(report => report.issues);
    s.log.push(`Search for ${item.label}: ${checked.length ? `found ${checked.length} different ${checked.length === 1 ? 'option' : 'options'}.` : issues.length ? 'Could not find different options because a retailer search failed. Try again.' : 'No different options found. Your existing options are kept; try again.'}${checked.length && issues.length ? ' Some retailers could not be searched; try again for more.' : ''}`);
  } catch {
    s.log.push(`Search for ${item.label}: search failed. Your existing products and choices are saved. Try again.`);
  } finally {
    s.phase = 'compare';
    s.searchingItemId = null;
  }
  await emit(s);
}
