---
name: Con la tuya, contribuyente
version: 2.0.0
colors:
  ink: "#0f2233"
  inkRaised: "#1b3348"
  paper: "#eef1f2"
  surface: "#ffffff"
  surfaceSunken: "#e2e7e9"
  celeste: "#5e93c4"
  celesteDeep: "#3c6d9c"
  celesteWash: "#dce8f3"
  money: "#8a6318"
  moneyRule: "#d9a441"
  alert: "#b2423b"
  active: "#3c7860"
  muted: "#536672"
  rule: "#d3dade"
  ruleStrong: "#b6c1c7"
  focus: "#1f6feb"
typography:
  display: '"Archivo", "Archivo Expanded", system-ui, sans-serif'
  body: '"Public Sans", system-ui, -apple-system, sans-serif'
  mono: '"IBM Plex Mono", ui-monospace, "SF Mono", monospace'
rounded:
  small: 3px
  medium: 6px
  large: 10px
  full: 999px
spacing:
  1: 0.25rem
  2: 0.5rem
  3: 0.75rem
  4: 1rem
  5: 1.5rem
  6: 2rem
  7: 3rem
  8: 4rem
  9: 6rem
components:
  button:
    background: "{colors.celesteDeep}"
    color: "{colors.surface}"
    radius: "{rounded.medium}"
  card:
    background: "{colors.surface}"
    border: "{colors.rule}"
    radius: "{rounded.large}"
  dialog:
    background: "{colors.surface}"
    border: "{colors.ruleStrong}"
    radius: "{rounded.large}"
  field:
    background: "{colors.surface}"
    border: "{colors.ruleStrong}"
    radius: "{rounded.medium}"
  status:
    background: "{colors.surfaceSunken}"
    color: "{colors.ink}"
    radius: "{rounded.small}"
---

# Design system

## Overview

The visual world is an **expediente público vivo**: the clarity of an official
record, made responsive and explorable. The interface is sober, modern and
evidence-first. Structural borders organize information; shadows are reserved
for dialogs, floating controls and other true overlays.

The canonical implementation tokens live in `assets/scss/_tokens.scss`. This
document names how to use them. Product meaning and data constraints live in
`PRODUCT.md`; component implementation details live in `COMPONENTS.md`.

The central rule is immutable: **gold is money**. `--sol`, `--money`,
`--money-rule` and their Vuetify accent equivalents are reserved for monetary
amounts. Gold is never a generic accent, CTA, icon or decorative highlight.

## Colors

| Role | Token | Use |
| --- | --- | --- |
| Document ink | `--ink`, `--text` | Headings, body copy, dark evidence headers |
| Paper | `--paper`, `--bg` | Page background |
| Record surface | `--surface` | Cards, table cells, dialog body |
| Sunken surface | `--surface-sunken` | Toolbars, grouped metadata, inactive controls |
| Structural blue | `--celeste`, `--celeste-deep` | Links, focusable actions, selected state |
| Money | `--money`, `--money-rule`, `--money-track` | Amount text and magnitude rule only |
| Watchdog alert | `--alerta`, `--alerta-wash` | Anomalies, failures and destructive actions |
| Active | `--verde` | Verified active/completed state |
| Rules | `--rule`, `--rule-strong` | Grouping, dividers, form structure |

Never hardcode a hex value inside a component. Use semantic CSS variables.
Filled custom CTAs pair `--cta-fill` with `--cta-fg`; filled alert actions pair
`--alerta` with `--alerta-fg`. These pairs invert safely in dark mode.

The dark theme is “the expediente under a desk lamp”: paper becomes ink while
money remains gold. `--ink` is a dark surface in BOTH themes, so content placed
on it never uses the paper tokens — they invert underneath it. The ink scale is
complete and closed; nothing on that surface needs a hex:

| Token | Against `--ink` | Use |
| --- | --- | --- |
| `--ink-fg-strong` | 16.2:1 | Headlines and the emphasised word |
| `--ink-fg` | 14.2:1 | Body on ink |
| `--ink-fg-dim` | 9.5:1 | Deks, secondary lines |
| `--ink-fg-faint` | 6.7:1 | The file line, mono meta |
| `--ink-link` | 7.1:1 | Links (`--celeste-deep` flips; this surface does not) |
| `--ink-flag` | 6.5:1 | `--alerta` **as text**; `--ink-alerta` is the fill |
| `--ink-rule` / `--ink-rule-soft` / `--ink-fill` | — | Edges and raised cells |

Every ink panel carries a `--ink-rule` hairline: in dark mode `--ink` and
`--surface` sit at 1.07:1, so without it the panel’s edge dissolves and only
the shadow survives.

**An accent is not an ink.** `--celeste` and `--alerta` are fills sized for a
marker or a border; as small text they land between 2.6:1 and 4.2:1. Text uses
`--celeste-deep` / `--text`; the accent moves to the dot, rule or icon, where
the 3:1 non-text floor applies.

**Targets.** A standalone link is a control and needs a 24×24px hit area
(WCAG 2.2 SC 2.5.8) — grow the box with `min-height` and `inline-flex`, not the
type. Links inside a sentence are exempt.

## Typography

- **Archivo** (`--font-display`) gives page and section headings the authority
  of a title block. Use it sparingly and keep headings compact.
- **Public Sans** (`--font-body`) carries controls, body text and explanatory
  content.
- **IBM Plex Mono** (`--font-mono`) carries RUTs, OCIDs, dates, amounts,
  metrics, field labels and eyebrows. Numeric content uses tabular figures.

The scale is `--t-xs` through `--t-3xl`. Controls favor `--t-sm` or
`--t-base`; tiny mono text is metadata, never the only way to understand an
action. Headings use sentence case. Spanish is the source of truth and English
mirrors it exactly.

Use plain verbs, active voice and specific empty/error states. User-facing copy
always comes from i18n. Format amounts, counts and dates through shared helpers.

## Layout

The maximum reading/work surface is `--container: 1400px`. Build layout with
responsive CSS Grid using `minmax(0, 1fr)` so dense records cannot widen the
page. Wide charts and tables own their scroll container; the body never scrolls
horizontally.

The first viewport should communicate:

1. what record or question is being examined;
2. which filters are active;
3. the primary evidence surface;
4. the next useful action.

Use `--s-1..--s-9` for spacing. Prefer dense but calm information: compact
controls, visible group boundaries, predictable field labels and progressive
disclosure for secondary evidence.

**The scale stops at `--s-9`.** Naming `var(--s-10)` or higher makes the whole
declaration invalid, so the browser drops it and the element silently loses that
padding, margin or gap. Nothing errors; the page just opens welded to the bottom
of its hero. `/analytics/senales` and `/analytics/omisos` both shipped that way.

**The page gutter belongs to `.u-container` and nothing else overrides it.** An
element carrying `.u-container` gets `padding-inline: clamp(--s-4, 3vw, --s-6)`.
A page's own scoped rule for that same element is *more* specific, so a `padding`
shorthand there wins — and `padding: var(--s-7) 0 var(--s-9)` sets the gutter to
zero, flushing every card, heading and paragraph against the phone's edge. Write
vertical rhythm as `padding-block`. `/analytics/genero` shipped edge-to-edge on
mobile for exactly this reason.

**A pager is prev / "page X of Y" / next.** Never `<v-pagination>`: it renders
one 48px button per visible page, so a seven-page pager needs 432px and pushes
the document sideways on any phone. Use `<DataPager>`, which also returns the
reader to the top of the list.

`node scripts/check-layout-guards.mjs` enforces all four of these, and runs in
`app`'s `prebuild` — so a regression fails the deploy build instead of shipping.

`.u-splitrow` is the canonical record row: a growing identity block and a fixed,
top-aligned figures block. Do not reproduce it with centered flex alignment.

**A `ch` cap is a measure, not a container.** Reading measure (65–75ch) belongs
on the elements that render a line of text — `p`, `li`, a lead, a heading. A
wrapping block that also holds tables, link rows, cards or buttons is bounded in
px or by its grid track. Capping the wrapper hands every non-text child the width
of a paragraph and pins the page to a narrow rail beside dead space; use
`.u-measure`, or target the text elements in page CSS (`.sec > p`), never the
wrapper. `.hero__in` and the `/about` article rail both exist because this rule
was broken. On viewports wide enough to leave a rail beside the article, give the
rail something — a sticky section index, related evidence — rather than air.

In `pages/investigaciones/**` that rule has a primitive and a token. The measure
is `--inv-measure` (41rem: 74 characters per line at the 1.15rem body), declared
once in `_investigaciones.scss`, and `InvSplit` puts prose in a track of exactly
that width with the remaining width as a rail. It is `rem`, not `ch`, because
`ch` resolves against the font-size of whichever element reads it — the grid
track inherits 1rem while the paragraph runs at 1.15rem, so one `66ch` produced
two different widths. Never widen the measure to close a gap on a wide screen:
that trades reading for cosmetics. Fill the rail with the section's own evidence,
or leave the section single-track.

Map surfaces are workbenches, not decorative hero imagery. Search, locate,
radius and result count remain legible over or adjacent to the map. Supplier
markers must remain recognizable against light and dark cartography.

## Elevation & Depth

The base hierarchy is flat and border-led:

- page and inline cards: no shadow;
- selected or raised form group: `--shadow-1` only when depth is meaningful;
- floating map controls: `--shadow-2`;
- modal dialogs: `--shadow-3`.

Never stack shadowed cards inside shadowed cards. Use background tone, spacing
and a one-pixel rule to explain structure first.

## Shapes

Radii are restrained: `--r-sm` for chips and small metadata, `--r-md` for
controls, and `--r-lg` for cards/dialogs. `--r-full` is limited to circular icon
buttons, map markers and true pills.

Avoid capsule containers for prose. A chip represents a value from a fixed
vocabulary; a sentence belongs in normal text.

## Components

### Vuetify 4 foundation

Vuetify components are auto-resolved by `vite-plugin-vuetify`; never import and
register the complete component set. Global defaults in `plugins/vuetify.ts`
govern `VCard`, `VBtn`, form fields, data tables, chips and tooltips. Prefer
those defaults over per-page variants.

Breakpoints intentionally match Vuetify 3 values (`sm 600`, `md 960`,
`lg 1280`, `xl 1920`) with `mobileBreakpoint: lg`. The theme palette mirrors
the SCSS tokens by hand and both files must move together.

### MoneyAmount

Every amount renders through `<MoneyAmount>`. Its gold magnitude rule uses the
fixed site-wide logarithmic domain from `utils/money.ts`; never normalize it to
the current result set and never hand-format an amount.

### CellLink

Use `<CellLink>` for row-level navigation. Its arrow has an integer icon box so
label and arrow stay optically aligned at fractional zoom.

### ChartBlock

All charts render inside `<ChartBlock>`, which owns heading, help, panel and
overflow. Every grid ancestor uses `minmax(0, 1fr)` and `min-width: 0`.

### StatusChip and ReportedFigure

Use `<StatusChip>` for fixed legal/record states. Use `<ReportedFigure>` for an
attributed prose claim. A source quotation does not earn the gold language used
for site-derived money.

### DataTable and PaginatedList

`<DataTable>` is the semantic table/card reflow primitive.
`<PaginatedList>` owns both pagers and return-to-results behavior. Do not compose
raw Vuetify data tables for public record directories unless the shared
component cannot represent the data.

### ContactsDirectoryFilters

The list and map views share `<ContactsDirectoryFilters>`. Query keys, labels,
defaults and apply/reset behavior must stay identical across both routes.

### SupplierLocationsMap and supplier dialog

`<SupplierLocationsMap>` owns OpenStreetMap interaction, viewport loading,
radius, geolocation and marker selection. A supplier marker opens a real
Vuetify dialog on the first click. The dialog loads the full available business
record immediately and groups it into identity, contact, activity, registry and
procurement evidence. There is no intermediate Leaflet popup.

The dialog has one clear close action, keyboard focus containment, direct
contact actions, provenance beside values and a link to the complete supplier
profile. Loading and partial-data states preserve the dialog frame so the
selection never feels lost.

## Do's and Don'ts

### Do

- Put record identity, source and state before interpretation.
- Use borders and background tone to group fields.
- Show provenance beside contact and registry facts.
- Make markers opaque, high-contrast and keyboard-reachable where supported.
- Use one click to open the complete supplier record.
- Respect focus visibility and `prefers-reduced-motion`.
- Verify public pages at 360px and desktop widths, and confirm
  `document.documentElement.scrollWidth` never exceeds the viewport.
- Wrap a value and its trailing chip in `.chip-row chip-row--baseline`.
- Call `useSeo` on every page and use SSR for public data.

### Don't

- Use gold for anything except money.
- Hardcode user-facing strings or color literals in components.
- Turn prose into chips or use numbered markers for unordered content.
- Create a second popup or “load details” click before the real dialog.
- Show enrichment scores, provider IDs or internal versions as business facts.
- Re-derive OCDS extraction or official URLs inside components.
- Remove outlines, hide missing data or imply a map point is exact when its
  source does not support that certainty.
- Use a bare `1fr` around charts or dense records.
- Write a `padding` shorthand on an element that also carries `.u-container`.
- Name a spacing token above `--s-9`, or reach for `<v-pagination>`.
- Emit two sibling elements with no gap-bearing wrapper and expect a space
  between them — Vue compiles the newline away and they render welded.
