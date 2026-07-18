import { createError, defineEventHandler, readBody, setHeader } from 'h3'
import { connectToDatabase } from '../../../utils/database'
import { ContractItemFeaturesModel } from '../../../utils/models'
import { scrapeItemFeatures } from '../../../utils/item-features'
import { awardUrl, sourceUrl } from '../../../utils/query'

/**
 * Batch características for a page of contracts. Cache-first: cached compras
 * return instantly; misses are scraped (via the shared util) under a small
 * concurrency cap within a wall-clock budget, and anything still unfetched comes
 * back `{ pending: true }` so the client can re-request later — the cache warms
 * across views. The client sends `ocid` per row so we never guess the gov URL
 * prefix; `compraId` is the cache key.
 */
const MAX_ITEMS = 25
const CONCURRENCY = 5
const BUDGET_MS = 12000

interface In { compraId: string, ocid: string }

export default defineEventHandler(async (event) => {
  await connectToDatabase()
  const body = await readBody<{ items?: unknown }>(event)
  const raw = Array.isArray(body?.items) ? body!.items : []
  const seen = new Set<string>()
  const items: In[] = []
  for (const it of raw) {
    const o = it as Partial<In>
    if (typeof o?.compraId === 'string' && o.compraId && typeof o?.ocid === 'string' && o.ocid && !seen.has(o.compraId)) {
      seen.add(o.compraId)
      items.push({ compraId: o.compraId, ocid: o.ocid })
    }
    if (items.length >= MAX_ITEMS) break
  }
  if (!items.length) throw createError({ statusCode: 400, statusMessage: 'items[] with {compraId, ocid} required' })

  const out: Record<string, { items: any[], object: string | null } | { pending: true }> = {}

  const cached = await ContractItemFeaturesModel.find({ compraId: { $in: items.map(i => i.compraId) } })
    .select('compraId items object').lean()
  const cachedBy = new Map(cached.map(c => [c.compraId, c]))
  const misses: In[] = []
  for (const it of items) {
    const c = cachedBy.get(it.compraId)
    // `object === undefined` is a pre-buy-object cache entry — treat as a miss so
    // it re-scrapes once and backfills, matching the single endpoint's guard.
    if (c && c.object !== undefined) out[it.compraId] = { items: c.items ?? [], object: c.object || null }
    else misses.push(it)
  }

  // Scrape misses under a deadline. The llamado page always exists; fall back to
  // the adjudicación page. A scrape that returns null (gov down) stays pending —
  // never cached as a false empty.
  const deadline = Date.now() + BUDGET_MS
  let cursor = 0
  async function worker() {
    while (cursor < misses.length && Date.now() < deadline) {
      const it = misses[cursor++]!
      const url = sourceUrl(it.ocid) || awardUrl(it.ocid)
      const scraped = url ? await scrapeItemFeatures(url) : null
      if (!scraped) { out[it.compraId] = { pending: true }; continue }
      out[it.compraId] = { items: scraped.items, object: scraped.object }
      await ContractItemFeaturesModel.updateOne(
        { compraId: it.compraId },
        { $set: { compraId: it.compraId, items: scraped.items, source: 'llamado', object: scraped.object ?? '', fetchedAt: new Date() } },
        { upsert: true },
      ).catch(() => {})
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, misses.length) }, worker))
  for (const it of misses) if (!(it.compraId in out)) out[it.compraId] = { pending: true }

  // A fully-resolved batch is static; a batch with any pending entry must not be cached.
  if (!Object.values(out).some(v => 'pending' in v)) setHeader(event, 'cache-control', 'public, max-age=86400')
  return { success: true, data: out }
})
