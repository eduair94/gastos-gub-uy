/**
 * Daily deadline reminders (Phase 2): for each saved call with a reminder set,
 * email the user N days before the reception deadline (once). `reminderSentAt`
 * guards against re-sending; the notification `dedupeKey` is a second guard.
 *
 * Run:  npx tsx src/jobs/deadline-reminders.ts
 */
import { connectToDatabase, disconnectFromDatabase } from "../../shared/connection/database";
import { SavedCallModel } from "../../shared/models/saved_call";
import { OpenCallModel } from "../../shared/models/open_call";
import { UserModel } from "../../shared/models/user";
import { NotificationModel } from "../../shared/models/notification";
import type { IOpenCall, IUser, OpenCallStatus } from "../../shared/types/monitor";
import { createMailer } from "../services/mailer";
import { renderReminderEmail } from "../emails/templates";
import type { Locale } from "../emails/templates";
import { appBaseUrl, toEmailCall, unsubscribeUrl } from "./alerts/dispatch";

const DAY_MS = 86_400_000;
const LIVE: OpenCallStatus[] = ["open", "clarification", "amended"];

async function main(): Promise<void> {
  const log = (m: string) => console.log(`[deadline-reminders] ${m}`);
  await connectToDatabase();
  const now = new Date();
  const mailer = createMailer();

  const saved = await SavedCallModel.find({
    reminderDaysBefore: { $gt: 0 },
    reminderSentAt: { $exists: false },
  }).lean();
  if (!saved.length) {
    log("no saved calls awaiting a reminder");
    await finish();
    return;
  }

  const compraIds = [...new Set(saved.map(s => s.compraId))];
  const calls = await OpenCallModel.find({ compraId: { $in: compraIds } })
    .select("compraId title buyer procurementMethodDetails tenderPeriod status")
    .lean();
  const callMap = new Map(calls.map(c => [c.compraId, c as unknown as IOpenCall]));

  interface Eligible { savedId: unknown; userId: string; compraId: string; daysBefore: number; call: IOpenCall }
  const eligible: Eligible[] = [];
  for (const s of saved) {
    const call = callMap.get(s.compraId);
    if (!call || !LIVE.includes(call.status)) continue;
    const end = call.tenderPeriod?.endDate ? new Date(call.tenderPeriod.endDate) : undefined;
    if (!end) continue;
    const daysUntil = Math.ceil((end.getTime() - now.getTime()) / DAY_MS);
    if (daysUntil < 0 || daysUntil > (s.reminderDaysBefore ?? 0)) continue;
    eligible.push({ savedId: s._id, userId: s.userId, compraId: s.compraId, daysBefore: s.reminderDaysBefore ?? 0, call });
  }

  if (!eligible.length) {
    log("no reminders due today");
    await finish();
    return;
  }

  const users = await UserModel.find({ uid: { $in: [...new Set(eligible.map(e => e.userId))] } }).lean();
  const userMap = new Map(users.map(u => [u.uid, u as unknown as IUser]));

  let sent = 0;
  for (const e of eligible) {
    const user = userMap.get(e.userId);
    if (!user || user.status !== "active" || !user.notificationPrefs?.enabled || !user.emailVerified) continue;

    const dedupeKey = `reminder:${e.userId}:${e.compraId}`;
    await NotificationModel.updateOne(
      { dedupeKey },
      {
        $setOnInsert: {
          type: "reminder",
          userId: e.userId,
          compraId: e.compraId,
          dedupeKey,
          channel: "email",
          status: "pending",
          attempts: 0,
          scheduledFor: now,
        },
      },
      { upsert: true },
    );

    const email = renderReminderEmail({
      call: toEmailCall(e.call),
      daysBefore: e.daysBefore,
      appBaseUrl: appBaseUrl(),
      unsubscribeUrl: unsubscribeUrl(user.unsubscribeToken),
      locale: (user.locale as Locale) ?? "es",
    });

    const result = await mailer.send({
      to: user.email,
      subject: email.subject,
      html: email.html,
      text: email.text,
      headers: {
        "List-Unsubscribe": `<${unsubscribeUrl(user.unsubscribeToken)}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });

    if (result.ok || result.skipped) {
      await NotificationModel.updateOne({ dedupeKey }, { $set: { status: "sent", sentAt: new Date() } });
      await SavedCallModel.updateOne({ _id: e.savedId }, { $set: { reminderSentAt: now } });
      if (result.ok) sent++;
    } else {
      await NotificationModel.updateOne({ dedupeKey }, { $inc: { attempts: 1 }, $set: { lastError: result.error ?? "unknown" } });
    }
  }

  log(`reminders complete: ${sent} sent of ${eligible.length} due`);
  await finish();
}

async function finish(): Promise<void> {
  await disconnectFromDatabase().catch(() => {});
}

main()
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error("[deadline-reminders] failed:", err);
    await finish();
    process.exit(1);
  });
