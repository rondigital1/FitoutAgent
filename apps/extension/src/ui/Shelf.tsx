import { money, type ChecklistItem, type Offer } from '@settlein/shared';
import { ProductTile } from './ProductTile';
import { shelfFacts, tileEmphasis } from './shelf-emphasis';

export function Shelf({
  item, offers, selected, locks, disabled, skipped, onOpen, onEditChecklist, onSkip, onRestore, onSearchMore,
}: {
  item: ChecklistItem;
  offers: Offer[];
  selected: string[];
  locks: string[];
  disabled: boolean;
  skipped: boolean;
  onSearchMore(): void;
  onSkip(): void;
  onRestore(): void;
  onOpen(offer: Offer): void;
  onEditChecklist(): void;
}) {
  const facts = shelfFacts(offers);
  const spread = facts.low !== null && facts.high !== null && facts.high > facts.low;

  return (
    <section className={`wk-shelf${skipped ? ' is-skipped' : ''}`} aria-labelledby={`shelf-${item.id}`}>
      <header className="wk-shelf__head">
        <div className="wk-shelf__title">
          <h2 className="wk-shelf__name" id={`shelf-${item.id}`}>{item.label}</h2>
          <div className="wk-shelf__facts">
            <span className={`wk-shelf__count${offers.length ? '' : ' is-empty'}`}>
              {offers.length ? `${offers.length} ${offers.length === 1 ? 'offer' : 'offers'}` : 'no offers'}
            </span>
            <span className="wk-shelf__qty">Need {item.quantity}</span>
            {facts.low !== null && (
              <span className="wk-shelf__range">
                {spread ? `${money(facts.low)} – ${money(facts.high)}` : money(facts.low)}
              </span>
            )}
            {skipped && <span className="chip chip--warn">Skipped</span>}
          </div>
        </div>
        <div className="wk-shelf__tools">
          <button type="button" disabled={disabled || skipped} aria-label={`Find different options for ${item.label}`} onClick={onSearchMore}>
            Find different options
          </button>
          {!offers.length && (
            <button type="button" disabled={disabled} aria-label={`${skipped ? 'Restore' : 'Skip'} ${item.label}`} onClick={skipped ? onRestore : onSkip}>
              {skipped ? 'Undo skip' : 'Skip category'}
            </button>
          )}
          {!offers.length && (
            <button type="button" disabled={disabled} aria-label={`Edit ${item.label} search`} onClick={onEditChecklist}>
              Edit list and budget
            </button>
          )}
        </div>
      </header>

      {!offers.length && (
        <div className="wk-shelf__empty">
          <p>{skipped ? 'Skipped — excluded from your basket.' : 'No products found. Skip this category to continue, or edit the search.'}</p>
        </div>
      )}

      {!!offers.length && <div className="wk-rail" role="list">
        {offers.map(offer => (
          <div role="listitem" key={offer.id}>
            <ProductTile
              offer={offer}
              selected={selected.includes(offer.id)}
              locked={locks.includes(offer.id)}
              emphasis={tileEmphasis(facts, offer.id)}
              onOpen={() => onOpen(offer)}
            />
          </div>
        ))}
      </div>}
    </section>
  );
}
