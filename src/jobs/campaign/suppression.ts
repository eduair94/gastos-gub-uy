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
