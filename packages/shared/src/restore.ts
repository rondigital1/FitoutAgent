import { z } from 'zod';
import { SearchRecovery } from './search-recovery';
import { CartRequest, CartResult, GoalDraft, Offer, Requirements, Suggestion, initialState, type State } from './index';

/** Older saved projects predate checklist/source fields. Restore a complete renderable state. */
export function restoreState(id: string, raw: unknown): State {
  const base = initialState(id);
  if (!raw || typeof raw !== 'object') return base;
  const source = raw as Record<string, unknown>;
  const parse = <T>(schema: z.ZodType<T, z.ZodTypeDef, any>, value: unknown, fallback: T): T => {
    const result = schema.safeParse(value);
    return result.success ? result.data : fallback;
  };
  const requirements = parse(Requirements.nullable(), source.requirements, null);
  const draft = parse(GoalDraft.nullable(), source.draft, requirements);
  const phase = parse(z.enum(['idle', 'checklist', 'discover', 'compare', 'prepare', 'verify', 'complete']), source.phase, requirements ? 'checklist' : 'idle');
  const plan = z.object({ id: z.string(), label: z.string(), productIds: z.array(z.string()), subtotal: z.number().nullable(), total: z.number().nullable(), issues: z.array(z.string()), warnings: z.array(z.string()).optional(), knownCost: z.number().nullable().optional(), storeCount: z.number().optional(), explanation: z.string().optional() });
  return {
    ...base,
    revision: parse(z.number().int().nonnegative(), source.revision, 0),
    requirements, draft,
    phase: requirements ? phase : 'idle',
    paused: source.paused === true,
    offers: parse(z.array(Offer), source.offers, []),
    suggestions: parse(z.array(Suggestion), source.suggestions, []),
    skippedItemIds: parse(z.array(z.string()), source.skippedItemIds, []),
    removedBasketProducts: parse(z.array(z.string()), source.removedBasketProducts, []),
    searchingItemId: parse(z.string().nullable(), source.searchingItemId, null),
    searchRecovery: parse(z.record(SearchRecovery), source.searchRecovery, {}),
    categorySearchHistory: parse(z.record(z.array(z.string())), source.categorySearchHistory, {}),
    selected: parse(z.array(z.string()), source.selected, []),
    locks: parse(z.array(z.string()), source.locks, []),
    plans: parse(z.array(plan), source.plans, []),
    replacement: parse(z.string().nullable(), source.replacement, null),
    approved: parse(z.string().nullable(), source.approved, null),
    pending: parse(CartRequest.nullable(), source.pending, null),
    baskets: parse(z.array(CartResult), source.baskets, []),
    attempts: parse(z.record(z.number()), source.attempts, {}),
    log: parse(z.array(z.string()), source.log, []),
    discoveryReports: parse(z.array(z.object({ source: z.string(), offerCount: z.number(), issues: z.array(z.object({ checklistItemId: z.string(), message: z.string() })) })), source.discoveryReports, []),
    discoverySources: parse(z.array(z.string()), source.discoverySources, []),
  };
}
