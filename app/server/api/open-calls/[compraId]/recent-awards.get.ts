import { createError, defineEventHandler, getRouterParam } from 'h3'
import { connectToDatabase } from '../../../utils/database'
import { OpenCallModel } from '../../../../../shared/models/open_call'
import { ReleaseModel } from '../../../../../shared/models/release'

// Public. "¿Quién ganó esto la última vez, a cuánto y para qué organismo?" — the
// last few awards of EACH article in this call, newest first.
//
// The bid estimate next to it answers with a distribution (median, quartiles);
// this answers with named precedents, which is the part a bidder can actually
// verify by opening the contract. Together they are what a paid competitor puts
// behind a wall.
//
// Cheap by construction: `awards.items.classification.id_1_date_-1` covers both
// the match and the sort, so each code is an index walk of five documents. What
// keeps it cheap is the cap — a call with 60 rubros would otherwise fire 60
// queries. MAX_CODES is enforced and REPORTED (`truncated`), never silent.
const MAX_CODES = 8
const PER_CODE = 5

interface Purchase {
  id: string | null
  ocid: string | null
  compraId: string | null
  date: string | null
  buyerName: string | null
  supplierName: string | null
  supplierId: string | null
  quantity: number | null
  unitName: string | null
  unitAmount: number | null
  currency: string | null
}

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

  // Item order, deduped: the first lines of a pliego are the ones that carry it.
  const labelByCode = new Map<string, string>()
  for (const it of call.items ?? []) {
    const code = it.classificationId
    if (!code || labelByCode.has(code)) continue
    labelByCode.set(code, it.description ?? '')
  }
  const allCodes = [...labelByCode.keys()]
  const codes = allCodes.slice(0, MAX_CODES)
  if (!codes.length) {
    return { success: true, data: { articles: [], truncated: { shown: 0, total: 0 } } }
  }

  const articles = await Promise.all(codes.map(async (code) => {
    const rows = await ReleaseModel.aggregate([
      { $match: { 'awards.items.classification.id': code } },
      { $sort: { date: -1 } },
      { $limit: PER_CODE },
      {
        $addFields: {
          // The award that actually contains this article — so the supplier we
          // name is the one who won THIS line, not whoever happens to sit first
          // in a multi-award release.
          matchedAward: {
            $first: {
              $filter: {
                input: { $ifNull: ['$awards', []] },
                cond: {
                  $in: [code, {
                    $map: { input: { $ifNull: ['$$this.items', []] }, in: '$$this.classification.id' },
                  }],
                },
              },
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          // `id` for our own /contracts/{id} route; `ocid` for the gov link, which
          // must never be derived from the id (they diverge on aclaración records).
          id: 1,
          ocid: 1,
          date: 1,
          buyerName: '$buyer.name',
          supplier: { $first: { $ifNull: ['$matchedAward.suppliers', []] } },
          item: {
            $first: {
              $filter: {
                input: { $ifNull: ['$matchedAward.items', []] },
                cond: { $eq: ['$$this.classification.id', code] },
              },
            },
          },
        },
      },
    ]).allowDiskUse(true)

    const purchases: Purchase[] = rows.map((r: Record<string, any>) => ({
      id: r.id ?? null,
      ocid: r.ocid ?? null,
      // The gov id_compra is the ocid minus its `ocds-<prefix>-` head; it is what
      // /llamados and the gov site key on.
      compraId: typeof r.ocid === 'string' ? r.ocid.split('-').slice(2).join('-') || null : null,
      date: r.date ? new Date(r.date).toISOString() : null,
      buyerName: r.buyerName ?? null,
      supplierName: r.supplier?.name ?? null,
      supplierId: r.supplier?.id ?? null,
      quantity: typeof r.item?.quantity === 'number' ? r.item.quantity : null,
      unitName: r.item?.unit?.name ?? null,
      unitAmount: typeof r.item?.unit?.value?.amount === 'number' ? r.item.unit.value.amount : null,
      currency: r.item?.unit?.value?.currency ?? null,
    }))

    return { code, label: labelByCode.get(code) ?? '', purchases }
  }))

  return {
    success: true,
    data: {
      articles: articles.filter(a => a.purchases.length > 0),
      truncated: { shown: codes.length, total: allCodes.length },
    },
  }
})
