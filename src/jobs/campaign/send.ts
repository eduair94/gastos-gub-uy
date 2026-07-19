#!/usr/bin/env tsx

/**
 * Campaign send engine: the throttled dispatch job that turns `campaign_sends`
 * rows queued by `./enqueue.ts` into actual outbound cold emails.
 *
 * Design (see docs/superpowers/plans/2026-07-19-cold-email-campaign-phase-b.md,
 * Task 7):
 *   - Warmup ramp: a brand-new sender identity needs to earn ESP trust, so the
 *     daily send cap starts small (50/day) and doubles every day the campaign
 *     has existed, capped at 5000/day (`warmupCap`).
 *   - Suppression is re-checked at send time (not just at enqueue time), since
 *     a recipient can unsubscribe/bounce/complain on an EARLIER campaign in
 *     the gap between enqueue and this run.
 *   - The subject hook (open-call count for the recipient's rubro) is computed
 *     live so the number in the email is never stale.
 *   - Kill-switch: after each run's batch, if the campaign's cumulative
 *     complaint or hard-bounce rate crosses a threshold, the campaign is
 *     auto-paused. A paused campaign refuses to dispatch until a human flips
 *     it back — this is the single most important guardrail in this file.
 *
 * Usage:
 *   npx tsx src/jobs/campaign/send.ts --campaign=promo1
 *   npx tsx src/jobs/campaign/send.ts --campaign=promo1 --limit=20 --dry-run
 *   npx tsx src/jobs/campaign/send.ts --campaign=promo1 --rate=200   # override today's cap
 */
import { createHash } from "node:crypto";
import { connectToDatabase, disconnectFromDatabase } from "../../../shared/connection/database";
import { EmailCampaignModel } from "../../../shared/models/email_campaign";
import { CampaignSendModel } from "../../../shared/models/campaign_send";
import { SiceCatalogModel } from "../../../shared/models/sice_catalog";
import { isSuppressed } from "./suppression";
import { countOpenCallsByRubro } from "./open-calls-count";
import { renderCampaignEmail, campaignHeaders } from "../../emails/campaign-templates";
import { createColdMailer } from "../../services/cold-mailer";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const WARMUP_START = 50;
const WARMUP_CEILING = 5000;

// Kill-switch thresholds (see brief: "e.g. complaints/(delivered+sent) > 0.005
// OR bounces rate > 0.05 with a min sample e.g. >=100 sent").
const COMPLAINT_RATE_THRESHOLD = 0.005;
const BOUNCE_RATE_THRESHOLD = 0.05;
const BOUNCE_MIN_SAMPLE = 100;

/**
 * PURE. Day-0 (a brand-new campaign) sends 50/day; the cap doubles every
 * elapsed day, capped at 5000/day so warmup never becomes unbounded.
 */
export function warmupCap(dayIndex: number): number {
  return Math.min(WARMUP_CEILING, WARMUP_START * 2 ** dayIndex);
}

/**
 * PURE, deterministic (no Math.random). A hex sha256 of
 * `supplierId|campaignKey|salt` — unique per (supplier,campaign) pair, and
 * stable across re-enqueue runs so the same recipient always gets the same
 * unsubscribe token for a given campaign.
 */
export function makeToken(supplierId: string, campaignKey: string): string {
  const salt = process.env.CAMPAIGN_TOKEN_SALT ?? "gastos-gub";
  return createHash("sha256").update(`${supplierId}|${campaignKey}|${salt}`).digest("hex");
}

/** PURE. Days elapsed since the campaign was created, floored, never negative. */
export function dayIndexSince(createdAt: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - createdAt.getTime()) / ONE_DAY_MS));
}

export interface KillSwitchCounts {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  complained: number;
  bounced: number;
  unsubscribed: number;
  failed: number;
}

/**
 * PURE. Whether the campaign's cumulative funnel counts breach the
 * complaint/bounce kill-switch. Denominator is every row that has left
 * `queued` (sent+delivered+opened+clicked+bounced+complained+unsubscribed+
 * failed) — NOT just sent+delivered, which would shrink (and inflate the
 * rate) as engaged sends move on to opened/clicked.
 * Bounce rate only applies once there is a meaningful sample (>=100 sent),
 * so one early bounce out of three test sends can't trip the switch.
 */
export function shouldPause(counts: KillSwitchCounts): boolean {
  const denom = counts.sent + counts.delivered + counts.opened + counts.clicked
    + counts.bounced + counts.complained + counts.unsubscribed + counts.failed;
  if (denom <= 0) return false;
  if (counts.complained / denom > COMPLAINT_RATE_THRESHOLD) return true;
  if (denom >= BOUNCE_MIN_SAMPLE && counts.bounced / denom > BOUNCE_RATE_THRESHOLD) return true;
  return false;
}

function appBaseUrl(): string {
  return (process.env.APP_BASE_URL || "http://localhost:3600").replace(/\/+$/, "");
}

/** The machine mailto: target listed alongside the https one-click URL in List-Unsubscribe. */
function unsubscribeMailto(): string {
  const addr = process.env.CAMPAIGN_UNSUB_MAILTO || process.env.COLD_SMTP_REPLY_TO || process.env.COLD_SMTP_FROM || "baja@gastos.gub.uy";
  return addr.startsWith("mailto:") ? addr : `mailto:${addr}`;
}

function senderIdentity(): string {
  return process.env.CAMPAIGN_SENDER_IDENTITY || "gastos-gub · Montevideo, Uruguay";
}

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}
function numArg(name: string): number | undefined {
  const raw = arg(name);
  if (raw === undefined) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

export interface DispatchSummary {
  campaign: string;
  dryRun: boolean;
  cap: number;
  processed: number;
  sent: number;
  failed: number;
  skippedSuppressed: number;
  paused: boolean;
}

/**
 * Runs one dispatch batch for `campaignKey`. Connects/disconnects the DB
 * itself so it can be invoked standalone via the CLI entrypoint below.
 *
 * NOTE: `queued` rows are not claimed atomically (no scheduler yet) — do not
 * run two instances of this job concurrently for the same campaign, or both
 * could pick up and send the same row.
 */
export async function main(): Promise<DispatchSummary | void> {
  const log = (m: string) => console.log(`[campaign-send] ${m}`);
  const campaignKey = arg("campaign");
  if (!campaignKey) {
    console.error("Usage: npx tsx src/jobs/campaign/send.ts --campaign=<key> [--limit=n] [--rate=n] [--dry-run]");
    process.exitCode = 1;
    return;
  }
  const dryRun = flag("dry-run");
  const limitArg = numArg("limit");
  const rateArg = numArg("rate");

  await connectToDatabase();

  const campaign = await EmailCampaignModel.findOne({ key: campaignKey }).lean();
  if (!campaign) {
    log(`campaign "${campaignKey}" not found — nothing to do`);
    await disconnectFromDatabase().catch(() => {});
    return;
  }
  if (campaign.status === "paused") {
    log(`campaign "${campaignKey}" is paused — aborting (flip status away from "paused" to resume)`);
    await disconnectFromDatabase().catch(() => {});
    return;
  }

  const now = new Date();
  const dayIndex = dayIndexSince(campaign.createdAt ?? now, now);
  const warmup = warmupCap(dayIndex);
  const rate = rateArg !== undefined ? Math.max(0, Math.floor(rateArg)) : warmup;
  const cap = limitArg !== undefined ? Math.min(rate, Math.max(0, Math.floor(limitArg))) : rate;

  log(`day ${dayIndex} of warmup, cap=${cap} (warmupCap=${warmup}${rateArg !== undefined ? `, --rate=${rateArg}` : ""}${limitArg !== undefined ? `, --limit=${limitArg}` : ""})${dryRun ? " [dry-run]" : ""}`);

  if (cap <= 0) {
    log("cap is 0 — nothing to send this run");
    await disconnectFromDatabase().catch(() => {});
    return { campaign: campaignKey, dryRun, cap, processed: 0, sent: 0, failed: 0, skippedSuppressed: 0, paused: false };
  }

  const queued = await CampaignSendModel.find({ campaignId: campaignKey, status: "queued" }).limit(cap).lean();
  if (!queued.length) {
    log("no queued sends found");
    await disconnectFromDatabase().catch(() => {});
    return { campaign: campaignKey, dryRun, cap, processed: 0, sent: 0, failed: 0, skippedSuppressed: 0, paused: false };
  }

  // Batch the two lookups the whole run needs (open-count hook, rubro label)
  // once per distinct rubro instead of once per recipient.
  const rubroKeys = [...new Set(queued.map((s) => s.rubroKey).filter((k): k is string => !!k))];
  const [openCounts, catalogDocs] = await Promise.all([
    countOpenCallsByRubro(rubroKeys, now),
    rubroKeys.length ? SiceCatalogModel.find({ code: { $in: rubroKeys } }).select("code canonicalName").lean() : Promise.resolve([]),
  ]);
  const labelByCode = new Map(catalogDocs.map((d) => [d.code, d.canonicalName]));

  const base = appBaseUrl();
  const mailer = createColdMailer();
  const mailto = unsubscribeMailto();
  const identity = senderIdentity();

  let sent = 0;
  let failed = 0;
  let skippedSuppressed = 0;

  for (const send of queued) {
    if (await isSuppressed(send.email)) {
      skippedSuppressed++;
      if (dryRun) {
        log(`[dry-run] would skip ${send.email} (suppressed)`);
      } else {
        await CampaignSendModel.updateOne({ _id: send._id }, { $set: { status: "failed", error: "suppressed" } });
      }
      continue;
    }

    const token = send.token;
    // Both the visible footer link and the List-Unsubscribe header must point
    // at the real registered route — it lives under /api/campaign/unsubscribe
    // (unsubscribe.get.ts / .post.ts), not /campaign/unsubscribe.
    const unsubscribeUrl = `${base}/api/campaign/unsubscribe?token=${encodeURIComponent(token)}`;
    const openCount = openCounts.get(send.rubroKey) ?? 0;
    const rubroLabel = labelByCode.get(send.rubroKey) || send.rubroKey;
    // rubroLabel rides along so the watch the landing pre-creates gets a human
    // name ("Llamados en Alcohol rectificado"), not a bare SICE code.
    const ctaUrl = `${base}/registro?rubro=${encodeURIComponent(send.rubroKey)}`
      + `&rubroLabel=${encodeURIComponent(rubroLabel)}`
      + `&utm_source=coldemail&utm_campaign=${encodeURIComponent(campaignKey)}`;

    const { subject, html, text } = renderCampaignEmail({
      supplierName: send.name || send.supplierId,
      rubroLabel,
      rubroCode: send.rubroKey,
      openCount,
      unsubscribeUrl,
      ctaUrl,
      senderIdentity: identity,
    });
    // X-Mailin-Custom round-trips on Brevo webhook events (nodemailer's local
    // info.messageId does not), so status updates + the kill-switch match on
    // this token, not on providerMessageId.
    const headers = { ...campaignHeaders(unsubscribeUrl, mailto), "X-Mailin-Custom": token };

    if (dryRun) {
      log(`[dry-run] would send to ${send.email}: "${subject}"`);
      sent++;
      continue;
    }

    const res = await mailer.send({ to: send.email, subject, html, text, headers });
    if (res.ok) {
      await CampaignSendModel.updateOne(
        { _id: send._id },
        { $set: { status: "sent", providerMessageId: res.id, sentAt: new Date() } },
      );
      sent++;
    } else {
      await CampaignSendModel.updateOne(
        { _id: send._id },
        { $set: { status: "failed", error: res.error ?? (res.skipped ? "skipped: cold mailer not configured" : "unknown error") } },
      );
      failed++;
    }
  }

  log(`batch done: processed=${queued.length} sent=${sent} failed=${failed} skippedSuppressed=${skippedSuppressed}`);

  let paused = false;
  if (!dryRun) {
    const [sentCount, deliveredCount, openedCount, clickedCount, complainedCount, bouncedCount, unsubscribedCount, failedCount] = await Promise.all([
      CampaignSendModel.countDocuments({ campaignId: campaignKey, status: "sent" }),
      CampaignSendModel.countDocuments({ campaignId: campaignKey, status: "delivered" }),
      CampaignSendModel.countDocuments({ campaignId: campaignKey, status: "opened" }),
      CampaignSendModel.countDocuments({ campaignId: campaignKey, status: "clicked" }),
      CampaignSendModel.countDocuments({ campaignId: campaignKey, status: "complained" }),
      CampaignSendModel.countDocuments({ campaignId: campaignKey, status: "bounced" }),
      CampaignSendModel.countDocuments({ campaignId: campaignKey, status: "unsubscribed" }),
      CampaignSendModel.countDocuments({ campaignId: campaignKey, status: "failed" }),
    ]);
    const counts: KillSwitchCounts = {
      sent: sentCount, delivered: deliveredCount, opened: openedCount, clicked: clickedCount,
      complained: complainedCount, bounced: bouncedCount, unsubscribed: unsubscribedCount, failed: failedCount,
    };
    if (shouldPause(counts)) {
      await EmailCampaignModel.updateOne({ key: campaignKey }, { $set: { status: "paused" } });
      paused = true;
      log(`KILL-SWITCH TRIPPED (sent=${counts.sent} delivered=${counts.delivered} complained=${counts.complained} bounced=${counts.bounced}) — campaign "${campaignKey}" paused`);
    }
  } else {
    log("[dry-run] kill-switch check skipped (no writes)");
  }

  await disconnectFromDatabase().catch(() => {});
  return { campaign: campaignKey, dryRun, cap, processed: queued.length, sent, failed, skippedSuppressed, paused };
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch(async (err) => {
      console.error("[campaign-send] failed:", err);
      await disconnectFromDatabase().catch(() => {});
      process.exit(1);
    });
}
