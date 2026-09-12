# FitoutAgent

FitoutAgent helps you buy a lot of things at once.

You describe a project in one sentence — *"Furnish an 800 sq ft two-bedroom apartment for two people under $5,000, we already have a sofa"* — and it turns that into a shopping list, searches real retailers for each item, picks a basket that fits your budget, and hands you the links to buy.

It does not take your money. FitoutAgent prepares the basket; you check out on the retailers' own websites.

## What it actually does

1. **Turns your sentence into a list.** An AI model breaks the project into item types ("desk", "desk lamp", "bed frame") with quantities, and suggests extras you may have forgotten.
2. **Searches real stores.** It queries live retailer APIs for every item on the list at once.
3. **Checks each product actually fits.** Results are compared against your stated constraints — size, material, brand, compatibility, exclusions — with the supporting quotes shown, so a "5 ft desk" doesn't end up in a 4 ft nook. Products that conflict are left out.
4. **Builds a basket.** It balances fit, quantities, known costs and how many separate stores you'd order from. You can sort for *Recommended*, *Lowest known cost*, or *Fewer stores*.
5. **Prepares the links.** All selected products appear together with quantities and sellers. You open them and pay at each merchant.

You can run it two ways: **Handle it for me** (the agent does all five steps unattended) or step by step (you review and edit the list before any searching happens).

Nothing is hidden from you along the way. Items that no store could match stay visible instead of being quietly dropped, and budget problems block approval rather than being rounded away.

## Requirements

- Node 22 or newer
- pnpm 11.20.0
- An API key for an OpenAI-compatible model

## Run it

```sh
pnpm install
cp .env.example .env
```

Open `.env` and set your model key:

```sh
AGENT_API_KEY=sk-your-key-here
```

That's the only value you must change. `.env.example` already enables Shopify Global Catalog, which searches across many stores and needs no retailer credentials of its own.

Then start it:

```sh
pnpm dev
```

Open **http://127.0.0.1:5173**. The backend runs alongside it on port 4100.

To run the two halves in separate terminals, use `pnpm dev:server` and `pnpm dev:panel`. Restart the backend after any `.env` change.

> **Never put a secret in a `VITE_*` variable.** Anything prefixed `VITE_` is compiled into the browser bundle and is public.

## Adding more retailers

Shopify Global Catalog works out of the box. The others need their own free credentials, set in `.env`:

| Source | Variables | Notes |
| --- | --- | --- |
| Shopify Global Catalog | `SHOPIFY_GLOBAL_CATALOG=1` | On by default. No account needed. |
| Best Buy | `BESTBUY_API_KEY` | Fastest way to add real product data. |
| Walmart | `WALMART_CONSUMER_ID`, `WALMART_PRIVATE_KEY_PEM`, … | Search only — no cart. |
| Shopify Storefront | `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_STOREFRONT_TOKEN` | Only if you own a store. The one path that builds a real, verified cart. |

Every configured source runs together, each showing its own result count and any failures. One retailer going down doesn't lose the others' results. Searches time out after 12 seconds.

If no source is configured, search reports a configuration error rather than inventing products. Set `ALLOW_MOCK_FALLBACK=1` to use demo products instead — it is off by default on purpose.

## Developing

```sh
pnpm typecheck
pnpm test        # unit tests
pnpm test:e2e    # browser tests, needs Google Chrome installed
pnpm build
```

The browser tests run their own isolated servers on ports 4319 and 5319 with scripted retailer responses, covering the real workflow end to end: prompt, list editing, product selection, links, reload, provider failure and recovery. They do not prove that live model credentials or real retailer availability work.

The panel source lives in `apps/extension`, but this is a plain web app — the directory name is historical, and `pnpm build` does not produce an installable Chrome extension.

## Limits worth knowing

- **This is a local, single-user prototype.** State is stored on disk under `apps/server/.data`.
- **Prepared links are not reservations.** A price, stock level or delivery estimate can change before you check out. Confirm quantities, tax and shipping at the merchant before paying.
- **Unquoted tax and shipping mean the final total is unknown**, so a basket that looks under budget may not be.
- Prices are compared in USD; offers known to be in other currencies are excluded.
- Checklist generation requires the model and has no offline fallback. If the provider fails or refuses, the error is shown and your prompt is kept so you can retry.

Design notes: [fit and optimization](docs/fit-optimization.md) · [UI design](docs/ui-design.md)
