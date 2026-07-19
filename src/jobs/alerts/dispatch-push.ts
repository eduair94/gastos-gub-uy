/**
 * Push dispatch: drain pending `channel:'push'` alert notifications and deliver a
 * compact Web Push to each of the user's active devices. Instant only (runs at the
 * tail of the hourly sync). Mirrors the email dispatcher's retry accounting:
 * transient failures leave the row pending until MAX_ATTEMPTS; a dead subscription
 * (404/410) is deactivated so it stops being retried.
 */
import { NotificationModel } from "../../../shared/models/notification";
import { OpenCallModel } from "../../../shared/models/open_call";
import { UserModel } from "../../../shared/models/user";
import { PushSubscriptionModel } from "../../../shared/models/push_subscription";
import type { IOpenCall } from "../../../shared/types/monitor";
import type { Locale } from "../../../shared/alerts/build-alert-content";
import { buildAlertCard, renderPushPayload } from "../../../shared/alerts/build-alert-content";
import { createPusher, isPushConfigured } from "../../services/webpush";
import { appBaseUrl, EMAIL_CALL_SELECT, MAX_ATTEMPTS } from "./dispatch";

export interface PushDispatchResult {
  notifications: number;
  pushed: number;
  failed: number;
  deactivated: number;
}

export async function dispatchPush(options?: { log?: (m: string) => void }): Promise<PushDispatchResult> {
  const log = options?.log ?? (() => {});
  const pending = await NotificationModel.find({ type: "alert", channel: "push", status: "pending" }).lean();
  if (!pending.length) return { notifications: 0, pushed: 0, failed: 0, deactivated: 0 };

  // Not configured → mark the queued rows skipped (a push subscription can't exist
  // without the public key, so this is defensive) and stop.
  if (!isPushConfigured()) {
    await NotificationModel.updateMany(
      { _id: { $in: pending.map(n => n._id) } },
      { $set: { status: "skipped", lastError: "push not configured" } },
    );
    log(`push: not configured — skipped ${pending.length}`);
    return { notifications: pending.length, pushed: 0, failed: 0, deactivated: 0 };
  }

  const pusher = createPusher();

  const byUser = new Map<string, typeof pending>();
  for (const n of pending) {
    const arr = byUser.get(n.userId) ?? [];
    arr.push(n);
    byUser.set(n.userId, arr);
  }

  const users = await UserModel.find({ uid: { $in: [...byUser.keys()] } }).lean();
  const userMap = new Map(users.map(u => [u.uid, u]));

  let pushed = 0;
  let failed = 0;
  let deactivated = 0;

  for (const [uid, notifs] of byUser) {
    const user = userMap.get(uid);
    const ids = notifs.map(n => n._id);
    if (!user || user.status !== "active" || !user.notificationPrefs?.enabled) {
      await NotificationModel.updateMany({ _id: { $in: ids } }, { $set: { status: "skipped", lastError: "user opted out" } });
      continue;
    }

    const subs = await PushSubscriptionModel.find({ userId: uid, active: true }).lean();
    if (!subs.length) {
      await NotificationModel.updateMany({ _id: { $in: ids } }, { $set: { status: "skipped", lastError: "no active devices" } });
      continue;
    }

    const compraIds = notifs.map(n => n.compraId);
    const calls = await OpenCallModel.find({ compraId: { $in: compraIds } }).select(EMAIL_CALL_SELECT).lean();
    const callMap = new Map(calls.map(c => [c.compraId, c as unknown as IOpenCall]));
    const locale = (user.locale as Locale) ?? "es";

    for (const n of notifs) {
      const call = callMap.get(n.compraId);
      if (!call) {
        await NotificationModel.updateOne({ _id: n._id }, { $set: { status: "skipped", lastError: "call not found" } });
        continue;
      }
      const card = buildAlertCard(call, { appBaseUrl: appBaseUrl(), matchedOn: n.matchedOn });
      const payload = JSON.stringify(renderPushPayload(card, locale));

      let anyOk = false;
      let anyTransient = false;
      for (const sub of subs) {
        const r = await pusher.send({ endpoint: sub.endpoint, keys: sub.keys }, payload);
        if (r.ok) {
          anyOk = true;
          await PushSubscriptionModel.updateOne({ _id: sub._id }, { $set: { lastSuccessAt: new Date(), failureCount: 0 } });
        } else if (r.gone) {
          await PushSubscriptionModel.updateOne({ _id: sub._id }, { $set: { active: false } });
          deactivated++;
        } else {
          anyTransient = true;
          await PushSubscriptionModel.updateOne({ _id: sub._id }, { $inc: { failureCount: 1 } });
        }
      }

      if (anyOk) {
        await NotificationModel.updateOne({ _id: n._id }, { $set: { status: "sent", sentAt: new Date() } });
        pushed++;
      } else if (anyTransient) {
        await NotificationModel.updateOne({ _id: n._id }, { $inc: { attempts: 1 }, $set: { lastError: "push transient failure" } });
        await NotificationModel.updateOne({ _id: n._id, attempts: { $gte: MAX_ATTEMPTS } }, { $set: { status: "failed" } });
        failed++;
      } else {
        // Every target was dead — nothing left to deliver to.
        await NotificationModel.updateOne({ _id: n._id }, { $set: { status: "skipped", lastError: "all devices gone" } });
      }
    }
  }

  log(`push: ${pushed} pushed, ${failed} failed, ${deactivated} subscriptions deactivated`);
  return { notifications: pending.length, pushed, failed, deactivated };
}
