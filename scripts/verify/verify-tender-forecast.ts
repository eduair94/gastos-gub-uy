#!/usr/bin/env tsx
/**
 * Live-DB invariants for the `tender_forecast` rollup (src/jobs/refresh-tender-forecast.ts).
 * Read-only. Run AFTER `npm run refresh-tender-forecast`.
 *
 * Every assertion here is written so a plausible implementation bug flips it:
 *   - dropping the MIN_EVENTS gate            → eventCount assertion fires
 *   - dropping the DISPLAY_THRESHOLD gate     → confidence-floor assertion fires
 *   - mis-ordering expectedWindow args        → window-after-lastEvent assertion fires
 *   - grouping on a node the leaves don't own → nodeId-in-ancestors assertion fires
 *   - forgetting the dataVersion swap         → single-dataVersion / freshness fires
 *   - forgetting the already-open suppression → open_call overlap assertion fires
 *   - forgetting the EVIDENCE_TOP slice       → evidence-size assertion fires
 */
import { connectToDatabase } from '../../shared/connection/database'
import { OpenCallModel, TenderForecastModel } from '../../shared/models'
import { DISPLAY_THRESHOLD, EVIDENCE_TOP, MIN_EVENTS, RUBRO_LEVEL } from '../../shared/forecast/constants'

function assert(c: unknown, m: string) { if (!c) throw new Error(`FAIL: ${m}`) }

async function main() {
  await connectToDatabase()

  const n = await TenderForecastModel.countDocuments()
  assert(n > 0, `forecasts exist (got ${n}) — run: npm run refresh-tender-forecast first`)

  // --- gates the job MUST apply -------------------------------------------
  const lowEvents = await TenderForecastModel.findOne({ 'cadence.eventCount': { $lt: MIN_EVENTS } }).lean()
  assert(!lowEvents, `no forecast below MIN_EVENTS=${MIN_EVENTS} (found ${lowEvents?._id})`)

  const lowConf = await TenderForecastModel.findOne({ confidence: { $lt: DISPLAY_THRESHOLD } }).lean()
  assert(!lowConf, `no forecast below DISPLAY_THRESHOLD=${DISPLAY_THRESHOLD} (found ${lowConf?._id} @ ${lowConf?.confidence})`)

  const oob = await TenderForecastModel.findOne({ $or: [{ confidence: { $lt: 0 } }, { confidence: { $gt: 1 } }] }).lean()
  assert(!oob, `confidence in [0,1] (violated by ${oob?._id})`)

  // --- structural invariants, checked over the WHOLE collection ------------
  const badWindow = await TenderForecastModel.findOne({
    $expr: { $lte: ['$expectedWindow.start', '$lastEventDate'] },
  }).lean()
  assert(!badWindow, `expectedWindow.start strictly after lastEventDate (violated by ${badWindow?._id})`)

  const invertedWindow = await TenderForecastModel.findOne({
    $expr: { $gte: ['$expectedWindow.start', '$expectedWindow.end'] },
  }).lean()
  assert(!invertedWindow, `expectedWindow.start < end (violated by ${invertedWindow?._id})`)

  // Cadence must be computed on UTC DAYS, not raw tenderPeriod timestamps. Without that,
  // an organism publishing four llamados of one rubro in the same afternoon yields
  // medianDays≈0.002 and (cv=0) confidence 0.83 — a top-of-page forecast built on minutes.
  // Two independent tells: sub-day medians, and medians off the whole/half-day grid.
  const subDay = await TenderForecastModel.findOne({ 'cadence.medianDays': { $lt: 1 } }).lean()
  assert(!subDay, `cadence.medianDays >= 1 — sub-day "cadence" means events were not snapped to UTC days (violated by ${subDay?._id} @ ${subDay?.cadence?.medianDays}d)`)

  const offGrid = await TenderForecastModel.findOne({
    $expr: { $ne: [{ $mod: [{ $multiply: ['$cadence.medianDays', 2] }, 1] }, 0] },
  }).lean()
  assert(!offGrid, `cadence.medianDays lies on the half-day grid, i.e. it is a median of whole-day intervals (violated by ${offGrid?._id} @ ${offGrid?.cadence?.medianDays}d)`)

  const timedLast = await TenderForecastModel.findOne({
    $expr: { $ne: [{ $dateToString: { date: '$lastEventDate', format: '%H:%M:%S.%L', timezone: 'UTC' } }, '00:00:00.000'] },
  }).lean()
  assert(!timedLast, `lastEventDate is a UTC midnight (violated by ${timedLast?._id} @ ${timedLast?.lastEventDate?.toISOString()})`)

  const badCv = await TenderForecastModel.findOne({ 'cadence.cvDays': { $lt: 0 } }).lean()
  assert(!badCv, `cadence.cvDays >= 0 (violated by ${badCv?._id})`)

  const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)
  const badMonth = await TenderForecastModel.findOne({ 'cadence.seasonalMonths': { $elemMatch: { $nin: MONTHS } } }).lean()
  assert(!badMonth, `every seasonalMonths entry within 1..12 (violated by ${badMonth?._id}: ${badMonth?.cadence?.seasonalMonths})`)

  const noMonths = await TenderForecastModel.findOne({ $expr: { $eq: [{ $size: '$cadence.seasonalMonths' }, 0] } }).lean()
  assert(!noMonths, `seasonalMonths non-empty — computeCadence always yields >=1 dominant month (violated by ${noMonths?._id})`)

  const noAnc = await TenderForecastModel.findOne({ $expr: { $eq: [{ $size: '$rubroAncestors' }, 0] } }).lean()
  assert(!noAnc, `every forecast has rubroAncestors (violated by ${noAnc?._id})`)

  // The grouping node must actually be an ancestor token of the group's leaves.
  const orphanNode = await TenderForecastModel.findOne({ $expr: { $eq: [{ $in: ['$rubroNodeId', '$rubroAncestors'] }, false] } }).lean()
  assert(!orphanNode, `rubroNodeId is among rubroAncestors (violated by ${orphanNode?._id} node=${orphanNode?.rubroNodeId})`)

  const badLevel = await TenderForecastModel.findOne({ rubroLevel: { $nin: [1, 2, RUBRO_LEVEL] } }).lean()
  assert(!badLevel, `rubroLevel in {1,2,${RUBRO_LEVEL}} (violated by ${badLevel?._id} lvl=${badLevel?.rubroLevel})`)

  const badEvidence = await TenderForecastModel.findOne({
    $expr: { $or: [{ $eq: [{ $size: '$evidenceItems' }, 0] }, { $gt: [{ $size: '$evidenceItems' }, EVIDENCE_TOP] }] },
  }).lean()
  assert(!badEvidence, `evidenceItems size in 1..${EVIDENCE_TOP} (violated by ${badEvidence?._id})`)

  // Every evidence leaf must have been seen at least once, and the kept slice must be the
  // TOP of the histogram — a broken sort would leave counts ascending.
  const zeroCount = await TenderForecastModel.findOne({ 'evidenceItems.count': { $lt: 1 } }).lean()
  assert(!zeroCount, `every evidenceItems.count >= 1 — a leaf with 0 llamados is not evidence (violated by ${zeroCount?._id})`)

  const unsorted = await TenderForecastModel.findOne({
    $expr: { $lt: [{ $first: '$evidenceItems.count' }, { $last: '$evidenceItems.count' }] },
  }).lean()
  assert(!unsorted, `evidenceItems ordered by descending count (violated by ${unsorted?._id})`)

  // Evidence labels must name the ARTICLE, not the rubro. Labelling leaves with clasName
  // makes every entry of a level-3 group repeat the clase title verbatim.
  const echoedLabels = await TenderForecastModel.findOne({
    $expr: {
      $and: [
        { $gte: [{ $size: '$evidenceItems' }, 2] },
        { $allElementsTrue: { $map: { input: '$evidenceItems', in: { $eq: ['$$this.label', '$rubroLabel'] } } } },
      ],
    },
  }).lean()
  assert(!echoedLabels, `evidence labels name the article, not the rubro (${echoedLabels?._id} repeats "${echoedLabels?.rubroLabel}")`)

  const badBasis = await TenderForecastModel.findOne({ basis: { $ne: 'recurrence' } }).lean()
  assert(!badBasis, `basis === "recurrence" (violated by ${badBasis?._id})`)

  const noBuyer = await TenderForecastModel.findOne({ $or: [{ buyerId: '' }, { buyerId: { $exists: false } }] }).lean()
  assert(!noBuyer, `every forecast has a buyerId (violated by ${noBuyer?._id})`)

  // --- compute-then-swap actually swapped ---------------------------------
  const versions = await TenderForecastModel.distinct('dataVersion')
  assert(versions.length === 1, `exactly one dataVersion after swap (got ${versions.length}: ${versions.slice(0, 3).join(',')})`)

  const stale = await TenderForecastModel.findOne({ generatedAt: { $lt: new Date(Date.now() - 24 * 3600_000) } }).lean()
  assert(!stale, `all forecasts generated within the last 24h — collection looks stale (${stale?.generatedAt?.toISOString()})`)

  // --- uniqueness of (buyerId, rubroNodeId) --------------------------------
  const dupes = await TenderForecastModel.aggregate([
    { $group: { _id: { b: '$buyerId', r: '$rubroNodeId' }, n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } },
    { $limit: 1 },
  ])
  assert(dupes.length === 0, `(buyerId, rubroNodeId) unique (dupe: ${JSON.stringify(dupes[0]?._id)})`)

  // --- already-open suppression really happened ----------------------------
  const liveOpen = await OpenCallModel.find({ status: { $in: ['open', 'clarification', 'amended'] } })
    .select('buyer.id classificationSet')
    .lean()
  const openKeys = new Set<string>()
  for (const c of liveOpen) {
    const bid = (c.buyer as { id?: string } | undefined)?.id
    if (!bid) continue
    for (const code of (c.classificationSet ?? [])) openKeys.add(`${bid}|${code}`)
  }
  assert(openKeys.size > 0, `open_calls yielded suppression keys (got ${openKeys.size}) — suppression check would be vacuous`)
  let overlaps = 0
  let example = ''
  for await (const f of TenderForecastModel.find().select('buyerId rubroAncestors').lean().cursor()) {
    const hit = f.rubroAncestors.find(a => openKeys.has(`${f.buyerId}|${a}`))
    if (hit) { overlaps++; if (!example) example = `${f.buyerId}|${hit}` }
  }
  assert(overlaps === 0, `no forecast overlaps a live open_call for the same buyer (${overlaps} overlap(s), e.g. ${example})`)

  const sample = await TenderForecastModel.find().sort({ confidence: -1 }).limit(5).lean()
  console.log(
    `OK verify-tender-forecast — ${n} forecasts, `
    + `${(await TenderForecastModel.distinct('buyerId')).length} buyers, `
    + `top confidence ${sample[0]?.confidence?.toFixed(2)}, `
    + `${openKeys.size} open-call suppression keys checked`,
  )
  process.exit(0)
}
main().catch((e) => { console.error(e); process.exit(1) })
