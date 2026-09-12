import type { ChecklistItem, State } from '@settlein/shared';
import { categorySearchPlanner } from '../discovery/category-search-plan';

export const signature = (query: string, source: string) => `${query.toLowerCase().replace(/\s+/g, ' ').trim()}|${source}`;

/** Keep the original search constraints verbatim even when the model supplies synonyms.
 * Fit assessment always receives the original goal and line, never this search text.
 */
export function constrainedQuery(item: ChecklistItem, rewrite: string) {
  const base = `${item.label} ${item.query}`.trim();
  return `${base} ${rewrite.trim().slice(0, Math.max(0, 399 - base.length))}`.trim();
}

export async function recoveryStrategy(s: State, item: ChecklistItem, sources: string[], tried: Set<string>) {
  let proposed: { query: string; sources: string[]; reason: string };
  try {
    proposed = await categorySearchPlanner.plan(s, item);
    if (!proposed.sources.length || proposed.sources.some(source => !sources.includes(source))) throw new Error('Unavailable source');
  } catch {
    proposed = { query: item.query, sources, reason: 'Search planning was unavailable; preserving the original requirements and trying configured retailers.' };
  }
  const query = constrainedQuery(item, proposed.query);
  const fresh = [...new Set(proposed.sources)].filter(source => !tried.has(signature(query, source)));
  if (fresh.length) return { ...proposed, query, sources: fresh };
  const alternatives = sources.filter(source => !tried.has(signature(query, source)));
  if (alternatives.length) return { query, sources: alternatives, reason: 'Trying another configured source with the same requirements.' };
  return null;
}
