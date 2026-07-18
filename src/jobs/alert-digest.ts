/**
 * Daily digest (Phase 3): one bundled email per `frequency:'daily'` user with all
 * their still-pending alert notifications. Instant users are handled inline by the
 * hourly sync; this only picks up the daily cohort.
 *
 * Run:  npx tsx src/jobs/alert-digest.ts
 */
import { connectToDatabase, disconnectFromDatabase } from "../../shared/connection/database";
import { dispatchAlerts } from "./alerts/dispatch";

async function main(): Promise<void> {
  const log = (m: string) => console.log(`[alert-digest] ${m}`);
  await connectToDatabase();
  const res = await dispatchAlerts({ frequency: "daily", log });
  log(`digest complete: ${res.emailsSent} emails to daily users`);
}

main()
  .then(async () => {
    await disconnectFromDatabase();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("[alert-digest] failed:", err);
    await disconnectFromDatabase().catch(() => {});
    process.exit(1);
  });
