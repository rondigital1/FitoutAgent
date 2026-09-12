import type { State } from '@fitoutagent/shared';

const sources: Record<string, string> = { BestBuy: 'Best Buy', WalmartAffiliate: 'Walmart', ShopifyGlobalCatalog: 'Shopify marketplace', ShopifyStorefront: 'Shopify store' };
export function SearchRecoveryPanel({ state, disabled, onRetry, onReview }: {
  state: State; disabled: boolean; onRetry(id: string): void; onReview(): void;
}) {
  const entries = Object.entries(state.searchRecovery ?? {}).filter(([id]) => !state.skippedItemIds.includes(id));
  if (!entries.length) return null;
  return <section className="wk-recovery" aria-label="Automatic search recovery" aria-live="polite">
    <h2>Search follow-up</h2>
    {entries.map(([id, result]) => <article key={id}>
      <h3>{state.requirements?.items.find(item => item.id === id)?.label ?? id}</h3>
      <p>{result.message}</p>
      {!!result.attempts.length && <details><summary>{result.attempts.length} additional {result.attempts.length === 1 ? 'search' : 'searches'}</summary>
        <ol>{result.attempts.map((attempt, index) => <li key={index}>
          <strong>{attempt.sources.map(source => sources[source] ?? source).join(', ')}</strong>
          <p>{attempt.query}</p>
          <small>{attempt.outcome === 'searching' ? 'Searching…' : attempt.outcome === 'source-error' ? 'Service could not complete the check' : `${attempt.found} products checked${attempt.outcome === 'matched' ? ' · suitable match found' : ''}`}</small>
        </li>)}</ol>
      </details>}
      {result.status !== 'resolved' && result.status !== 'searching' && <div className="wk-recovery__actions">
        {result.status === 'no-match' && <button type="button" disabled={disabled} onClick={onReview}>Review original request</button>}
        {result.status !== 'locked' && <button type="button" disabled={disabled} onClick={() => onRetry(id)}>{result.status === 'limit' ? 'Continue search' : 'Retry search'} for {state.requirements?.items.find(item => item.id === id)?.label ?? id}</button>}
      </div>}
    </article>)}
  </section>;
}
