#!/usr/bin/env tsx

/**
 * Campaign funnel stats: read-only reporting over `campaign_sends` for a
 * single cold-email campaign — status funnel (overall + per rubro) and a
 * best-effort signup count (users whose email received a send).
 *
 * Usage:
 *   npx tsx scripts/campaign-stats.ts --campaign=<campaignId>
 */

import { connectToDatabase, disconnectFromDatabase } from "../shared/connection/database";
import { CampaignSendModel, type SendStatus } from "../shared/models/campaign_send";
import { EmailCampaignModel } from "../shared/models/email_campaign";
import { UserModel } from "../shared/models/user";

const STATUSES: SendStatus[] = [
  "queued", "sent", "delivered", "opened", "clicked",
  "bounced", "complained", "unsubscribed", "failed",
];

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

interface StatusCount { _id: SendStatus | null; count: number }
interface RubroBucket { _id: string; statuses: StatusCount[]; total: number }

/** Right-pad/left-pad helpers for a plain-text table. */
const padEnd = (s: string, n: number) => (s.length >= n ? s : s + " ".repeat(n - s.length));
const padStart = (s: string, n: number) => (s.length >= n ? s : " ".repeat(n - s.length) + s);

function printFunnel(title: string, counts: Map<string, number>, total: number) {
  console.log(`\n${title} (total ${total})`);
  const col1 = Math.max(12, ...STATUSES.map((s) => s.length));
  for (const status of STATUSES) {
    const n = counts.get(status) ?? 0;
    const pct = total > 0 ? `${((n / total) * 100).toFixed(1)}%` : "-";
    console.log(`  ${padEnd(status, col1)} ${padStart(String(n), 8)}  ${padStart(pct, 6)}`);
  }
  const known = STATUSES.reduce((sum, s) => sum + (counts.get(s) ?? 0), 0);
  const other = total - known;
  if (other > 0) console.log(`  ${padEnd("(other)", col1)} ${padStart(String(other), 8)}`);
}

async function main() {
  const campaignId = arg("campaign");
  if (!campaignId) {
    console.error("Usage: npx tsx scripts/campaign-stats.ts --campaign=<campaignId>");
    process.exit(1);
    return;
  }

  await connectToDatabase();

  console.log(`\n📊 Campaign stats for "${campaignId}"`);

  const [result] = await CampaignSendModel.aggregate<{
    overall: StatusCount[];
    byRubro: RubroBucket[];
  }>([
    { $match: { campaignId } },
    {
      $facet: {
        overall: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
        byRubro: [
          { $group: { _id: { rubroKey: "$rubroKey", status: "$status" }, count: { $sum: 1 } } },
          {
            $group: {
              _id: "$_id.rubroKey",
              statuses: { $push: { _id: "$_id.status", count: "$count" } },
              total: { $sum: "$count" },
            },
          },
          { $sort: { total: -1 } },
        ],
      },
    },
  ]);

  const overall = result ?? { overall: [], byRubro: [] };
  const overallTotal = overall.overall.reduce((sum, r) => sum + r.count, 0);

  if (overallTotal === 0) {
    console.log("\n⚠️  No campaign_sends found for this campaign — nothing to report.");
  }
  else {
    const overallCounts = new Map(overall.overall.map((r) => [String(r._id ?? "unknown"), r.count]));
    printFunnel("OVERALL FUNNEL", overallCounts, overallTotal);

    console.log(`\nBY RUBRO (${overall.byRubro.length} rubro${overall.byRubro.length === 1 ? "" : "s"}):`);
    for (const bucket of overall.byRubro) {
      const rubroCounts = new Map(bucket.statuses.map((r) => [String(r._id ?? "unknown"), r.count]));
      printFunnel(`  ▸ ${bucket._id || "(sin rubro)"}`, rubroCounts, bucket.total);
    }
  }

  // --- Signups (best-effort): users whose email received a send in this
  // campaign AND signed up on/after the campaign started — otherwise a
  // recipient who was already a user before the campaign existed (or a
  // same-email signup from an unrelated, earlier source) would be counted
  // as a campaign conversion. ---
  const campaign = await EmailCampaignModel.findOne({ key: campaignId }).lean();
  const emails = await CampaignSendModel.distinct("email", { campaignId });
  const signups = emails.length > 0 && campaign
    ? await UserModel.countDocuments({ email: { $in: emails }, createdAt: { $gte: campaign.createdAt } })
    : 0;

  console.log(`\nSIGNUPS (best-effort, email match against ${emails.length} recipient(s), created on/after campaign start ${campaign?.createdAt?.toISOString() ?? "unknown"}): ${signups}`);

  await disconnectFromDatabase();
}

main().catch((e) => {
  console.error("❌ campaign-stats failed:", e);
  process.exit(1);
});
