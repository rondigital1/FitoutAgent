import { useEffect, useRef, useState } from 'react';
import { money, type State } from '@fitoutagent/shared';
import { useSetup } from './use-setup';
import { SetupForm } from './SetupForm';
import { ChecklistReview } from './ChecklistReview';
import { BasketPanel } from './ui/BasketPanel';
import { PlanDock } from './ui/PlanDock';
import { ShopStage } from './ui/ShopStage';
import { TopBar, type StageId } from './ui/TopBar';

const phaseStage = (phase: State['phase']): StageId => {
  if (phase === 'idle') return 'setup';
  if (phase === 'checklist') return 'checklist';
  if (phase === 'discover' || phase === 'compare') return 'shop';
  return 'baskets';
};

function reachedStages(s: State): StageId[] {
  const reached: StageId[] = ['setup'];
  if (s.requirements) reached.push('checklist');
  if (s.offers.length || s.phase === 'discover') reached.push('shop');
  if (s.plans.length || s.approved || s.baskets.length || s.pending) reached.push('baskets');
  return reached;
}

const STAGE_TITLES: Record<StageId, { eyebrow: string; title: string }> = {
  setup: { eyebrow: 'Project', title: 'What are you shopping for?' },
  checklist: { eyebrow: 'Shopping list', title: 'Review your list' },
  shop: { eyebrow: 'Products', title: 'Browse products' },
  baskets: { eyebrow: 'Cart', title: 'Your cart' },
};

export function App() {
  const { state: s, send, busy, connecting, error, reset } = useSetup();
  const disabled = busy || s.paused;

  const auto = phaseStage(s.phase);
  const reached = reachedStages(s);
  const [override, setOverride] = useState<StageId | null>(null);
  const lastAuto = useRef(auto);
  useEffect(() => {
    if (lastAuto.current !== auto) { lastAuto.current = auto; setOverride(null); }
  }, [auto]);
  const stage = override && reached.includes(override) ? override : auto;

  const [planId, setPlanId] = useState<string | null>(null);
  const activePlanId = s.approved ?? (planId && s.plans.some(p => p.id === planId) ? planId : s.plans[0]?.id ?? '');
  const showDock = (stage === 'shop' || (stage === 'baskets' && !s.approved)) && s.plans.length > 0 && !!s.requirements;

  return (
    <div className={`wk-app${showDock ? ' wk-app--with-dock' : ''}`}>
      <TopBar
        phase={s.phase}
        paused={s.paused}
        busy={busy}
        sources={s.discoverySources}
        stage={stage}
        reached={reached}
        onStage={setOverride}
        pauseDisabled={busy || !!s.pending}
        onPauseToggle={() => void send({ type: s.paused ? 'resume' : 'pause' })}
      />

      <main className="wk-stage">
        <div className="wk-stage__head">
          <span className="wk-label">{STAGE_TITLES[stage].eyebrow}</span>
          <h1>{stage === 'shop' && s.draft?.selectionMode === 'agent' ? 'Recommended products' : STAGE_TITLES[stage].title}</h1>
          {s.requirements && (stage === 'shop' || stage === 'baskets') && (
            <p className="muted">
              {s.requirements.budget === null ? 'No spending limit set' : `${money(s.requirements.budget)} budget`}
              {s.requirements.deadline ? ` · needed by ${s.requirements.deadline}` : ''}
            </p>
          )}
        </div>

        <div className="wk-toolbar">
          {connecting && <span className="muted">Connecting to local runtime…</span>}
          <button type="button" className="btn-quiet" disabled={busy || !!s.pending} onClick={() => reset()}>New order</button>
          {s.draft && <button type="button" disabled={disabled || !!s.pending} onClick={() => {
            void send({ type: 'start-over' }).then(ok => { if (ok) { lastAuto.current = 'setup'; setOverride('setup'); setPlanId(null); window.scrollTo(0, 0); } });
          }}>Start over</button>}
          {s.requirements && stage !== 'setup' && <button type="button" className="btn-quiet" onClick={() => setOverride('setup')}>Edit project</button>}
          {s.requirements && s.phase !== 'checklist' && <button type="button" disabled={disabled || !!s.pending} onClick={() => void send({ type: 'edit-checklist' })}>Edit list</button>}
        </div>

        {error && (
          <div className="wk-notice wk-notice--alert" role="alert">
            <span>{error}</span>
            <button type="button" disabled={busy} onClick={() => void send({ type: 'sync' })}>
              Reload saved setup
            </button>
          </div>
        )}

        {stage === 'setup' && !connecting && (
          <>
            {s.phase === 'idle' && s.draft && <p className="wk-notice" role="status">Your improved prompt is ready. Edit it if you like, then run a new search.</p>}
            <SetupForm key={s.id + (s.draft?.goal ?? '') + (s.draft?.selectionMode ?? 'manual')} state={s} submitting={disabled || !!s.pending}
              onStart={draft => { void send({ type: s.draft ? 'revise-goal' : 'start', draft }).then(ok => { if (ok) setOverride(null); }); }} />
          </>
        )}

        {stage === 'checklist' && s.requirements && (
          s.phase === 'checklist' ? (
            <>
              <ChecklistReview
                key={s.id}
                setupId={s.id}
                requirements={s.requirements}
                suggestions={s.suggestions}
                disabled={disabled}
                onConfirm={(items, budget, deadline) => void send({ type: 'confirm-checklist', items, budget, deadline })}
              />
            </>
          ) : (
            <div className="wk-panel">
              <div className="wk-check">
                {s.requirements.items.map(item => (
                  <div className="wk-check__row" key={item.id}>
                    <div className="wk-check__main">
                      <span className="wk-check__label">{item.label}</span>
                      {item.must && <span className="chip chip--ok">Must</span>}
                    </div>
                    <span className="chip">{item.quantity} ×</span>
                  </div>
                ))}
              </div>
            </div>
          )
        )}

        {stage === 'shop' && (
          <ShopStage
            state={s}
            disabled={disabled}
            onLock={productId => void send({ type: 'lock', productId })}
            onSearchMore={checklistItemId => void send({ type: 'search-more', checklistItemId })}
            onRetryRecovery={checklistItemId => void send({ type: 'retry-recovery', checklistItemId })}
            onReviewRequirements={() => setOverride('setup')}
            onSkip={checklistItemId => void send({ type: 'skip-item', checklistItemId })}
            onRestore={checklistItemId => void send({ type: 'restore-item', checklistItemId })}
            onSelect={productId => void send({ type: 'select', productId })}
            onReplace={productId => void send({ type: 'replace', productId })}
            onEditChecklist={() => void send({ type: 'edit-checklist' })}
          />
        )}

        {stage === 'baskets' && (
          <BasketPanel state={s} disabled={disabled} onShop={() => { void send({ type: 'reopen-basket' }).then(ok => { if (ok) { lastAuto.current = 'shop'; setOverride('shop'); setPlanId('essential'); } }); }} onEdit={async (productId, quantity) => {
            const ok = await send({ type: 'edit-basket-item', productId, quantity });
            if (ok) { lastAuto.current = 'shop'; setOverride('baskets'); setPlanId('essential'); }
            return ok;
          }} onReplace={async (productId, replacementId) => {
            const ok = await send({ type: 'replace-basket-product', productId, replacementId });
            if (ok) { lastAuto.current = 'shop'; setOverride('baskets'); setPlanId('essential'); }
            return ok;
          }} onRetry={() => void send({ type: 'retry' })} />
        )}

        {s.log.length > 0 && (
          <details className="wk-activity">
            <summary>Activity · {s.log.length} updates</summary>
            <ol>{s.log.map((entry, i) => <li key={i}>{entry}</li>)}</ol>
          </details>
        )}
      </main>

      {showDock ? (
        <PlanDock
          plans={s.plans}
          activeId={activePlanId}
          approved={s.approved}
          blocked={s.replacement ? 'Resolve the out-of-stock item first.' : null}
          disabled={disabled}
          onActivate={id => {
            if (id === 'essential' || s.approved) { setPlanId(id); return; }
            void send({ type: 'apply-plan', planId: id }).then(ok => { if (ok) setPlanId(id); });
          }}
          feedback={s.log.at(-1)?.includes('Locked choices are preserved.') || s.log.at(-1)?.startsWith('Applied ') ? s.log.at(-1) : undefined}
          onCreate={id => {
            if (s.approved === id) { setOverride('baskets'); return; }
            void send({ type: 'approve', planId: id }).then(ok => { if (ok) setOverride('baskets'); });
          }}
          onEditChecklist={() => void send({ type: 'edit-checklist' })}
        />
      ) : (
        <footer className="wk-foot">
          <span>FitoutAgent</span>
          <span>US · USD</span>
        </footer>
      )}
    </div>
  );
}
