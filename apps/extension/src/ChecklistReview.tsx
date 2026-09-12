import { useEffect, useState } from 'react';
import { ItemIcon } from './ui/ItemIcon';
import { BudgetSelector } from './ui/BudgetSelector';
import { ChecklistItem, GoalDraft, type Requirements, type Suggestion } from '@settlein/shared';

export function ChecklistReview({ setupId, requirements, suggestions, disabled, onConfirm }: {
  setupId: string;
  requirements: Requirements;
  suggestions: Suggestion[];
  disabled: boolean;
  onConfirm(items: ChecklistItem[], budget: number | null, deadline: string | null): void;
}) {
  const storageKey = `settlein-review-${setupId}`;
  const [savedReview] = useState(() => {
    const defaults = {
      items: requirements.items,
      budget: requirements.budget ? String(requirements.budget / 100) : '',
      deadline: requirements.deadline ?? '',
    };
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
      if (saved?.goal === requirements.goal) {
        const parsed = ChecklistItem.array().max(30).safeParse(saved.items);
        return {
          items: parsed.success ? parsed.data : defaults.items,
          budget: typeof saved.budget === 'string' && saved.budget.length <= 32 ? saved.budget : defaults.budget,
          deadline: saved.deadline === '' || (typeof saved.deadline === 'string' && GoalDraft.shape.deadline.safeParse(saved.deadline).success)
            ? saved.deadline : defaults.deadline,
        };
      }
    } catch { /* Use the server draft if local storage is unavailable. */ }
    return defaults;
  });
  const [items, setItems] = useState(savedReview.items);
  const [budget, setBudget] = useState(savedReview.budget);
  const [deadline, setDeadline] = useState<string>(savedReview.deadline);
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify({ goal: requirements.goal, items, budget, deadline })); } catch { /* Editing still works. */ }
  }, [items, budget, deadline, storageKey, requirements.goal]);
  const groups = [...new Set(items.map(item => item.room ?? 'Shopping list'))];
  const totalQuantity = items.reduce((total, item) => total + item.quantity, 0);
  const changeQuantity = (id: string, quantity: number) => setItems(prev => prev.map(item => item.id === id
    ? { ...item, quantity: Math.min(20, Math.max(1, Math.trunc(quantity || 1))) } : item));
  const apartment = items.some(item => item.room === 'Bedrooms');
  const addItem = () => {
    const name = label.trim();
    if (!name || items.length >= 30) return;
    setItems(prev => [...prev, { id: crypto.randomUUID(), label: name, query: name, quantity: 1, must: true, room: 'Other items' }]);
    setLabel('');
  };
  return <form className="wk-review" aria-label="Review shopping list" onSubmit={event => {
    event.preventDefault();
    const cents = budget.trim() === '' ? null : Math.round(Number(budget) * 100);
    if (!items.length || (cents !== null && (!Number.isFinite(cents) || cents <= 0 || cents > 10000000))) {
      setError('Keep at least one item. Leave the budget empty or enter an amount between $0.01 and $100,000.'); return;
    }
    onConfirm(items, cents, deadline || null);
  }}>
    <header className="wk-review__intro"><span className="wk-label">Your project</span><p className="wk-review__goal">{requirements.goal}</p><span className="wk-review__count" aria-live="polite">{items.length} item types <span>·</span> {totalQuantity} total pieces</span></header>
    <p className="wk-form__hint">Adjust quantities or remove anything you already have.</p>
    {apartment && <p className="wk-notice">Starting with {items.find(i => i.id === 'bed')?.quantity ?? items.find(i => i.id === 'mattress')?.quantity ?? 1} bed(s). Sharing a bedroom? Change the bed and mattress quantities below. Compact living and dining furniture leaves more usable space.</p>}
    {!!requirements.owned.length && <p className="wk-form__hint">Already owned: {requirements.owned.join(', ')}.</p>}
    <fieldset disabled={disabled}>
      <div className="wk-review__layout"><div className="wk-review__items">
      {groups.map(room => <section key={room} aria-label={room}>
        <h2 className="wk-review__room">{room.replace(/-/g, ' ')}<span>{items.filter(i => (i.room ?? 'Shopping list') === room).length} {items.filter(i => (i.room ?? 'Shopping list') === room).length === 1 ? 'item' : 'items'}</span></h2>
        <div className="wk-check">{items.filter(i => (i.room ?? 'Shopping list') === room).map(item => <div className="wk-check__row" key={item.id}>
          <div className="wk-check__main"><ItemIcon label={item.label} /><span className="wk-check__label">{item.label}</span></div>
          <div className="wk-check__actions">
            <div className="wk-quantity"><button type="button" aria-label={`Decrease ${item.label} quantity`} disabled={item.quantity <= 1} onClick={() => changeQuantity(item.id, item.quantity - 1)}>−</button>
            <input aria-label={`${item.label} quantity`} type="number" min={1} max={20} step={1} value={item.quantity}
              onChange={e => changeQuantity(item.id, Number(e.target.value))} />
            <button type="button" aria-label={`Increase ${item.label} quantity`} disabled={item.quantity >= 20} onClick={() => changeQuantity(item.id, item.quantity + 1)}>+</button></div>
            <button type="button" className="btn-quiet wk-remove" title={`Remove ${item.label}`} aria-label={`Remove ${item.label}`} onClick={() => setItems(prev => prev.filter(i => i.id !== item.id))}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13M10 10v7m4-7v7" /></svg></button>
          </div>
        </div>)}</div>
      </section>)}
      {!items.length && <p className="wk-empty">Your list is empty. Add an item to continue.</p>}
      <div className="wk-review__add">
        <label><span className="wk-label">Missing something?</span><input value={label} maxLength={120} placeholder="e.g. Bath towels" onChange={e => setLabel(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } }} /></label>
        <button type="button" disabled={!label.trim() || items.length >= 30} onClick={addItem}>Add item</button>
      </div>
      {suggestions.some(s => !items.some(i => i.id === s.id)) && <details className="wk-review__extras"><summary>Optional extras</summary>
        {suggestions.filter(s => !items.some(i => i.id === s.id)).map(s => <div className="wk-check__row" key={s.id}>
          <div className="wk-check__main"><ItemIcon label={s.label} /><span>{s.label}</span></div><button type="button" aria-label={`Add ${s.label}`} disabled={items.length >= 30}
            onClick={() => setItems(prev => [...prev, { id: s.id, label: s.label, query: s.query, quantity: s.defaultQty, must: false }])}>Add</button>
        </div>)}
      </details>}
      </div><aside className="wk-review__search" aria-label="Search settings"><div className="wk-review__search-heading"><span className="wk-label">Next step</span><h2>Find your products</h2><p>Set your budget, then explore options for your list.</p></div>
        <BudgetSelector value={budget} onChange={setBudget} />
        <details><summary>Delivery date · optional</summary><label><span className="wk-label">Needed by</span><input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} /></label></details>
        {error && <p role="alert">{error}</p>}
        <button type="submit" className="primary" disabled={disabled || !items.length}>{disabled ? 'Finding products…' : 'Find products for this list'}</button>
      </aside></div>
    </fieldset>
  </form>;
}
