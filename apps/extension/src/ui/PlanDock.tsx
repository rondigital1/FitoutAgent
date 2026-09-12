import { money, type Plan } from '@settlein/shared';

export function PlanDock({
  feedback, plans, activeId, approved, blocked, disabled, onActivate, onCreate, onEditChecklist,
}: {
  feedback?: string;
  plans: Plan[];
  activeId: string;
  approved: string | null;
  blocked: string | null;
  disabled: boolean;
  onActivate(id: string): void;
  onCreate(id: string): void;
  onEditChecklist(): void;
}) {
  const plan = plans.find(p => p.id === activeId) ?? plans[0];
  if (!plan) return null;
  const isApproved = approved === plan.id;
  const issues = blocked ? [blocked, ...plan.issues] : plan.issues;
  const cannotCreate = !isApproved && (!!approved || !plan.productIds.length || issues.length > 0);

  return (
    <aside className="wk-dock" aria-label="Basket controls">
      <div className="wk-dock__inner">
        <h2 className="wk-dock__title">Build your basket</h2>
        {plans.length > 1 && (
          <div className="wk-dock__switch" role="tablist" aria-label="Plan options">
            {plans.map(p => (
              <button key={p.id} type="button" role="tab" aria-selected={p.id === plan.id}
                className={`wk-dock__tab${p.id === plan.id ? ' is-active' : ''}`}
                disabled={disabled || (!!approved && p.id !== approved)} onClick={() => onActivate(p.id)}>
                {p.label}
              </button>
            ))}
          </div>
        )}
        {feedback && <p className="wk-dock__sub" role="status">{feedback}</p>}
        <div className="wk-dock__main">
          <div>
            <div className={`wk-dock__total${plan.total === null ? ' is-unknown' : ''}`}>
              {plan.total !== null ? money(plan.total) : plan.knownCost != null ? `At least ${money(plan.knownCost)}` : 'Cost unknown'}
            </div>
            <div className="wk-dock__sub">
              {plan.total === null ? 'Final total unconfirmed' : 'Includes quoted tax & shipping'}
              {plan.storeCount !== undefined && ` · ${plan.storeCount} ${plan.storeCount === 1 ? 'store' : 'stores'}`}
            </div>
          </div>
          <button type="button" className="primary" disabled={disabled || cannotCreate} onClick={() => onCreate(plan.id)}>
            {isApproved ? 'View basket' : 'Create basket'}
          </button>
        </div>
        {issues.length > 0 && <details className="wk-dock__issues">
          <summary>{issues.length} {issues.length === 1 ? 'item needs' : 'items need'} attention</summary>
          <ul>{issues.map(issue => <li key={issue}>{issue}</li>)}</ul>
          {issues.some(issue => issue.startsWith('Missing ')) &&
            <button type="button" className="btn-quiet" disabled={disabled} onClick={onEditChecklist}>Edit the list</button>}
        </details>}
      </div>
    </aside>
  );
}
