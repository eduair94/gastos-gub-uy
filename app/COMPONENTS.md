# Component handbook

This is the implementation companion to `DESIGN.md`. It documents the supported
Vuetify 4 foundation and the custom primitives that define the product.

## Runtime contract

- Nuxt 3 and Vue 3 render public pages SSR-first.
- Vuetify 4 components are auto-resolved by `vite-plugin-vuetify`.
- Do not add `import * as components from 'vuetify/components'`.
- Directives remain eagerly registered because templates reference them by name.
- Global themes and defaults live in `plugins/vuetify.ts`.
- Component CSS uses variables from `assets/scss/_tokens.scss`; no component hex.
- User-facing strings come from both locale files in identical key order.

## Vuetify primitives

| Primitive | Product use | Default |
| --- | --- | --- |
| `VBtn` | Primary/secondary actions, icon controls | flat, no elevation, medium radius |
| `VCard` | Dialog frame and bounded record surface | zero elevation, large radius |
| `VDialog` | Focused record/action overlay | use `scrollable`, explicit max width |
| `VTextField` | Search and short text filters | outlined, comfortable, auto details |
| `VSelect` / `VAutocomplete` | Controlled vocabularies and server search | outlined, comfortable |
| `VChip` | Fixed statuses and compact filters | tonal, small radius |
| `VDataTable` | Low-level table engine only | comfortable density |
| `VTabs` | Peer views inside one bounded context | use sparingly; preserve all content |
| `VTooltip` | Icon action clarification | top |
| `VProgressCircular` | In-place asynchronous wait | include adjacent readable label |

Use semantic HTML inside Vuetify shells. A dialog record remains a `<section>`
with headings, lists and definition lists; Vuetify provides focus, overlay and
interaction behavior.

## Custom primitives

### MoneyAmount

Required for every amount. It formats value/currency and draws the shared,
fixed-domain magnitude rule.

```vue
<MoneyAmount :amount="total" currency="UYU" size="xl" align="start" />
```

### CellLink

Required for row-level navigation and trailing-arrow actions.

```vue
<CellLink :to="supplierPath" :label="t('sup.view')" />
```

### StatusChip, RupeStatusChip and NeverAwardedChip

Use for finite status vocabularies. Do not put sentences or uncertain
interpretations in chips.

### The investigation chrome: RecordHero, SourceList, ContractLedger, RelatedRail, NotFoundPanel

The five pieces every investigation surface repeats. They were hand-rolled once
per page across `curros`, `recopilatorios` and `investigaciones/casos`, and had
already drifted — two hero tints, three title measures, a `<h3>` heading where
the siblings used `<h2>`. Build a new investigation surface out of these rather
than copying the markup again.

```vue
<RecordHero
  tone="alerta"
  :emoji="data.emoji"
  :eyebrow="t('curros.eyebrow')"
  :title="text.title"
  :dek="text.dek"
  :back-to="localePath('/curros')"
  :back-label="t('curros.backToAll')"
>
  <template #eyebrow> · {{ data.period }}</template>
  <div class="hero__tags"><StatusChip … on="ink" /></div>
</RecordHero>
```

`RecordHero` sits on `--ink`, which does **not** flip in dark mode: anything
placed in its slots uses the fixed `--ink-fg` / `--ink-fg-dim` pair, and a chip
inside it needs `on="ink"`. `tone` tints only the corner glow — `alerta` for the
surfaces about wrongdoing under investigation, `celeste` for a neutral record.

`SourceList` is the citation panel the evidence contract rests on; its links
always open in a new tab so the reader does not lose the argument they are in
the middle of. `ContractLedger` is the `<ol>` of contracts — the order is the
finding — and it puts every amount through `<MoneyAmount>`. `RelatedRail` is the
"read next" pill row, where only the label may shrink so a 200-character
Spanish title clips instead of widening the document. `NotFoundPanel` is the
soft-404 body; the page that renders it must also pass `noindex` to `useSeo()`.

### DataTable, PaginatedList and DataPager

Use this trio for directory results. `DataTable` preserves table semantics on
desktop and reflows records on narrow screens. `PaginatedList` owns both pagers
and scroll restoration.

`DataPager` is the only pager. `<v-pagination>` renders one 48px button per
visible page — seven pages plus prev/next need 432px and push the document
sideways on any phone — and it does not move the viewport on a page change, so
the reader lands at the bottom of a page they never saw the top of. Pass
`scroll-target-id` so paging returns to the top of the list.

A `#cell:` slot that renders more than one element must wrap them: two sibling
tags have **no** whitespace between them, because Vue compiles the newline away
(`whitespace: 'condense'`). `<span>{{ name }}</span><MandateChip/>` renders as
`Intendencia de MontevideoFA 2020–2025`, and there is no text node left to space
afterwards. Wrap a value plus its trailing chip in
`<span class="chip-row chip-row--baseline">`; use plain `.chip-row` for a row of
peer chips.

### ChartBlock

Required wrapper for every chart. It contains overflow locally and preserves
responsive grid behavior.

### ContactsDirectoryFilters

The canonical contact-directory filter form. Both list and map routes pass the
same model shape and handle `apply`/`reset` identically. Extend this component
first when adding a directory filter.

### SupplierLocationsMap

Owns OpenStreetMap, geocoding search, geolocation, radius visualization,
viewport/radius API loading and supplier selection. It emits no navigation
side-effects: selecting a marker opens the supplier dialog in place.

### SupplierBusinessDialog

The complete supplier overlay. Its input is a selected map point plus a detail
record. It opens immediately, displays a stable loading skeleton and then
organizes all available evidence:

- identity and registry state;
- direct contact actions with source;
- address and business hours;
- DEI activity/classification;
- procurement totals, years, buyers and categories;
- data provenance and update dates;
- route to the full supplier profile.

The dialog owns presentation only. Sanitization and aggregation belong in the
map-detail API.

### ContactChannelList and ContactLocationDialog

`ContactChannelList` is still the compact list/table renderer for sourced
contact values. `ContactLocationDialog` remains the narrow location-only
overlay used by the table. The map uses `SupplierBusinessDialog` because its
selection needs the complete record, not a second drill-in.

## Composition patterns

### Public record page

1. `useSeo` and SSR data fetch in setup.
2. Page header with eyebrow, title and concise evidence note.
3. Shared filters.
4. Results/status line.
5. One primary table, map or chart surface.
6. Source/caveat nearest to the data it qualifies.

### Complete record dialog

1. Open the `VDialog` on selection before the network request resolves.
2. Keep the selected identity visible during loading.
3. Cache records by supplier ID for repeated map selections.
4. Put direct actions in the header but leave evidence in semantic sections.
5. Show only sections with useful content; missing individual fields use an
   em dash or an explicit localized empty state.
6. External links use `target="_blank"` plus `rel="nofollow noopener"`.

## Review checklist

- Same behavior with keyboard, pointer and touch.
- Dialog focus is trapped and close is named.
- Page has no horizontal scroll at 360px.
- `node scripts/check-layout-guards.mjs` passes (gutter, spacing scale, welded
  chip siblings, numbered pager). It also runs in `app`'s `prebuild`.
- Content is inside the gutter at 360px: nothing renders at `x = 0`.
- Text and markers meet contrast in both themes.
- Loading, empty, error and partial-data states are visible.
- All new copy exists in Spanish and English at matching positions.
- Any new MDI icon is included in the generated subset.
- Lint, build and a real-browser pass cover the changed route.
