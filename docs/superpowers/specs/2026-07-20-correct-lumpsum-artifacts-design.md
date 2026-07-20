# Correct lump-sum-in-unit-price artifacts

_Design — 2026-07-20_

## Problem

Some OCDS award items store a **contract lump-sum total** in `awards[].items[].unit.value.amount`
instead of a true per-unit price. `src/utils/amount-calculator.ts:175` then computes
`itemTotal = unit.value.amount × quantity`, multiplying an already-total figure by a large
quantity and baking the blown-up result into the persisted `amount.primaryAmount`.

**Confirmed live case** — `adjudicacion-53193` (Dirección Nacional de Catastro, artículo 27050
"TIMBRE PARA RECAUDACION DE INGRESOS", SURYPARK S.A., 2005):

| field | stored | official (comprasestatales id 53193) |
|-------|--------|--------------------------------------|
| quantity | 330 000 | 330 000 |
| unit.value.amount | 3 316 USD | — (3 316 is the net-of-tax **contract total**, not a unit price) |
| computed total | **1 094 280 000 USD** (330 000 × 3 316) | **4 201 USD** ("Monto Total Adjudicado") |
| amount.primaryAmount | **≈ 43 823 788 580 UYU** | — |

A second, identical case exists: `adjudicacion-31334` (same buyer + supplier, 2004, "timbres de
tasas catastrales", 360 000 × 2 832,11 USD → ≈ 40 831 381 689 UYU). These two releases alone are
**~4.3 % of `dashboard_metrics.totalSpending`** and make SURYPARK the (false) **#1 all-time
supplier** in `top_entities` (84.65B of its 85.14B total is just these two).

### Why nothing catches it today

- `src/jobs/detect-anomalies.ts` — `isLineTotalArtifact()` (line 275) recognises the pattern
  (unit-price ÷ integer quantity lands back in `[p25,p95]`) but **only suppresses the alert**
  (`itemsLineTotalArtifact++; continue;`, line 611-614). It never corrects the stored amount. It
  also needs a baseline for `{classificationId, currency, unitName}`; rarely-bought items like
  código 27050/USD may have none, and the default run window is 24 months (these are 2004/2005).
- `src/jobs/analytics-pipeline.ts` — `MAX_PLAUSIBLE_RELEASE_UYU` (50B) is a presentation-layer
  exclusion from **aggregate sums only** ("not a deletion"); the contract page still shows the
  blown-up total, and both SURYPARK releases sit *just under* 50B so they aren't even excluded.
- `src/jobs/reconcile-award-amendments.ts` — only fires when the government publishes a correcting
  `awardUpdate`/`ajuste_adjudicacion` release. No such sibling exists for 53193/31334.
- **No code anywhere** compares the computed item total against the award's own stated total to
  detect or correct a mismatch. `awards[].value` isn't even preserved in the schema
  (`shared/models/release.ts` AwardSchema).

### Second, related bug (in scope, bounded)

`calculateTotalAmounts` converts foreign currency to UYU at **today's** rate
(`convertToUYU` → live/fallback rate), so a 2005 USD figure is converted at the 2026 rate. This
distorts *every* historical foreign-currency release, not just these artifacts. We fix it **only
for the releases this job already touches** (recompute at the release's own period rate); the
platform-wide version is a separate future spec.

## Goal

A new offline job that finds these blown-up releases, verifies the real total against the official
comprasestatales page, recomputes `amount` using that verified total at the correct historical FX
rate, and writes it back with an audit trail and an override flag that all other amount-writing
paths respect. The contract page shows a "verified against official source" badge. Public rollups
self-correct on their next scheduled refresh.

## Non-goals

- Platform-wide historical FX correction (separate spec).
- Splitting a verified award total across multiple line items (impossible from the official page,
  which only exposes one "Monto Total Adjudicado"). Per-item totals stay informational.
- Any change to how `detect-anomalies` scores or suppresses. This job is independent.
- Correcting releases whose official total genuinely matches the computed one (not artifacts).

## Design

New job: `src/jobs/correct-lumpsum-artifacts.ts`. Same conventions as
`reconcile-award-amendments.ts`: **dry-run by default**, `--commit` to write, per-release
before/after logging, read-only DB access until `--commit`.

```
npx tsx src/jobs/correct-lumpsum-artifacts.ts                 # dry-run, full history
npx tsx src/jobs/correct-lumpsum-artifacts.ts --commit        # write corrections
npx tsx src/jobs/correct-lumpsum-artifacts.ts --release=adjudicacion-53193   # single release
npx tsx src/jobs/correct-lumpsum-artifacts.ts --limit=50      # cap candidates per run
```

Run **on the 167 server** (prod Mongo is local-only; dev has no DNS for the scrape either — see
memory `gastos-gub-cold-email-campaign` / deploy notes).

### Stage 1 — candidate selection (structural threshold, no baseline needed)

Aggregate over `releases` where `tag: 'award'`, matching **all** of:

- award has `≤ 2` items with a priced `unit.value.amount`,
- some item has integer `quantity ≥ QTY_THRESHOLD` (default **1 000**),
- item `unit.value.currency` is foreign (**not** UYU — the mislabel is concentrated in USD/EUR),
- `amount.primaryAmount` is in the **blind band** `[SUSPECT_MIN_UYU, MAX_PLAUSIBLE_RELEASE_UYU)`
  (default `1e9 .. 50e9`) — above normal spend, below the aggregate ceiling that already hides the
  most extreme ones.

This is a bounded pool (expected hundreds, not thousands). Log the full candidate list before any
network calls. Constants live at the top of the file, env-overridable, documented with the SURYPARK
numbers as the worked example (mirroring the `MAX_PLAUSIBLE_RELEASE_UYU` comment style).

### Stage 2 — official-total verification (ground truth)

For each candidate: derive `idCompra` = ocid with `ocds-<prefix>-` stripped (regex
`/^ocds-[a-z0-9]+-/i`; equivalently the numeric suffix of the releaseId), fetch
`https://www.comprasestatales.gub.uy/consultas/detalle/id/{idCompra}`, parse the **"Monto Total
Adjudicado"** value and its currency.

- Serial fetch with a polite delay + `user-agent` header (match `refresh-exchange-rates.ts`), retry
  with backoff, hard timeout. This is the same deterministic-sibling-probe shape as
  `backfill-pliego-docs.ts` / `backfill-reiteracion-docs.ts`.
- **Confirm it's really an artifact**: only proceed if `computedTotal / officialTotal ≥ RATIO_MIN`
  (default 5×) in the item currency. If the official total is within an order of magnitude, it is
  **not** an artifact → skip, log as `notArtifact`.
- If the page can't be fetched/parsed, or has no unambiguous single total → skip, log as
  `unverified`. Never guess.

### Stage 3 — historical FX resolution

`getHistoricalRate(dateISO, currency): Promise<number | null>` — cache-first:

1. Look up `ExchangeRateModel` for the release's `YYYY-MM` (already covers 2022-12→now).
2. Miss (e.g. 2004/2005) → scrape the **BCU** historical form
   (`bcu.gub.uy/Estadisticas-e-Indicadores/Paginas/Cotizaciones.aspx`; "Desde/Hasta" date range,
   downloadable TXT, coverage back to ~2000). No clean API exists, so drive the ASPX form
   (chrome-devtools/playwright MCP or a scripted POST of the form fields) for the release's month,
   parse the TXT, and **upsert the month back into `ExchangeRateModel`** so it's never re-scraped.
   Isolate this in its own module (`src/jobs/lib/bcu-historical-rate.ts`) so the fragile scraper is
   testable and swappable.
3. Still no rate → skip the release, log as `noRate`. Do not fall back to today's rate.

### Stage 4 — write-back (only with `--commit`)

Set `amount` for the release to the verified figure:

- `totalAmounts = { [officialCurrency]: officialTotal }`, `primaryAmount = officialTotal ×
  historicalRate` (UYU), `primaryCurrency = 'UYU'`, `version` bumped, plus an audit sub-object:

```ts
amount.verifiedOverride = {
  source: 'comprasestatales',
  sourceUrl,                    // the detalle URL scraped
  officialTotal, officialCurrency,
  historicalRate, rateMonth,    // e.g. 40.05, '2005-06'
  previousPrimaryAmount,        // 43_823_788_580 — what we replaced
  previousComputedTotal,        // 1_094_280_000 USD
  verifiedAt: <ISO>,
  reason: 'lumpsum-in-unit-price',
}
```

Written via `updateOne({ _id }, { $set: { amount } })`. The raw `awards[].items[].unit.value.amount`
is **left untouched** (it faithfully reflects the government feed); only the derived `amount`
rollup is corrected, and the badge/UI explains the divergence.

### Stage 5 — protect the correction from being overwritten (the risky part)

Every path that recomputes `amount` from `calculateTotalAmounts` must **skip a release that carries
`amount.verifiedOverride`**, or a routine sync re-inflates it. Add the guard to all five:

1. `src/uploaders/release-uploader-new.ts:416`
2. `src/uploaders/release-uploader-new.ts:730`
3. `src/uploaders/release-uploader.ts:148`
4. `src/add-missing-amounts.ts:104`
5. `src/jobs/reconcile-award-amendments.ts:406` (if a real govt amendment later arrives, it should
   win — so here: if the incoming merge has genuine `awardUpdate` data, clear `verifiedOverride` and
   recompute; otherwise skip. Document the precedence.)

A single shared helper `hasVerifiedOverride(release)` keeps the guard consistent. This audit +
guard step is a **hard prerequisite** — do it and verify it before the first `--commit`.

### Display

`app/pages/contracts/[id].vue` + `app/utils/contract.ts`: when `amount.verifiedOverride` is present,
the page-header total reads the corrected `primaryAmount` (already does, since it reads
`amount.primaryAmount`), and a **badge** "✓ Monto verificado con la fuente oficial" links to
`sourceUrl`, with a short note that the per-line figures below are the raw feed values (which
overstate). Reuse the existing official-source-link i18n keys (`officialSourceHelp`) and the
citation/badge pattern from curros / empresas-señaladas. Add es/en i18n strings.

### Rollups

No rollup code changes. `src/jobs/refresh-analytics.ts` sums `amount.primaryAmount`
(`$sum: '$amount.primaryAmount'`), so `top_entities`, `dashboard_metrics`, per-year and per-buyer
breakdowns all self-correct on the next scheduled `refresh-analytics` run. Note in the job's final
log that a `refresh-analytics` pass is needed to propagate.

## Error handling

Skip-and-log (never fabricate) on: page unfetchable/unparseable, ambiguous/multi total,
official-within-magnitude (not an artifact), or unresolved historical rate. A run reports counts:
`candidates / verified / corrected / notArtifact / unverified / noRate`.

## Testing

No runner-based test suite; the repo uses standalone `tsx` assertion scripts under
`tests/unit/test-*.ts`. Verification plan:

1. `tests/unit/test-lumpsum-artifacts.ts` (new, following the existing convention) — pure-function
   coverage: candidate-predicate accepts the SURYPARK shape and rejects a normal high-value award;
   the "Monto Total Adjudicado" parser returns 4 201 / USD on a saved fixture of the 53193 page;
   `hasVerifiedOverride` guard logic. Network and DB are not exercised here.
2. Extend the **existing** `tests/unit/test-amount-calculator.ts` for any change to
   `amount-calculator.ts` (it already covers this module — do not create a parallel test).
3. Live spot-check on 167: `getHistoricalRate('2005-06','USD')` returns a plausible 2005 rate
   (~24 UYU/USD, **not** ~40), and the scraper returns 4 201 USD for id 53193.
4. Targeted root `tsc` on the changed files.
5. `--dry-run` on 167, eyeball the full before/after table.
6. `--commit --release=adjudicacion-53193` first (single), verify the contract page shows ~4 201
   USD + badge, then the rollups after a `refresh-analytics`.
7. Only then a full `--commit` run.

## Files

- `src/jobs/correct-lumpsum-artifacts.ts` (new — the job)
- `src/jobs/lib/bcu-historical-rate.ts` (new — historical FX scraper + cache)
- `src/utils/amount-calculator.ts` or a small shared module (new `hasVerifiedOverride` helper)
- `shared/models/release.ts`, `shared/types/database.ts` (add `verifiedOverride` to the amount type)
- `src/uploaders/release-uploader-new.ts`, `src/uploaders/release-uploader.ts`,
  `src/add-missing-amounts.ts`, `src/jobs/reconcile-award-amendments.ts` (the five guards)
- `app/pages/contracts/[id].vue`, `app/utils/contract.ts`, `app/i18n/locales/{es,en}.json` (badge)
- `tests/unit/test-lumpsum-artifacts.ts` (new), `tests/unit/test-amount-calculator.ts` (extend)
