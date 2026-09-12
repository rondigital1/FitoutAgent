# Product fit and basket recommendations

The goal is a complete basket of suitable products, with evidence and unresolved details visible before merchant checkout.

## Fit assessment

Discovery retains retailer descriptions when supplied, selected variant labels, and merchant identity. Shopify Storefront searches up to five variants per product. The fit verifier sends the original goal, checklist label/query, owned items and product evidence to the Responses API. It checks product type first, then explicit dimensions, compatibility, material, required brands and exclusions. Accessories do not satisfy a request for a main product.

Each requirement is supported, conflicting, or unknown. A supported or conflicting judgment must quote text from that exact offer; invalid quotes become unknown. Duplicate/foreign offer IDs or incomplete coverage invalidate the response. All supported checks produce `verified`; any conflict produces `rejected`; otherwise the result is `unknown`. This is an AI assessment of retailer evidence, not independent certification that a merchant's claims are true. The model can still miss or misinterpret a requirement.

Calls assess every live offer in batches of 20 per checklist line, with three concurrent lines, a 30-second timeout per call, and no automatic API retries. A failed batch stays explicitly unverified while successful batches survive. Missing credentials, refusal, incomplete output and provider errors preserve offers as unknown, never exact. Demo offers stay explicitly unverified. Product titles/descriptions are untrusted data and never instructions. No arbitrary product-page fetching or guessed specifications are used.

`AGENT_FIT_MODEL` overrides `AGENT_MODEL`, otherwise the existing default `gpt-5.6-luna` is used. Credentials and optional base URL use the existing server-only configuration. A new search rechecks fit. Stored fit evidence survives reload; it is not a guarantee of current stock or specifications.

## Basket search

The deterministic optimizer uses a beam of 512 combinations plus a cheapest-known-cost seed at each line. It retains all active checklist lines and quantities, including extras deliberately added by the user; explicit skipped categories are excluded. It never silently removes an item to meet budget. It searches returned offers, not the whole market, and does not claim a mathematically global optimum.

Common priorities are known prices and avoiding budget overrun. Three strategies then compare:

- Recommended: fewer unverified products, fewer unquoted cost components, lower known cost, fewer merchants.
- Lowest known cost: lower known cost, then fit evidence and cost certainty.
- Fewer stores: fewer unverified products, fewer merchants, then cost certainty and known cost.

Unavailable, fit-rejected and known-late offers are excluded unless locked. A lock remains in every recommendation and can block checkout; a locked product disappearing from search stays visible as unavailable. Explicit manual selections stay in Your basket until another basket is applied. Applying a basket replaces only unlocked selections. Approval independently rechecks fit conflicts, budget, quantities and locks.

Price, tax and shipping are per-unit cents; required quantities multiply each. No provider currently supplies reliable cart-level shipping promotions, so none are invented. `subtotal` is products only, `knownCost` includes quoted extras, and `total` is null if any cost component is unknown or any active line is missing. A known lower bound exceeding budget blocks approval even if other components are unknown. Unknown fit, fees and delivery remain visible review warnings; preparing links does not buy anything.

## Verification

`product-fit.test.ts` exercises structured HTTP output, evidence validation, identity and coverage failures, and graceful provider failure. `optimizer.test.ts` covers fees, quantities, cross-line budget tradeoffs, merchant consolidation, locks, deadlines, unknowns, applying plans, approval revalidation and persistence. `fit-optimization.spec.ts` exercises the real HTTP workflow with controlled external results, including product evidence, excluded accessories, alternatives, locks, reload and link preparation on mobile and desktop.

These fixtures test application behavior. They do not measure live model classification accuracy or guarantee merchant fulfillment. A live evaluation set of representative requests and labeled products should be maintained as the catalog coverage grows.
