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
      .select('code description contractCount buyerCount supplierCount totalUYU currencies lastYear')
      .lean(),
    ItemPriceBaselineModel.find({ classificationId: { $in: codes } })
      .select('classificationId currency unitName n p25 p50 p75 p95')
      .sort({ n: -1 })
      .lean(),
  ])

  const productByCode = new Map(products.map(p => [p.code, p]))
  // Keep the highest-n baseline per (code, currency).
  const baselineByCode = new Map<string, typeof baselines>()
  for (const b of baselines) {
    const arr = baselineByCode.get(b.classificationId) ?? []
    if (arr.length < 3) arr.push(b)
    baselineByCode.set(b.classificationId, arr)
  }

  const benchmarks = codes.map((code) => {
    const p = productByCode.get(code)
    const bs = baselineByCode.get(code) ?? []
    return {
      classificationId: code,
      label: labelByCode.get(code) ?? p?.description ?? null,
      product: p
        ? { contractCount: p.contractCount, buyerCount: p.buyerCount, supplierCount: p.supplierCount, totalUYU: p.totalUYU, lastYear: p.lastYear ?? null }
        : null,
      priceBaselines: bs.map(b => ({ currency: b.currency, unitName: b.unitName, n: b.n, p25: b.p25, p50: b.p50, p75: b.p75, p95: b.p95 })),
    }
  }).filter(b => b.product || b.priceBaselines.length)

  return { success: true, data: { benchmarks } }
})
