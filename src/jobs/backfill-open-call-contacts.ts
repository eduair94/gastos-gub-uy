#!/usr/bin/env tsx
/**
 * One-off: fill `contact` on open_calls that predate the projection change.
 * The hourly sync-open-calls covers new/updated calls; this covers the backlog.
 * Idempotent — re-runnable. Reads each call's source releases' parties and
 * applies the same pickPartyContact selector the projection uses.
 */
import { connectToDatabase, disconnectFromDatabase } from '../../shared/connection/database'
import { OpenCallModel } from '../../shared/models/open_call'
import { ReleaseModel } from '../../shared/models/release'
import { pickPartyContact } from '../../shared/utils/contact-point'

async function run(): Promise<void> {
  if (!process.env.MONGO_SOCKET_TIMEOUT_MS) {
    process.env.MONGO_SOCKET_TIMEOUT_MS = String(5 * 60 * 1000)
  }
  await connectToDatabase()
  const calls = await OpenCallModel.find({}, { compraId: 1, ocid: 1 }).lean()
  console.log(`[backfill-contacts] ${calls.length} open_calls`)
  let set = 0
  let cleared = 0
  for (const c of calls) {
    const rels = await ReleaseModel.find({ ocid: c.ocid }, { parties: 1 }).lean()
    const contact = pickPartyContact(rels.flatMap((r: any) => r.parties ?? []))
    if (contact) {
      await OpenCallModel.updateOne({ compraId: c.compraId }, { $set: { contact } })
      set++
    } else {
      await OpenCallModel.updateOne({ compraId: c.compraId }, { $unset: { contact: '' } })
      cleared++
    }
  }
  console.log(`[backfill-contacts] done — set ${set}, cleared ${cleared}`)
}

run()
  .then(async () => { await disconnectFromDatabase(); process.exit(0) })
  .catch(async (err) => { console.error('[backfill-contacts] failed:', err); await disconnectFromDatabase().catch(() => {}); process.exit(1) })
