import { useCallback, useEffect, useRef, useState } from 'react';
import { setupAgent as agent } from './agent';
import { CartResult, restoreState, type Decision, type State } from '@fitoutagent/shared';

import { agentBase } from './agent-base';

async function runServerCart(request: NonNullable<State['pending']>, state: State) {
  const offers = state.offers.filter(o => request.lines.some(l => l.id === o.id));
  const res = await fetch(`${agentBase}/cart/prepare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...request, threadId: state.id, offers }),
  });
  const raw = await res.json();
  if (!res.ok) throw new Error(typeof raw?.error === 'string' ? raw.error : `Cart prepare failed (${res.status})`);
  return raw;
}

export function resetSetup() {
  localStorage.removeItem('fitoutagent-thread');
  // Clear checklist draft caches for old threads
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith('fitoutagent-review-') || key.startsWith('fitoutagent-prompt-')) localStorage.removeItem(key);
  }
  window.location.reload();
}

/** Discovery fans out one catalog search per checklist line, so the ceiling is
 * generous; it only exists to turn a hung stream into a reportable error. */
const STALL_MS: Partial<Record<Decision['type'], number>> = { 'search-more': 180_000, sync: 20_000, start: 300_000, 'revise-goal': 300_000, 'confirm-checklist': 180_000, constraints: 180_000 };
const DEFAULT_STALL_MS = 60_000;

export function useSetup() {
  const [isReady, setIsReady] = useState(false);
  const [state, setState] = useState(() => restoreState(agent.threadId, agent.state));
  useEffect(() => {
    const subscription = agent.subscribe({ onStateChanged: ({ state }) => setState(restoreState(agent.threadId, state)) });
    return () => subscription.unsubscribe();
  }, []);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const inFlight = useRef(false), synced = useRef(false), working = useRef('');

  const send = useCallback(async (decision: Decision) => {
    if (inFlight.current) return false;
    if (decision.type === 'sync') working.current = '';
    inFlight.current = true; setBusy(true); setError('');
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      let runError: string | undefined;
      const run = agent.runAgent({ forwardedProps: { decision, revision: agent.state.revision ?? 0 } }, {
        onRunErrorEvent: ({ event }) => { runError = event.message; },
      });
      // A dropped stream (restarted runtime, lost connection) never settles, which
      // otherwise leaves the panel reporting "Working" forever. State lives on the
      // server, so a reload recovers whatever the run managed to persist.
      await Promise.race([run, new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error('The local runtime stopped responding. Reload the saved setup to pick up where it left off.'));
          agent.abortRun();
        }, STALL_MS[decision.type] ?? DEFAULT_STALL_MS);
      })]);
      if (runError) throw new Error(runError);
      return true;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(/failed to fetch|fetch failed|networkerror|load failed|network request failed/i.test(message)
        ? `Cannot connect to the local runtime at ${agentBase}. Start it with pnpm dev from the project folder, then reload the saved setup. Your prompt is kept.`
        : message);
      return false;
    } finally {
      clearTimeout(timer);
      inFlight.current = false; setBusy(false);
    }
  }, [agent]);

  useEffect(() => {
    if (synced.current) return;
    synced.current = true;
    void (async () => {
      // Reloading mid-run can be refused while the previous stream drains. Retry
      // briefly so the saved setup is restored instead of appearing lost.
      for (let attempt = 0; attempt < 4; attempt++) {
        if (await send({ type: 'sync' })) { setIsReady(true); return; }
        await new Promise(resolve => setTimeout(resolve, 400 * (attempt + 1)));
      }
      setIsReady(true);
    })();
  }, [send]);

  useEffect(() => {
    if (state.phase !== 'discover' || busy) return;
    const timer = setTimeout(() => void send({ type: 'sync' }), 1200);
    return () => clearTimeout(timer);
  }, [state.phase, busy, send]);

  useEffect(() => {
    const request = state.pending;
    if (!request || busy || state.paused || working.current === request.id) return;
    working.current = request.id;
    void (async () => {
      try {
        const raw = await runServerCart(request, state);
        await send({ type: 'cart-result', result: CartResult.parse(raw) });
      } catch (e) {
        await send({
          type: 'cart-result',
          result: {
            id: request.id,
            retailer: request.retailer,
            mock: false,
            verified: false,
            lines: [],
            error: e instanceof Error ? e.message : String(e),
          },
        });
      }
    })();
  }, [state.pending, state.paused, busy, send, state]);

  return {
    state,
    busy: busy || !isReady,
    connecting: !isReady,
    error,
    send,
    reset: resetSetup,
  };
}
