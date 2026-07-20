#!/usr/bin/env tsx
import { computeCadence, expectedWindow, confidenceScore } from '../../shared/forecast/recurrence'
import { MIN_DISP_DAYS, MAX_DISP_DAYS } from '../../shared/forecast/constants'

function assert(c: unknown, m: string) { if (!c) throw new Error(`FAIL: ${m}`) }
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol
const DAY_MS = 86_400_000

// Annual cadence → medianDays≈365, low CV.
const annual = [2018, 2019, 2020, 2021, 2022].map(y => new Date(Date.UTC(y, 2, 15)))
const c1 = computeCadence(annual)!
assert(c1, 'annual returns a result')
assert(near(c1.medianDays, 365, 3), `annual median ~365 (got ${c1.medianDays})`)
assert(c1.cvDays < 0.05, `annual CV low (got ${c1.cvDays})`)
assert(c1.eventCount === 5, 'annual eventCount 5')
assert(c1.seasonalMonths.includes(3), 'annual seasonal month = March')

// Fewer than 2 events → null.
assert(computeCadence([new Date()]) === null, 'single event → null')
assert(computeCadence([]) === null, 'empty → null')

// Window centered a median after last event, dispersion clamped.
const w = expectedWindow(new Date(Date.UTC(2022, 2, 15)), 365, 0.1)
assert(w.start.getTime() < w.end.getTime(), 'window ordered')
assert(w.start > new Date(Date.UTC(2022, 2, 15)), 'window starts after last event')

// Dispersion clamp — MIN_DISP_DAYS floor. medianDays*cvDays = 10*0.1 = 1, far below
// MIN_DISP_DAYS (15); the returned half-width must be pinned at the floor, not the raw value.
const wLow = expectedWindow(new Date(Date.UTC(2022, 2, 15)), 10, 0.1)
const halfWidthLow = (wLow.end.getTime() - wLow.start.getTime()) / 2 / DAY_MS
assert(near(halfWidthLow, MIN_DISP_DAYS, 1e-6), `low-dispersion half-width clamps to MIN_DISP_DAYS (got ${halfWidthLow})`)

// Dispersion clamp — MAX_DISP_DAYS ceiling. medianDays*cvDays = 1000*1 = 1000, far above
// MAX_DISP_DAYS (180); the returned half-width must be pinned at the ceiling, not the raw value.
const wHigh = expectedWindow(new Date(Date.UTC(2022, 2, 15)), 1000, 1)
const halfWidthHigh = (wHigh.end.getTime() - wHigh.start.getTime()) / 2 / DAY_MS
assert(near(halfWidthHigh, MAX_DISP_DAYS, 1e-6), `high-dispersion half-width clamps to MAX_DISP_DAYS (got ${halfWidthHigh})`)

// Confidence: tight cadence + many events + tender-heavy → high; erratic → low.
// NOTE: this hi case saturates at the clamp(...,0,1) ceiling (raw sum ≈1.002 → hi===1),
// so it alone can't prove the tenderShare bonus works — see isolated check below.
const hi = confidenceScore({ cvDays: 0.05, eventCount: 6, tenderShare: 1 })
const lo = confidenceScore({ cvDays: 2.0, eventCount: 3, tenderShare: 0 })
assert(hi > 0.7, `tight cadence high confidence (got ${hi})`)
assert(lo < 0.4, `erratic low confidence (got ${lo})`)
assert(hi >= 0 && hi <= 1 && lo >= 0 && lo <= 1, 'confidence in [0,1]')

// tenderShare term isolated: hold cvDays/eventCount fixed, vary only tenderShare.
// cvDays=0.3 (looser than the 'hi' case above) keeps both results strictly below the
// clamp(...,0,1) ceiling, so the comparison isn't vacuous — it actually exercises the bonus.
const shareHi = confidenceScore({ cvDays: 0.3, eventCount: 6, tenderShare: 1 })
const shareLo = confidenceScore({ cvDays: 0.3, eventCount: 6, tenderShare: 0 })
assert(shareHi < 1 && shareLo < 1, `tenderShare comparison must not saturate at 1 (got hi=${shareHi}, lo=${shareLo})`)
assert(shareHi > shareLo, `tenderShare=1 must score strictly higher than tenderShare=0 (got hi=${shareHi}, lo=${shareLo})`)

console.log('OK verify-recurrence')
