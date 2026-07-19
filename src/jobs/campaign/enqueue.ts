#!/usr/bin/env tsx

/**
 * Campaign enqueue: materializes `campaign_sends` rows for a campaign by
 * streaming `buildRecipients` (Task 6's segmented, suppression-filtered
 * supplier list) and upserting one queued row per recipient.
 *
 * Idempotent by design: the upsert is keyed on {campaignId, email} and uses
 * $setOnInsert, so re-running enqueue for the same campaign (e.g. to pick up
 * newly-scraped contacts) never duplicates a row and never resets one that's
 * already `sent`/`failed`/etc. — only brand-new recipients get inserted.
 *
 * Usage:
 *   npx tsx src/jobs/campaign/enqueue.ts --campaign=promo1
 *   npx tsx src/jobs/campaign/enqueue.ts --campaign=promo1 --rubro=28267
 */
import type { Db } from "mongodb";
import { CampaignSendModel } from "../../../shared/models/campaign_send";
import { buildRecipients } from "./recipients";
import type { BuildRecipientsOptions } from "./recipients";
import { makeToken } from "./send";
import { connectToDatabase, disconnectFromDatabase } from "../../../shared/connection/database";

/**
 * Iterates `buildRecipients(db, opts)` and upserts one `campaign_sends`
 * document per recipient. Returns the count of NEWLY enqueued rows (rows that
 * already existed for this {campaignId, email} pair are left untouched, not
 * counted).
 */
export async function enqueueCampaign(db: Db, campaignKey: string, opts?: BuildRecipientsOptions): Promise<number> {
  let enqueued = 0;
  for await (const r of buildRecipients(db, opts)) {
    const res = await CampaignSendModel.updateOne(
      { campaignId: campaignKey, email: r.email },
      {
        $setOnInsert: {
          campaignId: campaignKey,
          supplierId: r.supplierId,
          email: r.email,
          rubroKey: r.rubroCode,
          token: makeToken(r.supplierId, campaignKey),
          status: "queued",
          queuedAt: new Date(),
        },
      },
      { upsert: true },
    );
    if (res.upsertedCount > 0) enqueued++;
  }
  return enqueued;
}

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

async function main(): Promise<void> {
  const campaignKey = arg("campaign");
  if (!campaignKey) {
    console.error("Usage: npx tsx src/jobs/campaign/enqueue.ts --campaign=<key> [--rubro=<classificationId>]");
    process.exitCode = 1;
    return;
  }
  const rubro = arg("rubro");

  const conn = await connectToDatabase();
  const db = conn.connection.db as unknown as Db;

  const count = await enqueueCampaign(db, campaignKey, rubro ? { rubro } : undefined);
  console.log(`[campaign-enqueue] campaign "${campaignKey}": enqueued ${count} new recipient(s)`);

  await disconnectFromDatabase().catch(() => {});
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch(async (err) => {
      console.error("[campaign-enqueue] failed:", err);
      await disconnectFromDatabase().catch(() => {});
      process.exit(1);
    });
}
