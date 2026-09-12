# UI design

The panel is styled as a merchant console: white paper cards on a cool grey ground,
black chrome top and bottom, and one dark blue accent that carries every interactive
state. It replaces the earlier dark "Workshop" theme.

## Palette

All colors are tokens in `apps/extension/src/styles/tokens.css`. Nothing outside that
file should introduce a raw color, except the retailer brand glyphs in
`ui/RetailerMark.tsx`, which must stay on-brand, and `ui/ProductArt.tsx`, which draws
the placeholder line art.

| Role | Token | Value |
| --- | --- | --- |
| Page ground | `--wk-ground` | `#f4f6f8` |
| Card surface | `--wk-surface` | `#ffffff` |
| Ink | `--wk-ink` / `--wk-ink-dim` | `#0a1520` / `#55616f` |
| Brand fill | `--wk-accent` / `--wk-accent-lift` | `#133a6f` / `#1b4d91` |
| Link and focus | `--wk-blue` | `#1d5fd0` |
| Chrome | `--wk-night` | `#0a1520` |

Status tones (`--wk-ok`, `--wk-warn`, `--wk-danger`) are reserved for availability,
unquoted costs, and blockers. An unknown cost is always named, never drawn as `$0.00`,
and unknowns use the warn tone rather than the danger tone.

## Stylesheet layout

`styles.css` imports one file per concern, and each file owns a single surface:

```
tokens.css   → palette, type, radii, shadows, motion
base.css     → elements, buttons, inputs, badges
shell.css    → command bar, stepper, stage, banners, footer
dock.css     → pinned plan dock (black bar)
shelf.css    → category cards, rails, skeletons, source strip
tile.css     → product tile, flags, retailer mark
sheet.css    → product dialog, cost table, fit assessment
panels.css   → forms, checklist, activity log, empty states
basket.css   → unified basket / order summary
budget.css   → budget tier buttons
```

## Product emphasis

Products are the subject of the page, so every found offer is a card that reacts and,
where it earns it, wears a badge. `ui/shelf-emphasis.ts` decides the badges once per
shelf; it is pure and only ever nominates offers that are **in stock and priced**, so a
badge always names something buyable:

- **Lowest price** — the cheapest in-stock offer on that shelf.
- **Best fit** — the cheapest in-stock offer whose fit assessment is `verified`.
- **`+$n`** — how much more than the shelf's cheapest offer this one costs.

Card states, in increasing weight: hover (lift, image zoom, "View details" scrim),
`is-hero` (badged), `is-selected` (navy rule across the top plus a ring),
`is-unavailable` (dashed edge, desaturated image), `is-misfit` (red edge, for a
`rejected` fit). The shelf header carries the offer count, the required quantity, and
the live price range.

Motion is short and tied to intent — tiles lift, the dialog rises, skeletons shimmer
while discovery runs — and everything collapses under
`@media (prefers-reduced-motion: reduce)` in `base.css`.

## Responsiveness

One breakpoint at `720px` and a container query on the budget tiers. Below it: product
rails scroll horizontally with snap points, the basket lines collapse to two columns,
and the dialog is a bottom sheet. Above it: rails become an auto-filling product grid,
the stage widens to `1180px`, and the dialog is centered. The layout is exercised down
to 280px by `tests/review-draft.spec.ts`.

## Contracts the tests rely on

`tests/` selects on `.wk-shelf`, `.wk-rail [role="listitem"]`, `.wk-basket__links`,
`.wk-budget__tier[aria-pressed]`, `.wk-dock__main`, `.wk-dock__total`, and
`.wk-dock__warnings`. Keep those names and the single `role="status"` element in the
command bar when restyling. Assert on state attributes rather than exact colors so a
theme change does not fail a behavior test.
