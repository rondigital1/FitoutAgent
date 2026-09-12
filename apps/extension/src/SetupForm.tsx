import { useEffect, useState } from 'react';
import { GoalDraft, type SelectionMode, type State } from '@settlein/shared';

export function SetupForm({ state, submitting, onStart }: {
  state: State;
  submitting: boolean;
  onStart(draft: GoalDraft): void;
}) {
  const storageKey = `settlein-prompt-${state.id}`;
  const [saved] = useState(() => {
    try {
      const value = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
      if (value?.baseGoal === (state.draft?.goal ?? '') && typeof value.goal === 'string' && value.goal.length <= 500
        && ['manual', 'agent'].includes(value.selectionMode)) return value as { goal: string; selectionMode: SelectionMode };
    } catch { /* The form also works without browser storage. */ }
    return { goal: state.draft?.goal ?? '', selectionMode: state.draft?.selectionMode ?? 'manual' };
  });
  const [goal, setGoal] = useState(saved.goal);
  const [selectionMode, setSelectionMode] = useState<SelectionMode>(saved.selectionMode);
  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify({ baseGoal: state.draft?.goal ?? '', goal, selectionMode })); } catch { /* Keep editing in memory. */ }
  }, [storageKey, state.draft?.goal, goal, selectionMode]);
  const [error, setError] = useState('');
  return (
    <form
      className="wk-form"
      onSubmit={event => {
        event.preventDefault();
        const parsed = GoalDraft.safeParse({ ...(state.phase === 'idle' && goal.trim() === state.draft?.goal ? state.draft : {}), goal: goal.trim(), selectionMode });
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message ?? 'Enter what you need.');
          return;
        }
        setError('');
        onStart(parsed.data);
      }}
    >
      <label>
        <span className="wk-label">What do you need?</span>
        <textarea
          name="goal"
          value={goal}
          onChange={e => setGoal(e.target.value)}
          maxLength={500}
          disabled={submitting}
          placeholder="Furnish a small home office under $1,500. I already have a monitor."
          required
          rows={5}
          autoFocus
        />
      </label>
      <p className="wk-form__hint">
        Describe the project. Mention your budget, preferences, and things you already own.
      </p>
      <fieldset className="wk-mode" disabled={submitting}>
        <legend className="wk-label">How would you like to shop?</legend>
        <label className="wk-mode__option">
          <input type="radio" name="selectionMode" value="manual" checked={selectionMode === 'manual'} onChange={() => setSelectionMode('manual')} />
          <span><strong>Choose item by item</strong><small>Edit the list first, then compare products by category.</small></span>
        </label>
        <label className="wk-mode__option">
          <input type="radio" name="selectionMode" value="agent" checked={selectionMode === 'agent'} onChange={() => setSelectionMode('agent')} />
          <span><strong>Let the agent find everything</strong><small>Search every category, optimize the basket and prepare shopping links automatically.</small></span>
        </label>
      </fieldset>
      {selectionMode === 'agent' && <p className="wk-form__hint">One prompt is enough. Add a budget if you have one; the agent handles the list, product search and basket. You choose when to check out.</p>}
      {error && <p className="wk-notice wk-notice--alert" role="alert">{error}</p>}
      <button className="primary" type="submit" disabled={submitting || !goal.trim()}>
        {selectionMode === 'agent'
          ? submitting ? 'Finding your products…' : 'Find everything for me'
          : submitting ? 'Building your list…' : state.draft ? 'Update my list' : 'Make my list'}
      </button>
    </form>
  );
}
