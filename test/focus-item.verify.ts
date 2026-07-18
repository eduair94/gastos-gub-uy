import assert from 'node:assert/strict'
import mongoose from 'mongoose'

// Verifies the focusItem projection against whatever DB MONGODB_URI points at.
// Run: MONGODB_URI=... npx tsx test/focus-item.verify.ts   (FOCUS_CODE optional)
const CODE = process.env.FOCUS_CODE || '26392'
const URI = process.env.MONGODB_URI
if (!URI) { console.error('MONGODB_URI required'); process.exit(1) }

;(async () => {
  await mongoose.connect(URI, { serverSelectionTimeoutMS: 8000 } as any)
  const releases = mongoose.connection.db!.collection('releases')
  const rows = await releases.aggregate([
    { $match: { tag: 'award', 'awards.items.classification.id': CODE } },
    { $addFields: {
      focusItem: { $let: {
        vars: { matched: { $first: { $filter: {
          input: { $reduce: { input: { $ifNull: ['$awards', []] }, initialValue: [], in: { $concatArrays: ['$$value', { $ifNull: ['$$this.items', []] }] } } },
          cond: { $eq: ['$$this.classification.id', CODE] },
        } } } },
        in: { $cond: [{ $eq: ['$$matched', null] }, null, {
          nro: { $convert: { input: { $arrayElemAt: [{ $split: [{ $ifNull: [{ $toString: '$$matched.id' }, ''] }, '-'] }, 0] }, to: 'int', onError: null, onNull: null } },
          description: { $ifNull: ['$$matched.classification.description', ''] },
          quantity: '$$matched.quantity',
          unitName: '$$matched.unit.name',
          unitAmount: '$$matched.unit.value.amount',
          currency: '$$matched.unit.value.currency',
        }] },
      } },
    } },
    { $sort: { 'focusItem.unitAmount': -1 } },
    { $limit: 6 },
  ], { maxTimeMS: 20000 }).toArray()

  assert.ok(rows.length > 0, `no award releases for code ${CODE}`)
  for (const r of rows as any[]) assert.ok(r.focusItem && typeof r.focusItem.description === 'string', 'focusItem populated')
  console.log(`focus-item.verify OK — ${rows.length} rows for ${CODE}`)
  console.log((rows as any[]).map(r => `  nro=${r.focusItem.nro} | ${r.focusItem.description} | qty ${r.focusItem.quantity} ${r.focusItem.unitName ?? ''} | ${r.focusItem.unitAmount} ${r.focusItem.currency ?? ''}`).join('\n'))
  await mongoose.disconnect()
  process.exit(0)
})().catch((e) => { console.error(e); process.exit(1) })
