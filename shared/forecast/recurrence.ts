import { MIN_DISP_DAYS, MAX_DISP_DAYS } from "./constants";

const DAY_MS = 86_400_000;

export interface CadenceResult {
  medianDays: number;
  cvDays: number;
  seasonalMonths: number[];
  eventCount: number;
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}
function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Dominant month(s) of the year (1..12) — bins holding the max count. */
function dominantMonths(dates: Date[]): number[] {
  const bins = new Array(12).fill(0);
  for (const d of dates) bins[d.getUTCMonth()]++;
  const max = Math.max(...bins);
  if (max === 0) return [];
  const out: number[] = [];
  for (let i = 0; i < 12; i++) if (bins[i] === max) out.push(i + 1);
  return out;
}

/**
 * Cadence over a group's event dates. Dedupes identical timestamps, needs ≥2
 * distinct events to yield intervals. cvDays = stdev/mean of inter-event gaps
 * (0 = perfectly regular; large = erratic).
 */
export function computeCadence(dates: Date[]): CadenceResult | null {
  const ms = dates.map(d => d.getTime()).filter(n => Number.isFinite(n)).sort((a, b) => a - b);
  const uniq = ms.filter((v, i) => i === 0 || v !== ms[i - 1]);
  if (uniq.length < 2) return null;
  const intervals: number[] = [];
  for (let i = 1; i < uniq.length; i++) intervals.push((uniq[i]! - uniq[i - 1]!) / DAY_MS);
  const medianDays = median(intervals);
  const m = mean(intervals);
  const variance = mean(intervals.map(x => (x - m) ** 2));
  const cvDays = m > 0 ? Math.sqrt(variance) / m : 0;
  return {
    medianDays,
    cvDays,
    seasonalMonths: dominantMonths(dates),
    eventCount: uniq.length,
  };
}

/** Expected next window: centered a median after last event, ± clamped dispersion. */
export function expectedWindow(lastEventDate: Date, medianDays: number, cvDays: number): { start: Date; end: Date } {
  const disp = clamp(medianDays * cvDays, MIN_DISP_DAYS, MAX_DISP_DAYS);
  const center = lastEventDate.getTime() + medianDays * DAY_MS;
  return { start: new Date(center - disp * DAY_MS), end: new Date(center + disp * DAY_MS) };
}

/**
 * Confidence in [0,1]. Tight cadence (low CV) dominates; small bonuses for more
 * events and a tender-heavy (competitive, recurring) method mix.
 */
export function confidenceScore(input: { cvDays: number; eventCount: number; tenderShare: number }): number {
  const regularity = 1 / (1 + input.cvDays);            // 1 at CV=0, →0 as CV grows
  const evBonus = clamp((input.eventCount - 3) * 0.03, 0, 0.15);
  const methodBonus = clamp(input.tenderShare * 0.15, 0, 0.15);
  return clamp(regularity * 0.8 + evBonus + methodBonus, 0, 1);
}
