#!/usr/bin/env tsx
/**
 * Full-scan rollup of contracting-unit contacts into procurement_contacts,
 * one doc per organism (buyer.id). Source: parties[].contactPoint on tender
 * releases (the feed carries no contact on awards). Public data.
 *
 * No index on parties.contactPoint — this is a COLLSCAN with allowDiskUse; run
 * on the server (167) with the raised socket timeout. Compute-then-swap by
 * dataVersion so a partial run never leaves the collection half-empty.
 */
import { connectToDatabase, disconnectFromDatabase } from '../../shared/connection/database'
import { ReleaseModel } from '../../shared/models/release'
import { ProcurementContactModel, type IContactVariant } from '../../shared/models/procurement_contacts'

interface Row {
  _id: string
  organismName: string
  lastSeenAt: Date | null
  sampleReleaseId: string
  llamadosCount: number
  contacts: Array<{ name?: string, email?: string, telephone?: string, faxNumber?: string, date?: Date | null }>
}

async function run(): Promise<void> {
  const started = Date.now()
  if (!process.env.MONGO_SOCKET_TIMEOUT_MS) {
    process.env.MONGO_SOCKET_TIMEOUT_MS = String(15 * 60 * 1000)
  }
  const dataVersion = `v${Date.now()}`
  console.log('[refresh-contacts] connecting…')
  await connectToDatabase()

  console.log('[refresh-contacts] aggregating…')
  const rows = await ReleaseModel.aggregate<Row>([
    {
      $match: {
        tag: { $in: ['tender', 'tenderUpdate'] },
        'buyer.id': { $exists: true, $ne: null },
        'parties.contactPoint.email': { $exists: true, $ne: null },
      },
    },
    {
      $project: {
        ocid: 1,
        id: 1,
        date: 1,
        buyerId: '$buyer.id',
        buyerName: '$buyer.name',
        party: {
          $first: {
            $filter: {
              input: { $ifNull: ['$parties', []] },
              as: 'p',
              cond: {
                $and: [
                  { $ne: [{ $ifNull: ['$$p.contactPoint.email', null] }, null] },
                  { $gt: [{ $size: { $ifNull: [{ $setIntersection: ['$$p.roles', ['procuringEntity', 'buyer']] }, []] } }, 0] },
                ],
              },
            },
          },
        },
      },
    },
    { $match: { party: { $ne: null } } },
    {
      $group: {
        _id: '$buyerId',
        organismName: { $last: '$buyerName' },
        lastSeenAt: { $max: '$date' },
        sampleReleaseId: { $last: '$id' },
        llamadosCount: { $sum: 1 },
        contacts: {
          $push: {
            name: '$party.name',
            email: '$party.contactPoint.email',
            telephone: '$party.contactPoint.telephone',
            faxNumber: '$party.contactPoint.faxNumber',
            date: '$date',
          },
        },
      },
    },
  ]).option({ allowDiskUse: true })

  console.log(`[refresh-contacts] ${rows.length} organisms — writing…`)
  const now = new Date()
  for (const r of rows) {
    if (!r._id) continue
    // Newest contact wins as primary; the rest become distinct variants.
    const sorted = [...r.contacts].sort((a, b) => (new Date(b.date ?? 0).getTime()) - (new Date(a.date ?? 0).getTime()))
    const primary = sorted[0]
    const tel = (primary?.telephone ?? '').trim() || undefined
    const fax = (primary?.faxNumber ?? '').trim() || undefined
    const seen = new Set<string>()
    const variants: IContactVariant[] = []
    for (const c of sorted) {
      const email = (c.email ?? '').trim()
      const name = (c.name ?? '').trim()
      const key = `${name}|${email}`
      if (seen.has(key)) continue
      seen.add(key)
      if (c === primary) continue
      variants.push({ name: name || undefined, email: email || undefined, telephone: (c.telephone ?? '').trim() || undefined })
    }
    const organismName = (r.organismName ?? '').trim() || r._id
    const contactName = (primary?.name ?? '').trim() || undefined
    const email = (primary?.email ?? '').trim() || undefined
    const searchText = [organismName, contactName, email].filter(Boolean).join(' ').toLowerCase()

    await ProcurementContactModel.replaceOne(
      { organismId: r._id },
      {
        organismId: r._id,
        organismName,
        contactName,
        email,
        telephone: tel,
        faxNumber: fax && fax !== tel ? fax : undefined,
        variants: variants.slice(0, 20),
        llamadosCount: r.llamadosCount,
        lastSeenAt: r.lastSeenAt ?? null,
        sampleReleaseId: r.sampleReleaseId,
        searchText,
        dataVersion,
        calculatedAt: now,
      },
      { upsert: true }
    )
  }
  const swept = await ProcurementContactModel.deleteMany({ dataVersion: { $ne: dataVersion } })
  console.log(`[refresh-contacts] done in ${((Date.now() - started) / 1000).toFixed(1)}s — ${rows.length} organisms (swept ${swept.deletedCount} stale)`)
}

run()
  .then(async () => { await disconnectFromDatabase(); process.exit(0) })
  .catch(async (err) => { console.error('[refresh-contacts] failed:', err); await disconnectFromDatabase().catch(() => {}); process.exit(1) })
