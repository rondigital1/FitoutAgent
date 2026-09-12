import type { ChecklistItem } from '@fitoutagent/shared';

/** Placeholder shelves while discovery runs, so the stage keeps its shape and the
 * user can see which categories are still being searched. */
export function SearchSkeleton({ items }: { items: ChecklistItem[] }) {
  return (
    <div aria-hidden>
      {items.slice(0, 4).map(item => (
        <section className="wk-shelf wk-skelshelf" key={item.id}>
          <header className="wk-shelf__head">
            <div className="wk-shelf__title">
              <h2 className="wk-shelf__name">{item.label}</h2>
              <div className="wk-shelf__facts">
                <span className="wk-shelf__count">searching…</span>
                <span className="wk-shelf__qty">Need {item.quantity}</span>
              </div>
            </div>
          </header>
          <div className="wk-rail">
            {[0, 1, 2, 3].map(i => (
              <div className="wk-skel" key={i}>
                <div className="wk-skel__art" />
                <div className="wk-skel__line" />
                <div className="wk-skel__line wk-skel__line--short" />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
