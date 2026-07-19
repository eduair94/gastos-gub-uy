import { createError, defineEventHandler } from 'h3'
import { connectToDatabase, mongoose } from '../../utils/database'

/**
 * Spend by TYPE of supplier — the lens the raw explorer can't give.
 *
 * Joins the per-supplier spend (supplier_patterns.totalValue) to the AI category
 * (supplier_enrichment) and sums by category: how much the state pays to media
 * vs agencies vs construction vs fuel vs co-ops vs individuals.
 *
 * ONLY the enriched suppliers are covered (the biggest by spend, so most of the
 * money — but not the 40k long tail). The response says how many suppliers and
 * how much spend it represents, so the page can be honest about coverage: this
 * is "of the categorised suppliers", not "of all state spending".
 */
const TTL_MS = 30 * 60 * 1000
let cache: { data: unknown, at: number } | null = null

export default defineEventHandler(async () => {
  if (cache && Date.now() - cache.at < TTL_MS) {
    return { success: true, data: cache.data }
  }

  await connectToDatabase()
  if (mongoose.connection.readyState !== 1) {
    throw createError({ statusCode: 503, statusMessage: 'Database connection not ready' })
  }

  const rows = await mongoose.connection.db!
    .collection('supplier_enrichment')
    .aggregate([
      // Join each enriched supplier to its spend total.
      {
        $lookup: {
          from: 'supplier_patterns',
          localField: 'name',
          foreignField: 'name',
          as: 'p',
        },
      },
      { $addFields: { spend: { $ifNull: [{ $arrayElemAt: ['$p.totalValue', 0] }, 0] } } },
      {
        $group: {
          _id: '$category',
          spend: { $sum: '$spend' },
          suppliers: { $sum: 1 },
        },
      },
      { $sort: { spend: -1 } },
    ])
    .toArray()

  const types = rows
    .filter(r => typeof r._id === 'string' && r._id)
    .map(r => ({ category: r._id as string, spend: r.spend ?? 0, suppliers: r.suppliers ?? 0 }))

  const totalSpend = types.reduce((a, t) => a + t.spend, 0)
  const totalSuppliers = types.reduce((a, t) => a + t.suppliers, 0)

  const data = {
    types: types.map(t => ({ ...t, share: totalSpend ? t.spend / totalSpend : 0 })),
    totalSpend,
    totalSuppliers,
    meta: {
      basis: 'enriched suppliers only (the biggest by spend); not the full 40k tail',
      spendField: 'supplier_patterns.totalValue',
    },
  }

  cache = { data, at: Date.now() }
  return { success: true, data }
})
