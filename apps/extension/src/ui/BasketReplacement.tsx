import { useEffect, useRef, useState } from 'react';
import { money, type Offer, type State } from '@settlein/shared';
import { OfferImage } from './ProductTile';
import { FitDetails } from './FitDetails';

export function BasketReplacement({ state, offer, disabled, onClose, onReplace }: {
  state: State;
  offer: Offer;
  disabled: boolean;
  onClose(): void;
  onReplace(id: string): Promise<boolean>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { ref.current?.showModal(); }, []);
  const locked = state.locks.includes(offer.id);
  const alternatives = state.offers.filter(o => o.checklistItemId === offer.checklistItemId && o.id !== offer.id && o.available && o.fit?.status !== 'rejected' && !(state.requirements?.deadline && o.arrival && o.arrival > state.requirements.deadline));
  return (
    <dialog ref={ref} className="wk-sheet" onClose={onClose} aria-labelledby="basket-replace-title">
      <div className="wk-sheet__scroll">
        <div className="wk-sheet__body">
          <h2 id="basket-replace-title">Replace {offer.name}</h2>
          <p>Your other basket choices stay the same.</p>
          {locked && <p className="wk-notice">This choice is locked. Use Edit list and budget, then unlock it from its product details before replacing it.</p>}
          {!alternatives.length && <p className="wk-notice">No available alternatives yet. Edit the list and search again for more options.</p>}
          {failed && <p role="alert">Could not replace this product. Close this picker to review the error and try again.</p>}
          <ul className="wk-replacement-options">
            {alternatives.map(candidate => (
              <li key={candidate.id}>
                <div className="wk-replacement-options__image"><OfferImage offer={candidate} /></div>
                <div><h3>{candidate.name}</h3><p>{money(candidate.price)} each</p><FitDetails offer={candidate} />
                  <button className="primary" type="button" disabled={disabled || locked} aria-label={`Use ${candidate.name} instead`} onClick={async () => { setFailed(false); if (!await onReplace(candidate.id)) setFailed(true); }}>Use this instead</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="wk-sheet__actions"><button type="button" onClick={() => ref.current?.close()}>Cancel</button></div>
      </div>
    </dialog>
  );
}
