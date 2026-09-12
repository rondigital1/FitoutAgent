import type { Offer, State } from '@settlein/shared';

export function BasketItemControls({ state, offer, disabled, onEdit }: {
  state: State; offer: Offer; disabled: boolean;
  onEdit(productId: string, quantity: number): Promise<boolean>;
}) {
  const item = state.requirements!.items.find(item => item.id === offer.checklistItemId)!;
  return <div className="wk-basket-controls">
    <div className="wk-basket-quantity" role="group" aria-label={`Quantity for ${item.label}`}>
      <button type="button" aria-label={`Decrease quantity for ${item.label}`} disabled={disabled || item.quantity <= 1} onClick={() => void onEdit(offer.id, item.quantity - 1)}>−</button>
      <span aria-label={`${item.label} quantity`}>{item.quantity}</span>
      <button type="button" aria-label={`Increase quantity for ${item.label}`} disabled={disabled || item.quantity >= 20} onClick={() => void onEdit(offer.id, item.quantity + 1)}>+</button>
    </div>
    <button type="button" className="btn-quiet" disabled={disabled} aria-label={`Remove ${item.label}`} onClick={() => void onEdit(offer.id, 0)}>Remove</button>
  </div>;
}
