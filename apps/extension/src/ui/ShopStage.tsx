import { useState } from 'react';
import { money, type Offer, type State } from '@fitoutagent/shared';
import { ProductSheet } from './ProductSheet';
import { SearchSkeleton } from './SearchSkeleton';
import { Shelf } from './Shelf';
import { SearchRecoveryPanel } from './SearchRecoveryPanel';

const sourceNames: Record<string, string> = { ShopifyGlobalCatalog: 'Shopify marketplace', ShopifyStorefront: 'Shopify store', WalmartAffiliate: 'Walmart', BestBuy: 'Best Buy', Mock: 'Demo products' };

/** In-stock first, then ascending price. Deliberately independent of the current
 * choice: hoisting the selected tile reshuffled the shelf on every pick, which made
 * offers hard to compare. The badge moves; the tiles stay put. */
function railOrder(offers: Offer[]) {
  return offers.slice().sort((a, b) => {
    const stock = Number(b.available) - Number(a.available);
    if (stock) return stock;
    return (a.price ?? Number.POSITIVE_INFINITY) - (b.price ?? Number.POSITIVE_INFINITY);
  });
}

export function ShopStage({
  state, disabled, onLock, onReplace, onSelect, onEditChecklist, onSkip, onRestore, onSearchMore, onRetryRecovery, onReviewRequirements,
}: {
  state: State;
  disabled: boolean;
  onLock(productId: string): void;
  onReplace(productId: string): void;
  onSelect(productId: string): void;
  onEditChecklist(): void;
  onSearchMore(checklistItemId: string): void;
  onRetryRecovery(checklistItemId: string): void;
  onReviewRequirements(): void;
  onSkip(checklistItemId: string): void;
  onRestore(checklistItemId: string): void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const requirements = state.requirements;
  if (!requirements) return null;

  const unavailable = state.offers.find(o => o.id === state.replacement) ?? null;
  const replacementLocked = !!state.replacement && state.locks.includes(state.replacement);
  const open = state.offers.find(o => o.id === openId) ?? null;
  const openQty = open
    ? requirements.items.find(i => i.id === open.checklistItemId)?.quantity ?? 1
    : 1;
  const canReplaceWith = (offer: Offer) =>
    !!unavailable && offer.available && offer.checklistItemId === unavailable.checklistItemId && offer.id !== unavailable.id;
  const categorySearching = state.searchingItemId;
  const searching = state.phase === 'discover';

  return (
    <>
      {state.draft?.selectionMode === 'agent' && state.phase === 'compare' && (
        <p className="wk-notice">The agent compared complete baskets using product fit, quantities and known costs. Review unconfirmed details, or apply a different basket below. Locked products stay in every recommendation.</p>
      )}
      <SearchRecoveryPanel state={state} disabled={disabled || state.phase !== 'compare' || !!state.approved} onRetry={onRetryRecovery} onReview={onReviewRequirements} />
      {unavailable && (
        <div className="wk-replace">
          <p className="wk-label">Your decision</p>
          <h3>{unavailable.name} went out of stock</h3>
          <p>
            Pick a stand-in from the {requirements.items.find(i => i.id === unavailable.checklistItemId)?.label ?? 'same'} shelf
            below. Approval stays blocked until you do.
          </p>
          {replacementLocked && (
            <div className="wk-replace__actions">
              <button type="button" disabled={disabled} onClick={() => onLock(unavailable.id)}>
                Unlock to allow replacement
              </button>
            </div>
          )}
        </div>
      )}

      {state.discoveryReports.length > 0 && (
        <aside className="wk-sources" aria-label="Retailer search results">
          {state.discoveryReports.map(report => (
            <div className={`wk-source-card${report.issues.length ? ' is-warn' : ''}${!report.offerCount ? ' is-empty' : ''}`} key={report.source}>
              <span className="wk-label">{sourceNames[report.source] ?? report.source}</span>
              <strong>{report.offerCount} {report.offerCount === 1 ? 'offer' : 'offers'}</strong>
              {report.issues.length > 0 && <small>{report.issues.length} search {report.issues.length === 1 ? 'problem' : 'problems'} · {report.issues[0].message}</small>}
              {!report.offerCount && !report.issues.length && <small>No matches for this list.</small>}
            </div>
          ))}
        </aside>
      )}

      {!searching && state.log.at(-1)?.startsWith('Search for ') && <p className="wk-notice" role="status">{state.log.at(-1)}</p>}

      {searching && !categorySearching && (
        <>
          <p className="wk-working" aria-live="polite">{state.log.at(-1) ?? 'Searching retailers and checking product requirements…'}</p>
          <SearchSkeleton items={requirements.items} />
        </>
      )}

      {(!searching || categorySearching) && requirements.items.map(item => (
        searching && categorySearching === item.id ? <section key={item.id} aria-label={`Searching ${item.label}`} aria-busy="true"><p className="wk-working" role="status">{state.log.at(-1)}</p><SearchSkeleton items={[item]} /></section> :
        <Shelf
          key={item.id}
          item={item}
          skipped={state.skippedItemIds.includes(item.id)}
          onSearchMore={() => onSearchMore(item.id)}
          onSkip={() => onSkip(item.id)}
          onRestore={() => onRestore(item.id)}
          offers={railOrder(state.offers.filter(o => o.checklistItemId === item.id))}
          selected={state.selected}
          locks={state.locks}
          disabled={disabled || state.phase !== 'compare' || !!state.approved}
          onOpen={offer => setOpenId(offer.id)}
          onEditChecklist={onEditChecklist}
        />
      ))}

      {open && (
        <ProductSheet
          offer={open}
          quantity={openQty}
          selected={state.selected.includes(open.id)}
          locked={state.locks.includes(open.id)}
          replacing={canReplaceWith(open)}
          replacementLocked={replacementLocked}
          disabled={disabled}
          onSelect={() => { onSelect(open.id); setOpenId(null); }}
          onLock={() => { onLock(open.id); setOpenId(null); }}
          onReplace={() => { onReplace(open.id); setOpenId(null); }}
          onClose={() => setOpenId(null)}
        />
      )}
    </>
  );
}

export const budgetLine = (state: State) =>
  state.requirements ? `Budget ${money(state.requirements.budget)} · by ${state.requirements.deadline}` : '';
