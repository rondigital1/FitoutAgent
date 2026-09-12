import { useState } from 'react';
import { BasketItemControls } from './BasketItemControls';
import { BasketReplacement } from './BasketReplacement';
import { merchantKey, money, proxiedImage, type State } from '@settlein/shared';
import { agentBase } from '../agent-base';
import { ProductArt } from './ProductArt';
import { RetailerMark, retailerLabel } from './RetailerMark';
import { basketItems, sellerName } from './basket-items';

export function BasketPanel({ state, disabled, onRetry, onReplace, onEdit, onShop }: {
  state: State;
  disabled: boolean;
  onRetry(): void;
  onShop(): void;
  onEdit(productId: string, quantity: number): Promise<boolean>;
  onReplace(productId: string, replacementId: string): Promise<boolean>;
}) {
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const replacing = state.offers.find(offer => offer.id === replacingId);
  const items = basketItems(state);
  const quantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const sellers = new Set(items.map(item => merchantKey(item.offer))).size;
  const subtotal = items.some(item => item.offer.price === null) ? null
    : items.reduce((sum, item) => sum + item.offer.price! * item.quantity, 0);
  const budget = state.requirements?.budget ?? null;
  const remaining = budget !== null && subtotal !== null ? budget - subtotal : null;
  const plan = state.plans.find(plan => plan.id === (state.approved ?? 'essential'));
  const removed = state.requirements?.items.filter(item => state.skippedItemIds.includes(item.id)) ?? [];
  const warnings = plan?.warnings ?? [];
  const failed = state.baskets.filter(basket => !basket.verified);
  const carts = state.baskets.filter(basket => basket.verified && basket.checkoutUrl);


  return (
    <section className="wk-unified" aria-label="Unified basket">
      <div className="wk-unified__summary">
        <div><strong>{quantity} items · {sellers} {sellers === 1 ? 'seller' : 'sellers'}</strong>
          <p>Adjust quantities, swap products, or remove anything.</p>
          <button type="button" className="btn-quiet" disabled={disabled || !!state.pending} onClick={onShop}>+ Add or browse products</button>
        </div>
      </div>
      <div className="wk-unified__layout">
      <div className="wk-unified__workspace">
      {!items.length && <div className="wk-empty"><h2>Your basket is empty</h2><p>Restore a removed item below or browse products to start again.</p></div>}
      <ul className="wk-basket__links wk-unified__items" aria-label="Basket products">
        {items.map(({ offer, quantity, categories }) => {
          const basket = state.baskets.find(basket => basket.retailer === offer.retailer);
          const ready = basket?.verified;
          const choices = state.offers.filter(o => state.selected.includes(o.id) && merchantKey(o) === merchantKey(offer) && o.nativeId === offer.nativeId);
          return (
            <li key={`${merchantKey(offer)}:${offer.nativeId}`} className="wk-unified__item">
              <div className="wk-unified__image">
                {offer.image ? <img src={proxiedImage(agentBase, offer.image)!} alt="" loading="lazy" onError={event => { event.currentTarget.style.display = 'none'; }} />
                  : <ProductArt seed={offer.id} label={offer.name} />}
              </div>
              <div className="wk-unified__detail">
                <span className="wk-label">{categories.join(' · ')}</span>
                <h2>{offer.name}</h2>
                <div className="wk-unified__seller"><RetailerMark retailer={offer.retailer} />
                  {offer.retailer === 'Shopify' && <span>{sellerName(offer)}</span>}
                </div>
                <span className="muted">{money(offer.price)} each · {quantity} in basket</span>
                {choices.map(choice => <div key={choice.id}>
                  {categories.length > 1 && <small>{state.requirements?.items.find(i => i.id === choice.checklistItemId)?.label}</small>}
                  <BasketItemControls state={state} offer={choice} disabled={disabled || !!state.pending} onEdit={onEdit} />
                </div>)}
              </div>
              <div className="wk-unified__action">
                {choices.map(choice => <button key={choice.id} type="button" disabled={disabled || !!state.pending} aria-label={`Replace ${offer.name}${categories.length > 1 ? ` for ${state.requirements?.items.find(i => i.id === choice.checklistItemId)?.label}` : ''}`} onClick={() => setReplacingId(choice.id)}>
                  Replace{categories.length > 1 ? ` ${state.requirements?.items.find(i => i.id === choice.checklistItemId)?.label}` : ''}
                </button>)}
                <strong>{money(offer.price === null ? null : offer.price * quantity)}</strong>
                {ready && basket.checkoutUrl ? <span className="chip chip--ok">In prepared cart</span>
                  : offer.url ? <a className="wk-basket__link" href={sellerLink(offer.url, quantity)} target="_blank" rel="noreferrer">View at seller ↗</a>
                  : <span className="muted">Link unavailable</span>}
                {basket && !ready && <small className="wk-unified__error">Preparation needs attention</small>}
              </div>
            </li>
          );
        })}
      </ul>
      {removed.length > 0 && <div className="wk-basket-removed">
        <h2>Removed from basket <span>· {removed.length}</span></h2>
        {removed.map(item => {
          const offer = state.offers.find(o => o.checklistItemId === item.id && state.removedBasketProducts?.includes(o.id));
          return <div key={item.id}><span>{item.label}</span><button type="button" disabled={disabled || !!state.pending} onClick={() => offer ? void onEdit(offer.id, item.quantity) : onShop()}>{offer ? `Restore ${item.label}` : 'Browse products'}</button></div>;
        })}
      </div>}
      </div>
      <aside className="wk-basket-summary" aria-label="Basket summary">
        <span className="wk-label">Order summary</span>
        <div className="wk-unified__subtotal" aria-live="polite"><span>Product subtotal</span><strong>{money(subtotal)}</strong></div>
        <dl><div><dt>Items</dt><dd>{quantity}</dd></div><div><dt>Sellers</dt><dd>{sellers}</dd></div><div><dt>Budget</dt><dd>{budget === null ? 'Not set' : money(budget)}</dd></div></dl>
        {remaining !== null && <div className={`wk-basket-budget${remaining < 0 ? ' is-over' : ''}`}>
          <div><span>{remaining < 0 ? 'Over budget' : 'Budget remaining'}</span><strong>{money(Math.abs(remaining))}</strong></div>
          <progress aria-label="Budget used" value={subtotal ?? 0} max={budget || 1} />
        </div>}
        <p>Tax and shipping are confirmed at checkout.</p>
        <div className="wk-basket-summary__note"><strong>{state.approved && state.phase === 'complete' ? 'Ready for seller checkout' : 'Review your basket'}</strong><p>{state.approved ? 'Complete payment separately with each seller. No payment has occurred.' : 'Prepare fresh shopping links below after your changes.'}</p></div>
      </aside>
      </div>
      {replacing && <BasketReplacement state={state} offer={replacing} disabled={disabled || !!state.pending} onClose={() => setReplacingId(null)} onReplace={async replacementId => {
        const ok = await onReplace(replacing.id, replacementId);
        if (ok) setReplacingId(null);
        return ok;
      }} />}
      {!state.approved && <p className="wk-notice">Review your changes, then prepare shopping links for the updated basket.</p>}
      {carts.length > 0 && <div className="wk-unified__checkout" aria-label="Prepared carts">
        {carts.map(cart => <a key={cart.id} href={cart.checkoutUrl} target="_blank" rel="noreferrer">Continue to {retailerLabel(cart.retailer)} checkout ↗</a>)}
      </div>}
      {warnings.length > 0 && <details className="wk-unified__review">
        <summary>Review before checkout · {warnings.length} details</summary>
        <ul>{warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>
      </details>}
      {state.pending && <p className="wk-working">Preparing {retailerLabel(state.pending.retailer)}… Your full basket stays here.</p>}
      {failed.map(basket => <p className="wk-notice wk-notice--alert" key={basket.id}>{retailerLabel(basket.retailer)}: {basket.error ?? 'Could not prepare this part of your basket.'}</p>)}
      {state.phase === 'verify' && !state.pending && failed.length > 0 && (
        <button type="button" disabled={disabled} onClick={onRetry}>Retry unverified basket · max 2 attempts</button>
      )}
      {state.skippedItemIds.length > 0 && <p className="wk-notice">
        Skipped categories (not in this basket): {state.requirements?.items.filter(item => state.skippedItemIds.includes(item.id)).map(item => item.label).join(', ')}.
      </p>}
      {state.phase === 'complete' && state.approved && <p className="wk-notice">Merchant checkout links prepared. No payment has occurred.</p>}
    </section>
  );
}

/** Catalog cart permalinks must reflect the quantity displayed in this basket. */
function sellerLink(url: string, quantity: number): string {
  try {
    const link = new URL(url);
    if (/^\/cart\/\d+:\d+$/.test(link.pathname)) link.pathname = link.pathname.replace(/:\d+$/, `:${quantity}`);
    return link.toString();
  } catch { return url; }
}
