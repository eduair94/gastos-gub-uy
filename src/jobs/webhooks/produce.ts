import { WebhookSubscriptionModel } from "../../../shared/models/webhook_subscription";
import { WebhookDeliveryModel } from "../../../shared/models/webhook_delivery";
import { OpenCallModel } from "../../../shared/models/open_call";
import { AnomalyModel } from "../../../shared/models/anomaly";
import { ReleaseModel } from "../../../shared/models/release";
import { watchMatchesCall } from "../../../shared/matching/match";
import type { WatchInput } from "../../../shared/matching/match";
import type { IWebhookSubscription } from "../../../shared/types/monitor";

// Scan-based webhook producer. Rather than hooking into the existing ingest/detect
// jobs (which would couple prod cron to this feature), it independently scans a
// rolling window of newly-seen rows each run and enqueues one delivery per matching
// subscription. The unique dedupeKey on webhook_deliveries makes re-scanning the
// same window harmless — a row already enqueued is silently skipped.

// Window is wider than the cron interval so nothing slips between runs; dedupeKey
// absorbs the overlap.
const WINDOW_MS = Number(process.env.WEBHOOK_PRODUCE_WINDOW_MS || 2 * 60 * 60 * 1000);
const LIVE_STATUSES = ["open", "clarification", "amended"];

async function enqueue(subId: string, event: string, resourceId: string, payload: Record<string, unknown>): Promise<boolean> {
  const dedupeKey = `${event}:${subId}:${resourceId}`;
  try {
    await WebhookDeliveryModel.create({ subscriptionId: subId, event, dedupeKey, payload, status: "pending" });
    return true;
  } catch (e: any) {
    if (e && e.code === 11000) return false; // already enqueued — idempotent
    throw e;
  }
}

function subsFor(subs: IWebhookSubscription[], event: string): IWebhookSubscription[] {
  return subs.filter((s) => s.active && s.events.includes(event as any));
}

function filtersToWatch(s: IWebhookSubscription): WatchInput {
  const f = s.filters || {};
  return {
    categories: f.categories || [],
    keywords: f.keywords || [],
    keywordMode: "any",
    buyers: f.buyers || [],
    minValue: f.minAmount,
    maxValue: undefined,
    procurementMethods: undefined,
  };
}

export async function produceWebhookDeliveries(now: Date = new Date()): Promise<number> {
  const since = new Date(now.getTime() - WINDOW_MS);
  const subs = (await WebhookSubscriptionModel.find({ active: true }).lean()) as unknown as IWebhookSubscription[];
  if (!subs.length) return 0;

  let enqueued = 0;

  // ---- tender.matched ----
  const tenderSubs = subsFor(subs, "tender.matched");
  if (tenderSubs.length) {
    const calls = await OpenCallModel.find({ firstSeenAt: { $gte: since }, status: { $in: LIVE_STATUSES } })
      .select("compraId ocid title buyer classificationSet searchText estimatedValue procurementMethodDetails tenderPeriod firstSeenAt")
      .limit(5000)
      .lean();
    for (const call of calls) {
      const view = {
        classificationSet: call.classificationSet ?? [],
        searchText: call.searchText ?? "",
        buyerId: call.buyer?.id,
        estimatedValue: call.estimatedValue,
        procurementMethodDetails: call.procurementMethodDetails,
      };
      for (const s of tenderSubs) {
        if (!watchMatchesCall(filtersToWatch(s), view)) continue;
        const ok = await enqueue(String(s._id), "tender.matched", call.compraId, {
          event: "tender.matched",
          compraId: call.compraId,
          ocid: call.ocid,
          title: call.title,
          buyer: call.buyer,
          endDate: call.tenderPeriod?.endDate ?? null,
          estimatedValue: call.estimatedValue ?? null,
        });
        if (ok) enqueued++;
      }
    }
  }

  // ---- anomaly.detected ----
  const anomalySubs = subsFor(subs, "anomaly.detected");
  if (anomalySubs.length) {
    const anomalies = await AnomalyModel.find({ firstDetectedAt: { $gte: since } })
      .select("type severity severityRank detectedValue currency releaseId metadata.supplierName metadata.buyerName metadata.zScore firstDetectedAt")
      .limit(5000)
      .lean();
    for (const a of anomalies) {
      const z = a.metadata?.zScore;
      for (const s of anomalySubs) {
        const f = s.filters || {};
        if (f.minZ != null && !(typeof z === "number" && Math.abs(z) >= f.minZ)) continue;
        if (f.severity && a.severity !== f.severity) continue;
        if (f.minAmount != null && !(typeof a.detectedValue === "number" && a.detectedValue >= f.minAmount)) continue;
        const ok = await enqueue(String(s._id), "anomaly.detected", String(a._id), {
          event: "anomaly.detected",
          anomalyId: String(a._id),
          type: a.type,
          severity: a.severity,
          detectedValue: a.detectedValue,
          currency: a.currency ?? null,
          zScore: z ?? null,
          supplierName: a.metadata?.supplierName ?? null,
          buyerName: a.metadata?.buyerName ?? null,
          releaseId: a.releaseId,
        });
        if (ok) enqueued++;
      }
    }
  }

  // ---- award.created ---- (recently-ingested award releases, keyed on _id time)
  const awardSubs = subsFor(subs, "award.created");
  if (awardSubs.length) {
    const releases = await ReleaseModel.find({ tag: "award", date: { $gte: since } })
      .select("id ocid date buyer awards.suppliers amount.primaryAmount amount.primaryCurrency tender.title")
      .sort({ date: -1 })
      .limit(3000)
      .lean();
    for (const r of releases as any[]) {
      const supplierIds: string[] = (r.awards || []).flatMap((aw: any) => (aw.suppliers || []).map((sp: any) => sp.id).filter(Boolean));
      const amount = r.amount?.primaryAmount;
      for (const s of awardSubs) {
        const f = s.filters || {};
        if (f.supplierId && !supplierIds.includes(f.supplierId)) continue;
        if (f.buyers && f.buyers.length && !(r.buyer?.id && f.buyers.includes(r.buyer.id))) continue;
        if (f.minAmount != null && !(typeof amount === "number" && amount >= f.minAmount)) continue;
        const ok = await enqueue(String(s._id), "award.created", r.id, {
          event: "award.created",
          releaseId: r.id,
          ocid: r.ocid,
          buyer: r.buyer,
          suppliers: (r.awards || []).flatMap((aw: any) => aw.suppliers || []),
          amount: amount ?? null,
          currency: r.amount?.primaryCurrency ?? null,
          title: r.tender?.title ?? null,
        });
        if (ok) enqueued++;
      }
    }
  }

  return enqueued;
}
