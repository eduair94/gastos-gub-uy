#!/usr/bin/env tsx
import { effectiveWindow } from '../../shared/forecast/window-display'

function assert(c: unknown, m: string) { if (!c) throw new Error(`FAIL: ${m}`) }
const DAY_MS = 86_400_000

const now = new Date(Date.UTC(2026, 6, 19)) // 2026-07-19, matches the reported bug's "today"

// 1. Fully-future window (start > now) → returned unchanged, overdue=false.
{
  const start = new Date(now.getTime() + 30 * DAY_MS)
  const end = new Date(now.getTime() + 60 * DAY_MS)
  const w = effectiveWindow(start, end, now)
  assert(w.start.getTime() === start.getTime(), `future window: start unchanged (got ${w.start.toISOString()})`)
  assert(w.end.getTime() === end.getTime(), 'future window: end unchanged')
  assert(w.overdue === false, 'future window: overdue=false')
}

// 2. Overdue window (start < now < end) → start clamps to now, end unchanged,
//    overdue=true. This is the assertion that would FAIL against a wrong
//    implementation that just returns the raw start (the exact bug being
//    fixed: "ago. 2025 – ago. 2026" rendered with a start before today).
{
  const start = new Date(Date.UTC(2025, 7, 1)) // ago. 2025
  const end = new Date(Date.UTC(2026, 7, 1))   // ago. 2026
  const w = effectiveWindow(start, end, now)
  assert(w.overdue === true, 'overdue window: overdue=true')
  assert(w.start.getTime() === now.getTime(), `overdue window: start clamps to now (got ${w.start.toISOString()}, want ${now.toISOString()})`)
  assert(w.start.getTime() !== start.getTime(), 'overdue window: start must NOT equal the raw (past) start')
  assert(w.end.getTime() === end.getTime(), 'overdue window: end unchanged')
}

// 3. Degenerate: now already past end (shouldn't occur given the endpoint's
//    own expectedWindow.end >= now filter, but the fn must guard it anyway)
//    → start collapses to end, no throw, no inverted range.
{
  const start = new Date(Date.UTC(2025, 0, 1))
  const end = new Date(Date.UTC(2025, 5, 1))
  const nowLate = new Date(Date.UTC(2026, 0, 1)) // past both start and end
  const w = effectiveWindow(start, end, nowLate)
  assert(w.start.getTime() === w.end.getTime(), `degenerate: start === end (got start=${w.start.toISOString()}, end=${w.end.toISOString()})`)
  assert(w.start.getTime() === end.getTime(), 'degenerate: collapsed to end, not some other value')
  assert(w.overdue === true, 'degenerate: still overdue (start was before now)')
}

// 4. String inputs (ISO), overdue case — the API serializes dates as ISO
//    strings, so this must clamp identically to the Date-object case above.
{
  const w = effectiveWindow('2025-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z', now.toISOString())
  assert(w.overdue === true, 'ISO-string overdue: overdue=true')
  assert(w.start.getTime() === now.getTime(), `ISO-string overdue: start clamps to now (got ${w.start.toISOString()})`)
  assert(w.end.getTime() === new Date('2026-08-01T00:00:00.000Z').getTime(), 'ISO-string overdue: end unchanged')
}

// 5. Invalid date string → never throws, overdue=false.
{
  let threw = false
  let w: ReturnType<typeof effectiveWindow> | undefined
  try {
    w = effectiveWindow('not-a-date', now, now)
  }
  catch {
    threw = true
  }
  assert(!threw, 'invalid start string must not throw')
  assert(w !== undefined && w.overdue === false, 'invalid start string: overdue=false')
}

// 6. No mutation of caller-supplied Date inputs.
{
  const start = new Date(Date.UTC(2025, 7, 1))
  const end = new Date(Date.UTC(2026, 7, 1))
  const startBefore = start.getTime()
  const endBefore = end.getTime()
  effectiveWindow(start, end, now)
  assert(start.getTime() === startBefore, 'input start Date must not be mutated')
  assert(end.getTime() === endBefore, 'input end Date must not be mutated')
}

console.log('OK verify-window-display')
