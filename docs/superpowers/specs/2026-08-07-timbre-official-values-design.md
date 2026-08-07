# Timbre profesional: score against the official DGI value table

**Date:** 2026-08-07
**Status:** approved, implementing
**Touches:** `shared/data/`, `shared/models/anomaly.ts`, `src/jobs/anomaly-stats.ts`, `src/jobs/detect-anomalies.ts`, `tests/unit/`

## Problem

Classification `10233` (TIMBRE PROFESIONAL) is not a product with a market price. It is a **menu of
nine administratively fixed denominations**, set by Ley 17.738 art. 71 and raised **twice a year** by
decree. The ARCE catalogue pools all nine under one code, so the pooled baseline lands on the
dominant cheap denomination (certificado médico) and every legally higher denomination looks like a
price spike.

The detector currently defends against this with one generic heuristic:
`RECURRING_PRICE_MIN_COUNT` ([anomaly-stats.ts](../../../src/jobs/anomaly-stats.ts)) suppresses any
price observed 3+ times in the baseline window. That heuristic is a *statistical proxy* for "this is a
tariff", and it fails in both directions:

- **Guaranteed false positives every January.** When DGI raises the nine values, each new value is a
  singleton until it has been purchased three times, so the entire new official menu is emitted as
  `critical`. Live proof at the time of writing: `adjudicacion-1358443` and `adjudicacion-1359580`
  are flagged `critical` at **6540 UYU**, which is the exact official 2026 cirugía-mayor stamp.
  Same story for **6000 UYU** in 2025 (`adjudicacion-1296780`, `adjudicacion-1274699`) — the official
  2025-1S cirugía-mayor value.
- **Silent false negatives.** `recurringPrices` for the `10233|UYU|unidad` baseline currently
  contains `1500`, which was official in 2024-2S/2025-1S. A 2026 purchase at 1500 is suppressed
  without anyone looking at the date, even though the 2026 legal value is 1690.
- **A meaningless expected range.** `expectedRange` is reported as the baseline `p25..p95` —
  `140..170` — for an item whose legal price can be 16 870. The number cannot inform a reader.

## Evidence

Official table reconstructed and cross-validated from two independent sources:

- [DGI — Valor de los timbres](https://www.gub.uy/direccion-general-impositiva/datos-y-estadisticas/datos/valor-timbres)
  (period 2026-01-01 … 2026-12-31, nine concepts).
- CJPPU *"Timbres profesionales — valores históricos, período 2005-2025"*
  (<https://www.cjppu.org.uy/timbres.php> → Valores históricos), nine grupos × 21 years × 2 semesters.

The two agree at the seam: each of the nine 2025-2S values chains into its 2026 counterpart
(260→270, 160→170, 42→44, 3500→3690, 620→650, 4100→4320, 6200→6540, 1600→1690, 16 000→16 870), and
the parto series 570/590/600/620/650 reproduces the sequence already documented by hand at
[anomaly-stats.ts:100](../../../src/jobs/anomaly-stats.ts).

Measured against the live corpus (12 986 UYU award-item lines under `10233`, 10 999 releases):

| Accepted date window | Lines landing exactly on an official value |
|---|---|
| same semester only | 84.55 % |
| ±1 semester | 96.21 % |
| **−2 / +1 semesters** | **97.16 %** |
| −4 / +2 semesters | 97.61 % |

92.8 % land on the same *calendar year*'s menu with no window at all. A menu of fixed prices is the
correct model of this code; the log-normal price model is not.

Of the 21 open anomalies on `10233`, **4 are provably legal** (2 × 6540 in 2026-2S, 2 × 6000 in
2025-2S) and 17 are provably off-menu (24 480, 19 380, 8643.14, 4880, 1200, 700, 680, 520, 500, 420,
390, 362 …).

## Design

### 1. `shared/data/timbre-values.ts` — pure data, zero imports

The nine values per `{year, semester}` for 2005…2026, with the legal citation and per-source
provenance in the module docblock. No I/O, no config, so `tests/unit/` can import it directly.

```ts
officialTimbrePrices(date: Date): OfficialTimbreMenu | null
```

Returns the union of official values inside the window
`[semester − TIMBRE_LOOKBACK_SEMESTERS, semester + TIMBRE_LOOKAHEAD_SEMESTERS]` (2 back, 1 forward),
plus `min`, `max`, `year`, `semester`.

Returns **`null` when the date's year is not in the table.** It never extrapolates: an unknown year
means the rule is skipped and the detector behaves exactly as it does today. Guessing a value would
either suppress a real finding or invent an illegal one.

**Why the window is asymmetric.** Each grupo rises year over year *within its own semester series*,
and the detector is upper-tail only, so admitting *older* values essentially cannot mask an
overprice. (The one wrinkle: across a 2S→next-1S boundary the published schedule occasionally rounds
DOWN — grupo 4 goes 3300 in 2023-2S to 3200 in 2024-1S. The worst such regression over the whole
2005–2026 table is 3.03 %, and the unit test asserts a 5 % bound, so "older" means "at most a few
percent above", not "unbounded".) Admitting *newer* values genuinely can mask an overprice. Backward
is therefore cheap and forward is capped at one semester, which is what covers the real
December-purchase-at-January's-price lines in the corpus (179 lines at 160 in 2026-1S, 36 lines at
170 in 2025-2S).

Scope is `TIMBRE_CLASSIFICATION_IDS = {"10233"}` and nothing else. The catalogue also contains
`14624` TIMBRE INALAMBRICO, `290` CAMPANILLA DE TIMBRE, `291` CHICHARRA DE TIMBRE, `15057`
INSTALACION DE TIMBRE, `21210` TRANSFORMADOR COMUN PARA TIMBRE, `29828` PULSADOR DE TIMBRE and
`66628` TIMBRE ELECTRONICO — all doorbells and buzzers, all unrelated to the fiscal stamp. The
denylist is written into the module so the next reader does not widen the match on the word.

The rule applies to **UYU only**. The legal table is denominated in pesos; the `10233|USD` baseline
(n = 10, 1.11 … 4.40 USD) is a different, pre-normalisation animal.

### 2. `src/jobs/anomaly-stats.ts` — one optional gate

```ts
scoreUnitPrice(price, baseline, options?: { officialPrices?: ReadonlySet<number> })
```

An exact match returns `null`, immediately beside the existing `recurringPrices` gate and for the
same reason. Exact equality is right here for the same reason it is right there: both the observed
price and the table are exact decimal values, and a tolerance would only invent matches.

The set is passed per *observation*, not stored on the baseline, because it depends on the release
date. That keeps `anomaly-stats.ts` import-free and date-unaware.

### 3. `src/jobs/detect-anomalies.ts`

- Carry `releaseDate` through `normaliseRow` into `ScoredRow`. The pipeline already projects it; the
  **month** is required, and `sourceYear` cannot give the semester.
- Before scoring, when the row is a timbre in UYU, resolve the menu and pass it to `scoreUnitPrice`.
  Report the suppressions on their own line, next to the recurring-price and line-total counters.
- In `buildAnomalyDoc`, when the row is a timbre with a known menu and the price is **off-menu**:
  - `expectedRange` becomes the legal `{min, max}` of the window instead of `p25..p95`;
  - the description names the nearest official value and the semester, so the finding is checkable
    against the DGI page rather than against a statistic;
  - `metadata.officialTariff { source, sourceUrl, year, semester, values, nearest, aboveLegalMax }`
    records the evidence for the AI triage and any future UI.

`anomalyContentVersion` hashes only contract identity + unit price, so none of this moves an
anomaly's `dataVersion` and **no Gemini re-triage is triggered** for the corpus.

### 4. `shared/models/anomaly.ts` + `IAnomaly`

`metadata.officialTariff` must be declared on the Schema *and* the interface, or mongoose strict mode
drops it silently on write — the same trap that once dropped `detectedAt` and `aiVerdict`.

### 5. Retroactive correction — no new job

Add a release-level scope flag:

```
npx tsx src/jobs/detect-anomalies.ts --classification=10233 --score-only
```

`buildScopeFilter` adds `"awards.items.classification.id": <id>` to the filter, and `reconcile()`
reuses that filter verbatim, so the existing self-healing delete is bounded to timbre-carrying
releases and cannot touch anything else. This reuses the mechanism the amendment reconciler already
depends on rather than adding a second writer to `anomalies`.

**The flag narrows, it never widens.** It intersects with whatever date scope is in play and does not
relax the default trailing 24-month window. An earlier draft did relax it, on the reasoning that a
repair should reach a code's whole history; measuring killed that. A dry run without the date bound
emitted **558 findings where 178 exist today**, and the ~380 extra were 2005–2023 flags in
*unrelated* classifications that merely shared a release with a timbre — the corpus only holds
findings for the trailing window, so the repair would have injected an arbitrary subset of old ones.
Reaching the whole history stays available and explicit: `--classification=<id> --all`.

The flag is generic on purpose: any future "one catalogue code was being scored wrong" repair uses
the same lever.

### 6. Tests — `tests/unit/test-timbre-values.ts`

- Table integrity: every year 2005…2026 carries exactly nine values per semester; each grupo rises
  year over year inside its own semester series; the 2S→next-1S rounding regression stays under 5 %
  (measured worst: 3.03 %).
- Source anchors: parto 2024-2S = 590 and 2026 = 650; cirugía mayor 2026 = 6540; all nine DGI 2026
  values present.
- Window behaviour: 2026-2S accepts 6540 (current) and 6200 (−2 semesters) and rejects 8643.14 and
  24 480; an unknown year returns `null`.
- Classification scope: `10233` in, `14624` out.
- `scoreUnitPrice` regression: an official price returns `null` even on a baseline where its z-score
  would be `critical`.
- **Freshness guard:** fails when the *current* semester is missing from the table. The table needs a
  manual update twice a year and a silent stale table is the failure mode that matters — a
  hard-failing test is the forcing function.

## Non-goals

- No severity re-ranking from the legal maximum.
- No `timbre_values` collection and no DGI scraper. The table is nine numbers twice a year; keeping it
  in git makes it auditable and diffable, and a scraper's failure mode is silent.
- No UI work. The corrected `expectedRange` and description flow through the existing anomaly
  components unchanged.

## Verification

```bash
npx tsc --noEmit
npx eslint src shared scripts tests
npm test
npx tsx tests/unit/test-timbre-values.ts
npx tsx src/jobs/detect-anomalies.ts --classification=10233 --score-only --dry-run
npx tsx tests/unit/timbre-rescore-impact.verify.ts   # live-DB blast radius, skipped by npm test
```

Result on the live corpus at implementation time:

- `at official tariff: 5807` timbre lines recognised as legally priced inside the trailing window.
- 178 anomalies exist in the rescore scope; the dry run emits **175**.
- The delta is exactly the four legally-priced findings retired, plus **one** previously shadowed
  item in the same award surfacing — the anomaly key is `{releaseId, awardId}` and only the worst
  item per award is kept, so retiring a timbre promotes whatever it was hiding. Confirmed by scoring
  those four releases alone: `at official tariff: 4`, `anomalies found: 1` (medium, iqr_fence).
- The seventeen off-menu findings are retained, now with the legal menu as their expected range.

**Ordering.** Deploy first, repair second. The cron on 167 runs `detect-anomalies` nightly at 04:15
against the *deployed* code, so a repair run before the merge would simply be undone that night.
After the merge the nightly run fixes the corpus on its own — all 21 findings sit inside the trailing
window — and the targeted command above only makes it immediate.
