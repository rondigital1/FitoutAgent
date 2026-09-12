import { apartmentItems, isApartment, promptOwned } from './apartment';
import {
  CAMPING_SUGGESTIONS,
  CAMPING_TEMPLATE,
  OFFICE_SUGGESTIONS,
  OFFICE_TEMPLATE,
  type ChecklistItem,
  type DecomposeTool,
  type Suggestion,
} from '@fitoutagent/shared';
import { llmDecomposer } from './llm-decompose';

function isTemplateGoal(goal: string): 'office' | 'camping' | null {
  const g = goal.toLowerCase();
  if (/camp|tent|hike|outdoors/.test(g)) return 'camping';
  if (/office|desk|wfh|workspace|work from home/.test(g)) return 'office';
  return null;
}

function filterOwned(items: ChecklistItem[], owned: string[]): ChecklistItem[] {
  const ownedLower = owned.map(o => o.toLowerCase());
  return items.filter(item => !ownedLower.some(o =>
    item.label.toLowerCase().includes(o) || item.query.toLowerCase().includes(o) || o.includes(item.id)));
}

function filterOwnedSuggestions(suggestions: Suggestion[], owned: string[], items: ChecklistItem[]): Suggestion[] {
  const ownedLower = owned.map(o => o.toLowerCase());
  const ids = new Set(items.map(i => i.id));
  const labels = new Set(items.map(i => i.label.toLowerCase()));
  return suggestions.filter(s =>
    !ids.has(s.id)
    && !labels.has(s.label.toLowerCase())
    && !ownedLower.some(o => s.label.toLowerCase().includes(o) || s.query.toLowerCase().includes(o)));
}

export const ruleDecomposer: DecomposeTool = {
  async decompose({ goal, owned }) {
    owned = [...owned, ...promptOwned(goal)];
    const kind = isTemplateGoal(goal);
    let items: ChecklistItem[] =
      isApartment(goal) ? apartmentItems(goal)
      : kind === 'camping' ? structuredClone(CAMPING_TEMPLATE)
      : kind === 'office' ? structuredClone(OFFICE_TEMPLATE)
      : genericFromGoal(goal);
    items = filterOwned(items, owned);
    if (!items.length) {
      items = [{ id: 'item-1', label: goal.slice(0, 80), query: goal.slice(0, 120), quantity: 1, must: true }];
    }
    const suggestions = filterOwnedSuggestions(
      kind === 'camping' ? structuredClone(CAMPING_SUGGESTIONS)
        : kind === 'office' ? structuredClone(OFFICE_SUGGESTIONS)
        : isApartment(goal) ? [] : genericSuggestions(goal),
      owned,
      items,
    );
    return { items, suggestions };
  },
};

// Every live goal uses the model, including apartment, office and camping goals.
// Rule templates remain available only as explicit test fixtures.
export const smartDecomposer: DecomposeTool = llmDecomposer;

function genericFromGoal(goal: string): ChecklistItem[] {
  const parts = goal.split(/,|\band\b|\+/i).map(s => s.trim()).filter(s => s.length > 2).slice(0, 8);
  if (parts.length < 2) {
    return [
      { id: 'primary', label: 'Primary item', query: goal.slice(0, 120), quantity: 1, must: true },
      { id: 'accessory', label: 'Accessory', query: `${goal.slice(0, 80)} accessory`, quantity: 1, must: false },
    ];
  }
  return parts.map((label, i) => ({
    id: `item-${i + 1}`,
    label: label.slice(0, 80),
    query: label.slice(0, 120),
    quantity: 1,
    must: true,
  }));
}

function genericSuggestions(goal: string): Suggestion[] {
  return [
    { id: 'sug-spare', label: 'Spare / backup', query: `${goal.slice(0, 60)} spare`, reason: 'Backup if a primary pick is unavailable', defaultQty: 1 },
    { id: 'sug-consumable', label: 'Consumables pack', query: `${goal.slice(0, 60)} supplies`, reason: 'Non-standard extras people often forget', defaultQty: 1 },
  ];
}
