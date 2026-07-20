// Pure display clamp for an expectedWindow {start, end}. The recurrence math
// (shared/forecast/recurrence.ts) centers the window on `lastEventDate +
// medianDays`, ± a dispersion clamped up to MAX_DISP_DAYS (180 days). For an
// OVERDUE buyer (its cadence already elapsed), `start` lands in the past
// while `end` is still ahead — rendering that raw range produces a ~12-month
// span that visibly begins before today ("ago. 2025 – ago. 2026"), which
// reads as nonsense to a citizen reading a forecast. This never drops the
// row (overdue == most actionable signal), it only clamps what's *displayed*.
//
// Reused by both app/pages/analytics/anticipacion.vue and, later, Fase-2
// alert cards, so the clamp is defined once here rather than re-derived per
// caller.
export interface EffectiveWindow {
  start: Date;
  end: Date;
  overdue: boolean;
}

function toDate(v: Date | string): Date {
  // Clone rather than alias a passed-in Date, so callers can never mutate our
  // input through the returned value (and vice versa).
  return v instanceof Date ? new Date(v.getTime()) : new Date(v);
}

/**
 * Clamp an expectedWindow for display.
 * - overdue = the predicted window already began (start < now).
 * - effStart = max(start, now), but never past end: if now has somehow
 *   already passed end too (shouldn't happen given the read endpoint's own
 *   `expectedWindow.end >= now` filter, but this is a pure fn — guard it
 *   anyway), collapse to start = end rather than emit an inverted range.
 * - Invalid input (unparseable date string) never throws: returns the
 *   coerced (possibly `Invalid Date`) start/end unchanged with overdue=false,
 *   the same "don't guess, don't crash" contract the rest of this feature's
 *   pure math follows.
 */
export function effectiveWindow(start: Date | string, end: Date | string, now: Date | string): EffectiveWindow {
  const s = toDate(start);
  const e = toDate(end);
  const n = toDate(now);

  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || Number.isNaN(n.getTime())) {
    return { start: s, end: e, overdue: false };
  }

  const overdue = s.getTime() < n.getTime();
  if (!overdue) return { start: s, end: e, overdue: false };

  const effStart = n.getTime() > e.getTime() ? e : n;
  return { start: effStart, end: e, overdue: true };
}
