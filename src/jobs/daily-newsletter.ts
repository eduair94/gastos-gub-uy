/**
 * La edición diaria del newsletter.
 *
 *   npm run daily-newsletter
 *   npm run daily-newsletter -- --dry-run
 *   npm run daily-newsletter -- --day=2026-08-17 --skip-delivery
 *
 * NO MANDA UN CORREO VACÍO. Si el motor de notas no publicó nada ese día, el trabajo termina
 * sin crear edición. Un correo diario que algunos días no trae nada entrena al lector a
 * ignorarlo, y eso cuesta más que saltear un día.
 *
 * A QUIÉN LE LLEGA. A los suscriptos con cadencia diaria, que tras la migración son todos.
 * El que la bajó a semanal queda fuera de este envío y sigue recibiendo el del lunes.
 *
 * La cola de entrega, el token de baja y los reintentos son los MISMOS del semanal
 * (`newsletter_deliveries`). Acá no se reimplementa nada de eso.
 */
import { connectToDatabase, disconnectFromDatabase } from "../../shared/connection/database";
import { AnomalyModel } from "../../shared/models/anomaly";
import { DailyInvestigationModel } from "../../shared/models/daily_investigation";
import { NewsletterDailyIssueModel } from "../../shared/models/newsletter_daily_issue";
import type { INewsletterDailyIssue } from "../../shared/models/newsletter_daily_issue";
import { NewsletterDeliveryModel } from "../../shared/models/newsletter_delivery";
import { PushSubscriptionModel } from "../../shared/models/push_subscription";
import { ReleaseModel } from "../../shared/models/release";
import { UserModel } from "../../shared/models/user";
import { resolveChannels } from "../../shared/alerts/channels";
import { dailyListUnsubscribeHeaders, renderDailyMail } from "../../shared/newsletter/daily";
import { createMailer } from "../services/mailer";
import { createPusher, isPushConfigured } from "../services/webpush";

process.env.MONGO_SOCKET_TIMEOUT_MS = process.env.MONGO_SOCKET_TIMEOUT_MS ?? "180000";

const MAX_PLAUSIBLE_UYU = Number(process.env.ANALYTICS_MAX_RELEASE_UYU || 50_000_000_000);
const DELIVERY_MAX_ATTEMPTS = 3;
const URUGUAY_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

interface Args { dryRun: boolean; force: boolean; skipDelivery: boolean; day?: string | undefined }

function parseArgs(argv: string[]): Args {
  const dayArg = argv.find(a => a.startsWith("--day="))?.slice("--day=".length);
  return {
    dryRun: argv.includes("--dry-run"),
    force: argv.includes("--force"),
    skipDelivery: argv.includes("--skip-delivery"),
    ...(dayArg ? { day: dayArg } : {}),
  };
}

function uruguayDayKey(d: Date): string {
  return new Date(d.getTime() - URUGUAY_OFFSET_MS).toISOString().slice(0, 10);
}

/** El día uruguayo completo que la edición cubre: de 00:00 a 24:00 local. */
function dayBounds(dayKey: string): { start: Date; end: Date } {
  const start = new Date(`${dayKey}T00:00:00.000Z`);
  return { start: new Date(start.getTime() + URUGUAY_OFFSET_MS), end: new Date(start.getTime() + URUGUAY_OFFSET_MS + DAY_MS) };
}

function appBaseUrl(): string {
  return (process.env.APP_BASE_URL || "http://localhost:3600").replace(/\/+$/, "");
}

function clean(value: unknown, fallback: string): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text || fallback;
}

async function loadTopExpenses(start: Date, end: Date) {
  const rows = await ReleaseModel.aggregate<Record<string, any>>([
    {
      $match: {
        tag: "award",
        date: { $gte: start, $lt: end },
        "amount.hasAmounts": true,
        "amount.primaryAmount": { $gt: 0, $lte: MAX_PLAUSIBLE_UYU },
      },
    },
    { $sort: { date: -1, _id: -1 } },
    { $group: { _id: "$ocid", doc: { $first: "$$ROOT" } } },
    { $replaceWith: "$doc" },
    {
      $facet: {
        top: [
          { $sort: { "amount.primaryAmount": -1 } },
          { $limit: 5 },
          { $project: { ocid: 1, "tender.title": 1, "buyer.name": 1, "awards.title": 1, "awards.suppliers.name": 1, "awards.items.description": 1, "amount.primaryAmount": 1 } },
        ],
        summary: [{ $group: { _id: null, count: { $sum: 1 }, total: { $sum: "$amount.primaryAmount" } } }],
      },
    },
  ]).allowDiskUse(true);

  const facet = rows[0] ?? {};
  const topExpenses = (facet.top ?? []).map((doc: Record<string, any>, i: number) => {
    const award = (doc.awards ?? []).find((a: Record<string, any>) => a.title?.trim()) ?? doc.awards?.[0];
    return {
      rank: i + 1,
      ocid: String(doc.ocid ?? ""),
      title: clean(award?.title || doc.tender?.title || award?.items?.[0]?.description, `Adjudicación ${doc.ocid}`).slice(0, 180),
      ...(doc.buyer?.name ? { buyerName: String(doc.buyer.name) } : {}),
      supplierNames: [...new Set(((doc.awards ?? []).flatMap((a: Record<string, any>) => a.suppliers ?? []) as Array<Record<string, any>>).map(s => String(s.name ?? "")).filter(Boolean))].slice(0, 5) as string[],
      amountUyu: Number(doc.amount?.primaryAmount ?? 0),
    };
  });
  const summary = facet.summary?.[0];
  return { topExpenses, eligibleExpenseCount: summary?.count ?? 0, totalAmountUyu: summary?.total ?? 0 };
}

/** Los suscriptos que reciben el diario: cadencia diaria, o sin campo (migración pendiente). */
function dailyAudienceFilter() {
  return {
    status: "active",
    "newsletter.subscribed": true,
    $or: [{ "newsletter.frequency": "daily" }, { "newsletter.frequency": { $exists: false } }],
  };
}

async function enqueueDeliveries(issue: INewsletterDailyIssue): Promise<number> {
  if (issue.deliveryEnqueuedAt) return 0;
  const users = await UserModel.find(dailyAudienceFilter())
    .select("uid email emailVerified notificationPrefs")
    .lean();

  const operations: Array<Record<string, unknown>> = [];
  for (const user of users) {
    if (user.emailVerified && user.email) {
      operations.push({
        updateOne: {
          filter: { issueId: String(issue._id), userId: user.uid, channel: "email" },
          update: { $setOnInsert: { issueId: String(issue._id), userId: user.uid, channel: "email", status: "pending", attempts: 0 } },
          upsert: true,
        },
      });
    }
    const channels = resolveChannels(user);
    if (user.notificationPrefs?.enabled && channels.push) {
      operations.push({
        updateOne: {
          filter: { issueId: String(issue._id), userId: user.uid, channel: "push" },
          update: { $setOnInsert: { issueId: String(issue._id), userId: user.uid, channel: "push", status: "pending", attempts: 0 } },
          upsert: true,
        },
      });
    }
  }
  if (operations.length) await NewsletterDeliveryModel.bulkWrite(operations as never[], { ordered: false });
  await NewsletterDailyIssueModel.updateOne(
    { _id: issue._id, deliveryEnqueuedAt: { $exists: false } },
    { $set: { deliveryEnqueuedAt: new Date() } },
  );
  return operations.length;
}

async function dispatchEmail(issue: INewsletterDailyIssue): Promise<{ sent: number; failed: number; skipped: number }> {
  const deliveries = await NewsletterDeliveryModel.find({
    issueId: String(issue._id),
    channel: "email",
    status: "pending",
    attempts: { $lt: DELIVERY_MAX_ATTEMPTS },
  }).lean();
  if (!deliveries.length) return { sent: 0, failed: 0, skipped: 0 };

  const users = await UserModel.find({ uid: { $in: deliveries.map(d => d.userId) } })
    .select("uid email emailVerified status newsletter unsubscribeToken")
    .lean();
  const userMap = new Map(users.map(u => [u.uid, u]));
  const mailer = createMailer();
  let sent = 0; let failed = 0; let skipped = 0;

  for (const delivery of deliveries) {
    const user = userMap.get(delivery.userId);
    // Se re-chequea la cadencia acá: entre el encolado y el envío el usuario pudo bajarla.
    const wantsDaily = (user?.newsletter?.frequency ?? "daily") === "daily";
    if (!user || user.status !== "active" || !user.newsletter?.subscribed || !user.emailVerified || !user.email || !wantsDaily) {
      await NewsletterDeliveryModel.updateOne({ _id: delivery._id }, { $set: { status: "skipped", lastError: "user not eligible for the daily cadence" } });
      skipped++;
      continue;
    }
    const message = renderDailyMail(issue, { appBaseUrl: appBaseUrl(), unsubscribeToken: user.unsubscribeToken });
    const result = await mailer.send({
      to: user.email,
      ...message,
      headers: {
        ...dailyListUnsubscribeHeaders(appBaseUrl(), user.unsubscribeToken),
        "X-Entity-Ref-ID": `daily-${issue.dayKey}-${user.uid}`,
      },
    });
    if (result.ok) {
      await NewsletterDeliveryModel.updateOne({ _id: delivery._id }, { $set: { status: "sent", sentAt: new Date(), ...(result.id ? { providerMessageId: result.id } : {}) }, $inc: { attempts: 1 } });
      sent++;
    } else if (result.skipped) {
      await NewsletterDeliveryModel.updateOne({ _id: delivery._id }, { $set: { status: "skipped", lastError: "email transport not configured" }, $inc: { attempts: 1 } });
      skipped++;
    } else {
      const attempts = delivery.attempts + 1;
      await NewsletterDeliveryModel.updateOne({ _id: delivery._id }, { $set: { status: attempts >= DELIVERY_MAX_ATTEMPTS ? "failed" : "pending", lastError: result.error ?? "email delivery failed" }, $inc: { attempts: 1 } });
      failed++;
    }
  }
  return { sent, failed, skipped };
}

async function dispatchPush(issue: INewsletterDailyIssue): Promise<{ sent: number; skipped: number }> {
  const deliveries = await NewsletterDeliveryModel.find({
    issueId: String(issue._id), channel: "push", status: "pending", attempts: { $lt: DELIVERY_MAX_ATTEMPTS },
  }).lean();
  if (!deliveries.length) return { sent: 0, skipped: 0 };
  if (!isPushConfigured()) {
    await NewsletterDeliveryModel.updateMany(
      { _id: { $in: deliveries.map(d => d._id) } },
      { $set: { status: "skipped", lastError: "push transport not configured" } },
    );
    return { sent: 0, skipped: deliveries.length };
  }

  const subs = await PushSubscriptionModel.find({ userId: { $in: deliveries.map(d => d.userId) }, active: true }).lean();
  const byUser = new Map<string, typeof subs>();
  for (const s of subs) {
    const list = byUser.get(s.userId) ?? [];
    list.push(s);
    byUser.set(s.userId, list);
  }
  const pusher = createPusher();
  const payload = JSON.stringify({
    title: issue.title,
    body: issue.excerpt,
    url: issue.notes[0] ? `/investigaciones/diario/${issue.notes[0].slug}` : `/blog/${issue.slug}`,
    tag: `daily-${issue.dayKey}`,
  });
  let sent = 0; let skipped = 0;
  for (const delivery of deliveries) {
    const targets = byUser.get(delivery.userId) ?? [];
    if (!targets.length) {
      await NewsletterDeliveryModel.updateOne({ _id: delivery._id }, { $set: { status: "skipped", lastError: "no active device" } });
      skipped++;
      continue;
    }
    let anyOk = false;
    for (const target of targets) {
      const result = await pusher.send({ endpoint: target.endpoint, keys: target.keys }, payload);
      if (result.ok) anyOk = true;
      else if (result.gone) await PushSubscriptionModel.updateOne({ _id: target._id }, { $set: { active: false } });
    }
    await NewsletterDeliveryModel.updateOne(
      { _id: delivery._id },
      { $set: anyOk ? { status: "sent", sentAt: new Date() } : { status: "skipped", lastError: "push delivery failed" }, $inc: { attempts: 1 } },
    );
    if (anyOk) sent++; else skipped++;
  }
  return { sent, skipped };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const dayKey = args.day ?? uruguayDayKey(new Date());
  const { start, end } = dayBounds(dayKey);
  await connectToDatabase();

  let issue = await NewsletterDailyIssueModel.findOne({ dayKey }).lean();
  if (!issue || args.force) {
    const notes = await DailyInvestigationModel.find({ dayKey, status: "published" })
      .sort({ amountUyu: -1 })
      .lean() as unknown as Array<Record<string, any>>;

    // Sin nota no hay edición. Un correo vacío entrena a ignorar el correo.
    if (!notes.length) {
      console.log(`DAILY_NEWSLETTER_SUMMARY day=${dayKey} issue=none reason=sin-notas-publicadas`);
      return;
    }

    const [{ topExpenses, eligibleExpenseCount, totalAmountUyu }, newAnomalies] = await Promise.all([
      loadTopExpenses(start, end),
      AnomalyModel.countDocuments({ firstDetectedAt: { $gte: start, $lt: end } }),
    ]);

    const lead = notes[0]!;
    const payload = {
      dayKey,
      slug: `diario-${dayKey}`,
      locale: "es" as const,
      status: "published" as const,
      title: String(lead.es?.title ?? `Con la tuya, contribuyente — ${dayKey}`).slice(0, 160),
      excerpt: String(lead.es?.dek ?? "").slice(0, 300),
      periodStart: start,
      periodEnd: end,
      publishedAt: new Date(),
      notes: notes.map(nte => ({
        slug: String(nte.slug),
        title: String(nte.es?.title ?? ""),
        dek: String(nte.es?.dek ?? ""),
        lane: String(nte.lane ?? ""),
        subjectLabel: String(nte.subjectLabel ?? ""),
        amountUyu: Number(nte.amountUyu ?? 0),
        measured: String(nte.es?.measured ?? ""),
      })),
      topExpenses,
      eligibleExpenseCount,
      totalAmountUyu,
      newAnomalies,
    };

    if (args.dryRun) {
      console.log(JSON.stringify({ dryRun: true, ...payload, topExpenses: topExpenses.slice(0, 2) }, null, 2));
      return;
    }
    issue = await NewsletterDailyIssueModel.findOneAndUpdate(
      { dayKey },
      { $set: payload, ...(args.force ? { $unset: { deliveryEnqueuedAt: 1 } } : {}) },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();
  }

  if (!issue) throw new Error(`No se pudo crear la edición ${dayKey}`);
  if (args.dryRun || args.skipDelivery) {
    console.log(`DAILY_NEWSLETTER_SUMMARY day=${dayKey} issue=${issue.slug} delivery=skipped`);
    return;
  }

  const hydrated = await NewsletterDailyIssueModel.findById(issue._id);
  if (!hydrated) throw new Error(`La edición ${dayKey} desapareció antes del envío`);
  const enqueued = await enqueueDeliveries(hydrated);
  const [email, push] = await Promise.all([dispatchEmail(hydrated), dispatchPush(hydrated)]);
  console.log(`DAILY_NEWSLETTER_SUMMARY day=${dayKey} issue=${issue.slug} notes=${hydrated.notes.length} enqueued=${enqueued} emailSent=${email.sent} emailFailed=${email.failed} pushSent=${push.sent}`);
}

main()
  .catch((error) => {
    console.error("[daily-newsletter]", error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectFromDatabase().catch(() => undefined);
  });
