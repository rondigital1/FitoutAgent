# SettleIn

A local web app for planning a multi-item purchase: describe a project, review an AI-generated list, choose products, and prepare shopping links. Payment stays on merchant websites.

## Run

Requires Node 22+ and pnpm 11.20.0.

1. Run `pnpm install`.
2. Configure `AGENT_API_KEY` or `OPENAI_API_KEY` in the root `.env` or `apps/server/.env`. See `.env.example` for model and retailer settings. Never put secrets in `VITE_*` variables.
3. Run `pnpm dev` to start both the backend at `http://127.0.0.1:4100` and the panel.
4. Open `http://127.0.0.1:5173`. For separate processes, use `pnpm dev:server` and `pnpm dev:panel`.

The current build is a web app. The source directory retains the name `apps/extension`; `pnpm build` does not produce an installable Chrome extension.

## Workflow

1. Choose **Choose item by item** to review the list first, or **Let the agent find everything** to build the list, search every category, optimize the complete basket, and prepare shopping links automatically. A budget is optional in agent mode; missing matches receive one follow-up search, and unresolved constraints remain visible instead of being silently skipped. Enter one prompt, such as “Furnish an 800 sq ft, two-bedroom apartment for two people under $5,000. We already have a sofa.”
2. In agent mode, wait for the prepared basket; the agent handles searching and selection with or without a budget. In item-by-item mode, review the generated item types. Change quantities, remove items, add missing items, and enter a budget. A delivery date is optional.
3. Choose **Find products for this list**. Categories without results remain visible. Choose **Skip category** to exclude one from the basket, or **Undo skip** to require it again. Skips survive reload and appear in the final basket summary; a new search resets them. At least one product is required to prepare shopping links. Use **Edit list and budget** to revise the list and search again.
4. Agent picks balance fit and known costs across the whole list; use **Edit list and budget** to revise them. Unskipped missing products and budget issues still block approval. Open a product preview and choose an alternative. Locked products must be unlocked before replacement.
5. Choose **Prepare shopping links**. The unified basket shows all selected products together across retailers, with quantities, seller labels, and a combined product subtotal. Open **Basket** to review before preparation. Prepared carts appear as checkout actions; other products retain seller links. Check quantities, availability, delivery, taxes, and shipping at the merchant before paying.

**Edit prompt** reopens the original prompt. Updating it generates a new list and invalidates previous product selections and approval. **New project** starts a separate project. Reload restores the saved project and shopping mode; old snapshots receive missing field defaults instead of crashing the UI.

## Integration and limits

- The frontend uses `@ag-ui/client` directly for state snapshots and streamed errors. CopilotKit is deliberately not a dependency: this is a staged shopping flow driven by a structured `Decision` union, not a chat surface, so its chat and generative-UI hooks do not apply. The `@ag-ui/*` packages are pinned to exact versions because they are pre-1.0 and ship breaking changes in patch releases.
- AI checklist generation uses the Responses API with a strict Zod-backed output schema and requires server-side model credentials. Provider failures, refusals, and incomplete responses appear in the UI and preserve the prompt for retry.
- The checklist prompt favors a minimal list and concise searches that preserve explicit size, compatibility, material, brand, and exclusions. It generates optional extras in the same call. Live discovery uses checklist queries directly, then assesses product fit against retailer titles, descriptions and selected variants using structured AI output. Conflicting products are excluded from recommendations; missing or failed evidence stays unverified. Product previews show the requirement checks and supporting quotes.
- Live search adapters include Shopify Global Catalog, Shopify Storefront, Walmart Affiliate, and Best Buy. All configured sources run together. Set `SHOPIFY_GLOBAL_CATALOG=1` for cross-merchant Shopify suggestions; Walmart and Best Buy additionally need their own credentials from `.env.example`. Restart the backend after changing configuration.
- Each retailer displays an offer count and any search failures. Successful results survive another provider failing. Requests time out after 12 seconds, with at most four concurrent queries per source. Empty categories remain editable.
- Demo products require `ALLOW_MOCK_FALLBACK=1`; without live sources or this explicit opt-in, search reports a configuration error. Prices are compared in USD; known non-USD offers are excluded.
- Product links are not verified session carts or reservations. The configured Shopify Storefront integration can create and read back a cart; other paths prepare merchant links.
- Basket recommendations compare fit, required quantities, known item/tax/shipping costs and merchant count. Choose Recommended, Lowest known cost or Fewer stores, then **Apply this basket** to replace unlocked selections. Locked products survive searches and remain blockers if unavailable. Budget checks include all known costs; unquoted tax/shipping keeps the final total unknown. A missing delivery estimate is not a delivery guarantee. See [fit and optimization design](docs/fit-optimization.md) and [UI design](docs/ui-design.md).
- This is a local, single-user prototype. Server state is stored under `apps/server/.data` by default. Checkout and payment remain manual.

## Verification

```sh
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

Browser tests run isolated servers on ports 4319 and 5319 with controlled external-provider responses. They exercise the real HTTP workflow and persistence through prompt, list editing, product selection, shopping links, reload, prompt revision, provider failure, and missing-product recovery. These tests do not prove live model credentials, retailer availability, or completed purchases. The obsolete extension-only test is skipped when no extension manifest exists.
