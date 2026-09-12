import type { Offer } from '@fitoutagent/shared';
import type { TileEmphasis } from './ProductTile';

export type ShelfFacts = {
  /** Cheapest and dearest known price among in-stock offers, for the shelf header. */
  low: number | null;
  high: number | null;
  emphasis: Map<string, TileEmphasis>;
};

const NONE: TileEmphasis = { cheapest: false, bestFit: false, overCheapest: null };

/** Decide which offers a shelf should call out: the cheapest in-stock price, and the
 * cheapest offer whose fit the assessment actually supports. Out-of-stock and
 * unpriced offers never win a badge, so a badge always names something buyable. */
export function shelfFacts(offers: Offer[]): ShelfFacts {
  const priced = offers.filter(offer => offer.available && offer.price !== null);
  const prices = priced.map(offer => offer.price!);
  const low = prices.length ? Math.min(...prices) : null;
  const high = prices.length ? Math.max(...prices) : null;

  const cheapest = low === null ? null : priced.find(offer => offer.price === low) ?? null;
  const verified = priced.filter(offer => offer.fit?.status === 'verified');
  const bestFit = verified.length
    ? verified.reduce((best, offer) => (offer.price! < best.price! ? offer : best))
    : null;

  const emphasis = new Map<string, TileEmphasis>();
  for (const offer of offers) {
    const over = low !== null && offer.price !== null && offer.available ? offer.price - low : null;
    emphasis.set(offer.id, {
      ...NONE,
      cheapest: offer.id === cheapest?.id,
      bestFit: offer.id === bestFit?.id,
      overCheapest: over && over > 0 ? over : null,
    });
  }
  return { low, high, emphasis };
}

export const tileEmphasis = (facts: ShelfFacts, offerId: string) => facts.emphasis.get(offerId) ?? NONE;
