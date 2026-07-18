#!/usr/bin/env tsx

/**
 * Per-code item-característica variant distributions for unexplained-anomaly products.
 *
 * WHY. OCDS omits the per-item características (Marca, Concentración, Presentación,
 * Nombre comercial/modelo, Variación) and the SICE catalog does not carry them per
 * article. They exist only in `contract_item_features` (scraped from the gov HTML,
 * one doc per compra, items joined by `nro`). For the codes that carry an anomaly the
 * AI could NOT explain (`anomalies.aiVerdict.explainable === 'no'`), this precomputes
 * "does the physical product behind this code vary, and how" — so the product page can
 * answer, for the bicarbonate at 10.184 vs ~181/frasco, whether it is the same unit
 * product. Every other code gets the same shape lazily from the batch endpoint.
 *
 * SCOPE. Bounded: the unexplained set is a few hundred codes. Per code we sample up to
 * MAX_CONTRACTS_PER_CODE award releases, ensure their características are cached (scraping
 * misses via the shared util, gently), then roll up the matched line's features.
 *
 * SWAP. Compute-then-swap by dataVersion: upsert each code, then delete older versions —
 * a reader never sees a half-built set. A partial run (PV_ONLY_CODE / PV_MAX_CODES) skips
 * that cleanup so a smoke test never deletes the full set.
 *
 * Runs weekly from the cronserver (after the anomaly triage). Reuses the app's scraper
 * util (h3-free) so there is one parser to maintain.
 */

import { connectToDatabase } from '../../shared/connection/database'
import { AnomalyModel } from '../../shared/models/anomaly'
import { ReleaseModel } from '../../shared/models/release'
import { ContractItemFeaturesModel } from '../../shared/models/contract_item_features'
import { ProductVariantsModel } from '../../shared/models/product_variants'
import { rollupVariants, type MatchedItem } from './variants/rollup'
import { scrapeItemFeatures } from '../../shared/utils/item-features'
import { compraIdFromOcid, sourceUrl, awardUrl } from '../../app/server/utils/query'

const JUNK = new Set(['0', '', 'UNKNOWN'])
const MAX_CONTRACTS_PER_CODE = Number(process.env.PV_MAX_CONTRACTS_PER_CODE ?? 300)
const ONLY_CODE = process.env.PV_ONLY_CODE?.trim() || null
const MAX_CODES = process.env.PV_MAX_CODES ? Number(process.env.PV_MAX_CODES) : null
const IS_PARTIAL = !!ONLY_CODE || MAX_CODES !== null

function nroOf(itemId: unknown): number | null {
  if (itemId == null) return null
  const n = Number(String(itemId).split('-')[0])
  return Number.isFinite(n) ? n : null
}

async function run() {
  await connectToDatabase()
  // A stable per-run stamp. Date is fine here — this is a job, not a workflow script.
  const dataVersion = new Date().toISOString()

  let codes: string[]
  if (ONLY_CODE) {
    codes = [ONLY_CODE]
  } else {
    codes = (await AnomalyModel.distinct('metadata.itemClassification.id', { 'aiVerdict.explainable': 'no' }))
      .filter((c): c is string => typeof c === 'string' && !JUNK.has(c))
    if (MAX_CODES !== null) codes = codes.slice(0, MAX_CODES)
  }
  console.log(`[variants] ${codes.length} code(s) to process${IS_PARTIAL ? ' (partial run — no cleanup)' : ''}`)

  let done = 0
  for (const code of codes) {
    const releases = await ReleaseModel.find({ tag: 'award', 'awards.items.classification.id': code })
      .select('ocid awards')
      .limit(MAX_CONTRACTS_PER_CODE)
      .lean() as unknown as Array<{ ocid?: string, awards?: Array<{ items?: Array<{ id?: unknown, classification?: { id?: string } }> }> }>

    const targets = releases.map((r) => {
      const flat = (r.awards ?? []).flatMap(a => a.items ?? [])
      const it = flat.find(i => i?.classification?.id === code)
      return { compraId: compraIdFromOcid(r.ocid), ocid: r.ocid, nro: nroOf(it?.id) }
    }).filter((t): t is { compraId: string, ocid: string, nro: number } => !!t.compraId && !!t.ocid && t.nro != null)

    if (!targets.length) { console.log(`[variants] ${code}: no joinable contracts`); done++; continue }

    // Ensure características cached; scrape misses sequentially to stay gentle on the gov site.
    const ids = [...new Set(targets.map(t => t.compraId))]
    const cached = new Map<string, { items: Array<{ nro: number, features: Array<{ name: string, value: string }>, variation?: string }> }>(
      (await ContractItemFeaturesModel.find({ compraId: { $in: ids } }).select('compraId items object').lean())
        .map((c: any) => [c.compraId, c]),
    )
    for (const t of targets) {
      if (cached.has(t.compraId)) continue
      const url = sourceUrl(t.ocid) || awardUrl(t.ocid)
      const scraped = url ? await scrapeItemFeatures(url) : null
      if (scraped) {
        await ContractItemFeaturesModel.updateOne(
          { compraId: t.compraId },
          { $set: { compraId: t.compraId, items: scraped.items, source: 'llamado', object: scraped.object ?? '', fetchedAt: new Date() } },
          { upsert: true },
        ).catch(() => {})
        cached.set(t.compraId, { items: scraped.items })
      }
    }

    // Pick each contract's matched item and roll up.
    const matched: MatchedItem[] = []
    for (const t of targets) {
      const rec = cached.get(t.compraId)
      const item = rec?.items?.find(i => i.nro === t.nro)
      // Build conditionally: exactOptionalPropertyTypes forbids an explicit
      // `variation: undefined` against the optional `variation?: string`.
      if (item) {
        matched.push(item.variation !== undefined
          ? { features: item.features ?? [], variation: item.variation }
          : { features: item.features ?? [] })
      }
    }
    if (!matched.length) { console.log(`[variants] ${code}: no características found`); done++; continue }

    const { attributes, varies, sampledContracts } = rollupVariants(matched)
    await ProductVariantsModel.updateOne(
      { code },
      { $set: { code, attributes, varies, sampledContracts, dataVersion, calculatedAt: new Date() } },
      { upsert: true },
    )
    done++
    console.log(`[variants] ${code}: ${sampledContracts} sampled, varies=${varies} (${done}/${codes.length})`)
  }

  if (!IS_PARTIAL) {
    const del = await ProductVariantsModel.deleteMany({ dataVersion: { $ne: dataVersion } })
    console.log(`[variants] cleanup removed ${del.deletedCount} stale docs`)
  }
  console.log('[variants] done')
  process.exit(0)
}

run().catch((e) => { console.error(e); process.exit(1) })
