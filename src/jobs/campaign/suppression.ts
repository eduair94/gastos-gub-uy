import { EmailSuppressionModel } from "../../../shared/models/email_suppression";
import type { SuppressionReason } from "../../../shared/models/email_suppression";

const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
export function normalizeSuppressEmail(raw: string): string | null {
  const e = (raw ?? "").trim().toLowerCase();
  return EMAIL_RE.test(e) ? e : null;
}
export async function isSuppressed(email: string): Promise<boolean> {
  const e = normalizeSuppressEmail(email); if (!e) return true; // unusable = treat as suppressed
  return !!(await EmailSuppressionModel.exists({ email: e }));
}
export async function suppress(email: string, reason: SuppressionReason, source: string): Promise<void> {
  const e = normalizeSuppressEmail(email); if (!e) return;
  await EmailSuppressionModel.updateOne({ email: e }, { $setOnInsert: { email: e, reason, source, at: new Date() } }, { upsert: true });
}

/**
 * PURE. The batch form of the suppression gate: split rows into sendable and
 * suppressed in one pass, given a set of ALREADY-NORMALIZED suppressed emails.
 * A row is suppressed if its email is unusable (fails normalization) OR present
 * in the set — the same "unusable = suppressed" rule as `isSuppressed`. Lets a
 * dispatch batch replace one `exists()` per recipient with a single `$in` query
 * (see `fetchSuppressedSet`) plus this local partition.
 */
export function partitionBySuppression<T extends { email: string }>(
  rows: T[],
  suppressed: Set<string>,
): { sendable: T[]; suppressed: T[] } {
  const sendable: T[] = [];
  const blocked: T[] = [];
  for (const row of rows) {
    const e = normalizeSuppressEmail(row.email);
    if (!e || suppressed.has(e)) blocked.push(row);
    else sendable.push(row);
  }
  return { sendable, suppressed: blocked };
}

/**
 * Batch lookup: the (normalized) subset of `emails` that are currently
 * suppressed — one `$in` query for the whole batch instead of an `exists()`
 * per recipient. Feed the result to `partitionBySuppression`.
 */
export async function fetchSuppressedSet(emails: string[]): Promise<Set<string>> {
  const normalized = [...new Set(
    emails.map((e) => normalizeSuppressEmail(e)).filter((e): e is string => !!e),
  )];
  if (!normalized.length) return new Set();
  const docs = await EmailSuppressionModel.find({ email: { $in: normalized } }).select("email").lean();
  return new Set(docs.map((d) => d.email));
}
