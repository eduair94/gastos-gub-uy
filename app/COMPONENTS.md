# Component handbook

This is the implementation companion to `DESIGN.md`. It documents the supported
Vuetify 4 foundation and the custom primitives.

## Runtime contract

- Nuxt 3 and Vue 3 render public pages SSR-first.
- Vuetify 4 components are auto-resolved by `vite-plugin-vuetify`.
- Do not add `import * as components from 'vuetify/components'`.
- Directives stay eagerly registered because templates reference them by name.
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

Use semantic HTML inside Vuetify shells. A dialog record stays a `<section>`
with headings, lists and definition lists. Vuetify provides focus, overlay and
interaction behavior.

## Custom primitives

### MoneyAmount

Required for every amount. It formats the value and currency, and draws the
shared fixed-domain magnitude rule.

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

### StatePanel and SkeletonList

Do not hand-roll either one. They are the two components every list renders
before — or instead of — its rows. Twenty-one files hand-rolled them, and they
drifted into four variants. In `contactos/index.vue` both carried the class
names but **no CSS at all**: its loading state was a column of invisible divs,
and its error state was unstyled flush text.

```vue
<SkeletonList v-if="pending && !rows.length" :rows="8" />

<StatePanel
  v-else-if="error"
  :title="t('errors.generic.title')"
  :body="t('errors.generic.body')"
  :action-label="t('errors.generic.action')"
  @action="refreshNuxtData()"
/>

<StatePanel
  v-else-if="!rows.length"
  :title="t('suppliers.empty.title')"
  :body="t('suppliers.empty.body')"
  :action-label="term ? t('suppliers.empty.action') : undefined"
  @action="clearSearch"
/>
```

`StatePanel` takes `level` because the panel plays several roles. On a detail
route that resolved to nothing it IS the page's `h1`, and that page must also
pass `noindex` to `useSeo()`. Inside a section that already has a heading it is
an `h2`. A soft "no rows match this filter" is a `p`.

`variant` is `card` in a list, `bare` inside a panel that already draws a
border, and `inline` for the one-line note that replaces a table. Pass
`actionLabel` conditionally instead of putting a button in the slot: an
`undefined` label renders no action.

`SkeletonList` is `aria-hidden`, because it pictures content that is not there.
It holds still under `prefers-reduced-motion`, because the reader cannot dismiss
a loop.

### The investigation chrome: RecordHero, SourceList, ContractLedger, RelatedRail, NotFoundPanel

The five components every investigation surface repeats. Each page hand-rolled
them across `curros`, `recopilatorios` and `investigaciones/casos`, and they had
already drifted: two hero tints, three title measures, and an `<h3>` heading
where the siblings used `<h2>`. Build a new investigation surface out of these.
Do not copy the markup again.

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

`RecordHero` sits on `--ink`, which does **not** flip in dark mode. Anything in
its slots uses the fixed `--ink-fg` / `--ink-fg-dim` pair, and a chip inside it
needs `on="ink"`. `tone` tints only the corner glow: `alerta` for the surfaces
about wrongdoing under investigation, `celeste` for a neutral record.

`SourceList` is the citation panel the evidence contract rests on. Its links
always open in a new tab, so the reader keeps the argument they are reading.
`ContractLedger` is the `<ol>` of contracts, where the order is the finding, and
it puts every amount through `<MoneyAmount>`. `RelatedRail` is the "read next"
pill row; only the label may shrink, so a 200-character Spanish title clips
instead of widening the document. `NotFoundPanel` is the soft-404 body, and the
page that renders it must also pass `noindex` to `useSeo()`.

### The long-form investigation grammar: InvCover, InvSection and the rest

`pages/investigaciones/*` are twelve pages that argue the same way, and they
used to say so twelve times: 157 hand-written `<section class="inv-sec">`, 68
heads, 40 stat tiles, 11 covers, 9 identical disclaimers, and the same ledger
table copy-pasted into four files with ~120 lines of scoped CSS. Build a
long-form piece out of these. Do not copy a page.

| Component | What it is | Notes |
| --- | --- | --- |
| `InvCover` | The ink band: file line, kicker, headline, dek, chips | Field **labels are parameters** (`t('inv.file.*')`) — they used to be literal Spanish inside bilingual pages |
| `InvSection` | One band, one gutter, one optional head | `eyebrow` (article head) or `tag` (pill); `serie` switches to the hub's inline head; `alt` tints |
| `InvTiles` | The headline figure row | `amount` goes through `MoneyAmount`; `value` for anything else; `tone` never tints money; `value:<key>` slot for richer figures |
| `InvFinding` | The ink panel carrying a section's decisive sentence | `spaced` replaces the `style="margin-top: var(--s-6)"` four pages repeated |
| `InvLedger` | The evidence table | Columns are declared, cells come from `#cell:<key>` slots; reflows to cards under 760px |
| `InvSources` | The citation panel | `groups` or `items`; long lists split into two columns and break unbreakable URLs |
| `InvDisclaimer` | "Cómo leer esta investigación" | Optional `sources` list inside the panel |
| `InvLinkCard` | One investigation as a card | Without `to` it is the "coming soon" state |
| `InvNewsCards` | Press cases behind a piece | Amounts are plain ink: they are reported, not derived — gold means "we computed this" |
| `InvExplore` / `InvActions` | The band and the button row that send the reader into the live explorer | `InvActions` owns the `:deep(.v-btn)` wrap fix for sentence-length labels |
| `InvRows` | Record list: identity grows, figure stays put | Figure typography is opt-in (`.invrows__n` / `.invrows__u`) so a `MoneyAmount` is not repainted |
| `InvLegend` | A chart's key | Root is a `<span>`: it belongs in `ChartBlock`'s `#meta`, which is a paragraph |

```vue
<InvSection alt :eyebrow="c.gapTag" :title="c.gapTitle" :dek="c.gapIntro">
  <ChartBlock framed :level="3" :title="c.chart">
    <InvHBars :items="gapBars" format="moneyM" />
  </ChartBlock>
  <InvFinding spaced :kicker="c.gapTag" :body="c.gapFinding" />
</InvSection>
```

**Do not give a block its own top margin.** One rule in `_investigaciones.scss`
sets the rhythm between blocks inside a section
(`:where(.inv-sec > .u-container) > * + *`). It sits at zero specificity, so
anything that needs a bigger beat still wins by having a class. Per-block
margins welded an ink panel to the ledger under it on a phone: each of the two
expected the other to bring the space.

Charts inside an investigation are `<ChartBlock framed>`, like everywhere else.
The old `.inv-cardc` / `.inv-cardsub` / `.inv-scroll` trio was a second, weaker
copy of that box, and each page wired its own scroller. `ChartBlock`'s `title`
is optional for the case where the section head already names the chart.

`InvSources` gives each source link a 24px hit area: one link per row IS the
control, and a one-line source title was a 19px target (WCAG 2.2 SC 2.5.8). Do
the same for any standalone link you add. `min-height` plus `inline-flex` grows
the box without moving the type. A link inside a sentence is exempt.

### DataTable, PaginatedList and DataPager

Use this trio for directory results. `DataTable` preserves table semantics on
desktop and reflows records on narrow screens. `PaginatedList` owns both pagers
and scroll restoration.

`DataPager` is the only pager. `<v-pagination>` renders one 48px button per
visible page, so seven pages plus prev/next need 432px and push the document
sideways on any phone. It also does not move the viewport on a page change, so
the reader lands at the bottom of a page they never saw the top of. Pass
`scroll-target-id` so paging returns to the top of the list.

`DataPager` measures that anchor BEFORE the page changes, and holds the
coordinate while the new rows load. Both steps are load-bearing. A list that
swaps its results for a loading indicator unmounts the anchor, so a lookup after
the change finds nothing and throws the reader to the top of the document. The
same swap shortens the document, so the browser clamps the scroll short of the
list. The pager also clears the sticky header itself, so an anchor without
`scroll-margin-top` still lands on the first row.

A `#cell:` slot that renders more than one element must wrap them. Two sibling
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

The complete supplier overlay. It takes a selected map point plus a detail
record. It opens immediately, shows a stable loading skeleton, and then
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

`ContactChannelList` is the compact list/table renderer for sourced contact
values. `ContactLocationDialog` is the narrow location-only overlay used by the
table. The map uses `SupplierBusinessDialog`, because its selection needs the
complete record, not a second drill-in.

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
