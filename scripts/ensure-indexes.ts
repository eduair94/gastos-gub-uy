#!/usr/bin/env tsx

/**
 * Idempotent, resumable index migration for the advanced-filter work.
 *
 * This runs against a LIVE ~2.1M-document `releases` collection, so:
 *   - every build is issued with `{ background: true }`;
 *   - anything that already exists is skipped, making the script safe to
 *     re-run after a crash, a timeout, or a partial run;
 *   - nothing is ever dropped. Redundant indexes are only *reported*.
 *
 * Usage:
 *   npx tsx scripts/ensure-indexes.ts --dry-run   # print the plan, touch nothing
 *   npx tsx scripts/ensure-indexes.ts             # actually build
 */

import { config } from 'dotenv'
import { MongoClient } from 'mongodb'
import type { Db, IndexDirection } from 'mongodb'
import { TenderForecastModel } from '../shared/models'

config()

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI
const DB_NAME = 'gastos_gub'
const COLLECTION = 'releases'

/** A compound index key, kept as ordered entries because field order is
 *  load-bearing in MongoDB compound indexes. */
type IndexKey = Record<string, IndexDirection>

interface IndexSpec {
  name: string
  key: IndexKey
  /** Why this index exists — printed in the plan so a reviewer can judge it. */
  rationale: string
}

/**
 * The advanced filters combine year + buyer + supplier + amount + status +
 * method + currency, and always sort by `date` desc or `amount.primaryAmount`
 * desc. Each spec below puts the equality-filtered field first and the sort
 * field last, which is what lets MongoDB satisfy the sort from the index
 * instead of doing an in-memory SORT stage.
 */
const INDEX_SPECS: IndexSpec[] = [
  // `tag` is the lifecycle stage (award / tender / tenderUpdate / …). The
  // explorer defaults to `tag: 'award'` because only award releases carry a
  // supplier and an amount, so this is now on the hot path for the landing
  // view — and it was previously unindexed, which timed the stats facet out.
  {
    name: 'tag_1_date_-1',
    key: { tag: 1, date: -1 },
    rationale: 'Stage filter + default date sort (explorer landing view)',
  },
  {
    name: 'tag_1_amount.primaryAmount_-1',
    key: { 'tag': 1, 'amount.primaryAmount': -1 },
    rationale: 'Stage filter + amount sort, and the index-seek median',
  },
  {
    name: 'tag_1_sourceYear_1',
    key: { tag: 1, sourceYear: 1 },
    rationale: 'Stage filter + per-year histogram in the stats facet',
  },
  {
    name: 'sourceYear_1_amount.primaryAmount_-1',
    key: { 'sourceYear': 1, 'amount.primaryAmount': -1 },
    rationale: 'Year filter + amount sort',
  },
  {
    name: 'buyer.name_1_amount.primaryAmount_-1',
    key: { 'buyer.name': 1, 'amount.primaryAmount': -1 },
    rationale: 'Buyer filter + amount sort',
  },
  {
    name: 'awards.suppliers.name_1_date_-1',
    key: { 'awards.suppliers.name': 1, 'date': -1 },
    rationale: 'Supplier-name filter + date sort',
  },
  {
    name: 'awards.suppliers.id_1_date_-1',
    key: { 'awards.suppliers.id': 1, 'date': -1 },
    rationale: 'Supplier-id filter + date sort',
  },
  {
    name: 'tender.procurementMethod_1_date_-1',
    key: { 'tender.procurementMethod': 1, 'date': -1 },
    rationale: 'Procurement-method filter + date sort',
  },
  {
    name: 'amount.primaryAmount_-1_date_-1',
    key: { 'amount.primaryAmount': -1, 'date': -1 },
    rationale: 'Amount range/sort + date tiebreak',
  },
  {
    name: 'amount.hasAmounts_1_date_-1',
    key: { 'amount.hasAmounts': 1, 'date': -1 },
    rationale: 'Has-amounts filter + date sort',
  },
  {
    name: 'amount.currencies_1_date_-1',
    key: { 'amount.currencies': 1, 'date': -1 },
    rationale: 'Currency filter + date sort',
  },
  {
    name: 'sourceYear_1_buyer.name_1',
    key: { 'sourceYear': 1, 'buyer.name': 1 },
    rationale: 'Year + buyer combined filter',
  },

  // `tender.procurementMethodDetails` carries the human-meaningful Uruguayan
  // procedure names the UI actually filters on ("Compra Directa" 484,778 /
  // "Licitación Abreviada" 103,429 / "Concurso de Precios" 38,908 / …), whereas
  // `tender.procurementMethod` only holds the English OCDS enum. It had no
  // index at all before this migration.
  //
  // These lead with a field that is null in 69.31% of documents (1,505,391 of
  // 2,171,928). That is deliberately NOT a partialFilterExpression — see the
  // note above `reportRedundant` for the measurements behind that call.
  {
    name: 'tender.procurementMethodDetails_1_date_-1',
    key: { 'tender.procurementMethodDetails': 1, 'date': -1 },
    rationale: 'Procedure-name filter + date sort (primary UI filter)',
  },
  {
    name: 'tender.procurementMethodDetails_1_amount.primaryAmount_-1',
    key: { 'tender.procurementMethodDetails': 1, 'amount.primaryAmount': -1 },
    rationale: 'Procedure-name filter + amount sort',
  },
  {
    name: 'sourceYear_1_tender.procurementMethodDetails_1',
    key: { 'sourceYear': 1, 'tender.procurementMethodDetails': 1 },
    rationale: 'Year + procedure-name combined filter',
  },

  // Catalogue code (classification.id). Multikey over the awards.items array.
  // Backs the product pages and the price-reference "comparables" link, which
  // filter `awards.items.classification.id` exactly and sort by date/amount.
  // Without it, a categoryId filter degrades to the same unindexed full-range
  // walk that timed out the description-keyed `category` filter (15s aggregate
  // / 4s count), surfacing as a 500 on the comparables link.
  {
    name: 'awards.items.classification.id_1_date_-1',
    key: { 'awards.items.classification.id': 1, 'date': -1 },
    rationale: 'Catalogue-code filter + date sort (product pages, comparables link)',
  },
  {
    name: 'awards.items.classification.id_1_amount.primaryAmount_-1',
    key: { 'awards.items.classification.id': 1, 'amount.primaryAmount': -1 },
    rationale: 'Catalogue-code filter + amount sort',
  },
]

/** Ordered [field, direction] pairs. Order matters for compound indexes. */
function keyEntries(key: Record<string, unknown>): Array<[string, string]> {
  return Object.entries(key).map(([field, dir]) => [field, String(dir)])
}

/** Two index keys are the same iff the field order AND directions match. */
function sameKeyShape(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const ea = keyEntries(a)
  const eb = keyEntries(b)
  if (ea.length !== eb.length) return false
  return ea.every(([field, dir], i) => eb[i]![0] === field && eb[i]![1] === dir)
}

/**
 * True when `candidate` is a strict prefix of `full` and therefore redundant:
 * MongoDB can use any prefix of a compound index on its own.
 *
 * Directions must either match exactly or be *fully* inverted — an index and
 * its complete mirror image ({a:1,b:-1} vs {a:-1,b:1}) are interchangeable,
 * since the engine can walk an index backwards.
 */
function isStrictPrefix(candidate: Record<string, unknown>, full: Record<string, unknown>): boolean {
  const ec = keyEntries(candidate)
  const ef = keyEntries(full)
  if (ec.length === 0 || ec.length >= ef.length) return false
  // Field names must line up positionally.
  if (!ec.every(([field], i) => ef[i]![0] === field)) return false

  const numeric = (d: string) => (d === '-1' ? -1 : d === '1' ? 1 : NaN)
  const exact = ec.every(([, dir], i) => dir === ef[i]![1])
  const inverted = ec.every(([, dir], i) => {
    const c = numeric(dir)
    const f = numeric(ef[i]![1])
    return !Number.isNaN(c) && !Number.isNaN(f) && c === -f
  })
  return exact || inverted
}

/** Indexes we must never flag or touch: the _id index and any text index. */
function isProtected(idx: { name?: string, key: Record<string, unknown> }): boolean {
  if (idx.name === '_id_') return true
  return Object.values(idx.key).includes('text')
}

async function ensureIndexes(db: Db, dryRun: boolean): Promise<number> {
  const collection = db.collection(COLLECTION)

  const existing = await collection.indexes()
  console.log(`\n📋 Collection "${COLLECTION}" currently has ${existing.length} index(es):`)
  for (const idx of existing) {
    console.log(`   - ${idx.name}: ${JSON.stringify(idx.key)}`)
  }

  console.log(`\n${dryRun ? '📝 PLAN (dry run — nothing will be created)' : '🔨 APPLYING'}`)
  console.log('─'.repeat(72))

  let created = 0
  let skipped = 0
  let failed = 0

  for (const spec of INDEX_SPECS) {
    const match = existing.find(idx => sameKeyShape(idx.key, spec.key))
    const keyJson = JSON.stringify(spec.key)

    if (match) {
      console.log(`⏭️  skip (exists)  ${keyJson}`)
      console.log(`                  └─ already present as "${match.name}"`)
      skipped++
      continue
    }

    if (dryRun) {
      console.log(`➕ would create   ${keyJson}`)
      console.log(`                  └─ ${spec.rationale} (name: ${spec.name})`)
      created++
      continue
    }

    const startedAt = Date.now()
    try {
      console.log(`🔨 creating       ${keyJson} …`)
      // `background` is a no-op on MongoDB >= 4.2 (all builds use the hybrid
      // builder, which does not hold an exclusive lock) but is kept explicit:
      // it is required on older servers and harmless on newer ones.
      const result = await collection.createIndex(spec.key, {
        name: spec.name,
        background: true,
      })
      console.log(`✅ created        ${result} in ${Date.now() - startedAt}ms`)
      created++
    }
    catch (error) {
      console.error(`❌ failed         ${keyJson} after ${Date.now() - startedAt}ms`)
      console.error(`                  └─ ${error instanceof Error ? error.message : String(error)}`)
      failed++
    }
  }

  console.log('─'.repeat(72))
  console.log(
    dryRun
      ? `📝 Dry run summary: ${created} to create, ${skipped} already present, 0 changed.`
      : `📊 Summary: ${created} created, ${skipped} skipped, ${failed} failed.`,
  )

  reportRedundant(existing)

  return failed
}

/**
 * Why none of these are partial indexes
 * ─────────────────────────────────────
 * Indexes 10 and 11 lead with `tender.procurementMethodDetails`, which is null
 * in 69.31% of documents, so a
 * `partialFilterExpression: { 'tender.procurementMethodDetails': { $exists: true } }`
 * looks tempting. Measured against the live collection, it is not worth it:
 *
 *   - A null-heavy leading field costs essentially nothing. The live
 *     `tender.status_1_date_-1` index leads with a field that is null in 91.56%
 *     of documents and occupies 27.3 MB; `sourceYear_1_date_-1`, whose leading
 *     field is populated in ~100% of documents, occupies 27.1 MB. Same size.
 *     WiredTiger prefix-compresses the 1.5M repeated nulls down to near zero,
 *     so the premise that the nulls bloat the index does not hold here.
 *   - The saving is therefore only the ~666k indexed entries vs 2.17M, i.e.
 *     roughly 19 MB per index — about 1.6% of the ~1.15 GB this collection
 *     already spends on indexes (753.8 MB of which is the text index alone).
 *   - The cost is a silent cliff. A partial index is only used when the planner
 *     can *prove* the query predicate is a subset of the filter expression. Any
 *     query that fails that proof falls back to a COLLSCAN over 2.17M documents
 *     with no error and no warning. A faceted UI emits `$in` predicates and
 *     "no method" / null searches, which is exactly where that proof gets
 *     brittle — and it would permanently couple the API to emitting a matching
 *     `$exists: true` on every method query, forever, in every new call site.
 *
 * 19 MB is not worth buying a silent full-collection-scan footgun. Plain
 * indexes it is. Revisit only if index size becomes an actual constraint, and
 * then start with the 753.8 MB text index, not these.
 */

/**
 * Reports — but never drops — existing indexes that a planned index makes
 * redundant. Dropping an index on a live collection is a judgement call about
 * traffic that this script has no business making, so a human decides.
 */
function reportRedundant(existing: Array<{ name?: string, key: Record<string, unknown> }>): void {
  const findings: Array<{ name: string, key: string, coveredBy: string }> = []

  for (const idx of existing) {
    if (isProtected(idx)) continue
    // Something we are about to create ourselves is not "existing cruft".
    if (INDEX_SPECS.some(spec => sameKeyShape(idx.key, spec.key))) continue

    const cover = INDEX_SPECS.find(spec => isStrictPrefix(idx.key, spec.key))
    if (cover) {
      findings.push({
        name: idx.name ?? '(unnamed)',
        key: JSON.stringify(idx.key),
        coveredBy: JSON.stringify(cover.key),
      })
    }
  }

  console.log('\n⚠️  Redundant-index report (informational — nothing is dropped)')
  console.log('─'.repeat(72))
  if (findings.length === 0) {
    console.log('   None. No existing index is a strict prefix of a planned index.')
    return
  }
  console.log(`   ${findings.length} existing index(es) are a strict prefix of a planned index.`)
  console.log('   MongoDB can serve prefix queries from the longer index, so these are')
  console.log('   candidates for dropping. Verify with $indexStats before removing any:\n')
  for (const f of findings) {
    console.log(`   • ${f.name}`)
    console.log(`       key:        ${f.key}`)
    console.log(`       covered by: ${f.coveredBy}`)
  }
  console.log('\n   Check real usage first:')
  console.log(`     db.${COLLECTION}.aggregate([{ $indexStats: {} }])`)
  console.log('   An index with a low `accesses.ops` count that is listed above is a safe drop.')
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run')

  if (!MONGO_URI) {
    console.error('❌ MONGODB_URI (or MONGO_URI) is not set. Add it to your .env file.')
    process.exit(1)
  }

  console.log('🗂️  ensure-indexes')
  console.log(`   database:   ${DB_NAME}`)
  console.log(`   collection: ${COLLECTION}`)
  console.log(`   mode:       ${dryRun ? 'DRY RUN (no writes)' : 'LIVE (indexes will be built in background)'}`)

  const client = new MongoClient(MONGO_URI)
  try {
    await client.connect()
    console.log('✅ Connected')

    const failed = await ensureIndexes(client.db(DB_NAME), dryRun)

    // Side collections. Mongoose `autoIndex` is off globally (replaying
    // schema indexes against the live 2.1M `releases` collection on every
    // boot is what it protects against), so schema-declared indexes on the
    // small side collections must be ensured here instead.
    //
    // `contract_item_features` is the per-compra cache of scraped item
    // características (see server/api/contracts/[id]/features.get.ts); the
    // unique key is what makes its upsert idempotent.
    if (!dryRun) {
      await client.db(DB_NAME)
        .collection('contract_item_features')
        .createIndex({ compraId: 1 }, { unique: true, background: true })
      console.log('✅ contract_item_features.compraId_1 (unique) ensured')

      // product_analytics is rebuilt (compute-then-swap) by
      // src/jobs/refresh-product-analytics.ts. `code` is the point-lookup key
      // the detail API uses; the rank indexes back the list page's sort.
      const products = client.db(DB_NAME).collection('product_analytics')
      await products.createIndex({ code: 1 }, { unique: true, background: true })
      await products.createIndex({ rankBySpend: 1 }, { background: true })
      await products.createIndex({ rankByLines: 1 }, { background: true })
      // rubroPath backs the SICE rubro filter on the products list (prefix regex).
      await products.createIndex({ rubroPath: 1 }, { background: true })
      console.log('✅ product_analytics indexes ensured (code unique, rankBySpend, rankByLines, rubroPath)')

      // product_variants is rebuilt (compute-then-swap) by
      // src/jobs/refresh-product-variants.ts; the product API reads one doc per
      // code, and the swap deletes older dataVersions.
      const variants = client.db(DB_NAME).collection('product_variants')
      await variants.createIndex({ code: 1 }, { unique: true, background: true })
      await variants.createIndex({ dataVersion: 1 }, { background: true })
      console.log('✅ product_variants indexes ensured (code unique, dataVersion)')

      // anomalies: the AI-triage view filters on aiVerdict.explainable and sorts
      // worst-first by severityRank (see src/jobs/score-anomalies-ai.ts + the
      // /api/analytics/anomalies `ai` filter). Declared on AnomalySchema, but
      // autoIndex is off so it is ensured here.
      const anomaliesCol = client.db(DB_NAME).collection('anomalies')
      await anomaliesCol.createIndex({ 'aiVerdict.explainable': 1, severityRank: -1 }, { background: true })
      // Keyset pagination for /api/v1/anomalies/changes (newest-first by first-seen, _id tiebreak).
      await anomaliesCol.createIndex({ firstDetectedAt: -1, _id: -1 }, { background: true })
      console.log('✅ anomalies indexes ensured (aiVerdict.explainable+severityRank, firstDetectedAt+_id)')

      // provider_anomaly_stats: the unexplained-flags-by-provider cross-reference, rebuilt
      // (compute-then-swap) by src/jobs/cross-provider-anomalies.ts. `supplierName` unique is the
      // upsert key; the rest back the /api/analytics/provider-anomalies sorts. The summary rollup
      // is read by calculatedAt desc.
      const provStats = client.db(DB_NAME).collection('provider_anomaly_stats')
      await provStats.createIndex({ supplierName: 1 }, { unique: true, background: true })
      await provStats.createIndex({ flagCount: -1 }, { background: true })
      await provStats.createIndex({ primaryOverprice: -1 }, { background: true })
      await provStats.createIndex({ overpriceUyuToday: -1 }, { background: true })
      await provStats.createIndex({ worstZ: -1 }, { background: true })
      await client.db(DB_NAME)
        .collection('provider_anomaly_summary')
        .createIndex({ calculatedAt: -1 }, { background: true })
      console.log('✅ provider_anomaly_stats indexes ensured (supplierName unique, flagCount, primaryOverprice, worstZ) + summary.calculatedAt')

      // organism_group_stats: precomputed spending rollups per organism group (Intendencias,
      // Ministerios, Salud, Entes, Educación), rebuilt monthly (compute-then-swap by dataVersion)
      // by src/jobs/refresh-organism-groups.ts. `groupKey` unique is the upsert/read key.
      const organismStats = client.db(DB_NAME).collection('organism_group_stats')
      await organismStats.createIndex({ groupKey: 1 }, { unique: true, background: true })
      await organismStats.createIndex({ dataVersion: 1 }, { background: true })
      console.log('✅ organism_group_stats indexes ensured (groupKey unique, dataVersion)')

      // ---- Monitor de Llamados + auth collections ----
      // These are small, hot collections whose schema-declared indexes must be
      // ensured here (autoIndex off). Unique keys enforce idempotent upserts and
      // one-notification-per-(type,user,call).
      const db = client.db(DB_NAME)

      const users = db.collection('users')
      await users.createIndex({ uid: 1 }, { unique: true, background: true })
      await users.createIndex({ email: 1 }, { unique: true, background: true })
      await users.createIndex({ unsubscribeToken: 1 }, { unique: true, background: true })
      console.log('✅ users indexes ensured (uid, email, unsubscribeToken — all unique)')

      const watches = db.collection('watches')
      await watches.createIndex({ userId: 1 }, { background: true })
      await watches.createIndex({ active: 1, categories: 1 }, { background: true })
      await watches.createIndex({ active: 1 }, { background: true })
      console.log('✅ watches indexes ensured (userId, active+categories, active)')

      const openCalls = db.collection('open_calls')
      await openCalls.createIndex({ compraId: 1 }, { unique: true, background: true })
      await openCalls.createIndex({ classificationSet: 1 }, { background: true })
      await openCalls.createIndex({ 'tenderPeriod.endDate': 1 }, { background: true })
      await openCalls.createIndex({ 'buyer.id': 1 }, { background: true })
      await openCalls.createIndex({ status: 1, 'tenderPeriod.endDate': 1 }, { background: true })
      await openCalls.createIndex({ firstSeenAt: -1 }, { background: true })
      // Keyset pagination for /api/v1/tenders/changes (newest-first, _id tiebreak).
      await openCalls.createIndex({ firstSeenAt: -1, _id: -1 }, { background: true })
      // Keyword search over the normalized concat. `default_language: 'none'`
      // disables stemming for exact/substring phrase matching, mirroring the
      // releases exact-search index. One text index per collection — this is it.
      await openCalls.createIndex(
        { searchText: 'text' },
        { name: 'open_calls_text', default_language: 'none', background: true },
      )
      console.log('✅ open_calls indexes ensured (compraId unique, classificationSet, endDate, buyer.id, status+endDate, firstSeenAt, text)')

      const notifications = db.collection('notifications')
      await notifications.createIndex({ dedupeKey: 1 }, { unique: true, background: true })
      await notifications.createIndex({ status: 1, type: 1 }, { background: true })
      await notifications.createIndex({ userId: 1, createdAt: -1 }, { background: true })
      await notifications.createIndex({ status: 1, scheduledFor: 1 }, { background: true })
      // Inbox list + unread badge (a user's rows for one channel, newest first).
      await notifications.createIndex({ userId: 1, channel: 1, createdAt: -1 }, { background: true })
      // Per-channel drain query for the push/telegram dispatchers.
      await notifications.createIndex({ status: 1, channel: 1 }, { background: true })
      console.log('✅ notifications indexes ensured (dedupeKey unique, status+type, userId+createdAt, status+scheduledFor, userId+channel+createdAt, status+channel)')

      // push_subscriptions: one Web Push endpoint per browser/device. endpoint
      // unique makes re-subscribe an idempotent upsert; userId backs the fan-out.
      const pushSubs = db.collection('push_subscriptions')
      await pushSubs.createIndex({ endpoint: 1 }, { unique: true, background: true })
      await pushSubs.createIndex({ userId: 1 }, { background: true })
      console.log('✅ push_subscriptions indexes ensured (endpoint unique, userId)')

      const savedCalls = db.collection('saved_calls')
      await savedCalls.createIndex({ userId: 1, compraId: 1 }, { unique: true, background: true })
      await savedCalls.createIndex({ userId: 1, createdAt: -1 }, { background: true })
      console.log('✅ saved_calls indexes ensured (userId+compraId unique, userId+createdAt)')

      // anomaly_feedback: a user's up/down verdict (+ optional comment) on one anomaly
      // flag. userId+anomalyId unique makes re-voting an idempotent upsert; anomalyId
      // backs the public count aggregate; userId+createdAt backs the "my feedback" list.
      const anomalyFeedback = db.collection('anomaly_feedback')
      await anomalyFeedback.createIndex({ userId: 1, anomalyId: 1 }, { unique: true, background: true })
      // Compound so the up/down count aggregate ($match anomalyId, $group by vote) is
      // covered by the index — no per-vote document fetch. The {anomalyId} prefix still
      // serves plain by-anomaly lookups.
      await anomalyFeedback.createIndex({ anomalyId: 1, vote: 1 }, { background: true })
      await anomalyFeedback.createIndex({ userId: 1, createdAt: -1 }, { background: true })
      console.log('✅ anomaly_feedback indexes ensured (userId+anomalyId unique, anomalyId+vote, userId+createdAt)')

      // api_keys: user-issued API credentials. `prefix` unique is the O(1) lookup
      // key the apiAuth middleware resolves the bearer/x-api-key header against.
      const apiKeys = db.collection('api_keys')
      await apiKeys.createIndex({ prefix: 1 }, { unique: true, background: true })
      await apiKeys.createIndex({ userId: 1, createdAt: -1 }, { background: true })
      console.log('✅ api_keys indexes ensured (prefix unique, userId+createdAt)')

      // webhook_subscriptions: REST-Hook targets. active+events drives the producer
      // fan-out; userId+createdAt backs the management list.
      const webhookSubs = db.collection('webhook_subscriptions')
      await webhookSubs.createIndex({ userId: 1, createdAt: -1 }, { background: true })
      await webhookSubs.createIndex({ active: 1, events: 1 }, { background: true })
      console.log('✅ webhook_subscriptions indexes ensured (userId+createdAt, active+events)')

      // webhook_deliveries: idempotent outbox. dedupeKey unique makes enqueue safe
      // to re-run; status+nextAttemptAt is the dispatcher's drain query.
      const webhookDeliveries = db.collection('webhook_deliveries')
      await webhookDeliveries.createIndex({ dedupeKey: 1 }, { unique: true, background: true })
      await webhookDeliveries.createIndex({ status: 1, nextAttemptAt: 1 }, { background: true })
      console.log('✅ webhook_deliveries indexes ensured (dedupeKey unique, status+nextAttemptAt)')

      // ---- SICE / CUBS article catalog ----
      // sice_catalog: per-article, keyed by `code` (== classification.id). The text
      // index backs the alerts picker search over canonical name + synonyms.
      const siceCatalog = db.collection('sice_catalog')
      await siceCatalog.createIndex({ code: 1 }, { unique: true, background: true })
      await siceCatalog.createIndex({ rubroPath: 1 }, { background: true })
      await siceCatalog.createIndex({ rubroTokens: 1 }, { background: true })
      await siceCatalog.createIndex({ dataVersion: 1 }, { background: true })
      await siceCatalog.createIndex(
        { canonicalName: 'text', synonyms: 'text' },
        { name: 'sice_catalog_text', default_language: 'none', background: true },
      )
      console.log('✅ sice_catalog indexes ensured (code unique, rubroPath, rubroTokens, dataVersion, text)')

      // sice_rubro: the tree nodes for the picker/breadcrumbs.
      const siceRubro = db.collection('sice_rubro')
      await siceRubro.createIndex({ token: 1 }, { unique: true, background: true })
      await siceRubro.createIndex({ parentToken: 1 }, { background: true })
      await siceRubro.createIndex({ level: 1 }, { background: true })
      await siceRubro.createIndex({ dataVersion: 1 }, { background: true })
      await siceRubro.createIndex(
        { name: 'text' },
        { name: 'sice_rubro_text', default_language: 'none', background: true },
      )
      console.log('✅ sice_rubro indexes ensured (token unique, parentToken, level, dataVersion, text)')

      // --- supplier_contacts (Phase A enrichment) ---
      const sc = db.collection('supplier_contacts')
      await sc.createIndex({ supplierId: 1 }, { unique: true, background: true, name: 'supplierId_1' })
      await sc.createIndex({ rut: 1 }, { background: true, name: 'rut_1' })
      await sc.createIndex({ status: 1, priorityScore: -1 }, { background: true, name: 'status_1_priorityScore_-1' })
      await sc.createIndex({ 'rubros.classificationId': 1 }, { background: true, name: 'rubros.classificationId_1' })
      await sc.createIndex({ placeSource: 1 }, { background: true, name: 'placeSource_1' })
      await sc.createIndex({ locality: 1 }, { background: true, name: 'locality_1' })
      console.log('✅ supplier_contacts indexes ensured')

      // --- campaign collections (Phase B) ---
      const sup = db.collection('email_suppressions')
      await sup.createIndex({ email: 1 }, { unique: true, background: true, name: 'email_1' })
      const camp = db.collection('email_campaigns')
      await camp.createIndex({ key: 1 }, { unique: true, background: true, name: 'key_1' })
      const csend = db.collection('campaign_sends')
      await csend.createIndex({ campaignId: 1, email: 1 }, { unique: true, background: true, name: 'campaignId_1_email_1' })
      await csend.createIndex({ token: 1 }, { unique: true, background: true, name: 'token_1' })
      await csend.createIndex({ status: 1, campaignId: 1 }, { background: true, name: 'status_1_campaignId_1' })
      await csend.createIndex({ providerMessageId: 1 }, { background: true, name: 'providerMessageId_1' })
      console.log('✅ campaign collections indexes ensured')

      // tender_forecast: precomputed recurrence forecast per (buyer.id × SICE rubro node),
      // rebuilt monthly (compute-then-swap by dataVersion) by
      // src/jobs/refresh-tender-forecast.ts. buyerId+rubroNodeId unique is the upsert/read
      // key; the rest back the read endpoint's sorts/filters. Collection name sourced from
      // the schema (shared/models/tender_forecast.ts) to avoid string drift.
      const forecast = db.collection(TenderForecastModel.collection.collectionName)
      await forecast.createIndex({ buyerId: 1, rubroNodeId: 1 }, { unique: true, background: true, name: 'buyerId_1_rubroNodeId_1' })
      await forecast.createIndex({ dataVersion: 1 }, { background: true, name: 'dataVersion_1' })
      await forecast.createIndex({ 'expectedWindow.start': 1 }, { background: true, name: 'expectedWindow.start_1' })
      // Backs the read endpoint's default filter (expectedWindow.end >= now); without it
      // that query walks expectedWindow.start and fetches ~2/3 of the collection before paging.
      await forecast.createIndex({ 'expectedWindow.end': 1 }, { background: true, name: 'expectedWindow.end_1' })
      await forecast.createIndex({ rubroAncestors: 1 }, { background: true, name: 'rubroAncestors_1' })
      await forecast.createIndex({ confidence: -1 }, { background: true, name: 'confidence_-1' })
      console.log('✅ tender_forecast indexes ensured (buyerId+rubroNodeId unique, dataVersion, expectedWindow.start, expectedWindow.end, rubroAncestors, confidence)')
    }
    else {
      console.log('   plan: contract_item_features.compraId_1 (unique)')
      console.log('   plan: product_analytics.code_1 (unique), rankBySpend_1, rankByLines_1')
      console.log('   plan: anomalies.aiVerdict.explainable_1_severityRank_-1')
      console.log('   plan: provider_anomaly_stats.{supplierName unique, flagCount, primaryOverprice, worstZ} + summary.calculatedAt')
      console.log('   plan: organism_group_stats.{groupKey unique, dataVersion}')
      console.log('   plan: users.{uid,email,unsubscribeToken} (unique)')
      console.log('   plan: watches.{userId, active+categories, active}')
      console.log('   plan: open_calls.{compraId unique, classificationSet, tenderPeriod.endDate, buyer.id, status+endDate, firstSeenAt, text}')
      console.log('   plan: notifications.{dedupeKey unique, status+type, userId+createdAt, status+scheduledFor, userId+channel+createdAt, status+channel}')
      console.log('   plan: push_subscriptions.{endpoint unique, userId}')
      console.log('   plan: saved_calls.{userId+compraId unique, userId+createdAt}')
      console.log('   plan: anomaly_feedback.{userId+anomalyId unique, anomalyId+vote, userId+createdAt}')
      console.log('   plan: api_keys.{prefix unique, userId+createdAt}')
      console.log('   plan: webhook_subscriptions.{userId+createdAt, active+events}')
      console.log('   plan: webhook_deliveries.{dedupeKey unique, status+nextAttemptAt}')
      console.log('   plan: sice_catalog.{code unique, rubroPath, rubroTokens, dataVersion, text}')
      console.log('   plan: sice_rubro.{token unique, parentToken, level, dataVersion, text}')
      console.log('   plan: supplier_contacts.{supplierId unique, rut, status+priorityScore, rubros.classificationId, placeSource, locality}')
      console.log('   plan: tender_forecast.{buyerId+rubroNodeId unique, dataVersion, expectedWindow.start, expectedWindow.end, rubroAncestors, confidence}')
    }

    if (failed > 0) {
      console.error(`\n❌ ${failed} index build(s) failed. Re-run to retry — completed indexes are skipped.`)
      process.exitCode = 1
      return
    }

    console.log(dryRun ? '\n✅ Dry run complete. Re-run without --dry-run to apply.' : '\n🎉 All indexes ensured.')
  }
  catch (error) {
    console.error('❌ ensure-indexes failed:', error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
  finally {
    await client.close()
    console.log('🔌 Connection closed')
  }
}

main()
