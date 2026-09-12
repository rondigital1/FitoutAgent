import { useState } from 'react';
import { money, proxiedImage, type Offer } from '@fitoutagent/shared';
import { agentBase } from '../agent-base';
import { ProductArt } from './ProductArt';
import { RetailerMark } from './RetailerMark';
import { fitLabel } from './FitDetails';

/** Why this product stands out on its shelf, computed once per shelf in Shelf.tsx. */
export type TileEmphasis = {
  cheapest: boolean;
  bestFit: boolean;
  /** Cents above the cheapest available offer, or null when either price is unknown. */
  overCheapest: number | null;
};

const FIT_TONE = { verified: 'ok', rejected: 'bad' } as const;

export function OfferImage({ offer }: { offer: Offer }) {
  const [failed, setFailed] = useState(false);
  const src = proxiedImage(agentBase, offer.image);
  if (!src || failed) return <ProductArt seed={offer.id} label={offer.name} />;
  return <img src={src} alt={offer.name} loading="lazy" decoding="async" onError={() => setFailed(true)} />;
}

export function ProductTile({
  offer, selected, locked, emphasis, onOpen,
}: {
  offer: Offer;
  selected: boolean;
  locked: boolean;
  emphasis: TileEmphasis;
  onOpen(): void;
}) {
  const misfit = offer.fit?.status === 'rejected';
  const state = [
    selected && 'in your plan',
    locked && 'locked',
    !offer.available && 'unavailable',
    emphasis.cheapest && 'lowest price on this shelf',
    emphasis.bestFit && 'best verified fit',
  ].filter(Boolean).join(', ');
  const classes = [
    'wk-tile',
    selected && 'is-selected',
    !offer.available && 'is-unavailable',
    misfit && 'is-misfit',
    !selected && (emphasis.cheapest || emphasis.bestFit) && 'is-hero',
  ].filter(Boolean).join(' ');

  return (
    <button
      type="button"
      className={classes}
      aria-label={`${offer.name}, ${money(offer.price)}${state ? `, ${state}` : ''}. Open preview.`}
      onClick={onOpen}
    >
      <span className="wk-tile__art">
        <OfferImage offer={offer} />
        <span className="wk-tile__flags">
          {emphasis.cheapest && <span className="wk-flag wk-flag--price">Lowest price</span>}
          {emphasis.bestFit && <span className="wk-flag wk-flag--fit">Best fit</span>}
        </span>
        <span className="wk-tile__corner">
          {locked && <span className="chip chip--accent">Locked</span>}
          {!locked && selected && <span className="chip chip--solid">In plan</span>}
          {!offer.available && <span className="chip chip--danger">Out of stock</span>}
        </span>
        <span className="wk-tile__mark"><RetailerMark retailer={offer.retailer} /></span>
        <span className="wk-tile__peek" aria-hidden>View details →</span>
      </span>
      <span className="wk-tile__meta">
        {offer.brand && <span className="wk-tile__brand">{offer.brand}</span>}
        <span className="wk-tile__name">{offer.name}</span>
        {offer.variant && <span className="wk-tile__variant">{offer.variant}</span>}
        <span className="wk-tile__fit">
          <span className={`wk-dot wk-dot--${FIT_TONE[offer.fit?.status as keyof typeof FIT_TONE] ?? 'warn'}`} aria-hidden />
          {fitLabel(offer)}
        </span>
        <span className="wk-tile__foot">
          <span className={`wk-tile__price${offer.price === null ? ' is-unknown' : ''}`}>
            {offer.price === null ? 'Price unknown' : money(offer.price)}
          </span>
          {!!emphasis.overCheapest && <span className="wk-tile__delta">+{money(emphasis.overCheapest)}</span>}
        </span>
      </span>
    </button>
  );
}
