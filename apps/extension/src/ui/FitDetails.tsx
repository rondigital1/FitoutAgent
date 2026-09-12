import type { Offer } from '@fitoutagent/shared';

export const fitLabel = (offer: Offer) => offer.fit?.status === 'verified' ? 'Fit supported'
  : offer.fit?.status === 'rejected' ? 'Does not fit' : 'Fit needs review';

export function FitDetails({ offer }: { offer: Offer }) {
  return (
    <section className="wk-fit" aria-label="Product fit assessment">
      <h3>{fitLabel(offer)}</h3>
      <p>{offer.fit?.summary ?? 'This product has not been assessed. Search again to check its fit.'}</p>
      {offer.variant && <p><strong>Selected variant:</strong> {offer.variant}</p>}
      {!!offer.fit?.checks.length && <ul>
        {offer.fit.checks.map((check, index) => <li key={index}>
          <strong>{check.requirement}</strong> · {check.status === 'supported' ? 'Supported' : check.status === 'conflict' ? 'Conflict' : 'Unconfirmed'}
          {check.evidence && <blockquote>{check.evidence}</blockquote>}
        </li>)}
      </ul>}
      {offer.description && <details><summary>Retailer description</summary><p>{offer.description}</p></details>}
    </section>
  );
}
