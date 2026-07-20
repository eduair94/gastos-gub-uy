#!/usr/bin/env tsx
import { TenderForecastModel } from '../../shared/models'
import type { ITenderForecast } from '../../shared/models'

function assert(cond: unknown, msg: string): void { if (!cond) throw new Error(`FAIL: ${msg}`) }

assert(TenderForecastModel, 'TenderForecastModel exported from barrel')
assert(TenderForecastModel.collection.collectionName === 'tender_forecast', 'collection name is tender_forecast')
const idx = TenderForecastModel.schema.indexes()
const hasUnique = idx.some(([spec, opts]: any) => spec.buyerId === 1 && spec.rubroNodeId === 1 && opts?.unique)
assert(hasUnique, 'unique {buyerId,rubroNodeId} index declared')
const sample: ITenderForecast = {
  buyerId: '80-1', buyerName: 'X', rubroNodeId: 'C2.6.5', rubroLabel: 'Y', rubroLevel: 3,
  rubroAncestors: ['C2.6.5', '28267'], evidenceItems: [{ classificationId: '28267', label: 'Z', count: 4 }],
  cadence: { medianDays: 365, cvDays: 0.1, seasonalMonths: [3], eventCount: 5 },
  lastEventDate: new Date(), expectedWindow: { start: new Date(), end: new Date() },
  confidence: 0.8, basis: 'recurrence', dataVersion: 'v1', generatedAt: new Date(),
}
assert(sample.rubroNodeId === 'C2.6.5', 'ITenderForecast shape compiles')
console.log('OK verify-tender-forecast-model')
