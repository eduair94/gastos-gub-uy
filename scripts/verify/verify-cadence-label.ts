#!/usr/bin/env tsx
import { cadenceUnit } from '../../shared/forecast/cadence-label'

function assert(c: unknown, m: string) { if (!c) throw new Error(`FAIL: ${m}`) }

// Old (buggy) behavior every case below is checked against: the pre-fix code
// was `Math.round(medianDays / 30)` months, unconditionally.
function oldMonths(medianDays: number): number {
  return Math.round(medianDays / 30)
}

// 1. A ~7-day cadence (the reported bug: a buyer re-tendering weekly). Old
//    logic: round(7/30) = round(0.233) = 0 → "cada ~0 meses" / "every ~0
//    months". New logic must land in `days`, with n >= 1.
{
  const r = cadenceUnit(7)
  assert(oldMonths(7) === 0, `sanity: old logic really does produce 0 for 7 days (got ${oldMonths(7)})`)
  assert(r.key === 'days', `7 days: expected unit 'days', got '${r.key}'`)
  assert(r.n >= 1, `7 days: expected n >= 1 (never 0), got ${r.n}`)
  assert(r.n === 7, `7 days: expected n=7, got ${r.n}`)
}

// 2. A ~20-day cadence — also short-cadence territory (job gates
//    medianDays >= 1 only). Old logic: round(20/30) = round(0.667) = 1 →
//    "cada ~1 meses" is at least non-zero but still the wrong unit (reads as
//    "every ~1 months" for a twice-monthly buyer). New logic must NOT say
//    months for this either — falls in `weeks`.
{
  const r = cadenceUnit(21)
  assert(oldMonths(21) === 1, `sanity: old logic gives 1 for 21 days (got ${oldMonths(21)})`)
  assert(r.key === 'weeks', `21 days: expected unit 'weeks', got '${r.key}'`)
  assert(r.n >= 1, `21 days: expected n >= 1, got ${r.n}`)
  assert(r.n === 3, `21 days: expected n=3 (21/7), got ${r.n}`)
}

// 3. A ~365-day cadence (annual recurrence) — the common case this feature
//    was built for. Must still read as months, same as the old behavior.
{
  const r = cadenceUnit(365)
  assert(r.key === 'months', `365 days: expected unit 'months', got '${r.key}'`)
  assert(r.n === 12, `365 days: expected n=12 (round(365/30)), got ${r.n}`)
}

// 4. Never returns n=0 for any positive medianDays, across the whole
//    sub-day..multi-year range (including the exact boundary values and the
//    smallest positive input the job could ever emit, medianDays=1 — the
//    job's own `if (cadence.medianDays < 1) continue;` gate).
{
  const probes = [1, 2, 6, 7, 13, 14, 15, 29, 30, 59, 60, 61, 90, 180, 364, 365, 1000, 3650]
  for (const d of probes) {
    const r = cadenceUnit(d)
    assert(r.n >= 1, `medianDays=${d}: n must be >= 1, got ${r.n} (key=${r.key})`)
    assert(Number.isFinite(r.n), `medianDays=${d}: n must be finite, got ${r.n}`)
  }
}

// 5. Boundary checks on the cutoffs themselves: < 14 → days, [14, 60) →
//    weeks, >= 60 → months.
{
  assert(cadenceUnit(13.9).key === 'days', 'just under 14 days: expected days')
  assert(cadenceUnit(14).key === 'weeks', '14 days: expected weeks')
  assert(cadenceUnit(59.9).key === 'weeks', 'just under 60 days: expected weeks')
  assert(cadenceUnit(60).key === 'months', '60 days: expected months')
}

console.log('OK verify-cadence-label')
