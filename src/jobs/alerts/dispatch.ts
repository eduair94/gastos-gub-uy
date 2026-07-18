/**
 * Alert dispatch: turn pending `alert` notifications into batched emails, one per
 * user per run. Instant users are dispatched at the tail of the hourly sync; daily
 * users are handled by the digest job (same code, different frequency filter).
 */
import { NotificationModel } from "../../../shared/models/notification";
import { OpenCallModel } from "../../../shared/models/open_call";
import { UserModel } from "../../../shared/models/user";
import type { IOpenCall, IUser, NotificationFrequency } from "../../../shared/types/monitor";
import { createMailer } from "../../services/mailer";
import { renderAlertEmail } from "../../emails/templates";
import type { EmailCall, Locale } from "../../emails/templates";

export const MAX_ATTEMPTS = 5;

export function appBaseUrl(): string {
  return (process.env.APP_BASE_URL || "http://localhost:3600").replace(/\/+$/, "");
}

export function unsubscribeUrl(token: string): string {
  return `${appBaseUrl()}/unsubscribe?token=${encodeURIComponent(token)}`;
}

export function callUrl(compraId: string): string {
  return `${appBaseUrl()}/llamados/${encodeURIComponent(compraId)}`;
}

export function toEmailCall(call: Pick<IOpenCall, "compraId" | "title" | "buyer" | "procurementMethodDetails" | "tenderPeriod">): EmailCall {
  return {
    compraId: call.compraId,
    title: call.title,
    buyerName: call.buyer?.name,
    procurementMethodDetails: call.procurementMethodDetails,
    endDate: call.tenderPeriod?.endDate,
    url: callUrl(call.compraId),
  };
}

function listUnsubHeaders(token: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<${unsubscribeUrl(token)}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

export interface DispatchResult {
  users: number;
  emailsSent: number;
  notificationsSent: number;
  failed: number;
}

export interface DispatchOptions {
  frequency: NotificationFrequency;
  log?: (m: string) => void;
  now?: Date;
}

/**
 * Groups pending `alert` notifications by user, renders one bundled email each,
 * and marks the notifications sent/failed. Idempotent-ish: a failed send leaves
 * the notifications pending for the next run until MAX_ATTEMPTS.
 */
export async function dispatchAlerts(options: DispatchOptions): Promise<DispatchResult> {
  const log = options.log ?? (() => {});
  const mailer = createMailer();

  const pending = await NotificationModel.find({ type: "alert", status: "pending" }).lean();
  if (!pending.length) return { users: 0, emailsSent: 0, notificationsSent: 0, failed: 0 };

  // Group notifications by user.
  const byUser = new Map<string, typeof pending>();
  for (const n of pending) {
    const arr = byUser.get(n.userId) ?? [];
    arr.push(n);
    byUser.set(n.userId, arr);
  }

  const users = await UserModel.find({ uid: { $in: [...byUser.keys()] } }).lean();
  const userMap = new Map(users.map(u => [u.uid, u as unknown as IUser]));

  let emailsSent = 0;
  let notificationsSent = 0;
  let failed = 0;
  const batchId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  for (const [uid, notifs] of byUser) {
    const user = userMap.get(uid);
    if (!user || user.status !== "active" || !user.notificationPrefs?.enabled || !user.emailVerified) continue;
    if ((user.notificationPrefs.frequency ?? "instant") !== options.frequency) continue;

    const compraIds = notifs.map(n => n.compraId);
    const calls = await OpenCallModel.find({ compraId: { $in: compraIds } })
      .select("compraId title buyer procurementMethodDetails tenderPeriod")
      .lean();
    if (!calls.length) continue;

    const emailCalls = calls.map(c => toEmailCall(c as unknown as IOpenCall));
    const email = renderAlertEmail({
      calls: emailCalls,
      appBaseUrl: appBaseUrl(),
      unsubscribeUrl: unsubscribeUrl(user.unsubscribeToken),
      locale: (user.locale as Locale) ?? "es",
      digest: options.frequency === "daily",
    });

    const result = await mailer.send({
      to: user.email,
      subject: email.subject,
      html: email.html,
      text: email.text,
      headers: listUnsubHeaders(user.unsubscribeToken),
    });

    const ids = notifs.map(n => n._id);
    if (result.ok || result.skipped) {
      await NotificationModel.updateMany(
        { _id: { $in: ids } },
        { $set: { status: "sent", sentAt: new Date(), batchId } },
      );
      if (result.ok) emailsSent++;
      notificationsSent += ids.length;
    } else {
      await NotificationModel.updateMany({ _id: { $in: ids } }, {
        $inc: { attempts: 1 },
        $set: { lastError: result.error ?? "unknown" },
      });
      await NotificationModel.updateMany(
        { _id: { $in: ids }, attempts: { $gte: MAX_ATTEMPTS } },
        { $set: { status: "failed" } },
      );
      failed += ids.length;
    }
  }

  log(`dispatch(${options.frequency}): ${emailsSent} emails, ${notificationsSent} notifications sent, ${failed} failed`);
  return { users: byUser.size, emailsSent, notificationsSent, failed };
}
