# Shopify demo audit — 2026-09-12

**Verdict: live product discovery works; a reliable products-to-baskets demo is not ready.** The app completes its own workflow, but the merchant checkout can contain a different quantity. No purchase, payment, or customer information was submitted during this audit.

## Scope and evidence

Tested the running application at `http://127.0.0.1:5173`, its backend at `http://127.0.0.1:4100`, actual Shopify Global Catalog results, and merchant checkout pages. The repository was already entirely untracked; application implementation files were not changed by this audit. Other work appeared during the run, so these results describe the checkout observed during testing, not a pinned Git commit.

Health response:

```json
{"ok":true,"sources":["ShopifyGlobalCatalog"],"shopifyCart":false,"mockFallback":false}
```

The model credentials worked live. Storefront domain/token are absent from the inspected local configuration. Walmart, Best Buy, and mock products were not active in the live walkthrough.

| Check | Result | Evidence boundary |
| --- | --- | --- |
| Workspace typecheck | Passed | Baseline application |
| Server tests | 35 passed | Existing controlled tests |
| Production build | Passed | Baseline application |
| Browser suite | 8 passed, 1 skipped | Controlled model and product fixtures; obsolete extension test skipped |
| Added Shopify cart tests | 6 passed | Real Storefront adapter, controlled HTTP responses |
| Server typecheck after test addition | Passed | Includes new test file |
| Live model → checklist | Passed | Correct two categories, quantities, and $200 budget |
| Live Shopify discovery | Passed | 9 offers: 5 mugs, 4 kettles |
| Quantity edit → reload | Passed | Mug quantity changed from 2 to 3 and persisted |
| Selection and budget blocking | Passed | $304 selection blocked; $123.99 selection allowed |
| App shopping-link completion → reload | Passed | Final page restored; no captured browser errors/warnings |
| Merchant quantity handoff | **Failed** | App displayed 3 mugs; Magnolia checkout contained 1 |
| Kettle merchant handoff | Passed | COSORI checkout: stainless steel kettle, quantity 1, $69.99 |
| Edit completed list / reopen prompt | Passed | Quantity retained; original prompt available for revision |
| Live configured-store cartCreate | Not tested | Storefront credentials unavailable |
| Separate live UCP cart probe | Passed | Magnolia created/read back 3 mugs, USD subtotal 5400 cents |

## Reproduce the primary failure

1. Enter: “Buy two ceramic coffee mugs and one stainless steel electric kettle for a kitchen under $200. Only these items.”
2. Generate the list. Change Ceramic coffee mug quantity to **3**. Reload and confirm the edit remains.
3. Find products. In this run, choose Campfire Market & Garden Mug from Magnolia at $18 and Original Electric Gooseneck Kettle from COSORI at $69.99.
4. Confirm the app subtotal is **$123.99**: `3 × $18 + $69.99`.
5. Prepare shopping links. The app shows **4 items**, marks its Shopify result `verified: true`, and reaches Done.
6. Open the Magnolia link. Its path is **`/cart/16942518404:1`**. Merchant checkout shows **quantity 1, subtotal $18**, while the app displays **×3**.
7. Open the COSORI link. Its path is `/cart/45003311743285:1`; the merchant shows quantity 1 and $69.99, matching the app.

Local test setup ID: `f31091ea-27b5-4fe5-a834-d7b5c26a52c7`. The walkthrough later reopened its checklist, which correctly invalidated completion. Live catalog ordering and availability can change.

## Required before a basket demo

### 1. Preserve quantities and group by actual merchant — blocker

`apps/server/src/discovery/shopify-global-catalog.ts` stores the provider's single-variant checkout URL unchanged. `apps/extension/src/ui/BasketPanel.tsx` adds the requested quantity to the label but leaves the URL unchanged. Its duplicate-link grouping also only changes displayed quantities.

`apps/server/src/planning.ts:49` groups baskets by `retailer`, so Magnolia and COSORI become one “Shopify” result. There is no per-shop basket identity. The catalog adapter retains the seller as display text but drops structured seller identity/domain.

Required behavior: retain merchant identity and selected variant identity; aggregate duplicate variants within each merchant; create one basket per merchant with exact quantities; show each merchant separately. Two different products from one shop must open together in one basket. Products from different shops must remain separate.

### 2. Verify merchant contents before reporting a prepared basket — blocker

`apps/server/src/cart/link-handoff.ts:8` makes no merchant request. It checks that cached URLs exist and cached availability is not false, then echoes requested lines as verified. This is why the wrong mug quantity still completes successfully.

Introduce distinct link-ready and cart-verified outcomes. A verified basket needs fresh merchant readback of variant IDs and quantities plus a usable handoff URL. Missing, reduced, unavailable, or rejected lines must keep that merchant unresolved. The current UI mostly says “Links ready,” but internal verification and completion logs imply stronger checks than occurred.

### 3. Choose and wire the basket integration — blocker

**Cross-merchant route:** retain Global Catalog and integrate merchant UCP Cart MCP. Both `https://magnolia.com/api/ucp/mcp` and `https://cosori.com/api/ucp/mcp` advertised `create_cart`, `get_cart`, and `update_cart` during this audit. A separate direct call to Magnolia created 3 of variant `gid://shopify/ProductVariant/16942518404`; `get_cart` returned quantity 3, unit price 1800, USD subtotal 5400, no messages, and a continuation URL. This used no Storefront token and is **not an application capability yet**.

Implementation detail learned live: Magnolia returned the cart directly under `result.structuredContent` (`id`, `line_items`, `currency`, `totals`, `continue_url`), whereas the documentation also illustrates a nested `cart` envelope. Validate actual responses and cover supported shapes. Avoid logging cart keys. The probe used Shopify's example agent profile; a durable integration should host its own correctly advertised profile and handle capability negotiation and rate limits.

Shopify documents unauthenticated cart tools and separate authenticated checkout conversion. Manual merchant checkout can remain the demo endpoint. See [Cart MCP](https://shopify.dev/docs/agents/carts-and-checkout/cart-mcp).

**Single configured store route:** set `SHOPIFY_STORE_DOMAIN` and `SHOPIFY_STOREFRONT_TOKEN`, disable Global Catalog for that rehearsal, publish suitable in-stock USD variants to the relevant storefront, and verify the existing Storefront integration live. Its cart adapter correctly aggregates duplicates and detects quantity mismatch in controlled tests. Credentials alone are not live proof. See [Storefront cart management](https://shopify.dev/docs/storefronts/headless/building-with-the-storefront-api/cart/manage).

Do not mix the paths without explicit per-source/per-merchant routing: `apps/server/src/index.ts:56` only calls Storefront when **every** requested line is a Storefront offer. A mixed Shopify selection falls back to link-only handling for the whole group.

For a link-only demonstration, quantity-aware, per-merchant permalinks are a smaller implementation, but they still do not prove cart contents until opened/read back. Shopify supports multiple variant/quantity pairs in one merchant URL: [cart permalinks](https://shopify.dev/docs/apps/build/checkout/create-cart-permalinks).

### 4. Verify selected variants and refreshed prices — required for trustworthy claims

Global Catalog uses one automatically chosen variant per product; Storefront requests `variants(first: 1)`. Product option labels and selection controls are absent. Explicit size, color, capacity, compatibility, and pack count cannot be reliably verified from this UI. The COSORI handoff happened to match stainless steel in this run; this is not general variant validation.

Add product detail retrieval and explicit variant selection or restrict the demo to prevalidated simple variants. Shopify's documented catalog flow includes `get_product` after discovery: [Global Catalog](https://shopify.dev/docs/agents/catalog/global-catalog).

Automatic selection ranks by price rather than validating fit. Cart readback in the existing Storefront implementation only compares IDs and quantities; it does not reconcile updated prices/currency against the approved budget. Refresh these before handoff and require another review if they change materially. Taxes, shipping, and delivery remain unknown until merchant checkout; present the current budget as an item subtotal.

### 5. Make failure and resume behavior safe for real carts

Storefront cart IDs live in an in-memory map, and `prepare` always creates a new cart. A retry or reload during preparation can create another cart; no persisted cart identity supports readback after backend restart. Persist merchant/cart association and operation status, reuse/reconcile existing carts, and keep successful merchant baskets when another fails.

Test throttling, missing/expired carts, sold-out variants, quantity reductions, stale prices, and interruption during creation through the browser-to-backend path. Existing generic recovery tests and the six new Storefront adapter tests are useful coverage, but do not yet establish these live multi-merchant behaviors.

## Demo acceptance checklist

- [ ] Only Shopify sources active; no silent mock fallback.
- [ ] Prompt produces the intended list; edits and reload preserve quantities/budget.
- [ ] Every chosen item has a confirmed merchant, exact variant/options, current USD price, and availability.
- [ ] One merchant with two distinct products opens both in the same basket.
- [ ] Quantity 3 and duplicate checklist lines survive merchant handoff exactly.
- [ ] Two merchants produce separate verified baskets and links.
- [ ] Price/quantity changes prevent stale approval from being treated as valid.
- [ ] Failed merchant can be retried while successful baskets remain available.
- [ ] Reload during preparation and backend restart resume without blindly creating new carts.
- [ ] Merchant pages visibly match the app's variants, quantities, and subtotals.
- [ ] Rehearse the exact prompt and products shortly before the demo; stop before payment.

Audit additions: this report and `apps/server/src/shopify-cart.test.ts`. Application blockers described above remain unresolved.
