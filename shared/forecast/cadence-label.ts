// Pure display unit-picker for a forecast's `cadence.medianDays`. Both
// app/pages/analytics/anticipacion.vue and app/components/AnticipatedTenderCard.vue
// rendered this as `Math.round(medianDays / 30)` months — the refresh job only
// gates `medianDays >= 1` (see src/jobs/refresh-tender-forecast.ts), so a buyer
// that re-tenders every ~7–20 days rounded to 0 and rendered the nonsensical
// "cada ~0 meses" / "every ~0 months" on the page's soonest (top) rows, right
// where a citizen's eye lands first.
//
// Fix: pick the unit (days/weeks/months) by magnitude instead of always
// dividing by 30, and floor every branch at n=1 so this can never emit 0
// regardless of input. Cutoffs (roughly one cadence *count* per bucket before
// the number gets awkward to read):
//   - < 14 days  → days  (a 7–13 day cadence read as "~1–2 weeks" is fine, but
//     "days" keeps single-digit cadences legible instead of rounding to "~0-2
//     weeks")
//   - < 60 days  → weeks (14–59 days is 2–8 weeks, a comfortable range; 60+
//     days in weeks would read as "~9 weeks" which is less legible than "~2
//     months")
//   - else       → months (unchanged from the original always-months behavior
//     for the common case this feature was built for — monthly-ish and
//     slower recurring buys)
export type CadenceUnitKey = 'days' | 'weeks' | 'months'

export interface CadenceUnit {
  key: CadenceUnitKey
  n: number
}

/**
 * Pick a display unit + rounded count for a cadence's medianDays. Never
 * returns n=0 (floored at 1 in every branch) — the exact defect this
 * replaces was `Math.round(medianDays / 30)` rounding short cadences to 0.
 */
export function cadenceUnit(medianDays: number): CadenceUnit {
  if (medianDays < 14) return { key: 'days', n: Math.max(1, Math.round(medianDays)) }
  if (medianDays < 60) return { key: 'weeks', n: Math.max(1, Math.round(medianDays / 7)) }
  return { key: 'months', n: Math.max(1, Math.round(medianDays / 30)) }
}
