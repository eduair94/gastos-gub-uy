import { WebhookDeliveryModel, WEBHOOK_MAX_ATTEMPTS } from "../../../shared/models/webhook_delivery";
import { WebhookSubscriptionModel } from "../../../shared/models/webhook_subscription";
import { signPayload } from "../../../shared/webhooks/sign";
import type { IWebhookSubscription } from "../../../shared/types/monitor";

const BATCH = Number(process.env.WEBHOOK_DISPATCH_BATCH || 100);
const REQUEST_TIMEOUT_MS = 10_000;
const AUTO_DISABLE_AT = 15; // consecutive sub failures → deactivate

function backoffMs(attempts: number): number {
  // 2^attempts minutes, capped at 60 min.
  return Math.min(2 ** attempts, 60) * 60_000;
}

async function post(url: string, body: string, headers: Record<string, string>): Promise<{ ok: boolean; status: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: "POST", headers, body, signal: controller.signal });
    return { ok: res.ok, status: res.status };
  } finally {
    clearTimeout(timer);
  }
}

export async function dispatchWebhookDeliveries(now: Date = new Date()): Promise<{ sent: number; failed: number }> {
  const due = await WebhookDeliveryModel.find({
    status: "pending",
    $or: [{ nextAttemptAt: { $exists: false } }, { nextAttemptAt: null }, { nextAttemptAt: { $lte: now } }],
  })
    .sort({ createdAt: 1 })
    .limit(BATCH)
    .lean();

  if (!due.length) return { sent: 0, failed: 0 };

  const subCache = new Map<string, IWebhookSubscription | null>();
  async function getSub(id: string): Promise<IWebhookSubscription | null> {
    if (subCache.has(id)) return subCache.get(id)!;
    const s = (await WebhookSubscriptionModel.findById(id).lean()) as unknown as IWebhookSubscription | null;
    subCache.set(id, s);
    return s;
  }

  let sent = 0;
  let failed = 0;

  for (const d of due) {
    const sub = await getSub(String(d.subscriptionId));
    if (!sub || !sub.active) {
      // Subscription gone or disabled — the delivery can never succeed.
      await WebhookDeliveryModel.updateOne({ _id: d._id }, { $set: { status: "failed", lastError: sub ? "subscription inactive" : "subscription deleted" } });
      failed++;
      continue;
    }

    const body = JSON.stringify(d.payload);
    const signature = signPayload(sub.secret, body);
    const headers = {
      "content-type": "application/json",
      "x-gastosgub-event": String(d.event),
      "x-gastosgub-delivery": String(d._id),
      "x-gastosgub-signature": signature,
      "x-gastosgub-timestamp": now.toISOString(),
    };

    let ok = false;
    let errMsg = "";
    try {
      const r = await post(sub.url, body, headers);
      ok = r.ok;
      if (!ok) errMsg = `HTTP ${r.status}`;
    } catch (e: any) {
      errMsg = e instanceof Error ? e.message : String(e);
    }

    if (ok) {
      await WebhookDeliveryModel.updateOne({ _id: d._id }, { $set: { status: "sent", sentAt: now } });
      await WebhookSubscriptionModel.updateOne({ _id: sub._id }, { $set: { failureCount: 0, lastDeliveryAt: now } });
      sent++;
    } else {
      const attempts = (d.attempts || 0) + 1;
      const isFinal = attempts >= WEBHOOK_MAX_ATTEMPTS;
      await WebhookDeliveryModel.updateOne(
        { _id: d._id },
        {
          $set: {
            status: isFinal ? "failed" : "pending",
            attempts,
            lastError: errMsg.slice(0, 500),
            nextAttemptAt: isFinal ? null : new Date(now.getTime() + backoffMs(attempts)),
          },
        }
      );
      const newFailureCount = (sub.failureCount || 0) + 1;
      const update: Record<string, unknown> = { failureCount: newFailureCount, lastDeliveryAt: now };
      if (newFailureCount >= AUTO_DISABLE_AT) update.active = false;
      await WebhookSubscriptionModel.updateOne({ _id: sub._id }, { $set: update });
      // Refresh the cached copy so subsequent deliveries this run see the new state.
      subCache.set(String(sub._id), { ...sub, failureCount: newFailureCount, active: newFailureCount < AUTO_DISABLE_AT } as unknown as IWebhookSubscription);
      if (isFinal) failed++;
    }
  }

  return { sent, failed };
}
