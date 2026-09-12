import { z } from 'zod';
import { ProductFit } from './product-fit';
import type { SearchRecovery } from './search-recovery';

export const ChecklistItem = z.object({
  id: z.string().min(1).max(64),
  label: z.string().min(1).max(120),
  query: z.string().min(1).max(200),
  quantity: z.number().int().positive().max(20),
  must: z.boolean().default(true),
  room: z.string().max(60).optional(),
});
export type ChecklistItem = z.infer<typeof ChecklistItem>;

export const Suggestion = z.object({
  id: z.string().min(1).max(64),
  label: z.string().min(1).max(120),
  query: z.string().min(1).max(200),
  reason: z.string().min(1).max(160),
  defaultQty: z.number().int().positive().max(20).default(1),
});
export type Suggestion = z.infer<typeof Suggestion>;

export const SelectionMode = z.enum(['manual', 'agent']);
export type SelectionMode = z.infer<typeof SelectionMode>;

export const GoalDraft = z.object({
  /** Omitted in older projects; treated as manual. */
  selectionMode: SelectionMode.optional(),
  goal: z.string().trim().min(1).max(500),
  budget: z.number().int().positive().max(10000000).nullable().default(null),
  deadline: z.string().date().nullable().default(null),
  zip: z.string().max(16).optional(),
  owned: z.array(z.string().min(1).max(80)).max(30).default([]),
});
export type GoalDraft = z.infer<typeof GoalDraft>;

export const Requirements = GoalDraft.extend({
  items: z.array(ChecklistItem).min(1).max(30),
});
export type Requirements = z.infer<typeof Requirements>;

export const Retailer = z.enum(['Walmart', 'BestBuy', 'Shopify', 'Mock']);
export type Retailer = z.infer<typeof Retailer>;

export const Offer = z.object({
  id: z.string(),
  checklistItemId: z.string(),
  name: z.string(),
  retailer: Retailer,
  nativeId: z.string(),
  source: z.string().optional(),
  description: z.string().max(6000).optional(),
  variant: z.string().max(500).optional(),
  merchant: z.string().max(300).optional(),
  fit: ProductFit.optional(),
  url: z.string().url().nullable(),
  /** Canonical retailer image URL. Rendered through the local runtime proxy, never fetched directly by the panel. */
  image: z.string().url().nullable().default(null),
  brand: z.string().nullable().default(null),
  price: z.number().int().nonnegative().nullable(),
  shipping: z.number().int().nonnegative().nullable(),
  tax: z.number().int().nonnegative().nullable(),
  arrival: z.string().nullable(),
  available: z.boolean(),
  match: z.enum(['exact', 'alternative']).default('alternative'),
});
export type Offer = z.infer<typeof Offer>;

export const Line = z.object({
  id: z.string(),
  quantity: z.number().int().positive(),
  owner: z.enum(['existing', 'settlein']),
});

export const CartRequest = z.object({
  id: z.string(),
  retailer: Retailer,
  lines: z.array(Line),
  operation: z.literal('prepare-and-verify'),
});
export type CartRequest = z.infer<typeof CartRequest>;

export const CartResult = z.object({
  id: z.string(),
  retailer: Retailer,
  verified: z.boolean(),
  lines: z.array(Line),
  error: z.string().optional(),
  mock: z.boolean(),
  checkoutUrl: z.string().url().optional(),
});
export type CartResult = z.infer<typeof CartResult>;

export const Decision = z.discriminatedUnion('type', [
  z.object({ type: z.literal('start-over') }),
  z.object({ type: z.literal('start'), draft: GoalDraft }),
  z.object({ type: z.literal('revise-goal'), draft: GoalDraft }),
  z.object({ type: z.literal('edit-checklist') }),
  z.object({ type: z.literal('apply-plan'), planId: z.string() }),
  z.object({ type: z.literal('select'), productId: z.string() }),
  z.object({ type: z.literal('reopen-basket') }),
  z.object({ type: z.literal('edit-basket-item'), productId: z.string(), quantity: z.number().int().min(0).max(20) }),
  z.object({ type: z.literal('replace-basket-product'), productId: z.string(), replacementId: z.string() }),
  z.object({ type: z.literal('retry-recovery'), checklistItemId: z.string() }),
  z.object({ type: z.literal('search-more'), checklistItemId: z.string() }),
  z.object({ type: z.literal('skip-item'), checklistItemId: z.string() }),
  z.object({ type: z.literal('restore-item'), checklistItemId: z.string() }),
  z.object({ type: z.literal('add-suggestion'), suggestionId: z.string() }),
  z.object({ type: z.literal('dismiss-suggestion'), suggestionId: z.string() }),
  z.object({ type: z.literal('confirm-checklist'), items: z.array(ChecklistItem).min(1).max(30).optional(), budget: z.number().int().positive().max(10000000).nullable().optional(), deadline: z.string().date().nullable().optional() }),
  z.object({ type: z.literal('constraints'), requirements: Requirements }),
  z.object({ type: z.literal('lock'), productId: z.string() }),
  z.object({ type: z.literal('replace'), productId: z.string() }),
  z.object({ type: z.literal('approve'), planId: z.string() }),
  z.object({ type: z.literal('cart-result'), result: CartResult }),
  z.object({ type: z.literal('pause') }),
  z.object({ type: z.literal('resume') }),
  z.object({ type: z.literal('retry') }),
  z.object({ type: z.literal('sync') }),
]);
export type Decision = z.infer<typeof Decision>;

export type Plan = {
  id: string;
  label: string;
  productIds: string[];
  subtotal: number | null;
  total: number | null;
  issues: string[];
  warnings?: string[];
  knownCost?: number | null;
  storeCount?: number;
  explanation?: string;
};

export type State = {
  id: string;
  revision: number;
  draft: GoalDraft | null;
  requirements: Requirements | null;
  suggestions: Suggestion[];
  phase: 'idle' | 'checklist' | 'discover' | 'compare' | 'prepare' | 'verify' | 'complete';
  paused: boolean;
  offers: Offer[];
  selected: string[];
  skippedItemIds: string[];
  searchingItemId?: string | null;
  searchRecovery?: Record<string, SearchRecovery>;
  categorySearchHistory?: Record<string, string[]>;
  removedBasketProducts?: string[];
  locks: string[];
  plans: Plan[];
  replacement: string | null;
  approved: string | null;
  pending: CartRequest | null;
  baskets: CartResult[];
  attempts: Record<string, number>;
  log: string[];
  discoverySources: string[];
  discoveryReports: DiscoveryReport[];
};

/** Must produce the same shape restoreState() does, so an empty project and a
 * restored-from-empty project compare equal. See restore.test.ts. */
export const initialState = (id: string): State => ({
  id, revision: 0, draft: null, requirements: null, suggestions: [],
  phase: 'idle', paused: false,
  offers: [], selected: [], skippedItemIds: [], locks: [], plans: [], replacement: null, approved: null,
  pending: null, baskets: [], attempts: {}, log: [], discoverySources: [], discoveryReports: [],
  searchRecovery: {}, searchingItemId: null, categorySearchHistory: {}, removedBasketProducts: [],
});

export type DecomposeResult = { items: ChecklistItem[]; suggestions: Suggestion[] };

export interface DecomposeTool {
  decompose(input: { goal: string; owned: string[]; budget: number | null; deadline: string | null }): Promise<DecomposeResult>;
}
export type DiscoveryIssue = { checklistItemId: string; message: string };
export type DiscoveryReport = {
  source: string;
  offerCount: number;
  issues: DiscoveryIssue[];
};
export interface DiscoveryTool {
  discover(requirements: Requirements, onIssue?: (issue: DiscoveryIssue) => void, onReport?: (report: DiscoveryReport) => void, options?: { limit: number; sources?: string[] }): Promise<Offer[]>;
}
export interface RefreshTool { refresh(offers: Offer[]): Promise<Offer[]> }
export interface BrowserCartTool {
  prepare(request: CartRequest): Promise<void>;
  verify(request: CartRequest): Promise<CartResult>;
}

export const money = (cents: number | null) =>
  cents === null ? 'Unknown' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

/** Retailer images route through the local runtime so the panel never contacts a retailer host directly. */
export const proxiedImage = (agentBase: string, image: string | null) =>
  image ? `${agentBase.replace(/\/$/, '')}/img?u=${encodeURIComponent(image)}` : null;

export { evaluate } from './constraints';
export { OFFICE_TEMPLATE, CAMPING_TEMPLATE, OFFICE_SUGGESTIONS, CAMPING_SUGGESTIONS, templates } from './templates';

export { restoreState } from './restore';

export { ProductFit, FitCheck } from './product-fit';
export { knownUnitCost, merchantKey } from './constraints';

export { SearchRecovery, RecoveryAttempt } from './search-recovery';
