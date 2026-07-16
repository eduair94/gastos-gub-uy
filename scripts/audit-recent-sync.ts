/**
 * Audit recently-synced releases against the live OCDS API to measure data drift.
 *
 * Run ON THE SERVER (production Mongo only accepts local connections):
 *
 *   npx tsx scripts/audit-recent-sync.ts [months] [sampleSize]
 *
 *   months     how far back to look        (default 5)
 *   sampleSize how many releases to re-fetch and compare (default 300)
 *
 * It reports:
 *   - how many sampled releases are STALE (stored data no longer matches the live API)
 *   - a breakdown of what changed (new awards, changed status, changed amounts)
 *   - how many "non-final" releases exist in the window (what the weekly reconcile will refresh)
 */
import { connectToDatabase, disconnectFromDatabase } from '../shared/connection/database'
import { ReleaseModel } from '../shared/models'
import { ReleaseRSSFetcher } from '../src/services/release-rss-fetcher'

const fetcher = new ReleaseRSSFetcher('GastosGubUy-Audit/1.0')

function fingerprint(release: any) {
  const awards = release.awards || []
  const items = awards.flatMap((a: any) => a.items || [])
  return {
    awards: awards.length,
    items: items.length,
    status: release.tender?.status || null,
    tag: JSON.stringify(release.tag || []),
    itemAmountSum: items.reduce((s: number, i: any) => s + (i.unit?.value?.amount || 0), 0),
    suppliers: awards.flatMap((a: any) => (a.suppliers || []).map((s: any) => s.id)).sort().join(','),
  }
}

function diff(stored: any, live: any): string[] {
  const a = fingerprint(stored)
  const b = fingerprint(live)
  const out: string[] = []
  if (a.awards !== b.awards) out.push('awards')
  if (a.items !== b.items) out.push('items')
  if (a.status !== b.status) out.push('status')
  if (a.tag !== b.tag) out.push('tag')
  if (Math.round(a.itemAmountSum) !== Math.round(b.itemAmountSum)) out.push('amount')
  if (a.suppliers !== b.suppliers) out.push('suppliers')
  return out
}

async function main() {
  const months = Number(process.argv[2]) || 5
  const sampleSize = Number(process.argv[3]) || 300

  await connectToDatabase()

  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - months)

  const windowFilter = {
    $or: [{ rssPublishDate: { $gte: cutoff } }, { webFetchDate: { $gte: cutoff } }],
  }

  const totalInWindow = await ReleaseModel.countDocuments(windowFilter)

  const nonFinalFilter = {
    $and: [
      windowFilter,
      {
        $or: [
          { 'tender.status': { $in: ['active', 'planning', 'enquiry'] } },
          { awards: { $exists: false } },
          { awards: { $size: 0 } },
          { 'amount.hasAmounts': { $ne: true } },
        ],
      },
    ],
  }
  const nonFinalCount = await ReleaseModel.countDocuments(nonFinalFilter)

  console.log('\n' + '='.repeat(70))
  console.log(`AUDIT — last ${months} months (since ${cutoff.toISOString().split('T')[0]})`)
  console.log('='.repeat(70))
  console.log(`Releases synced in window:        ${totalInWindow}`)
  console.log(`Non-final (reconcile candidates): ${nonFinalCount}`)
  console.log(`Sampling up to ${sampleSize} releases to compare with the live API...\n`)

  const sample = await ReleaseModel.find(windowFilter)
    .select({ id: 1, ocid: 1, rssLink: 1, tender: 1, awards: 1, tag: 1, amount: 1 })
    .sort({ rssPublishDate: -1 })
    .limit(sampleSize)
    .lean()

  let checked = 0
  let stale = 0
  let fetchFailed = 0
  const reasons: Record<string, number> = {}
  const staleExamples: string[] = []

  const concurrency = 15
  for (let i = 0; i < sample.length; i += concurrency) {
    const group = sample.slice(i, i + concurrency)
    await Promise.all(
      group.map(async (doc: any) => {
        const url = doc.rssLink || `https://www.comprasestatales.gub.uy/ocds/release/${doc.id}`
        try {
          const live = await fetcher.fetchReleaseData(url)
          const liveRelease = live?.releases?.[0]
          if (!liveRelease) {
            fetchFailed++
            return
          }
          checked++
          const changed = diff(doc, liveRelease)
          if (changed.length > 0) {
            stale++
            changed.forEach((r) => { reasons[r] = (reasons[r] || 0) + 1 })
            if (staleExamples.length < 25) staleExamples.push(`${doc.id}  [${changed.join(', ')}]`)
          }
        } catch {
          fetchFailed++
        }
      }),
    )
    process.stdout.write(`\r   checked ${checked}/${sample.length} (stale so far: ${stale})`)
    await new Promise((r) => setTimeout(r, 500))
  }

  console.log('\n\n' + '-'.repeat(70))
  console.log('RESULTS')
  console.log('-'.repeat(70))
  console.log(`Compared:      ${checked}`)
  console.log(`Fetch failed:  ${fetchFailed}`)
  console.log(`STALE:         ${stale}  (${checked ? ((stale / checked) * 100).toFixed(1) : 0}% of compared)`)
  console.log(`\nChanged fields breakdown:`)
  Object.entries(reasons).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`   ${k.padEnd(12)} ${v}`))
  if (staleExamples.length) {
    console.log(`\nStale examples:`)
    staleExamples.forEach((e) => console.log('   - ' + e))
  }
  console.log(`\n👉 The weekly reconcile job will refresh the ${nonFinalCount} non-final releases automatically.`)
  console.log(`   To refresh now:  GET/POST http://localhost:3002/cron/reconcile\n`)

  await disconnectFromDatabase()
}

main().catch((e) => {
  console.error('Error:', e)
  process.exit(1)
})
