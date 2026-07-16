/**
 * Diagnose a single release: is it in Mongo, is it fresh, and does it still match the live API?
 *
 * Run ON THE SERVER (the production Mongo at 69.166.230.55:27017 only accepts local connections).
 *
 *   npx tsx scripts/check-release.ts <query>
 *
 * <query> can be:
 *   - a release id            e.g. adjudicacion-496833
 *   - an ocid                 e.g. ocds-70d2nz-496833
 *   - a free-text fragment    e.g. "URBITEL"  (matched against supplier/buyer/title)
 *
 * Examples:
 *   npx tsx scripts/check-release.ts adjudicacion-496833
 *   npx tsx scripts/check-release.ts URBITEL
 *   npx tsx scripts/check-release.ts "Administración Nacional de Puertos"
 */
import { connectToDatabase, disconnectFromDatabase } from '../shared/connection/database'
import { ReleaseModel } from '../shared/models'
import { ReleaseRSSFetcher } from '../src/services/release-rss-fetcher'

const fetcher = new ReleaseRSSFetcher('GastosGubUy-Diagnostics/1.0')

function summarize(doc: any) {
  const awards = doc.awards || []
  const items = awards.flatMap((a: any) => a.items || [])
  return {
    id: doc.id,
    ocid: doc.ocid,
    date: doc.date,
    tag: doc.tag,
    tenderStatus: doc.tender?.status,
    buyer: doc.buyer?.name,
    title: doc.tender?.title,
    awards: awards.length,
    suppliers: awards.flatMap((a: any) => (a.suppliers || []).map((s: any) => s.name)),
    items: items.length,
    itemAmounts: items.map((i: any) => i.unit?.value?.amount),
    amountPrimary: doc.amount?.primaryAmount,
    amountHasAmounts: doc.amount?.hasAmounts,
    amountVersion: doc.amount?.version,
    sourceFileName: doc.sourceFileName,
    rssLink: doc.rssLink,
    rssPublishDate: doc.rssPublishDate,
    webFetchDate: doc.webFetchDate,
    reconciledAt: doc.reconciledAt,
  }
}

async function main() {
  const query = process.argv.slice(2).join(' ').trim()
  if (!query) {
    console.error('Usage: npx tsx scripts/check-release.ts <id | ocid | text>')
    process.exit(1)
  }

  await connectToDatabase()

  const rx = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
  const docs = await ReleaseModel.find({
    $or: [
      { id: query },
      { ocid: query },
      { id: rx },
      { ocid: rx },
      { 'awards.suppliers.name': rx },
      { 'buyer.name': rx },
      { 'tender.title': rx },
    ],
  })
    .limit(10)
    .lean()

  console.log(`\n🔎 Query: "${query}" -> ${docs.length} match(es) in Mongo\n`)

  if (docs.length === 0) {
    console.log('❌ Not found in the database.')
    await disconnectFromDatabase()
    return
  }

  for (const doc of docs) {
    console.log('='.repeat(70))
    console.log('STORED IN MONGO:')
    console.log(JSON.stringify(summarize(doc), null, 2))

    // Compare against the live OCDS API
    const url = (doc as any).rssLink || `https://www.comprasestatales.gub.uy/ocds/release/${doc.id}`
    try {
      const live = await fetcher.fetchReleaseData(url)
      const liveRelease = live?.releases?.[0]
      if (!liveRelease) {
        console.log(`\n⚠️  Live API returned no release for ${url}`)
        continue
      }
      console.log('\nLIVE API NOW:')
      console.log(JSON.stringify(summarize(liveRelease), null, 2))

      // Diff the things that matter
      const storedItems = (doc.awards || []).flatMap((a: any) => a.items || []).length
      const liveItems = (liveRelease.awards || []).flatMap((a: any) => a.items || []).length
      const storedAwards = (doc.awards || []).length
      const liveAwards = (liveRelease.awards || []).length
      const storedStatus = doc.tender?.status
      const liveStatus = liveRelease.tender?.status

      const diffs: string[] = []
      if (storedAwards !== liveAwards) diffs.push(`awards: stored ${storedAwards} vs live ${liveAwards}`)
      if (storedItems !== liveItems) diffs.push(`items: stored ${storedItems} vs live ${liveItems}`)
      if (storedStatus !== liveStatus) diffs.push(`tender.status: stored "${storedStatus}" vs live "${liveStatus}"`)
      if (JSON.stringify(doc.tag) !== JSON.stringify(liveRelease.tag)) diffs.push(`tag: ${JSON.stringify(doc.tag)} vs ${JSON.stringify(liveRelease.tag)}`)

      console.log('\n📊 VERDICT:')
      if (diffs.length === 0) {
        console.log('✅ Stored data matches the live API (up to date).')
      } else {
        console.log('🚨 STALE — stored data differs from the live API:')
        diffs.forEach((d) => console.log('   - ' + d))
      }
    } catch (err) {
      console.log(`\n⚠️  Could not fetch live API (${url}): ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  await disconnectFromDatabase()
}

main().catch((e) => {
  console.error('Error:', e)
  process.exit(1)
})
