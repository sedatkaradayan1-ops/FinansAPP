# Finans Kontrol Merkezi — Design Brief

## Design read
A private, daily-use financial operating system for one power user who wants
instant clarity and calm confidence over their money — not a spreadsheet, a
cockpit.

## Concept spine
"Kokpit / Uçuş Kontrol" (Mission Control cockpit). The dashboard is read as an
instrument panel at night: glass panels glow softly against a near-black
cabin, key numbers sit inside precise circular gauges (Financial Health Score
as an instrument dial, Safe-to-Spend as a glowing readout), category flows
render as radar/sonar-style radial charts. Every screen keeps this cockpit
grammar: dark glass cards, thin hairline borders, soft inner glow on the
"instrument" numbers, tabular monospace figures for every amount.

## Delivery tier
`editorial` — this is a dense, functional daily-use application (15+ screens),
not a marketing scroll site. Craft comes from typography, real generated
imagery/iconography and precise bespoke chrome (gauges, glass cards, the
quick-entry composer), with motivated micro-motion only (count-up numbers,
gauge sweep-in, card stagger reveals). No scroll-jacked cinema sequence.

## Locked palette
- Background primary: `#0b0a10` — near-black with a cool violet undertone
  (not zinc/graphite, not pure black).
- Background secondary (panels): `#131219`
- Background tertiary (hover/inset): `#1b1922`
- Border hairline: `#28242f`
- Text primary: `#f4f2f7` (warm-cool off-white)
- Text secondary: `#948da3`
- Text tertiary/muted: `#615a70`
- Brand accent (the ONE accent, used for primary CTAs/active states/the
  instrument glow): `#e8527c` — a precise desaturated rose/magenta. Distinct
  from every banned family (no orange/amber, no neon cyan/blue/green, no
  beige+brass, no AI purple-violet).
- Semantic positive (income / under-budget / good): `#4fae8a` muted jade.
- Semantic negative (expense over-budget / risk): `#e2645a` muted coral-red.
- Semantic warning (upcoming/attention): `#d9a441` muted amber, used ONLY as a
  small semantic badge tone, never as page chrome.
- Gold-asset identity accent (Altın Varlıkları only): `#c9a227` warm muted
  gold, confined to gold-related iconography/badges.
Defense: rose-on-near-violet-black reads premium and un-generic for fintech
(fintech defaults to blue/teal/green); jade/coral stay purely semantic so the
one-accent rule holds.

## Locked type
- Display / headings: `Outfit` (geometric, confident, full Turkish glyph
  coverage).
- Body / UI text: `Plus Jakarta Sans` (warm, highly legible at small sizes).
- Numeric / financial figures: `IBM Plex Mono` with tabular figures — every
  amount, percentage, and date in the app renders in mono for scannable
  columns.
No serif anywhere (no editorial/heritage justification here).

## Tier-1 technique
Instrument-panel gauges (custom SVG radial dial component) driving the
Financial Health Score + Safe-to-Spend readouts, with count-up number
animation on mount and a soft conic-gradient glow in the brand accent. This
is the recurring signature component reused across Dashboard, Reports, and
Monthly Journal — not a one-off decoration.

## Section plan (Dashboard, the densest screen)
1. Top strip — greeting + Daily Brief callout (bespoke card, its own layout).
2. Hero instrument row — Net Worth (big number) + Health Score gauge + Safe to
   Spend gauge (3-up asymmetric grid, not equal 3-col cards).
3. Accounts / Assets horizontal glass-card rail (scrollable row).
4. Cash flow sparkline + Upcoming Payments list (split 60/40).
5. Spending breakdown radial chart + Savings/Investment allocation bars
   (2-col, distinct chart families).
6. Today's Recommendation banner (bespoke, own component).
No consecutive repeats; ≥4 distinct layout families used.

## Asset plan
- App icon (square 1:1, `3d` style — a glass instrument dial/gauge object).
- Cover / OG image (3:2, cockpit-glow brand capsule).
- Ambient background plate (soft radial glow texture) reused low-opacity
  behind hero instrument row.
- Empty-state illustration (calm, line-art wallet/gauge, brand-toned).
Functional/dense UI (category icons, nav icons, table glyphs) use the Lucide
icon set already wired in the template — appropriate per design-recipe.md
§8 for "dense functional UI (forms, tables, 20+ tiny glyphs)".

## CTA inventory
- "Hızlı İşlem Ekle" (quick entry composer trigger) — floating action pill,
  own glow + spring press.
- "Ödemeyi Onayla" (mark bill paid) — inline check-swap button, own morph
  animation.
- "Hedefe Ekle" (add to goal) — ghost button with progress-fill hover.
- "Ay Karşılaştır" (compare months) — segmented toggle, not a button.
Each keeps its own component and interaction identity — no shared button
utility class reused across all four.

