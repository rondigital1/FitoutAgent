import { loadEnv } from './load-env';
loadEnv();

import express from 'express';
import cors from 'cors';
import { RunAgentInputSchema, EventType } from '@ag-ui/core';
import { EventEncoder } from '@ag-ui/encoder';
import { CartRequest, Decision, Offer, initialState, type State } from '@settlein/shared';
import { z } from 'zod';
import { LocalAmbiguousAdapter } from './ambiguous';
import { verifyLinkHandoff } from './cart/link-handoff';
import { isStorefrontRequest, prepareStorefront } from './cart/storefront-handoff';
import { activeDiscoverySources } from './discovery/composite';
import { imageProxy } from './images';
import { shopifyEnabled } from './discovery/shopify';
import { transition } from './workflow';

const app = express();
app.use(cors({ origin: (origin, done) => done(null, !origin || /^chrome-extension:\/\/[a-p]{32}$/.test(origin) || origin === (process.env.PANEL_ORIGIN ?? 'http://127.0.0.1:5173')) }));
app.use(express.json({ limit: '512kb' }));
app.use(imageProxy);
const storage = new LocalAmbiguousAdapter();
const busy = new Set<string>();

const CartPrepareBody = CartRequest.extend({
  threadId: z.string().optional(),
  offers: z.array(Offer).optional(),
});

app.get('/health', (_req, res) => res.json({
  ok: true,
  sources: activeDiscoverySources(),
  shopifyCart: shopifyEnabled(),
  mockFallback: process.env.ALLOW_MOCK_FALLBACK === '1',
}));

/**
 * Cart prepare:
 * - Shopify → Storefront cartCreate + verify (real checkoutUrl)
 * - Walmart / BestBuy → link handoff (product URLs present; not session cart)
 * - Mock → rejected here (extension mock-cart)
 */
app.post('/cart/prepare', async (req, res) => {
  const parsed = CartPrepareBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid cart request' }); return; }
  const request = CartRequest.parse(parsed.data);
  let offers = parsed.data.offers ?? [];
  if (!offers.length && parsed.data.threadId) {
    const state = await storage.loadSetupPlan(parsed.data.threadId);
    offers = state?.offers ?? [];
  }

  try {
    if (request.retailer === 'Shopify') {
      // Own-store Storefront cart when configured; otherwise Global Catalog checkout permalinks
      if (shopifyEnabled() && isStorefrontRequest(request, offers)) {
        res.json(await prepareStorefront(request, offers));
        return;
      }
      res.json(verifyLinkHandoff(request, offers));
      return;
    }
    if (request.retailer === 'Walmart' || request.retailer === 'BestBuy') {
      res.json(verifyLinkHandoff(request, offers));
      return;
    }
    res.status(400).json({ error: `Server cart does not handle ${request.retailer}` });
  } catch (e) {
    res.status(502).json({
      id: request.id,
      retailer: request.retailer,
      mock: false,
      verified: false,
      lines: [],
      error: e instanceof Error ? e.message : String(e),
    });
  }
});

app.post('/agent', async (req, res) => {
  const input = RunAgentInputSchema.safeParse(req.body);
  if (!input.success || !/^[a-zA-Z0-9-]{1,80}$/.test(input.data.threadId)) { res.status(400).json({ error: 'Invalid AG-UI input' }); return; }
  const { threadId, runId, forwardedProps } = input.data;
  const decision = Decision.safeParse(forwardedProps?.decision);
  if (!decision.success) { res.status(400).json({ error: 'Invalid structured decision' }); return; }
  const readOnly = decision.data.type === 'sync';
  if (!readOnly && busy.has(threadId)) { res.status(409).json({ error: 'Setup busy; retry after current run' }); return; }
  if (!readOnly) busy.add(threadId);
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' }); res.flushHeaders();
  const encoder = new EventEncoder();
  const send = (event: Parameters<EventEncoder['encode']>[0]) => res.write(encoder.encode(event));
  send({ type: EventType.RUN_STARTED, threadId, runId });
  try {
    const s = await storage.loadSetupPlan(threadId) ?? initialState(threadId);
    if (decision.data.type !== 'sync' && forwardedProps?.revision !== s.revision) throw new Error('State changed. Reload the setup before retrying.');
    if (!readOnly) s.revision++;
    const emit = async (state: State) => {
      if (!readOnly) await storage.saveSetupPlan(state);
      send({ type: EventType.STATE_SNAPSHOT, snapshot: state });
    };
    await transition(s, decision.data, emit); await emit(s);
    send({ type: EventType.RUN_FINISHED, threadId, runId });
  } catch (error) {
    send({ type: EventType.RUN_ERROR, message: error instanceof Error ? error.message : 'Workflow failed' });
  } finally { if (!readOnly) busy.delete(threadId); res.end(); }
});

app.listen(Number(process.env.PORT ?? 4100), '127.0.0.1', () =>
  console.log(`SettleIn runtime: http://127.0.0.1:4100 sources=${activeDiscoverySources().join(',')}`));
