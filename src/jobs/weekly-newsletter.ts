/**
 * Weekly public-procurement newsletter.
 *
 * One idempotent issue per completed Uruguay week:
 *   1. selects the largest plausible UYU-normalised award releases;
 *   2. computes the anomaly report deterministically from firstDetectedAt;
 *   3. asks Gemini only for bounded interpretation of those supplied facts;
 *   4. publishes the blog issue and drains the email/Web Push delivery outbox.
 *
 * Usage:
 *   npm run weekly-newsletter
 *   npm run weekly-newsletter -- --dry-run
 *   npm run weekly-newsletter -- --week-start=2026-07-20 --skip-delivery
 */
import { AnomalyModel } from "../../shared/models/anomaly";
import { NewsletterDeliveryModel } from "../../shared/models/newsletter_delivery";
import { NewsletterIssueModel } from "../../shared/models/newsletter_issue";
import { PushSubscriptionModel } from "../../shared/models/push_subscription";
import { ReleaseModel } from "../../shared/models/release";
import { TopicContractModel } from "../../shared/models/topic_contract";
import { UserModel } from "../../shared/models/user";
import { callGeminiStructured } from "../../shared/ai/gemini-client";
import type { GeminiSchema } from "../../shared/ai/gemini-client";
import { resolveChannels } from "../../shared/alerts/channels";
import { SPENDING_TOPICS } from "../../shared/spending-topics";
import { connectToDatabase, disconnectFromDatabase } from "../../shared/connection/database";
import {
  newsletterListUnsubscribeHeaders,
  normalizeNewsletterAnalysis,
  previousUruguayWeek,
  renderNewsletterMail,
} from "../../shared/newsletter/weekly";
import type {
  INewsletterAiAnalysis,
  INewsletterAnomalyFinding,
  INewsletterAnomalySummary,
  INewsletterExpense,
  INewsletterIssue,
  INewsletterTopicHighlight,
} from "../../shared/types/newsletter";
import { createMailer } from "../services/mailer";
import { createPusher, isPushConfigured } from "../services/webpush";

const MAX_PLAUSIBLE_UYU = Number(process.env.ANALYTICS_MAX_RELEASE_UYU || 50_000_000_000);
const DELIVERY_MAX_ATTEMPTS = 3;
const URUGUAY_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

interface Args {
  dryRun: boolean;
  force: boolean;
  skipDelivery: boolean;
  weekStart?: string | undefined;
}

interface LeanExpenseRelease {
  id?: string | undefined;
  ocid?: string | undefined;
  date?: Date | undefined;
  tender?: { title?: string | undefined } | undefined;
  buyer?: { name?: string | undefined } | undefined;
  awards?: Array<{
    title?: string | undefined;
    suppliers?: Array<{ name?: string | undefined }> | undefined;
    items?: Array<{ description?: string | undefined; classification?: { description?: string | undefined } | undefined }> | undefined;
  }> | undefined;
  amount?: { primaryAmount?: number | undefined } | undefined;
}

interface ExpenseFacet {
  top?: LeanExpenseRelease[] | undefined;
  summary?: Array<{ count: number; totalAmountUyu: number }> | undefined;
}

function parseArgs(argv: string[]): Args {
  const weekArg = argv.find(arg => arg.startsWith("--week-start="));
  return {
    dryRun: argv.includes("--dry-run"),
    force: argv.includes("--force"),
    skipDelivery: argv.includes("--skip-delivery"),
    ...(weekArg ? { weekStart: weekArg.slice("--week-start=".length) } : {}),
  };
}

function explicitWeek(startDay: string): ReturnType<typeof previousUruguayWeek> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDay)) {
    throw new Error("--week-start must be YYYY-MM-DD");
  }
  const start = new Date(`${startDay}T03:00:00.000Z`);
  if (Number.isNaN(start.getTime())) throw new Error("Invalid --week-start date");
  const local = new Date(start.getTime() - URUGUAY_OFFSET_MS);
  if (local.getUTCDay() !== 1) throw new Error("--week-start must be a Monday in America/Montevideo");
  return {
    start,
    end: new Date(start.getTime() + (7 * DAY_MS)),
    key: startDay,
    slug: `resumen-semanal-${startDay}`,
  };
}

function clean(value: unknown, fallback: string): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text || fallback;
}

function expenseTitle(doc: LeanExpenseRelease): string {
  const award = doc.awards?.find(a => a.title?.trim()) ?? doc.awards?.[0];
  const item = award?.items?.[0];
  return clean(
    award?.title || doc.tender?.title || item?.description || item?.classification?.description,
    `Adjudicación ${doc.ocid ?? doc.id ?? ""}`.trim(),
  );
}

function supplierNames(doc: LeanExpenseRelease): string[] {
  return [...new Set(
    (doc.awards ?? [])
      .flatMap(award => award.suppliers ?? [])
      .map(supplier => supplier.name?.trim())
      .filter((name): name is string => !!name),
  )].slice(0, 8);
}

async function loadExpenses(start: Date, end: Date): Promise<{
  topExpenses: INewsletterExpense[];
  eligibleExpenseCount: number;
  totalAmountUyu: number;
}> {
  const [facet] = await ReleaseModel.aggregate<ExpenseFacet>([
    {
      $match: {
        date: { $gte: start, $lt: end },
        tag: "award",
        "amount.hasAmounts": true,
        "amount.primaryAmount": { $gt: 0, $lte: MAX_PLAUSIBLE_UYU },
      },
    },
    { $sort: { date: -1, _id: -1 } },
    // An OCDS process may publish more than one award release in the week. The
    // latest record is the weekly representation; one ocid is never double-counted.
    { $group: { _id: "$ocid", doc: { $first: "$$ROOT" } } },
    { $replaceWith: "$doc" },
    {
      $facet: {
        top: [
          { $sort: { "amount.primaryAmount": -1, date: -1 } },
          { $limit: 10 },
          {
            $project: {
              id: 1,
              ocid: 1,
              date: 1,
              "tender.title": 1,
              "buyer.name": 1,
              "awards.title": 1,
              "awards.suppliers.name": 1,
              "awards.items.description": 1,
              "awards.items.classification.description": 1,
              "amount.primaryAmount": 1,
            },
          },
        ],
        summary: [
          { $group: { _id: null, count: { $sum: 1 }, totalAmountUyu: { $sum: "$amount.primaryAmount" } } },
        ],
      },
    },
  ]).allowDiskUse(true);

  const topExpenses = (facet?.top ?? []).flatMap((doc, index): INewsletterExpense[] => {
    const releaseId = doc.id?.trim();
    const ocid = doc.ocid?.trim();
    const amountUyu = Number(doc.amount?.primaryAmount);
    if (!releaseId || !ocid || !doc.date || !Number.isFinite(amountUyu)) return [];
    return [{
      rank: index + 1,
      releaseId,
      ocid,
      title: expenseTitle(doc),
      ...(doc.buyer?.name ? { buyerName: doc.buyer.name } : {}),
      supplierNames: supplierNames(doc),
      amountUyu,
      publishedAt: new Date(doc.date),
    }];
  });
  const summary = facet?.summary?.[0];
  return {
    topExpenses,
    eligibleExpenseCount: summary?.count ?? 0,
    totalAmountUyu: summary?.totalAmountUyu ?? 0,
  };
}

/**
 * What each spending topic picked up inside the week.
 *
 * `firstSeenAt` — when the weekly topic job first classified the contract — is the
 * only "new this week" the data supports: a contract's own date can be years old and
 * still be the first time the topic saw it. So the block is about what BECAME VISIBLE
 * this week, and says so, rather than implying the purchase happened this week.
 */
async function loadTopicHighlights(start: Date, end: Date): Promise<INewsletterTopicHighlight[]> {
  const out: INewsletterTopicHighlight[] = [];
  for (const topic of SPENDING_TOPICS) {
    const rows = await TopicContractModel.find(
      { topicKey: topic.key, inTopic: true, firstSeenAt: { $gte: start, $lt: end } },
      { ocid: 1, releaseId: 1, title: 1, description: 1, buyerName: 1, amount: 1, hasAmount: 1 },
    ).sort({ amount: -1 }).limit(200).lean();
    if (!rows.length) continue;

    out.push({
      topicKey: topic.key,
      slug: topic.slug,
      label: topic.labelEs,
      newContracts: rows.length,
      newTotalUyu: rows.reduce((sum, r) => sum + (r.amount ?? 0), 0),
      items: rows.slice(0, 5).map(r => ({
        ocid: r.ocid,
        ...(r.releaseId ? { releaseId: r.releaseId } : {}),
        title: clean(r.title ?? r.description, r.ocid).slice(0, 160),
        ...(r.buyerName ? { buyerName: r.buyerName } : {}),
        amountUyu: r.amount ?? 0,
        hasAmount: Boolean(r.hasAmount),
      })),
    });
  }
  return out;
}

function emptyAnomalySummary(): INewsletterAnomalySummary {
  return {
    total: 0,
    highCritical: 0,
    unexplained: 0,
    dataErrors: 0,
    pendingAiReview: 0,
    bySeverity: { low: 0, medium: 0, high: 0, critical: 0 },
  };
}

async function loadAnomalies(start: Date, end: Date): Promise<{
  anomalySummary: INewsletterAnomalySummary;
  anomalyFindings: INewsletterAnomalyFinding[];
}> {
  const filter = { firstDetectedAt: { $gte: start, $lt: end } };
  const [summaryRows, findings] = await Promise.all([
    AnomalyModel.aggregate<{
      total: number;
      highCritical: number;
      unexplained: number;
      dataErrors: number;
      pendingAiReview: number;
      low: number;
      medium: number;
      high: number;
      critical: number;
    }>([
      { $match: filter },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          highCritical: { $sum: { $cond: [{ $gte: [{ $ifNull: ["$severityRank", 0] }, 3] }, 1, 0] } },
          unexplained: { $sum: { $cond: [{ $eq: ["$aiVerdict.explainable", "no"] }, 1, 0] } },
          dataErrors: {
            $sum: {
              $cond: [{ $in: ["$aiVerdict.category", ["error-carga", "moneda-erronea"]] }, 1, 0],
            },
          },
          pendingAiReview: {
            $sum: {
              $cond: [{ $in: [{ $ifNull: ["$aiVerdict.explainable", "pending"] }, ["pending", "uncertain"]] }, 1, 0],
            },
          },
          low: { $sum: { $cond: [{ $eq: ["$severity", "low"] }, 1, 0] } },
          medium: { $sum: { $cond: [{ $eq: ["$severity", "medium"] }, 1, 0] } },
          high: { $sum: { $cond: [{ $eq: ["$severity", "high"] }, 1, 0] } },
          critical: { $sum: { $cond: [{ $eq: ["$severity", "critical"] }, 1, 0] } },
        },
      },
    ]),
    AnomalyModel.find(filter)
      .sort({ severityRank: -1, "metadata.zScore": -1, firstDetectedAt: -1 })
      .limit(10)
      .lean(),
  ]);

  const row = summaryRows[0];
  const anomalySummary = row ? {
    total: row.total,
    highCritical: row.highCritical,
    unexplained: row.unexplained,
    dataErrors: row.dataErrors,
    pendingAiReview: row.pendingAiReview,
    bySeverity: {
      low: row.low,
      medium: row.medium,
      high: row.high,
      critical: row.critical,
    },
  } : emptyAnomalySummary();

  const anomalyFindings = findings.map((finding): INewsletterAnomalyFinding => ({
    anomalyId: String(finding._id),
    releaseId: finding.releaseId,
    type: finding.type,
    severity: finding.severity,
    severityRank: finding.severityRank ?? 0,
    description: finding.description,
    ...(finding.metadata?.buyerName ? { buyerName: finding.metadata.buyerName } : {}),
    ...(finding.metadata?.supplierName ? { supplierName: finding.metadata.supplierName } : {}),
    ...(finding.metadata?.itemDescription ? { itemDescription: finding.metadata.itemDescription } : {}),
    detectedValue: finding.detectedValue,
    expectedMin: finding.expectedRange.min,
    expectedMax: finding.expectedRange.max,
    ...(finding.currency ? { currency: finding.currency } : {}),
    ...(Number.isFinite(finding.metadata?.zScore) ? { zScore: finding.metadata?.zScore } : {}),
    ...(finding.aiVerdict?.explainable ? { aiExplainable: finding.aiVerdict.explainable } : {}),
    ...(finding.aiVerdict?.category ? { aiCategory: finding.aiVerdict.category } : {}),
  }));

  return { anomalySummary, anomalyFindings };
}

const ANALYSIS_SCHEMA: GeminiSchema = {
  type: "OBJECT",
  properties: {
    headline: { type: "STRING", description: "Titular informativo, sobrio y específico, sin sensacionalismo." },
    overview: { type: "ARRAY", items: { type: "STRING" }, description: "Entre 2 y 4 párrafos de análisis." },
    spendingPatterns: { type: "ARRAY", items: { type: "STRING" }, description: "Entre 1 y 6 patrones observables en los datos suministrados." },
    cautions: { type: "ARRAY", items: { type: "STRING" }, description: "Entre 1 y 5 límites o cautelas metodológicas." },
  },
  required: ["headline", "overview", "spendingPatterns", "cautions"],
  propertyOrdering: ["headline", "overview", "spendingPatterns", "cautions"],
};

async function generateAnalysis(input: {
  weekKey: string;
  periodStart: Date;
  periodEnd: Date;
  eligibleExpenseCount: number;
  totalAmountUyu: number;
  topExpenses: INewsletterExpense[];
  anomalySummary: INewsletterAnomalySummary;
  anomalyFindings: INewsletterAnomalyFinding[];
}): Promise<{ analysis: INewsletterAiAnalysis; model: string; usage: { promptTokens: number; candidatesTokens: number; totalTokens: number } }> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY or GOOGLE_API_KEY is required to publish the weekly newsletter");
  const model = process.env.NEWSLETTER_GEMINI_MODEL || "gemini-2.5-flash";
  const periodFormatter = new Intl.DateTimeFormat("es-UY", {
    timeZone: "America/Montevideo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const inclusivePeriodLabel = `${periodFormatter.format(input.periodStart)} al ${periodFormatter.format(new Date(input.periodEnd.getTime() - 1))}`;
  const facts = {
    period: {
      key: input.weekKey,
      start: input.periodStart.toISOString(),
      endExclusive: input.periodEnd.toISOString(),
      inclusiveLabel: inclusivePeriodLabel,
    },
    expenses: {
      eligibleUniqueProcesses: input.eligibleExpenseCount,
      totalAmountUyu: input.totalAmountUyu,
      ranking: input.topExpenses.map(expense => ({
        rank: expense.rank,
        title: expense.title,
        buyer: expense.buyerName ?? null,
        suppliers: expense.supplierNames,
        amountUyu: expense.amountUyu,
        publishedAt: expense.publishedAt.toISOString(),
      })),
    },
    anomalies: {
      summary: input.anomalySummary,
      topSignals: input.anomalyFindings.map(finding => ({
        type: finding.type,
        severity: finding.severity,
        buyer: finding.buyerName ?? null,
        supplier: finding.supplierName ?? null,
        item: finding.itemDescription ?? null,
        detectedValue: finding.detectedValue,
        expectedRange: [finding.expectedMin, finding.expectedMax],
        currency: finding.currency ?? null,
        zScore: finding.zScore ?? null,
        aiExplainable: finding.aiExplainable ?? null,
        aiCategory: finding.aiCategory ?? null,
      })),
    },
  };

  const result = await callGeminiStructured<INewsletterAiAnalysis>({
    apiKey,
    model,
    temperature: 0,
    timeoutMs: 60_000,
    maxRetries: 3,
    schema: ANALYSIS_SCHEMA,
    systemInstruction: [
      "Sos un analista de compras públicas uruguayas.",
      "Redactá en español rioplatense claro, sobrio y periodístico.",
      "Usá exclusivamente los hechos y cifras del JSON suministrado: no agregues contexto externo, causas, comparaciones ni acusaciones.",
      "Separá correlación de causalidad. Una alerta estadística no demuestra irregularidad.",
      "No llames gasto ejecutado a lo que son adjudicaciones publicadas.",
      `Si mencionás las fechas del período, copiá literalmente esta etiqueta inclusiva: "${inclusivePeriodLabel}".`,
      "Indicá explícitamente cuando el tamaño de la muestra limita una conclusión.",
      "No repitas listas completas ni uses lenguaje promocional.",
    ].join(" "),
    prompt: `Prepará el análisis del expediente semanal a partir de este conjunto cerrado de hechos:\n${JSON.stringify(facts)}`,
  });
  return { analysis: normalizeNewsletterAnalysis(result.data), model, usage: result.usage };
}

function appBaseUrl(): string {
  return (process.env.APP_BASE_URL || "http://localhost:3600").replace(/\/+$/, "");
}

async function enqueueDeliveries(issue: INewsletterIssue): Promise<number> {
  if (issue.deliveryEnqueuedAt) return 0;
  const users = await UserModel.find({
    status: "active",
    "newsletter.subscribed": true,
  }).select("uid email emailVerified notificationPrefs").lean();

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
  if (operations.length) {
    await NewsletterDeliveryModel.bulkWrite(operations as never[], { ordered: false });
  }
  await NewsletterIssueModel.updateOne(
    { _id: issue._id, deliveryEnqueuedAt: { $exists: false } },
    { $set: { deliveryEnqueuedAt: new Date() } },
  );
  return operations.length;
}

async function dispatchEmail(issue: INewsletterIssue): Promise<{ sent: number; failed: number; skipped: number }> {
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
  const userMap = new Map(users.map(user => [user.uid, user]));
  const mailer = createMailer();
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const delivery of deliveries) {
    const user = userMap.get(delivery.userId);
    if (!user || user.status !== "active" || !user.newsletter?.subscribed || !user.emailVerified || !user.email) {
      await NewsletterDeliveryModel.updateOne({ _id: delivery._id }, { $set: { status: "skipped", lastError: "user not eligible" } });
      skipped++;
      continue;
    }
    const message = renderNewsletterMail(issue, { appBaseUrl: appBaseUrl(), unsubscribeToken: user.unsubscribeToken });
    const result = await mailer.send({
      to: user.email,
      ...message,
      headers: {
        ...newsletterListUnsubscribeHeaders(appBaseUrl(), user.unsubscribeToken),
        "X-Entity-Ref-ID": `newsletter-${issue.weekKey}-${user.uid}`,
      },
    });
    if (result.ok) {
      await NewsletterDeliveryModel.updateOne(
        { _id: delivery._id },
        { $set: { status: "sent", sentAt: new Date(), ...(result.id ? { providerMessageId: result.id } : {}) }, $inc: { attempts: 1 } },
      );
      sent++;
    } else if (result.skipped) {
      await NewsletterDeliveryModel.updateOne(
        { _id: delivery._id },
        { $set: { status: "skipped", lastError: "email transport not configured" }, $inc: { attempts: 1 } },
      );
      skipped++;
    } else {
      const attempts = delivery.attempts + 1;
      await NewsletterDeliveryModel.updateOne(
        { _id: delivery._id },
        { $set: { status: attempts >= DELIVERY_MAX_ATTEMPTS ? "failed" : "pending", lastError: result.error ?? "email delivery failed" }, $inc: { attempts: 1 } },
      );
      failed++;
    }
  }
  return { sent, failed, skipped };
}

async function dispatchPush(issue: INewsletterIssue): Promise<{ sent: number; failed: number; skipped: number; deactivated: number }> {
  const deliveries = await NewsletterDeliveryModel.find({
    issueId: String(issue._id),
    channel: "push",
    status: "pending",
    attempts: { $lt: DELIVERY_MAX_ATTEMPTS },
  }).lean();
  if (!deliveries.length) return { sent: 0, failed: 0, skipped: 0, deactivated: 0 };
  if (!isPushConfigured()) {
    await NewsletterDeliveryModel.updateMany(
      { _id: { $in: deliveries.map(d => d._id) } },
      { $set: { status: "skipped", lastError: "push transport not configured" } },
    );
    return { sent: 0, failed: 0, skipped: deliveries.length, deactivated: 0 };
  }

  const users = await UserModel.find({ uid: { $in: deliveries.map(d => d.userId) } })
    .select("uid status newsletter notificationPrefs")
    .lean();
  const userMap = new Map(users.map(user => [user.uid, user]));
  const subscriptions = await PushSubscriptionModel.find({
    userId: { $in: deliveries.map(d => d.userId) },
    active: true,
  }).lean();
  const subMap = new Map<string, typeof subscriptions>();
  for (const subscription of subscriptions) {
    const list = subMap.get(subscription.userId) ?? [];
    list.push(subscription);
    subMap.set(subscription.userId, list);
  }

  const pusher = createPusher();
  const payload = JSON.stringify({
    title: issue.title,
    body: issue.excerpt,
    url: `/blog/${issue.slug}`,
    tag: `newsletter-${issue.weekKey}`,
  });
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let deactivated = 0;

  for (const delivery of deliveries) {
    const user = userMap.get(delivery.userId);
    const channels = user ? resolveChannels(user) : null;
    const targets = subMap.get(delivery.userId) ?? [];
    if (!user || user.status !== "active" || !user.newsletter?.subscribed || !user.notificationPrefs?.enabled || !channels?.push || !targets.length) {
      await NewsletterDeliveryModel.updateOne({ _id: delivery._id }, { $set: { status: "skipped", lastError: "user or device not eligible" } });
      skipped++;
      continue;
    }

    let anyOk = false;
    let anyTransient = false;
    for (const target of targets) {
      const result = await pusher.send({ endpoint: target.endpoint, keys: target.keys }, payload);
      if (result.ok) {
        anyOk = true;
        await PushSubscriptionModel.updateOne({ _id: target._id }, { $set: { lastSuccessAt: new Date(), failureCount: 0 } });
      } else if (result.gone) {
        await PushSubscriptionModel.updateOne({ _id: target._id }, { $set: { active: false } });
        deactivated++;
      } else {
        anyTransient = true;
        await PushSubscriptionModel.updateOne({ _id: target._id }, { $inc: { failureCount: 1 } });
      }
    }
    if (anyOk) {
      await NewsletterDeliveryModel.updateOne({ _id: delivery._id }, { $set: { status: "sent", sentAt: new Date() }, $inc: { attempts: 1 } });
      sent++;
    } else if (anyTransient) {
      const attempts = delivery.attempts + 1;
      await NewsletterDeliveryModel.updateOne(
        { _id: delivery._id },
        { $set: { status: attempts >= DELIVERY_MAX_ATTEMPTS ? "failed" : "pending", lastError: "push delivery failed" }, $inc: { attempts: 1 } },
      );
      failed++;
    } else {
      await NewsletterDeliveryModel.updateOne({ _id: delivery._id }, { $set: { status: "skipped", lastError: "all push subscriptions expired" } });
      skipped++;
    }
  }
  return { sent, failed, skipped, deactivated };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const week = args.weekStart ? explicitWeek(args.weekStart) : previousUruguayWeek();
  process.env.MONGO_SOCKET_TIMEOUT_MS ||= "180000";
  await connectToDatabase();

  let issue = await NewsletterIssueModel.findOne({ weekKey: week.key }).lean();
  if (!issue || issue.status !== "published" || args.force) {
    const [{ topExpenses, eligibleExpenseCount, totalAmountUyu }, { anomalySummary, anomalyFindings }, topicHighlights] = await Promise.all([
      loadExpenses(week.start, week.end),
      loadAnomalies(week.start, week.end),
      loadTopicHighlights(week.start, week.end),
    ]);
    if (!topExpenses.length) throw new Error(`No eligible award releases found for week ${week.key}`);
    const generated = await generateAnalysis({
      weekKey: week.key,
      periodStart: week.start,
      periodEnd: week.end,
      eligibleExpenseCount,
      totalAmountUyu,
      topExpenses,
      anomalySummary,
      anomalyFindings,
    });
    const issuePayload = {
      weekKey: week.key,
      slug: week.slug,
      locale: "es" as const,
      status: "published" as const,
      title: generated.analysis.headline,
      excerpt: generated.analysis.overview[0]!,
      periodStart: week.start,
      periodEnd: week.end,
      publishedAt: new Date(),
      eligibleExpenseCount,
      totalAmountUyu,
      topExpenses,
      anomalySummary,
      anomalyFindings,
      topicHighlights,
      analysis: generated.analysis,
      ai: {
        provider: "gemini" as const,
        model: generated.model,
        generatedAt: new Date(),
        ...generated.usage,
      },
      methodology: {
        amountField: "amount.primaryAmount" as const,
        expenseScope: `Adjudicaciones publicadas entre ${week.start.toISOString()} y ${week.end.toISOString()} (fin exclusivo), un registro por ocid y montos normalizados plausibles hasta ${MAX_PLAUSIBLE_UYU} UYU.`,
        anomalyDateField: "firstDetectedAt" as const,
        anomalyDisclaimer: "Las alertas son señales estadísticas para revisión. No constituyen por sí solas prueba de irregularidad ni atribuyen intención.",
      },
    };
    if (args.dryRun) {
      console.log(JSON.stringify({
        dryRun: true,
        week: week.key,
        title: issuePayload.title,
        expenses: eligibleExpenseCount,
        topExpense: topExpenses[0],
        anomalies: anomalySummary,
        ai: issuePayload.ai,
      }, null, 2));
      return;
    }
    issue = await NewsletterIssueModel.findOneAndUpdate(
      { weekKey: week.key },
      {
        $set: issuePayload,
        ...(args.force ? { $unset: { deliveryEnqueuedAt: 1 } } : {}),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();
  }

  if (!issue) throw new Error(`Could not load or create issue ${week.key}`);
  if (args.dryRun || args.skipDelivery) {
    console.log(`WEEKLY_NEWSLETTER_SUMMARY week=${week.key} issue=${issue.slug} delivery=skipped`);
    return;
  }

  const hydrated = await NewsletterIssueModel.findById(issue._id);
  if (!hydrated) throw new Error(`Issue ${week.key} disappeared before delivery`);
  const enqueued = await enqueueDeliveries(hydrated);
  const [email, push] = await Promise.all([dispatchEmail(hydrated), dispatchPush(hydrated)]);
  console.log(`WEEKLY_NEWSLETTER_SUMMARY week=${week.key} issue=${issue.slug} enqueued=${enqueued} emailSent=${email.sent} emailFailed=${email.failed} pushSent=${push.sent} pushFailed=${push.failed}`);
}

main()
  .catch((error) => {
    console.error("[weekly-newsletter]", error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectFromDatabase().catch(() => undefined);
  });
