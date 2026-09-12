import { evaluate, knownUnitCost, merchantKey, type Offer, type Plan, type Requirements } from '@settlein/shared';

type Strategy = 'fit' | 'cost' | 'stores';
type Basket = { offers: Offer[]; cost: number; unknownPrice: number; unknownFit: number; unknownFees: number; stores: Set<string> };
const WIDTH = 512;

function add(b: Basket, o: Offer, quantity: number): Basket {
  return { offers: [...b.offers, o], cost: b.cost + (knownUnitCost(o) ?? 0) * quantity,
    unknownPrice: b.unknownPrice + Number(o.price === null), unknownFit: b.unknownFit + Number(o.fit?.status !== 'verified'),
    unknownFees: b.unknownFees + Number(o.tax === null) + Number(o.shipping === null), stores: new Set([...b.stores, merchantKey(o)]) };
}

function order(strategy: Strategy, budget: number | null) {
  const score = (b: Basket) => {
    const common = [b.unknownPrice, budget === null ? 0 : Math.max(0, b.cost - budget)];
    if (strategy === 'cost') return [...common, b.cost, b.unknownFit, b.unknownFees, b.stores.size];
    if (strategy === 'stores') return [...common, b.unknownFit, b.stores.size, b.unknownFees, b.cost];
    return [...common, b.unknownFit, b.unknownFees, b.cost, b.stores.size];
  };
  return (a: Basket, b: Basket) => {
    const x = score(a), y = score(b);
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i];
    return a.offers.map(o => o.id).join('|').localeCompare(b.offers.map(o => o.id).join('|'));
  };
}

export function eligible(o: Offer, r: Requirements) {
  return o.available && o.fit?.status !== 'rejected' && !(r.deadline && o.arrival && o.arrival > r.deadline);
}

/** Bounded beam search, with a minimum-known-cost seed retained at every step.
 * All checklist lines stay in scope, including optional extras the user added.
 * The seed prevents fit-first pruning from losing the least expensive complete basket.
 * This is a recommendation among returned offers, not proof of a global optimum.
 */
export function optimize(r: Requirements, offers: Offer[], locks: string[], strategy: Strategy): Plan {
  const empty: Basket = { offers: [], cost: 0, unknownPrice: 0, unknownFit: 0, unknownFees: 0, stores: new Set() };
  let beam = [empty];
  let cheapest = empty;
  for (const item of r.items) {
    const line = offers.filter(o => o.checklistItemId === item.id);
    const locked = line.filter(o => locks.includes(o.id));
    const candidates = locked.length ? locked : line.filter(o => eligible(o, r));
    if (!candidates.length) continue;
    const expanded = beam.flatMap(b => candidates.map(o => add(b, o, item.quantity)));
    cheapest = candidates.map(o => add(cheapest, o, item.quantity)).sort(order('cost', null))[0];
    beam = expanded.sort(order(strategy, r.budget)).slice(0, WIDTH);
    if (!beam.some(b => b.offers.every((o, i) => o.id === cheapest.offers[i]?.id))) beam.push(cheapest);
  }
  const chosen = beam.sort(order(strategy, r.budget))[0];
  const labels = { fit: ['optimized', 'Recommended'], cost: ['lowest', 'Lowest known cost'], stores: ['studio', 'Fewer stores'] };
  const [id, label] = labels[strategy];
  const plan = evaluate(id, label, chosen.offers, r);
  if (locks.some(id => !chosen.offers.some(o => o.id === id))) plan.issues.push('A locked product is missing. Unlock it before replacing it.');
  plan.explanation = `${strategy === 'fit' ? 'Prioritizes supported fit, then quoted costs and price' : strategy === 'stores'
    ? 'Prioritizes supported fit, then fewer merchants within budget' : 'Minimizes known item, tax and shipping costs'}; keeps your locked choices. Unquoted costs still need checking.`;
  return plan;
}
