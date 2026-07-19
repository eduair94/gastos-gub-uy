import { createError, defineEventHandler, getRouterParam } from 'h3'
import { connectToDatabase } from '../../../utils/database'
import { OpenCallModel } from '../../../../../shared/models/open_call'
import { ProductAnalyticsModel } from '../../../../../shared/models/product_analytics'
import { ItemPriceBaselineModel } from '../../../../../shared/models/item_price_baseline'

// Public. For each of the call's rubros (classification ids), returns the
// historical award-price context — "a cuánto se adjudicó" — by reusing the
// already-computed product_analytics + item_price_baselines. No new computation.
export default defineEventHandler(async (event) => {
  const compraId = getRouterParam(event, 'compraId')
  if (!compraId) {
    throw createError({ statusCode: 400, statusMessage: 'Falta compraId' })
  }
  await connectToDatabase()
  const call = await OpenCallModel.findOne({ compraId }).select('classificationSet items').lean()
  if (!call) {
    throw createError({ statusCode: 404, statusMessage: 'Llamado no encontrado' })
  }

  const codes = call.classificationSet ?? []
  if (!codes.length) {
    return { success: true, data: { benchmarks: [] } }
  }

  const labelByCode = new Map<string, string>()
  for (const it of call.items ?? []) {
    if (it.classificationId && it.classificationLabel) labelByCode.set(it.classificationId, it.classificationLabel)
  }

  const [products, baselines] = await Promise.all([
    ProductAnalyticsModel.find({ code: { $in: codes } })
      .select('code description canonicalName contractCount buyerCount supplierCount totalUYU currencies firstYear lastYear topSuppliers topBuyers')
      .lean(),
    ItemPriceBaselineModel.find({ classificationId: { $in: codes } })
      .select('classificationId currency unitName n p25 p50 p75 p95')
      .sort({ n: -1 })
      .lean(),
  ])

  const productByCode = new Map(products.map(p => [p.code, p]))
  // Keep the highest-n baselines per code (already sorted by n desc), up to 3.
  // Require a median >= 1 currency unit: a p50 under 1 is a data artifact (USD
  // lines whose amounts sit on a different scale, giving unit prices like 0.02)
  // that renders as a misleading "US$ 0" reference. Real procurement references
  // clear 1 unit at the median, so this drops only the junk.
  const baselineByCode = new Map<string, typeof baselines>()
  for (const b of baselines) {
    if (!(b.p50 >= 1)) continue
    const arr = baselineByCode.get(b.classificationId) ?? []
    if (arr.length < 3) arr.push(b)
    baselineByCode.set(b.classificationId, arr)
  }

  // A rank row a bidder can act on: who won and how much/often. Bounded to the
  // top few so 50+ rubros on one call don't bloat the payload — the full list
  // lives on the rubro's own ficha (/products/{code}), linked from the panel.
  const rankRow = (e: { id?: string, name?: string, spendUYU?: number, lines?: number }) => ({
    id: e.id || null,
    name: e.name || '',
    spendUYU: e.spendUYU ?? 0,
    lines: e.lines ?? 0,
  })

  const benchmarks = codes.map((code) => {
    const p = productByCode.get(code)
    const bs = baselineByCode.get(code) ?? []
    return {
      classificationId: code,
      label: labelByCode.get(code) ?? p?.canonicalName ?? p?.description ?? null,
      product: p
        ? {
            contractCount: p.contractCount,
            buyerCount: p.buyerCount,
            supplierCount: p.supplierCount,
            totalUYU: p.totalUYU,
            firstYear: p.firstYear ?? null,
            lastYear: p.lastYear ?? null,
            // "Quiénes ganaron adjudicaciones similares" — the historical winners.
            topSuppliers: (p.topSuppliers ?? []).filter(s => s.name).slice(0, 4).map(rankRow),
            // Demand side: the organisms that buy this rubro (potential clients).
            topBuyers: (p.topBuyers ?? []).filter(b => b.name).slice(0, 3).map(rankRow),
          }
        : null,
      priceBaselines: bs.map(b => ({ currency: b.currency, unitName: b.unitName, n: b.n, p25: b.p25, p50: b.p50, p75: b.p75, p95: b.p95 })),
    }
  })
    .filter(b => b.product || b.priceBaselines.length)
    // Lead with the meatiest rubros (most historical contracts), not feed order.
    .sort((a, b) => (b.product?.contractCount ?? 0) - (a.product?.contractCount ?? 0))

  return { success: true, data: { benchmarks } }
})
