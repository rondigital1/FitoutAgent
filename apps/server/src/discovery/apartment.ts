import type { ChecklistItem } from '@fitoutagent/shared';

export const isApartment = (goal: string) => /apartment|\bapt\b|\b[1-9]\s*[- ]?\s*(?:br|bedroom)|furnish(?:ing)?\s+(?:a\s+)?(?:home|house|place)(?!\s*office)/i.test(goal) && !/office|desk|wfh|workspace|work from home/i.test(goal);

export function apartmentItems(goal: string): ChecklistItem[] {
  const bedrooms = Math.min(10, Number(goal.match(/(\d+)\s*[- ]?\s*(?:br|bedroom)/i)?.[1] ?? 1));
  const people = Math.min(20, Number(goal.match(/(?:for\s+)(\d+|two|one|three|four)(?:\s+people|\s+adults|\s+of us|\b)/i)?.[1]?.replace('two', '2').replace('one', '1').replace('three', '3').replace('four', '4') ?? 2));
  const beds = /share.*(?:bed|room)|couple/i.test(goal) ? 1 : Math.min(bedrooms, people);
  const rows: [string, string, string, number, string][] = [
    ['bed', 'Bed frame', 'Bedrooms', beds, 'bed frame'],
    ['mattress', 'Mattress', 'Bedrooms', beds, 'mattress'],
    ['dresser', 'Clothing storage', 'Bedrooms', beds, 'compact dresser'],
    ['sofa', 'Sofa', 'Living room', 1, 'compact two seat sofa'],
    ['coffee-table', 'Coffee table', 'Living room', 1, 'small coffee table'],
    ['floor-lamp', 'Floor lamp', 'Living room', 1, 'floor lamp'],
    ['dining-table', 'Dining table', 'Dining area', 1, 'small dining table'],
    ['dining-chair', 'Dining chair', 'Dining area', people, 'dining chair'],
    ['cookware', 'Cookware set', 'Kitchen', 1, 'cookware set'],
    ['dishes', 'Dinnerware set', 'Kitchen', 1, `dinnerware set for ${people}`],
    ['utensils', 'Utensil set', 'Kitchen', 1, 'kitchen utensil set'],
  ];
  return rows.map(([id, label, room, quantity, query]) => ({ id, label, room, quantity, query, must: true }));
}

export function promptOwned(goal: string): string[] {
  const phrase = goal.match(/(?:already\s+(?:have|own)|we\s+(?:have|own)|i\s+(?:have|own))\s+([^.!;]+)/i)?.[1];
  return phrase ? phrase.split(/,|\band\b/i).map(x => x.trim().replace(/^(?:a|an|the|our)\s+/i, '')).filter(Boolean) : [];
}

export function promptBudget(goal: string): number | null {
  const amount = goal.match(/\$\s*([\d,]+(?:\.\d{1,2})?)/)?.[1];
  const cents = amount ? Math.round(Number(amount.replaceAll(',', '')) * 100) : null;
  return cents && cents <= 10000000 ? cents : null;
}
