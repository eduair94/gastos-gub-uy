#!/usr/bin/env tsx
import { computeCadence, expectedWindow, confidenceScore } from '../../shared/forecast/recurrence'

function assert(c: unknown, m: string) { if (!c) throw new Error(`FAIL: ${m}`) }
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol

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

// Confidence: tight cadence + many events + tender-heavy → high; erratic → low.
const hi = confidenceScore({ cvDays: 0.05, eventCount: 6, tenderShare: 1 })
const lo = confidenceScore({ cvDays: 2.0, eventCount: 3, tenderShare: 0 })
assert(hi > 0.7, `tight cadence high confidence (got ${hi})`)
assert(lo < 0.4, `erratic low confidence (got ${lo})`)
assert(hi >= 0 && hi <= 1 && lo >= 0 && lo <= 1, 'confidence in [0,1]')
console.log('OK verify-recurrence')
