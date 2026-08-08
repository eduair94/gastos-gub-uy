# Evolución del gasto — spec

**Route:** [/analytics/evolucion-gasto](../../../app/pages/analytics/evolucion-gasto.vue) ·
**Collection:** `spending_trend` ·
**Job:** [src/jobs/refresh-spending-trend.ts](../../../src/jobs/refresh-spending-trend.ts)

## The question

"¿Aumentó el gasto del Estado, o solo bajó el peso?" The site already plots spend per year.
That plot cannot answer the question, because four different things move it identically:

1. **Inflation.** Pesos of 2003 are not pesos of 2025.
2. **Exchange rate.** `amount.primaryAmount` was written by the ingest at the rate of the day it
   ran, so a 2003 USD contract is valued at today's peso. 114.865 releases quote USD.
3. **Artefacts.** Some releases carry a contract lump sum in `unit.value.amount`; multiplied by
   quantity they inflate by orders of magnitude. In the raw data a **single** release is 63% of
   2003 and another is 64% of 2024.
4. **Coverage.** The feed carried 110 reporting bodies in 2002 and 278 in 2024. More publishing
   is not more spending.

The page separates all four.

## Scope

The universe is public **procurement** (OCDS, Compras Estatales) — not the national budget.
Wages, pensions, transfers and debt interest are out of scope, and the page says so above the
first chart. Macro context (GDP, central-government expense, population) comes from a curated,
committed table so the slice can be read against the whole.

## Data facts this design rests on (verified against the live DB, 2026-08-07)

| Fact | Value | Consequence |
|---|---|---|
| Priced releases | 1.405.878 | — |
| `year(date) == sourceYear` | 100% | The year axis is unambiguous. |
| `amount.totalAmounts` present | 100% of priced releases | Historical FX can be rebuilt per currency. |
| Currency mix | UYU 1.298.365 · USD 114.865 · EUR 1.926 · UYI 615 · other <200 | Own-month FX matters; the tail is unconvertible and reported. |
| `verifiedOverride` releases | 42 | Corrected, not excluded — `primaryAmount` already holds the official total. |
| Releases > 1,25e10 | 26 | The artefact scan is tiny and fully auditable. |
| UI (Unidad Indexada) months | 288, 2002-06 → 2026-08 | An exact, self-updating deflator over the whole series. |
| Items with `classification.id` | 100% (`quantity>0` 99,85%) | The price/quantity lens is viable. |
| year × month × buyer groups | 52.839 | The main aggregation is cheap. |

## Method

### Series

Per release, sum `amount.totalAmounts` converting **each currency at the rate of its own month**
([shared/utils/real-value.ts](../../../shared/utils/real-value.ts); UI-denominated amounts were
added to `toNominalUyu` for this). Deflate by that month's UI to obtain today's pesos.
`verifiedOverride` releases use their verified `primaryAmount`. Unconvertible currencies
(GBP/BRL/CHF/ZAR/CAD/ARS) are counted and excluded, never guessed.

### Artefact removal

A release whose **real** (today's-pesos) value exceeds `ARTIFACT_CEIL_REAL = 5e10` is a load
error, not a contract. The ceiling is applied to the real value on purpose: the fixed 5e10
*nominal* ceiling the other rollups use lets a 2003 artefact through while catching a legitimate
2025 megacontract. 17 releases are excluded; every one is published in the page's audit table
with year, body, amount, reason and a link to its record. `rawNominalUyu` keeps the unsanitised
figure behind a toggle.

### The bridge (exact, additive)

All terms in pesos of `year`; `k = uiAvg(year) / latestUi` converts today's pesos back to this
year's price level.

```
base       = Nominal(year-1)
rebase     = Real(year-1) × k
inflation  = rebase − base
realDelta  = Nominal(year) − rebase

entrants   =  Σ Nominal_year(b)        for b only in year
exits      = −Σ Real_{year-1}(b) × k   for b only in year-1
panelDelta =  Σ (Nominal_year(b) − Real_{year-1}(b) × k)  for b in both

base + inflation + entrants + exits + panelDelta === Nominal(year)
entrants + exits + panelDelta === realDelta
```

Deriving the re-priced base from the **real** total rather than inflating the nominal one keeps
month-level timing inside the year intact; any residual lands visibly in `panelDelta` rather than
being hidden. Both identities are asserted in
[tests/unit/spending-bridge.test.ts](../../../tests/unit/spending-bridge.test.ts) and re-checked
against the live output after every run.

### Price vs quantity (partial, by design)

Over article codes present in both years with a comparable canonical unit:

```
quantity_c = (q_now − q_then) × p_then      p_then re-priced by inflation
price_c    =  q_now × (p_now − p_then)
```

Deliberately **not** part of the bridge: it sees only comparable codes, and it publishes its own
`coverage`. Three comparability gates run first — quantity ratio > 25×, real unit-price ratio
> 10×, or an absolute term above 5% of the year — because the feed stores integer-floored
quantities and lump-sum lines. Without them one code produced a ±4e15 pair of terms that
cancelled into a meaningless net. Rejected codes are counted in `droppedCodes`, never dropped
silently.

### Narrative

Deterministic sentences built from the computed bridge (es/en), optionally rewritten by Gemini
under `--ai`. The rewrite is accepted **only if its multiset of numeric tokens matches the template's exactly**
(sorted, so clauses may move but no figure may be added, dropped, rounded or rescaled); otherwise
the template text stands. On the live data 23/25 years were accepted, 1 was rejected for dropping
a figure, and 2002 has no bridge to describe. The guard is pinned by
[tests/unit/spending-narrative.test.ts](../../../tests/unit/spending-narrative.test.ts).

## Storage and refresh

One document per year in `spending_trend`, upserted **by `year`**, then a sweep of years no
longer produced. Deliberately not `deleteMany({ dataVersion: { $ne } })`: two overlapping runs of
that pattern delete each other's generation (see
[swap $ne annihilation](../../../docs/)). Indexes in
[scripts/ensure-indexes.ts](../../../scripts/ensure-indexes.ts). Cron: monthly, 05:00 on the 1st,
after the organism-group and dept-indicator rollups so the three heavy scans never overlap.
Runtime ~4 min against the live DB.

Macro table: [shared/macro-uruguay.ts](../../../shared/macro-uruguay.ts), generated by
`npm run refresh-macro-table` from the World Bank open API (GDP current LCU, population,
central-government expense % of GDP). Committed so every figure is auditable in git; `null`
renders "sin dato" rather than interpolating.

## Page

- **Scope note first** — what is and is not counted, plus the three corrections.
- **KPIs** — last complete year, nominal change, real change, long-run multiple + CAGR.
- **Series** with six lenses (today's pesos / current pesos / USD / % GDP / % central spending /
  per person) and an "as reported" toggle. In the real lens the nominal line is drawn dashed
  behind it: the gap between them *is* inflation.
- **Bridge waterfall** per year + the narrative sentence.
- **Contributors** — bodies and article codes, each against its own re-priced previous year.
- **Price vs quantity**, with coverage and the caveat stated in the panel.
- **Events** — the largest contracts, with their share of the year's real change.
- **Coverage charts** — reporting bodies and published records per year.
- **Audit table** — every excluded release, linked.
- **Method** — deflator, FX, bridge identity, macro source, computed-at stamp.

`% of central-government expense` is labelled as an order-of-magnitude reference: our universe
includes entes autónomos that the World Bank's central-government denominator does not count.

## Known limits (stated on the page)

- Quantities are integer-floored in the feed, so the price/quantity split is directional.
- The current year is partial and marked; KPIs use the last complete year.
- Coverage growth is separated but not corrected — we do not reconstruct what unreported bodies
  spent.
- 15 further artefacts above the ceiling remain uncorrected upstream; here they are excluded and
  listed, which is a different fix from
  [correct-lumpsum-artifacts](../../../src/jobs/correct-lumpsum-artifacts.ts).
