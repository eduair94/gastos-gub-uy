/**
 * Telegram dispatch: drain pending `channel:'telegram'` alert notifications and
 * deliver a rich HTML message (with "Ver llamado" / "Ver pliego" buttons) to the
 * user's linked chat. Instant only. Mirrors the retry accounting; a 403 (user
 * blocked the bot) deactivates the link so it stops being retried.
 */
import { NotificationModel } from "../../../shared/models/notification";
import { OpenCallModel } from "../../../shared/models/open_call";
import { UserModel } from "../../../shared/models/user";
import type { IOpenCall } from "../../../shared/types/monitor";
import type { Locale } from "../../../shared/alerts/build-alert-content";
import { buildAlertCard, renderTelegramHtml } from "../../../shared/alerts/build-alert-content";
import type { TelegramButton } from "../../services/telegram";
import { createTelegram, isTelegramConfigured } from "../../services/telegram";
import { appBaseUrl, EMAIL_CALL_SELECT, MAX_ATTEMPTS } from "./dispatch";

export interface TelegramDispatchResult {
  notifications: number;
  sent: number;
  failed: number;
  unlinked: number;
}

export async function dispatchTelegram(options?: { log?: (m: string) => void }): Promise<TelegramDispatchResult> {
  const log = options?.log ?? (() => {});
  const pending = await NotificationModel.find({ type: "alert", channel: "telegram", status: "pending" }).lean();
  if (!pending.length) return { notifications: 0, sent: 0, failed: 0, unlinked: 0 };

  if (!isTelegramConfigured()) {
    await NotificationModel.updateMany(
      { _id: { $in: pending.map(n => n._id) } },
      { $set: { status: "skipped", lastError: "telegram not configured" } },
    );
    log(`telegram: not configured — skipped ${pending.length}`);
    return { notifications: pending.length, sent: 0, failed: 0, unlinked: 0 };
  }

  const bot = createTelegram();

  const byUser = new Map<string, typeof pending>();
  for (const n of pending) {
    const arr = byUser.get(n.userId) ?? [];
    arr.push(n);
    byUser.set(n.userId, arr);
  }

  const users = await UserModel.find({ uid: { $in: [...byUser.keys()] } }).lean();
  const userMap = new Map(users.map(u => [u.uid, u]));

  let sent = 0;
  let failed = 0;
  let unlinked = 0;

  const viewCall = (l: Locale) => (l === "en" ? "View tender" : "Ver llamado");
  const viewPliego = (l: Locale) => (l === "en" ? "View documents" : "Ver pliego");

  for (const [uid, notifs] of byUser) {
    const user = userMap.get(uid);
    const ids = notifs.map(n => n._id);
    if (!user || user.status !== "active" || !user.notificationPrefs?.enabled) {
      await NotificationModel.updateMany({ _id: { $in: ids } }, { $set: { status: "skipped", lastError: "user opted out" } });
      continue;
    }
    const chatId = user.telegram?.active ? user.telegram.chatId : null;
    if (!chatId) {
      await NotificationModel.updateMany({ _id: { $in: ids } }, { $set: { status: "skipped", lastError: "no linked chat" } });
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
      const buttons: TelegramButton[] = [{ text: viewCall(locale), url: card.url }];
      if (card.pliegoUrl) buttons.push({ text: viewPliego(locale), url: card.pliegoUrl });

      const r = await bot.sendMessage({ chatId, html: renderTelegramHtml(card, locale), buttons });

      if (r.ok) {
        await NotificationModel.updateOne({ _id: n._id }, { $set: { status: "sent", sentAt: new Date() } });
        sent++;
      } else if (r.blocked) {
        // User blocked the bot — deactivate the link and skip the rest for this user.
        await UserModel.updateOne({ uid }, { $set: { "telegram.active": false } });
        unlinked++;
        await NotificationModel.updateMany({ _id: { $in: ids } }, { $set: { status: "skipped", lastError: "bot blocked" } });
        break;
      } else {
        await NotificationModel.updateOne({ _id: n._id }, { $inc: { attempts: 1 }, $set: { lastError: r.error ?? "telegram failure" } });
        await NotificationModel.updateOne({ _id: n._id, attempts: { $gte: MAX_ATTEMPTS } }, { $set: { status: "failed" } });
        failed++;
      }
    }
  }

  log(`telegram: ${sent} sent, ${failed} failed, ${unlinked} links deactivated`);
  return { notifications: pending.length, sent, failed, unlinked };
}
