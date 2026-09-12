import { useId } from 'react';

const tiers = [
  { label: 'Minimal', amount: '1000', price: '$1,000' },
  { label: 'Balanced', amount: '3000', price: '$3,000' },
  { label: 'Premium', amount: '5000', price: '$5,000' },
  { label: 'Luxury', amount: '10000', price: '$10,000' },
];

export function BudgetSelector({ value, onChange }: {
  value: string;
  onChange(value: string): void;
}) {
  const hintId = useId();
  return <fieldset className="wk-budget" aria-describedby={hintId}>
    <legend className="wk-label">Budget · optional</legend>
    <p id={hintId} className="wk-form__hint">Skip for no spending limit, or choose a total for your list. Tap a selected option to clear it.</p>
    <div className="wk-budget__tiers">
      {tiers.map(tier => {
        const selected = value.trim() !== '' && Number(value) === Number(tier.amount);
        return <button key={tier.label} type="button" className="wk-budget__tier"
          aria-pressed={selected} onClick={() => onChange(selected ? '' : tier.amount)}>
          <span>{tier.label}</span><small>{tier.price}</small>
        </button>;
      })}
    </div>
    <label><span className="wk-label">Total budget · USD</span>
      <input type="number" min="0.01" max="100000" step="0.01" value={value}
        placeholder="No spending limit" onChange={event => onChange(event.target.value)} />
    </label>
  </fieldset>;
}
