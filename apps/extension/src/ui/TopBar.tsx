import type { State } from '@settlein/shared';

export type StageId = 'setup' | 'checklist' | 'shop' | 'baskets';

const STAGES: { id: StageId; label: string }[] = [
  { id: 'setup', label: 'Project' },
  { id: 'checklist', label: 'Checklist' },
  { id: 'shop', label: 'Shop' },
  { id: 'baskets', label: 'Basket' },
];

const PHASE_TEXT: Record<State['phase'], string> = {
  idle: 'Ready',
  checklist: 'Review checklist',
  discover: 'Searching',
  compare: 'Compare',
  prepare: 'Preparing',
  verify: 'Verifying',
  complete: 'Done',
};

const SOURCE_TEXT: Record<string, string> = {
  ShopifyGlobalCatalog: 'Shopify marketplace',
  ShopifyStorefront: 'Shopify store',
  WalmartAffiliate: 'Walmart',
  BestBuy: 'Best Buy',
  Mock: 'Demo catalog',
};

export function TopBar({
  phase, paused, busy, sources, stage, reached, onStage, onPauseToggle, pauseDisabled,
}: {
  phase: State['phase'];
  paused: boolean;
  busy: boolean;
  sources: string[];
  stage: StageId;
  reached: StageId[];
  onStage(id: StageId): void;
  onPauseToggle(): void;
  pauseDisabled: boolean;
}) {
  const tone = paused ? 'paused' : busy ? 'busy' : phase === 'complete' ? 'done' : 'idle';
  const current = STAGES.findIndex(s => s.id === stage);
  return (
    <header className="wk-top">
      <div className="wk-top__row">
        <div className="wk-wordmark">
          <span className="wk-wordmark__glyph" aria-hidden>S</span>
          SettleIn
        </div>
        <span className={`wk-phase wk-phase--${tone}`} role="status">
          <span className="wk-phase__dot" aria-hidden />
          {paused ? 'Paused' : busy ? 'Working' : PHASE_TEXT[phase]}
        </span>
        {phase !== 'idle' && (
          <button type="button" className="btn-quiet" disabled={pauseDisabled} onClick={onPauseToggle}>
            {paused ? 'Resume' : 'Pause'}
          </button>
        )}
      </div>

      <nav aria-label="Workflow stages">
        <ol className="wk-stages">
          {STAGES.map((s, i) => {
            const isReached = reached.includes(s.id);
            const isDone = isReached && i < current;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  className={`wk-stages__btn${s.id === stage ? ' is-current' : ''}${isReached ? ' is-reached' : ''}`}
                  aria-current={s.id === stage ? 'step' : undefined}
                  disabled={!isReached}
                  onClick={() => onStage(s.id)}
                >
                  <span className="wk-stages__num" aria-hidden>{isDone ? '✓' : String(i + 1).padStart(2, '0')}</span>
                  <span className="wk-stages__text">{s.label}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {!!sources.length && phase !== 'checklist' && (
        <div className="wk-top__sources">
          <span className="wk-label">Live sources</span>
          {sources.map(source => (
            <span className="wk-source" key={source}>{SOURCE_TEXT[source] ?? source}</span>
          ))}
        </div>
      )}
    </header>
  );
}
