import { useEffect, useRef } from 'react';
import { money, type Offer } from '@settlein/shared';
import { OfferImage } from './ProductTile';
import { RetailerMark } from './RetailerMark';
import { FitDetails, fitLabel } from './FitDetails';

/** Mirrors evaluate() in packages/shared/src/constraints.ts: any unknown component
 * makes the line total unknown. Never renders an unknown cost as $0.00. */
function lineTotal(offer: Offer, quantity: number) {
  if (offer.price === null || offer.tax === null || offer.shipping === null) return null;
  return (offer.price + offer.tax + offer.shipping) * quantity;
}

function Spec({ label, value, unknownAs }: { label: string; value: number | null; unknownAs: string }) {
  return (
    <div className="wk-spec__row">
      <dt>{label}</dt>
      <dd className={value === null ? 'is-unknown' : undefined}>{value === null ? unknownAs : money(value)}</dd>
    </div>
  );
}

export function ProductSheet({
  offer, quantity, selected, locked, replacing, replacementLocked, disabled,
  onLock, onReplace, onClose, onSelect,
}: {
  offer: Offer;
  quantity: number;
  selected: boolean;
  locked: boolean;
  /** This offer is an eligible stand-in for the currently unavailable selection. */
  replacing: boolean;
  replacementLocked: boolean;
  disabled: boolean;
  onLock(): void;
  onReplace(): void;
  onClose(): void;
  onSelect(): void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);

  const total = lineTotal(offer, quantity);
  return (
    <dialog className="wk-sheet" ref={ref} onClose={onClose} aria-labelledby="wk-sheet-title">
      <div className="wk-sheet__scroll">
        <div className="wk-sheet__grip"><span /></div>

        <div className="wk-sheet__art">
          <OfferImage offer={offer} />
          <RetailerMark retailer={offer.retailer} size="lg" />
        </div>

        <div className="wk-sheet__body">
          {offer.brand && <p className="wk-label wk-sheet__brand">{offer.brand}</p>}
          <h2 className="wk-sheet__title" id="wk-sheet-title">{offer.name}</h2>

          <div className="wk-sheet__chips">
            <span className={`chip ${offer.available ? 'chip--ok' : 'chip--danger'}`}>
              {offer.available ? 'Available' : 'Unavailable'}
            </span>
            <span className="chip">{fitLabel(offer)}</span>
            <span className="chip">{quantity} needed</span>
            {selected && <span className="chip chip--accent">In your plan</span>}
            {locked && <span className="chip chip--accent">Locked</span>}
          </div>

          <FitDetails offer={offer} />
          <dl className="wk-spec">
            <Spec label="Unit price" value={offer.price} unknownAs="Unknown" />
            <Spec label="Est. tax" value={offer.tax} unknownAs="Not quoted" />
            <Spec label="Shipping" value={offer.shipping} unknownAs="Not quoted" />
            <div className="wk-spec__row">
              <dt>Arrives</dt>
              <dd className={offer.arrival ? undefined : 'is-unknown'}>{offer.arrival ?? 'Unconfirmed'}</dd>
            </div>
            <div className="wk-spec__row wk-spec__row--total">
              <dt>Line total · {quantity}&times;</dt>
              <dd className={total === null ? 'is-unknown' : undefined}>{total === null ? 'Unknown' : money(total)}</dd>
            </div>
          </dl>
        </div>

        <p className="wk-sheet__note">
          {offer.retailer === 'Mock'
            ? 'Simulated offer from the local catalog. No retailer was contacted.'
            : 'Prices and availability come from the retailer search API and can change before checkout.'}
          {' '}A product link is not a prepared cart, and nothing here reserves stock.
        </p>

        <div className="wk-sheet__actions">
          {replacing && !replacementLocked && offer.fit?.status !== 'rejected' && (
            <button type="button" className="primary" disabled={disabled} onClick={onReplace}>
              Use this instead
            </button>
          )}
          {replacing && replacementLocked && (
            <p className="wk-sheet__note" style={{ padding: 0 }}>
              Unlock the unavailable product before choosing a replacement.
            </p>
          )}
          {!selected && !replacing && offer.available && offer.fit?.status !== 'rejected' && <button type="button" className="primary" disabled={disabled} onClick={onSelect}>Choose this product</button>}
          {selected && (
            <button type="button" disabled={disabled} onClick={onLock}>
              {locked ? 'Unlock this choice' : 'Lock this choice'}
            </button>
          )}
          {offer.url && (
            <a className="wk-sheet__link" href={offer.url} target="_blank" rel="noreferrer">
              Open product page ↗
            </a>
          )}
          <button type="button" className="btn-quiet" onClick={() => ref.current?.close()}>Close</button>
        </div>
      </div>
    </dialog>
  );
}
