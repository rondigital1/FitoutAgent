import type { CartRequest, CartResult, Offer } from '@fitoutagent/shared';

/**
 * For retailers without a sanctioned session-cart API (Walmart Affiliate, Best Buy):
 * "prepare" means confirm product URLs exist for each line. Payment stays manual on the retailer site.
 * Links ≠ reserved stock; unknown tax/shipping still unknown.
 */
export function verifyLinkHandoff(request: CartRequest, offers: Offer[]): CartResult {
  const lines = request.lines.map(line => {
    const offer = offers.find(o => o.id === line.id);
    return { line, offer };
  });
  const missing = lines.filter(({ offer }) => !offer?.url);
  const ok = missing.length === 0 && lines.every(({ offer }) => offer?.available !== false);
  return {
    id: request.id,
    retailer: request.retailer,
    mock: false,
    verified: ok,
    lines: request.lines,
    error: ok
      ? undefined
      : `Missing product links for: ${missing.map(m => m.line.id).join(', ') || 'unavailable items'}`,

  };
}
