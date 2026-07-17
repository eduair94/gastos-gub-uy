# Product analytics (by catalogue code) — design

**Goal.** Let a citizen ask "what does the Uruguayan state actually buy, who buys each
thing, from whom, and at what price?" — organised by the procurement **catalogue code**
(`awards.items.classification.id`), not the free-text description.

Why the code, not the description: the description is unnormalised ("Papel A4" / "PAPEL A4"
/ "Papel A-4" all fragment one economic category). `classification.id` is the canonical key —
the same key `item_price_baselines` and the anomaly detector already group on.

## Data reality (verified against the live DB, 2026-07-17)

- ~20k distinct **real** catalogue codes across the award set.
- `classification.id` `"0"` / `""` / null is a **junk bucket** — 36% of all award item
  lines, mixed unrelated descriptions. Excluded everywhere.
- Live group-by-code over the full award set is ~15s → **must be precomputed**, never on the
  request path (matches every other aggregation in this codebase).
- `item_price_baselines` (~40,948 docs) already holds a **price distribution per
  `{classificationId, currency, unitName}`** — reused as-is for the price section.
- Money basis: `amount.primaryAmount` (release total, UYU, quantity- and fx-corrected).
  Per-item UYU is derived with the shared `FX_SCALE` / `UNWOUND_ITEM_UYU` helpers in
  `src/jobs/analytics-pipeline.ts`, with the `MAX_PLAUSIBLE_RELEASE_UYU` ceiling so a handful
  of malformed line-total records don't dominate.

## New precompute collection: `product_analytics`

One doc per real catalogue code:

```
code            string   // classification.id, e.g. "1879"
description     string   // modal (most frequent) description for the code
lineCount       number   // award item lines
contractCount   number   // distinct award releases containing the code
buyerCount      number   // distinct buyers
supplierCount   number   // distinct suppliers
totalUYU        number   // summed per-item UYU spend, plausibility-capped
topBuyers       [{ id, name, spendUYU, lines }]    // top 12 by spend
topSuppliers    [{ id, name, spendUYU, lines }]    // top 12 by spend
byYear          [{ year, spendUYU, lines }]
firstYear, lastYear   number
currencies      string[]
rankBySpend, rankByLines   number
calculatedAt    Date
dataVersion     string
```

**Counts** (lines/contracts/buyers/suppliers/rank lists/byYear) are computed over **every**
award item line with a real code — "how often / by how many institutions is this bought" is
meaningful with or without a money figure. **Spend** (`totalUYU`, `spendUYU`) is gated: a
line contributes money only when its release carries a plausible `amount.primaryAmount`.
So a code with no priced releases still ranks by activity.

Index: `{ code: 1 }` unique; `{ rankBySpend: 1 }`, `{ rankByLines: 1 }` for the list page.

## Job: `src/jobs/refresh-product-analytics.ts`

Follows the `detect-anomalies` streaming pattern (group in Mongo → small cursor → assemble in
JS), reusing `analytics-pipeline.ts` for the money math. Four grouped scans, merged by code:

1. `{code, buyerId, buyerName}` → spend, lines, `$addToSet` release id → gives totalUYU,
   lineCount, buyerCount, contractCount (a release has exactly one buyer, so summing distinct
   release ids across a code's buyers is exact), topBuyers.
2. `{code, supplierId, supplierName}` → spend, lines → supplierCount, topSuppliers.
3. `{code, year}` → spend, lines → byYear, first/last year.
4. `{code, description}` → lines → modal description; also collects currencies.

`allowDiskUse: true`, junk codes excluded in the `$match`. Compute-then-swap (write to the
collection, then delete the previous `dataVersion`) so a reader never sees a half-built set —
same crash-safety refresh-analytics uses.

**Scheduling.** Spawned from `cronserver.ts::runAnalyticsJob` after `refresh-analytics` +
`populate-filters`, non-fatal (a failure can't abort analytics that already landed). New npm
script `refresh-product-analytics`. Index ensured in `scripts/ensure-indexes.ts`.

## Exact catalogue-code filter on the explorer

Add a `categoryId` param to `buildContractFilters` matching
`awards.items.classification.id` exactly (`$in`). Product pages and the existing "ver
comparables" link then filter by **code** (exact) instead of description (fuzzy) — which also
fixes the prior feature's comparables link if code↔description turns out not to be 1:1.

## API

- `GET /api/analytics/products` — list from `product_analytics`. Params: `sort`
  (`spend|contracts|buyers|lines`), `search` (description/code substring), `page`, `limit`.
  Fast: ~20k indexed docs, no releases scan. Plus a small `meta` (distinct product count).
- `GET /api/analytics/products/[code]` — one `product_analytics` doc + the code's
  `item_price_baselines` rows (price units), by the same indexed point-lookup
  `contracts/[id].get.ts` already uses.

## Pages

- `/products` — "Qué compra el Estado". Header + a few stat tiles (distinct products, etc.),
  search box, sort chips, `DataTable`: product (description + code), total spend
  (`MoneyAmount`), contracts, buyers, suppliers. Paginated. Rows link to the detail page.
- `/products/[code]` — header (description + code + total spend `MoneyAmount xl`), stat row
  (contracts / buyers / suppliers / lines / median price), sections: **top buyers** (rank
  list → buyer pages), **top suppliers** (rank list → supplier pages), **spend by year**
  (`YearBars` → explorer by code+year), **price reference** (from baselines, per unit/currency),
  and a "ver todos los contratos de este producto" link → `/contracts?categoryId=<code>`.
  `useSeo` + `Dataset` JSON-LD.

## Links from existing pages

- Nav: add `products` entry in `layouts/default.vue` → `/products`.
- Contract detail items table: each item's catalogue code → `/products/<code>`.
- Contract price-reference table: product name → `/products/<code>`.

## i18n

New `nav.products`, a `products` copy section, and `seo.products` / `seo.productDetail` in
**both** `es.json` and `en.json`, Spanish as source, identical order.

## Verification

Locally the money is sparse (the mirror backfilled `amount.primaryAmount` on only ~5k
releases), so the **count facets** (what/who/how-many) are verified against the full 1.9M
locally, and the money path is trusted to the proven `analytics-pipeline.ts` helpers (exact on
single-currency releases per that file's production verification). Pages driven end-to-end in a
real browser.
