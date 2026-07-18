# Product filter on /contracts + product-page overhaul — design

**Date:** 2026-07-18
**Branch:** feat/sice-catalog-integration
**Status:** approved-for-planning

## Goal

Two connected gaps in the product/catalogue-code experience:

1. `/contracts` has **no way to filter by product / catalogue code** from the UI. The
   `categoryId` filter param exists and works end-to-end server-side, but the only control
   is a display-only chip that a "ver comparables" link populates. Users cannot search for
   and pick products.
2. The product page (`/products/[code]`, e.g. `/products/26392` "SOLUCION BICARBONATADA
   MOLAR") is thin: counts, one year-bars chart, two rank lists, a price table. It does not
   show **whether the physical product behind a code actually varies** (brand, concentration,
   presentation, commercial name) — the exact question an unexplained price anomaly raises.

The unifying idea: the catalogue **code** (`awards.items.classification.id`) is the join key
across releases, `product_analytics`, `item_price_baselines`, and anomalies. We make that key
a first-class, searchable filter, and we enrich each product with the item-level detail that
lives outside OCDS.

## Data reality that shapes the design (verified against the code + memory)

- **`categoryId` already filters** contracts on `awards.items.classification.id` with an
  index (`awards.items.classification.id_1_date_-1`). Comma-separated, `$in`, exact. No new
  filter param or endpoint is needed for the *filter itself*.
  (`app/server/api/contracts/index.get.ts:256-257`.)
- **`/api/analytics/products?search=`** already searches `product_analytics` (~20k docs, one
  per real code) by `code` / `description` / `canonicalName`. Its `code` **is**
  `classification.id` — the value the `categoryId` filter expects. This is the typeahead source.
- **The característica attributes** the bicarbonate example lists — Marca, Concentración,
  Presentación, Medida presentación, Nombre comercial/modelo, Variación — are **NOT** in the
  OCDS release documents and **NOT** in the SICE catalog (`MED_VARIANTES`/`DET_VARIANTES` are
  a deferred import). They exist **only** in `contract_item_features`: scraped on demand from
  the gov "Características del Ítem" HTML page, cached one doc per **compra** (`compraId` =
  ocid minus `ocds-<prefix>-`), items keyed by `nro` (the leading integer of the OCDS item
  id). Parser + scraper live in `app/server/api/contracts/[id]/features.get.ts`
  (`parseItemFeatures`, `scrape`).
- **Anomaly docs carry the code** at `metadata.itemClassification.id`, and
  `aiVerdict.explainable` is indexed (`{'aiVerdict.explainable':1, severityRank:-1}`). The
  "unexplained" set (`aiVerdict.explainable:'no'`) is ~535 flags / a few hundred codes —
  bounded enough to precompute against.
- **Currency:** a code is almost always transacted in one dominant currency, but not
  guaranteed. `amount.primaryAmount` is whole-contract UYU, not per-item. Per-item unit price
  (`awards.items.unit.value.amount`) is **native**.
- Charts use `vue-chartjs` + Chart.js, registered per-component, theme-token-aware, client
  only (`app/components/charts/*`, `InvHBars.vue`, `YearBars.vue`). Money renders through
  `<MoneyAmount>`; gold is reserved for money. Tables use `<DataTable>`; lists wrap in
  `<PaginatedList>`. i18n: es is default; a `$` immediately before a digit in a message is
  eaten by vue-i18n's regex — always write `$ ` with a space.

## Chosen approach for the característica layer: **hybrid** (user decision)

- **Lazy/progressive everywhere:** a batch endpoint returns cached características for a page
  of contracts instantly and scrapes misses under a cap, so columns/panels fill over repeat
  views. No new crawl cost until a product is actually looked at.
- **Offline precompute for unexplained-anomaly products:** a job crawls + aggregates
  característica variants for the bounded set of codes that carry an unexplained anomaly, so
  the flagship "¿varía el producto?" view is fully populated exactly where a price anomaly
  makes it matter. Stored in a new `product_variants` collection, read non-fatally by the
  product API.

Rejected alternatives: **lazy-only** (flagship view empty on first anomaly investigation —
the most important case); **bulk-offline-for-all-codes** (a rate-limited crawl of ~20k codes'
contracts, large cron + deploy cost, violates YAGNI for the long tail nobody investigates).

---

## Component / unit breakdown

### Unit A — `ProductAutocomplete.vue` (new component)
- **What it does:** a multi-select typeahead over catalogue products. Emits selected **codes**
  (strings) via `v-model`. Renders chips labelled with the product name, resolving labels for
  codes that arrive from the URL without one.
- **How it's used:** `<ProductAutocomplete v-model="filters.categoryId" />` inside FilterRail,
  replacing the display-only `categoryId` chip section.
- **Depends on:** `/api/analytics/products` (`search` mode for typeahead, new `codes` mode for
  label resolution). Debounce via `lodash-es` `debounce` (300ms), min 2 chars, `escapeRegex`
  already applied server-side.
- **Interface:** props `{ modelValue: string[] }`, emits `update:modelValue`. Internal:
  `items` (search results), label cache. No knowledge of contracts/filtering — just codes.

### Unit B — `/api/analytics/products` `codes` resolve mode (extend existing)
- Add: `?codes=26392,123` → `find({ code: { $in } })` selecting `code description canonicalName`,
  returns `[{ code, label }]` (label = `canonicalName || description || code`). Leaves the
  existing `search`/`rubro`/paging modes untouched. Used only by Unit A to hydrate chips.

### Unit C — contracts list `focusItem` projection + product sorts (extend `index.get.ts`)
- **Trigger:** exactly one `categoryId` value present (`focusCode`). With zero or multiple,
  behaviour is unchanged (generic columns, generic sorts).
- **What it adds to the pipeline:** after the `$match`, an `$addFields` computing `focusItem`
  from the award item whose `classification.id === focusCode`:
  ```
  focusItem: {
    nro:         <leading int of the matched item.id>,
    description: <matched item.classification.description>,
    quantity:    <matched item.quantity>,
    unitName:    <matched item.unit.name>,
    unitAmount:  <matched item.unit.value.amount>,   // native
    currency:    <matched item.unit.value.currency>,
    lineAmount:  <quantity * unitAmount when both present>
  }
  ```
  Implementation: flatten `awards.items` (`$reduce`/`$concatArrays`), `$filter` to the code,
  take the first match. Also add per-row `compraId` (derived from `ocid`) so the client can
  batch-fetch características.
- **New sorts (focus mode only):** `itemUnitPrice` → `focusItem.unitAmount`, `itemQuantity` →
  `focusItem.quantity`, each asc/desc. Sort runs on the code-filtered (index-selected,
  bounded) candidate set, then `$addFields`/`$sort`/`$skip`/`$limit`. Guard with `maxTimeMS`.
- **Caveat (documented in UI help text):** sort is on the **native** unit price; a product
  spanning currencies mixes them in the ordering. Currency is shown in the column so the
  reader sees it. Acceptable because a single code is near-always one dominant currency.

### Unit D — shared item-features server util (`server/utils/item-features.ts`, new)
- **Extract** `decodeEntities`, `parseBuyObject`, `parseItemFeatures`, `scrape`, `FETCH_OPTS`
  out of `app/server/api/contracts/[id]/features.get.ts` into a shared module.
- **Rewire** the existing `[id]/features.get.ts` to import from it (no behaviour change) — so
  the batch endpoint (Unit E) and the offline job (Unit G) share one parser/scraper, one place
  a gov-layout change is fixed.

### Unit E — batch características endpoint (`POST /api/contracts/item-features/batch`, new)
- **Input:** `{ compras: string[] }` (compraIds; cap ~25 to match a page). Optional `codes`
  ignored — the client already knows the nro to read.
- **Behaviour:** for each compraId, return cached `contract_item_features` immediately; collect
  misses; scrape misses via Unit D under a concurrency cap (~4–6) and per-page timeout (8s),
  caching results (including confirmed-empty, mirroring the single endpoint's poisoning
  guards); any still-unfetched beyond a wall-clock budget come back `pending: true`.
- **Output:** `{ success, data: { [compraId]: { items: [{nro, features, variation}], object } | { pending: true } } }`.
  Static data → `cache-control: public, max-age=86400` for the fully-resolved shape.
- **Used by:** the contracts table (Unit F) and the product-page variants panel for non-precomputed codes (Unit I).

### Unit F — contracts table product columns (extend `pages/contracts/index.vue`)
- When `focusCode` active, render extra columns from `c.focusItem`: **Producto (descripción
  específica)**, **Cantidad** (`qtyLabel`), **Precio unit.** (`<MoneyAmount :currency>`), plus
  característica cells (Marca / Presentación / Concentración / Nombre comercial) resolved from
  a `Map<compraId, features>` populated by one Unit E batch call after the list loads. Each
  característica cell reads the row's `focusItem.nro` from the batch result; shows `—` while
  pending. Follows the `ctable`/`dtable` `:data-label` mobile pattern.
- Add the product sort options to the sort `<select>` (rendered only when `focusCode`), mapped
  to Unit C's new `sortBy` values via the `SORTS` table.
- URL state: sort additions follow the existing `route.query` watcher + `urlQueryNow()` guard
  discipline (contracts/index.vue is the reference).

### Unit G — `refresh-product-variants.ts` job + `product_variants` model (new)
- **Model `shared/models/product_variants.ts`:**
  ```
  code: string (unique)
  sampledContracts: number          // how many compras fed the aggregate
  attributes: [{ name, values: [{ value, count }], distinct }]   // per característica name
  varies: boolean                   // >1 distinct on any key axis (Marca/Presentación/Nombre comercial)
  calculatedAt, dataVersion
  ```
  Indexes: `{code:1}` unique, `{dataVersion:1}`.
- **Job steps:**
  1. `AnomalyModel.distinct('metadata.itemClassification.id', { 'aiVerdict.explainable': 'no' })`
     → candidate codes (filter out junk `0`/`''`/null).
  2. Per code: find award releases with `awards.items.classification.id === code`, collect
     `{compraId, nro}` (nro from the matched item id); cap N per code (e.g. 300) for crawl budget.
  3. Ensure `contract_item_features` cached for those compras via Unit D (rate-limited,
     mostly sequential; skip already-cached).
  4. Aggregate the matched items' `features` into per-name value→count maps + `varies`.
  5. Compute-then-swap by `dataVersion` (upsert-by-code, like `product_analytics`).
- **Schedule:** new guard + `/cron/product-variants` route in `src/cronserver.ts`, weekly (or
  daily after the anomaly triage), following the provider-anomalies cron pattern. Runs from
  compiled `dist` under pm2.
- **Index registration:** add `product_variants` indexes to `scripts/ensure-indexes.ts`.

### Unit H — product API returns variants + price data (extend `products/[code].get.ts`)
- Add a non-fatal `ProductVariantsModel.findOne({ code }).lean().catch(() => null)` → include
  `variants` in the response when present. `priceUnits` already returned.

### Unit I — product page enrichment (extend `pages/products/[code].vue`)
- **who-vende / who-compra links (explicit ask):** the primary row link becomes
  `/contracts?categoryId=<code>&suppliers=<name>` (sellers) and `&buyers=<name>` (buyers) —
  filter by product **and** party. Where an `id` exists, add a small secondary "perfil" link
  to `/suppliers/{id}` / `/buyers/{id}` so the profile is still reachable.
- **Charts (Chart.js, `<ClientOnly>`):**
  - Price dispersion: a whisker/range per `{currency, unitName}` from `priceUnits` percentiles
    (p25–p50–p95, min/max) — shows spread, which is the context an anomaly sits in.
  - Concentration: reuse `InvHBars` for top suppliers and top buyers by lines, showing the
    top-N share (captive-market signal).
  - Keep the existing year bars.
- **"¿Varía el producto?" panel (flagship):** renders `variants.attributes` (name →
  values+counts) with a headline ("siempre FARMACO URUGUAYO" vs "N marcas distintas"). Source:
  `variants` from Unit H when precomputed; otherwise lazily aggregate client-side from a Unit E
  batch over a sample of the code's contracts (fetched via `/api/contracts?categoryId=<code>`).
  Panel hidden only when neither source yields any característica.

### Unit J — i18n + indexes
- Add es/en keys for: product filter label/placeholder/help, product columns, product sorts,
  the price-dispersion + concentration + variants panel headings and help. Respect the `$ `
  gotcha. es is the source of truth; en mirrors.
- `scripts/ensure-indexes.ts`: register `product_variants` indexes.

---

## Data flow

```
User types in ProductAutocomplete
  → GET /api/analytics/products?search=…            (typeahead)
  → selects code(s) → filters.categoryId → URL ?categoryId=…
  → GET /api/contracts?categoryId=…&sortBy=itemUnitPrice…
       (index match on classification.id → focusItem projection when single code)
  → table renders focusItem columns
  → POST /api/contracts/item-features/batch {compras:[…]}   (cache-first, scrape misses)
  → característica columns fill in

Product page /products/26392
  → GET /api/analytics/products/26392   → product_analytics + priceUnits + product_variants
  → charts from priceUnits + topSuppliers/topBuyers
  → variants panel from product_variants (precomputed) OR lazy batch aggregate
  → who-sells/who-buys rows deep-link to /contracts?categoryId=26392&suppliers|buyers=…

Cron (weekly) refresh-product-variants
  → anomalies.distinct(classification.id where explainable:'no')
  → per code: releases → {compraId,nro} → ensure item-features cache → aggregate → swap
```

## Error handling
- Autocomplete search failure → empty results, no throw (matches existing debounced patterns).
- Batch endpoint: a scrape that fails transiently marks that compra `pending`, never poisons
  the cache with a false empty (mirrors the single endpoint's `anyTransient` guard).
- Product API `product_variants` read is non-fatal (`.catch(() => null)`), like `priceUnits`.
- `focusItem` projection is skipped unless exactly one code → zero risk to the default explorer.
- Job caps per-code contract count and honours the gov-site timeout; a code that can't be
  crawled simply gets fewer samples, never blocks the swap.

## Testing / verification
- **Verify against the live DB** (dev server reads the stale local mirror; `item_price_baselines`
  and scraped features may be empty locally). Confirm code 26392 (bicarbonate) end-to-end:
  filter → focusItem columns → características → product page variants panel.
- Server: unit-test `focusItem` extraction on a fixture release with multiple awards/items;
  unit-test the batch aggregation and the variants roll-up on fixtures.
- Browser: measure the settled state (global smooth-scroll animates; reduced-motion for headless).
- Clean build before deploy (`rm -rf .nuxt .output node_modules/.vite`) — a warm build hides
  the SCSS `//`-comment 500 and stale server routes.

## Non-goals (v1)
- Importing SICE `MED_VARIANTES`/`DET_VARIANTES` (still deferred).
- Per-year price-over-time series (needs per-year price stats not currently precomputed).
- Bulk característica crawl for all ~20k codes (only unexplained-anomaly codes are precomputed).
- Product-specific columns/sorts when multiple codes are selected (ambiguous "matched item").
