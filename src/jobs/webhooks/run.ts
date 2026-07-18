#!/usr/bin/env tsx
import { config } from "dotenv";
config();

import { connectToDatabase, mongoose } from "../../../shared/connection/database";
import { produceWebhookDeliveries } from "./produce";
import { dispatchWebhookDeliveries } from "./dispatch";

// One webhook tick: enqueue deliveries for newly-seen events, then drain the
// outbox with signed POSTs. Spawned by the cron server via runJobProcess, so it
// must connect, do its work, and exit. Idempotent — safe to run every few minutes.
async function main(): Promise<void> {
  await connectToDatabase();
  const enqueued = await produceWebhookDeliveries();
  const { sent, failed } = await dispatchWebhookDeliveries();
  console.log(`[webhooks] enqueued=${enqueued} sent=${sent} failed=${failed}`);
}

main()
  .then(async () => {
    await mongoose.disconnect().catch(() => {});
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("[webhooks] run failed:", err instanceof Error ? err.message : err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
