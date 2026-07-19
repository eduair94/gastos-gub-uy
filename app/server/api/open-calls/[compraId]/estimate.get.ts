import { createError, defineEventHandler, getRouterParam } from 'h3'
import { connectToDatabase } from '../../../utils/database'
import { OpenCallModel } from '../../../../../shared/models/open_call'
import { ItemPriceBaselineModel } from '../../../../../shared/models/item_price_baseline'
import { canonicalUnit } from '../../../../../shared/utils/units'

// Public. "¿Cuánto debería ofertar para ganar este pliego?" — a per-line bid
// estimate built from the call's own items (quantity × unit) times the historical
// AWARD unit price for that item's rubro. Because item_price_baselines are computed
// over *awarded* item unit prices, the median (p50) is roughly the winning price and
// the low quartile (p25) the aggressive-but-still-winning offer. The estimate is the
// sum of quantity × {p25, p50} across the lines we can price like-for-like.
//
// Like-for-like is enforced two ways: the baseline is keyed by classificationId (the
// canonical rubro, not the noisy free-text description) AND by unit — the call item's
// raw unit is folded with the SAME canonicalUnit() the baseline was built with, so a
// per-unit line never gets multiplied by a per-kg price. Lines without a matching
// baseline (or without a quantity) are reported as uncovered, never silently dropped.
const CURRENCY_PREFERENCE = ['UYU', 'USD', 'UYI']

export default defineEventHandler(async (event) => {
  const compraId = getRouterParam(event, 'compraId')
  if (!compraId) {
    throw createError({ statusCode: 400, statusMessage: 'Falta compraId' })
  }
  await connectToDatabase()
  const call = await OpenCallModel.findOne({ compraId }).select('items').lean()
  if (!call) {
    throw createError({ statusCode: 404, statusMessage: 'Llamado no encontrado' })
  }

  const items = call.items ?? []
  const codes = [...new Set(items.map(i => i.classificationId).filter(Boolean) as string[])]
  if (!codes.length) {
    return { success: true, data: { items: [], totals: [], coverage: { estimated: 0, total: items.length, noBaseline: items.length, noQuantity: 0 } } }
  }

  // One index pass over the code's baselines (highest-n first). Keyed by
  // code|currency|unit; the first write per key wins, so the fullest baseline
  // for a given unit is the one we price against. Drop sub-1 medians (data
  // artifacts that would price a line at ~0 — see benchmarks.get.ts).
  const baselines = await ItemPriceBaselineModel.find({ classificationId: { $in: codes } })
    .select('classificationId currency unitName n p25 p50')
    .sort({ n: -1 })
    .lean()
  const idx = new Map<string, { currency: string, unitName: string, n: number, p25: number, p50: number }>()
  for (const b of baselines) {
    if (!(b.p50 >= 1)) continue
    const key = `${b.classificationId}|${b.currency}|${b.unitName}`
    if (!idx.has(key)) idx.set(key, b)
  }
  const pick = (code: string, unit: string) => {
    for (const cur of CURRENCY_PREFERENCE) {
      const b = idx.get(`${code}|${cur}|${unit}`)
      if (b) return b
    }
    return null
  }

  const totalsByCur = new Map<string, { currency: string, low: number, typical: number, lines: number }>()
  let estimated = 0
  let noBaseline = 0
  let noQuantity = 0

  const outItems = items.map((it) => {
    const unitName = it.unit?.name ?? null
    const base = {
      description: it.description ?? null,
      classificationId: it.classificationId ?? null,
      quantity: it.quantity ?? null,
      unitName,
    }
    const b = it.classificationId ? pick(it.classificationId, canonicalUnit(unitName)) : null
    if (!b) {
      noBaseline++
      return { ...base, matched: false as const, reason: 'no-baseline' as const }
    }
    const qty = it.quantity
    if (!(typeof qty === 'number' && qty > 0)) {
      noQuantity++
      // A priced rubro but no quantity to multiply — still surface the unit price.
      return { ...base, matched: false as const, reason: 'no-quantity' as const, currency: b.currency, unitP25: b.p25, unitP50: b.p50, n: b.n }
    }
    estimated++
    const lineLow = qty * b.p25
    const lineTypical = qty * b.p50
    const t = totalsByCur.get(b.currency) ?? { currency: b.currency, low: 0, typical: 0, lines: 0 }
    t.low += lineLow
    t.typical += lineTypical
    t.lines++
    totalsByCur.set(b.currency, t)
    return { ...base, matched: true as const, currency: b.currency, unitP25: b.p25, unitP50: b.p50, n: b.n, lineLow, lineTypical }
  })

  const totals = [...totalsByCur.values()].sort((a, b) => b.typical - a.typical)

  return {
    success: true,
    data: {
      items: outItems,
      totals,
      coverage: { estimated, total: items.length, noBaseline, noQuantity },
    },
  }
})
