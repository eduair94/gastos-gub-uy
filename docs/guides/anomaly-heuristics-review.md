# Anomaly-detector heuristics review

_Generated 2026-07-17 by a 7-agent Claude review (6 lenses + 1 synthesizer, 0 errors) over `src/jobs/detect-anomalies.ts` and `src/jobs/anomaly-stats.ts`._

**Status 2026-07-17 — SHIPPED: #2 (line-total), #3 (contamination guard), #5 (deviation-from-mode).** Unit-tested (`tests/unit/test-anomaly-stats.ts`, 132 pass) and validated on the live DB. Measured delta over the 24-month scoring window: total anomalies **11.9k → 9,607**; **3,622** line-total false spikes suppressed (#2); **69** genuine `mode_deviation` catches that were structurally invisible before (#5); **2,394** stale false-positives reconciled away. The rest of this document is the remaining backlog._

This is the companion to the **AI triage layer** (`src/jobs/score-anomalies-ai.ts`), which is a _second stage_ that reads item text + contract context with an LLM. This document is about improving the _first stage_ (the pure statistics) with more heuristics.

## Plumbing facts that bound several proposals

- **`supplier.id` is not carried downstream.** Stage-1 groups on `{classificationId, currency, unitName, price}`; Stage-2 projects only `supplierName`/`buyerName`. Any supplier-diversity idea (#6, #19) must first plumb `awards.suppliers.id` through a spill-safe two-stage `$group` (`$sum` only — no `$push`/`$addToSet`).
- **`loadBaselines()` does not load `p50`.** It loads `medianLn, p25, p75, p95, recurringPrices`. FP-reducers comparing to `p50` (#9, #11) must add it to the projection.
- **`date` type discrepancy — VERIFY before building date-math heuristics.** The reviewer inferred from the code (`date: {$gte: windowStart}` matches Date objects) that `date` is a real `Date`. The `gastos-gub-data-truths` memory says it is stored as an **ISO string** (verified by full scan). These conflict. Resolve with a live `typeof`/`$type` check before #12 or #17. The trailing-window detector works today either way (ISO strings sort lexicographically), so it is not urgent for the shipped detector.
- Stage-1 streams **one baseline key resident at a time**, so any per-key clustering (mode, gap-split, menu-detection) is free at the server level — it stays inside MongoDB 4.4's 100MB-per-stage budget.

## Quick wins (cheap, safe, ship first)

| # | Heuristic | Type | Effort | Impact | Mechanism (short) |
|---|-----------|------|--------|--------|-------------------|
| 1 | **Unit-of-measure canonicalization** | FN-catch | S | high | Fold `u/un/uni/unid/unidad/c-u` → one canonical token at build **and** score time (`$toLower→$trim→$switch` allowlist). Strictly reduces cardinality; needs one `--baselines-only` rebuild. Never strip pack quantifiers (`caja x100`). |
| 2 ✅ | **Line-total-in-unit-price flag** _(SHIPPED)_ | data-quality | S | high | Pure Stage-2: for a flagged price with integer `quantity≥2`, if `price/quantity` falls back inside `[p25,p95]`, it is a line total mis-stored as a unit price — **suppress** and count (`isLineTotalArtifact` in detect-anomalies). Shipped as suppression, not a new type. **3,622 suppressed** live. |
| 3 ✅ | **Contamination guard via log-span** _(SHIPPED)_ | FP-reduction | S | medium | When `ln(p95/p25) ≥ ln(50)` (mixed products under one code), raise the effect floor to `ln(2)` (`contaminationHardenedFloor`). Cutoff set at **50×** from the measured prod distribution (median span is already 5.5×). Effect-floor only — dropped the rank≥3 part as too aggressive. Only ever hardens. |
| 4 | **Denomination-menu suppression** | FP-reduction | M | medium | Generalize the timbre fix: mark a baseline `tariffMenu` when its histogram is administratively discrete (≥3 recurring points, or top-5 prices cover ≥90% of n with ≥4 distinct prices); store `menuCeiling`; suppress unless `price > menuCeiling*1.25`. |

## Worthwhile (real value, more work or narrower)

| # | Heuristic | Type | Effort | Impact | Mechanism (short) |
|---|-----------|------|--------|--------|-------------------|
| 5 ✅ | **Deviation-from-mode on concentrated baselines** _(SHIPPED)_ | FN-catch | M | high | **The top gap, admitted verbatim in the source.** Baselines now store `modePrice/modeShare`; `scoreDeviationFromMode` fires only where MAD and IQR are both degenerate, gated on `modeShare≥0.55`, `price∉recurringPrices`, `ln(price/mode)≥ln(2)`; severity capped at high. **69 live catches** (e.g. the NEUROESTIMULADOR class). Needed a `--baselines-only` rebuild for the mode fields. |
| 6 | **Supplier-diversity gate on recurring-price whitelist** | FN-catch | M | high | Grant list-price immunity only when a recurring price spans ≥2 independent suppliers/buyers; single-supplier repeats lose the free pass and flow back to the >25%-over-median z-path. Closes the "corrupt price repeated 3×" hole. Needs `supplier.id` plumbed. |
| 7 | **Price-gap / mixture segmentation** | FN-catch | M | high | Split a code's log-price histogram at an empty multiplicative gap (≥~2.5× jump, zero obs between); keep runs with ≥30 obs as segments; score against the containing segment. Node-side over resident bins — no cardinality change. Supersedes description-fingerprint (#15). |
| 8 | **Method-conditioned severity** | FP-reduction | S | medium | Add `tender.procurementMethodDetails` to Stage-2: raise floor for Compra Directa (earned convenience), nudge confidence for competitive tenders, leave the 69% null neutral. Accent/case-normalized substring match. |
| 9 | **Cross-currency mislabel suppression** | FP-reduction | M | medium | Suppress a non-UYU critical spike whose raw number is an ordinary UYU amount for the same product. Sibling-currency map; guard on UYU sibling `n≥30` and `p50 ≥ 10×`. Needs `p50` loaded. Demote, don't delete. |
| 10 | **Quantity-band stratification** | FP-reduction | M | medium | Coarse `qtyBucket` in the key; use banded baseline only when its own `n≥30`, else pooled fallback; route `quantity≤0/null` to pooled. Gate on total-n≥~90 (quantity is dirty). |
| 11 | **Decimal/thousands-separator artifact** | data-quality | S | low | Demote spikes at ~exactly 100× or 1000× the median as comma-vs-dot parse errors (±5% window). Needs `p50` (shared with #9); order after #2. |

## Larger efforts / defer

12 Inflation deflation (36m window, UYU CPI table) · 13 Method-segmented reference prices (needs Convenio Marco strings to exist) · 14 Hierarchical dispersion shrinkage · 15 Description-fingerprint segmentation (fold into #7) · 17 **Fraccionamiento / bid-splitting detector** (high value, but a _separate release-grain job_, own track) · 18 Junk `id=0` bucket recovery (shadow-mode only) · 19 Per-supplier list-rate demotion (overlaps #6) · 20 Buyer-relative premium · 21 Quantity-inflation outlier.

## Rejected (do NOT ship as specified)

- **16 Price-per-base-unit regex parsing of `unit.name`** — a wrong divisor _silently hides_ a real overpay; the unbounded FN is worse than the FP it removes.
- **22 Category-relative round-number bias** — lowering `MIN_LOG_DEVIATION` for round prices manufactures FPs (public budgets are round) for a weak signal.

## Recommended implementation order

1. **#5 deviation-from-mode** (biggest recall gain, the documented blind spot) + **#3 contamination guard** (cheap precision) + **#2 line-total flag** — all validatable via `detect-anomalies --dry-run` (writes nothing).
2. **#1 unit canonicalization** — needs a `--baselines-only` rebuild; do after #5 so the mode fields land in the same rebuild.
3. **#6 supplier-diversity gate** + **#8 method severity** — once `supplier.id` / method are plumbed into Stage-2.

Each detector change must update `tests/unit/test-anomaly-stats.ts` and be checked with a `--dry-run` before/after delta on the live DB (dry-run scores against existing baselines and persists nothing).
