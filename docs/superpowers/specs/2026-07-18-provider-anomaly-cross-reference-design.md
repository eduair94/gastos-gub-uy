# Provider Anomaly Cross-Reference — Design

**Date:** 2026-07-18
**Status:** Approved (brainstorm) — pending spec review
**Route:** `/analytics/proveedores-anomalias`

## Problem

The site flags overpricing anomalies. A second-stage Gemini triage marks each scored
flag `aiVerdict.explainable ∈ {yes,no,uncertain}`. The `no` flags — "sin explicación",
surfaced today at `/analytics/anomalies?ai=unexplained` — are the real signal: an
overprice the model could not justify. Today they are only browsable one-by-one. There
is no view that answers **"which providers concentrate these unexplained flags, and is
there a pattern?"** (repeat buyer, single rubro, recurring over time).

We want a scheduled cross-reference of unexplained flags against providers, plus an
insightful analytics page linked to the anomalies system, refreshed every 24h.

## Key data facts (verified)

- **"Unexplained"** = `anomalies.aiVerdict.explainable === 'no'` (invariably paired with
  `aiVerdict.category === 'sin-explicacion'`). This is exactly what `?ai=unexplained`
  filters via `AI_VERDICT.unexplained → 'no'` in
  `app/server/api/analytics/anomalies.get.ts` (lines ~66–75).
- **Join gap:** anomalies carry only `metadata.supplierName` (string). They do **not**
  carry the supplier RUT. The stable provider id (`supplierId` = RUT) lives in the
  `supplier_patterns` collection (`SupplierPatternModel`, field `supplierId`, unique).
- **Overprice fields on an anomaly:** `detectedValue` (unit price paid),
  `expectedRange.min/max` (p25/p95 baseline), `currency`, `metadata.zScore` (robust
  modified z-score / "divergence"), `metadata.itemQuantity`, `metadata.amount`,
  `metadata.buyerName`, `metadata.itemClassification.rubro` (+ `canonicalName`,
  `rubroPath`), `severityRank`, `confidence`, `firstDetectedAt`, `detectedAt`.
- **Job infra:** `node-cron` in `src/cronserver.ts`, timezone `America/Montevideo`.
  Heavy jobs are spawned as detached child processes via `runJobProcess(...)`. Dominant
  pattern = precompute into a dedicated collection, Nuxt API reads it back with `.lean()`.
- **Page pattern:** data-driven archetype = `app/pages/analytics/anomalies.vue` —
  `route.query`-synced filter refs, `await useFetch('/api/...')` with a computed query,
  pending/error/empty skeleton states, `.chip` filter groups, `<PaginatedList>`,
  `<MoneyAmount>` for every peso, Chart.js in `<ClientOnly>` reading CSS tokens,
  `useSeo`, all copy through `t()` (Spanish source of truth, `en.json` mirrors 1:1).

## Decisions

1. **Join key = Hybrid.** Group by `metadata.supplierName` in the job; then best-effort
   resolve each name to a `supplier_patterns.supplierId` (RUT) via **exact unique** name
   match. No change to `detect-anomalies.ts`, no re-detection. Unresolved providers still
   rank; they just lack a profile link. Name variants may split one provider — accepted
   for v1.
2. **Page focus = Watchlist + patterns.** Primary: ranked provider watchlist. Plus
   pattern panels: provider concentration, provider×buyer co-occurrence (collusion
   signal), rubro mix, recurrence over time.
3. **Drill-down = supplier filter on the existing anomalies API + page.** Add
   `?supplier=<name>` to `/api/analytics/anomalies` and `analytics/anomalies.vue`. Each
   provider row deep-links to its own unexplained flags on the existing page.

## Architecture / data flow

```
detect-anomalies + score-anomalies-ai            (EXISTING — untouched)
  writes anomalies{ aiVerdict.explainable:'no', metadata.supplierName, ... }
        │
        ▼
NEW  src/jobs/cross-provider-anomalies.ts          cron "0 6 * * *" daily (Montevideo)
  1. aggregate anomalies where aiVerdict.explainable='no'
       $group by metadata.supplierName →
         flagCount, totalOverprice (per currency), worstZ, avgConfidence,
         rubros[], buyers[], currencies[], firstSeen, lastSeen, monthlyCounts[]
  2. resolve supplierName → supplier_patterns.supplierId (exact unique match)
  3. compute summary rollups (top buyer×provider pairs, rubro totals, monthly totals)
  4. compute-then-swap into provider_anomaly_stats (+ one summary doc)
        │
        ▼
NEW  /api/analytics/provider-anomalies.get.ts       .find().lean() + sort/paginate/filter
        │
        ▼
NEW  page /analytics/proveedores-anomalias          Vuetify data-driven archetype
  KPIs · watchlist table · concentration bars · buyer co-occurrence · rubro mix · recurrence
  provider row → /analytics/anomalies?ai=unexplained&supplier=<name>
```

## Units of work

### Unit A — `src/jobs/cross-provider-anomalies.ts`
- **Does:** aggregates unexplained anomalies by provider name, resolves RUT, computes
  summary rollups, writes `provider_anomaly_stats` via compute-then-swap.
- **Uses:** copy structure from `src/jobs/refresh-product-analytics.ts` (shebang,
  `class` + `run()`, `if (require.main === module)` guard, raise
  `MONGO_SOCKET_TIMEOUT_MS` before `connectToDatabase()`, `dataVersion = v${Date.now()}`
  stamp, delete-stale sweep). Reads `AnomalyModel`, `SupplierPatternModel`; writes new
  models.
- **Overprice metric:** per flag `overprice = max(0, (detectedValue − expectedRange.max)) × (metadata.itemQuantity || 1)`, accumulated per currency (never sum across currencies).
- **Depends on:** `shared/connection/database`, `shared/models`.

### Unit B — models `shared/models/provider-anomaly-stats.ts`
- `ProviderAnomalyStatsModel` (collection `provider_anomaly_stats`) — one doc/provider.
- `ProviderAnomalySummaryModel` (collection `provider_anomaly_summary`) — one rollup doc.
- Use the safe `mongoose.models.X || mongoose.model<I>(...)` guard. Add TS interfaces to
  `shared/types/database.ts`. Barrel-export from `shared/models/index.ts`.
- **`provider_anomaly_stats` doc fields:** `supplierName`, `supplierId?`, `flagCount`,
  `totalOverprice` (array `{currency, amount}`), `worstZ`, `avgConfidence`,
  `rubros` (`{rubro, count}[]`), `buyers` (`{buyerName, count}[]`), `currencies` (string[]),
  `firstSeen`, `lastSeen`, `monthlyCounts` (`{month, count}[]`), `dataVersion`, `calculatedAt`.
- **`provider_anomaly_summary` doc fields:** `providerCount`, `flagTotal`,
  `overpriceTotals` (`{currency, amount}[]`), `topPairs` (`{supplierName, buyerName, count}[]`),
  `rubroTotals` (`{rubro, count}[]`), `monthlyTotals` (`{month, count}[]`), `dataVersion`,
  `calculatedAt`.

### Unit C — `app/server/api/analytics/provider-anomalies.get.ts`
- **Does:** reads `provider_anomaly_stats` + latest summary, returns
  `{ data: { providers, summary, pagination } }`.
- **Params:** `page`, `limit` (default 20), `sortBy ∈ {flags,overprice,worstZ}` (default
  `flags`), `sortOrder`, `minFlags`, `rubro`, `currency`. Overprice sort uses the
  matching-currency entry (default UYU).
- **Empty collection → 404** with a "run the pre-calculation job first" message (matches
  existing readers).
- Follows `useApi`/existing route conventions: `ensureConnection()`, `.lean()`.

### Unit D — drill-down filter on existing anomalies
- `app/server/api/analytics/anomalies.get.ts`: accept `supplier` query param →
  `filter['metadata.supplierName'] = supplier` (exact). Additive, back-compatible.
- `app/pages/analytics/anomalies.vue`: read `route.query.supplier`, thread into the
  `useFetch` query, render a clearable "proveedor: X" chip, keep it in `router.replace`
  query sync.

### Unit E — page `app/pages/analytics/proveedores-anomalias.vue`
- **Does:** the analytics page. Mirrors `anomalies.vue` skeleton exactly.
- **Sections:** KPI row (providers, flags, total overprice) → watchlist table
  (rank · provider · flags · overprice · worst z · top rubro · top buyer · drill link) →
  concentration bars (top providers by flags) → buyer co-occurrence panel (top repeat
  provider×buyer pairs) → rubro mix → recurrence timeline (monthlyTotals).
- **Charts:** reuse Chart.js via a small wrapper matching `YearBars.vue`/`InvHBars.vue`
  conventions (`<ClientOnly>`, reads CSS tokens, re-themes on `data-theme` change). Prefer
  reusing `YearBars` for the timeline and a horizontal-bars component for concentration.
- **Vuetify base:** `v-table` for the watchlist, `v-card`/`v-expansion-panels` where they
  match existing usage; otherwise the site's `.chip`/`.u-splitrow` utilities.
- **Compliance:** every peso through `<MoneyAmount>`; counts via `formatNumber`; gold =
  money only; tokens only, no hex; `useSeo` with unique title/description; all strings
  through `t()` in `es.json` (source) + `en.json` (mirror).
- **Cross-links:** a card/link on `analytics/anomalies.vue` and `analytics/unexplained.vue`
  pointing to the new page, and each provider row links back to the anomalies page.

### Unit F — cron wiring `src/cronserver.ts`
- Add `isCrossProviderRunning` flag + `crossProviderStatus`, a `runCrossProviderJob()`
  calling `this.runJobProcess("jobs/cross-provider-anomalies")`, and
  `cron.schedule("0 6 * * *", ...)` in `setupCronJob()` (daily 06:00 Montevideo = every
  24h). Independent guard (does not touch `releases`, so not in `busyWith()`). Optional
  `/cron/cross-provider` status + manual-trigger routes for parity. Best sequenced to run
  after the anomaly + AI-triage jobs so it reads fresh verdicts.
- Add `package.json` script `"cross-provider-anomalies": "tsx src/jobs/cross-provider-anomalies.ts"`.

### Unit G — Artifact mockup (build-order step 1)
- Before writing the Nuxt page, publish a self-contained HTML **Artifact** on claude.ai
  visualizing the full layout with a **small real sample** pulled from the DB (honest
  numbers, sampled — not fabricated). Get layout/insight sign-off, then convert to the
  real page (Units B–F). The Artifact is a design aid, not a shipped file.

## Error handling & edge cases

- **No unexplained flags / empty stats:** job writes an empty stats set + a zeroed summary;
  API returns 404; page shows the empty state with a link back to anomalies.
- **Name resolves to multiple RUTs:** treat as unresolved (`supplierId` omitted) — never
  guess. Row still ranks and links to the anomalies drill-down (name-based), just not to a
  supplier profile.
- **Mixed currencies:** overprice totals are kept per-currency and never summed across
  currencies; the watchlist shows the dominant currency's total and labels it.
- **Legacy anomalies without `aiVerdict`:** excluded by definition (`explainable:'no'`
  requires a verdict).
- **Long aggregation:** raise `MONGO_SOCKET_TIMEOUT_MS` in the job before connecting, as
  the other heavy jobs do.

## Testing / verification

- Job: run `npm run cross-provider-anomalies` against the real DB; assert
  `provider_anomaly_stats` populated, counts reconcile with
  `countDocuments({'aiVerdict.explainable':'no'})`, summary `flagTotal` = Σ provider
  `flagCount`.
- API: hit `/api/analytics/provider-anomalies` with each sort + a `rubro`/`currency`
  filter; assert shape and 404-on-empty.
- Drill-down: `/api/analytics/anomalies?ai=unexplained&supplier=<known name>` returns only
  that provider's flags; existing calls unchanged.
- Page: drive it in the running app (skeleton → data → charts render → drill link
  navigates and filters). Verify light + dark theme, 360px width (wide charts scroll in
  their own scroller), and es/en parity.

## YAGNI cuts

No new charting library (Chart.js reused). No detector change / re-detection. No auth. No
CSV export v1. No fuzzy name matching (exact unique resolve only). No live aggregation on
the page (all precomputed).

## Build order

1. Artifact mockup with sampled real data → sign-off (Unit G).
2. Models + job + collection (Units B, A, F) → run job, verify data.
3. API (Unit C) + drill-down filter (Unit D).
4. Page + i18n + cross-links (Unit E).
5. Verify end-to-end (light/dark, es/en, 360px), then commit.
