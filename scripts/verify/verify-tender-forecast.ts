#!/usr/bin/env tsx
/**
 * Live-DB invariants for the `tender_forecast` rollup (src/jobs/refresh-tender-forecast.ts).
 * Read-only. Run AFTER `npm run refresh-tender-forecast`.
 *
 * Every assertion here is written so a plausible implementation bug flips it:
 *   - dropping the MIN_EVENTS gate            → eventCount assertion fires
 *   - dropping the DISPLAY_THRESHOLD gate     → confidence-floor assertion fires
 *   - mis-ordering expectedWindow args        → window-derivation assertion fires
 *   - grouping on a node the leaves don't own → nodeId-in-ancestors assertion fires
 *   - forgetting the dataVersion swap         → single-dataVersion assertion fires
 *   - forgetting the already-open suppression → open_call overlap assertion fires
 *   - forgetting the EVIDENCE_TOP slice       → evidence-size assertion fires
 *   - award pipeline silently yielding nothing→ incumbent/amount coverage floors fire
 *   - a broken buyer-name projection          → buyerName coverage floor fires
 *
 * Assertions that CANNOT fail are deliberately absent: cvDays >= 0, seasonalMonths
 * within 1..12 and confidence within [0,1] are all guaranteed by the pure functions in
 * shared/forecast/recurrence.ts, so asserting them only inflates the suite's count.
 */
import { connectToDatabase } from '../../shared/connection/database'
import { OpenCallModel, TenderForecastModel } from '../../shared/models'
import { DISPLAY_THRESHOLD, EVIDENCE_TOP, MAX_DISP_DAYS, MIN_DISP_DAYS, MIN_EVENTS, RUBRO_LEVEL } from '../../shared/forecast/constants'

const DAY_MS = 86_400_000

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

  // --- structural invariants, checked over the WHOLE collection ------------
  const badWindow = await TenderForecastModel.findOne({
    $expr: { $lte: ['$expectedWindow.start', '$lastEventDate'] },
  }).lean()
  assert(!badWindow, `expectedWindow.start strictly after lastEventDate (violated by ${badWindow?._id})`)

  const invertedWindow = await TenderForecastModel.findOne({
    $expr: { $gte: ['$expectedWindow.start', '$expectedWindow.end'] },
  }).lean()
  assert(!invertedWindow, `expectedWindow.start < end (violated by ${invertedWindow?._id})`)

  // The window must actually be DERIVED FROM the cadence stored beside it. Without this,
  // swapping expectedWindow(last, medianDays, cvDays) → (last, cvDays, medianDays) is
  // invisible: clamp(m*cv) is symmetric so the dispersion is identical and every other
  // assertion still passes, while the window centre becomes `cv` days after the last event
  // — nonsense. Recomputed here from lastEventDate + cadence alone:
  //   end == lastEventDate + (medianDays + clamp(medianDays*cvDays, MIN_DISP, MAX_DISP)) days
  // (`end` is the informative edge and is the one value the job never truncates; `start`
  // IS truncated to lastEventDate+1d, which is why the check is pinned to `end`.)
  // 1s tolerance absorbs float/ms truncation in `new Date(centre + disp*DAY_MS)`.
  const dispExpr = {
    $min: [MAX_DISP_DAYS, { $max: [MIN_DISP_DAYS, { $multiply: ['$cadence.medianDays', '$cadence.cvDays'] }] }],
  }
  const derivedEnd = {
    $add: ['$lastEventDate', { $multiply: [{ $add: ['$cadence.medianDays', dispExpr] }, DAY_MS] }],
  }
  const badDerivation = await TenderForecastModel.findOne({
    $expr: { $gt: [{ $abs: { $subtract: ['$expectedWindow.end', derivedEnd] } }, 1000] },
  }).lean()
  assert(
    !badDerivation,
    `expectedWindow.end == lastEventDate + medianDays + clamp(medianDays*cvDays,${MIN_DISP_DAYS},${MAX_DISP_DAYS}) `
    + `(violated by ${badDerivation?._id}: end=${badDerivation?.expectedWindow?.end?.toISOString()} `
    + `last=${badDerivation?.lastEventDate?.toISOString()} median=${badDerivation?.cadence?.medianDays} cv=${badDerivation?.cadence?.cvDays})`,
  )

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

  const noMonths = await TenderForecastModel.findOne({ $expr: { $eq: [{ $size: '$cadence.seasonalMonths' }, 0] } }).lean()
  assert(!noMonths, `seasonalMonths non-empty — computeCadence always yields >=1 dominant month (violated by ${noMonths?._id})`)

  // The grouping node must actually be an ancestor token of the group's leaves.
  // (This subsumes "rubroAncestors non-empty", which is why that one is not asserted.)
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

  // --- data-completeness floors -------------------------------------------
  // These exist because the assertions above are ALL satisfied by a collection with zero
  // incumbents and zero amounts. That is not hypothetical: the brief's award pipeline read
  // `tender.items.classification.id`, a path that does not exist on an award release, and
  // would have shipped 10k forecasts with no incumbent anywhere and nothing to notice it.
  // Any regression in the award leaf path, in AWARD_RE, or in the forecastBuyers narrowing
  // drives these to ~0. Floors are set well below the observed rates so they measure a
  // pipeline that WORKS, not the exact numbers of one run.
  const withIncumbent = await TenderForecastModel.countDocuments({ 'incumbentSupplier.name': { $type: 'string', $ne: '' } })
  assert(withIncumbent / n > 0.5, `>50% of forecasts carry an incumbentSupplier (got ${withIncumbent}/${n} = ${(withIncumbent / n * 100).toFixed(1)}%) — the award pipeline is producing nothing`)

  const withAmount = await TenderForecastModel.countDocuments({ 'expectedAmount.p50': { $type: 'number' } })
  assert(withAmount / n > 0.5, `>50% of forecasts carry an expectedAmount (got ${withAmount}/${n} = ${(withAmount / n * 100).toFixed(1)}%) — the item_price_baselines join is producing nothing`)

  // expectedAmount.p50 is a UNIT price from a {classificationId, currency, unitName}
  // bucket. Storing it without its unit renders "UYU 25" as a tender's expected amount
  // when 25 is the price of one button battery, so the unit must survive the join.
  const withUnit = await TenderForecastModel.countDocuments({ 'expectedAmount.unitName': { $type: 'string', $ne: '' } })
  assert(withAmount === 0 || withUnit / withAmount > 0.5, `>50% of expectedAmounts carry unitName (got ${withUnit}/${withAmount}) — the baseline's unit was dropped`)

  // buyerName is derived from the events pipeline ($first: "$buyer.name") rather than a
  // separate scan; a wrong projection yields thousands of blank names and nothing else
  // notices. Floor rather than zero-tolerance: a handful of releases genuinely lack a name.
  const withBuyerName = await TenderForecastModel.countDocuments({ buyerName: { $type: 'string', $ne: '' } })
  assert(withBuyerName / n > 0.95, `>95% of forecasts carry a buyerName (got ${withBuyerName}/${n}) — the buyer-name projection is broken`)

  // --- compute-then-swap actually swapped ---------------------------------
  // NOT a wall-clock recency check: this job is monthly, so "generated in the last 24h"
  // fails on a perfectly valid collection the day after a legitimate run. What must hold
  // is that exactly ONE generation is present and every document is stamped.
  const versions = await TenderForecastModel.distinct('dataVersion')
  assert(versions.length === 1, `exactly one dataVersion after swap (got ${versions.length}: ${versions.slice(0, 3).join(',')})`)

  const unstamped = await TenderForecastModel.countDocuments({ generatedAt: { $not: { $type: 'date' } } })
  assert(unstamped === 0, `every forecast carries a generatedAt Date (${unstamped} without one)`)

  const future = await TenderForecastModel.findOne({ generatedAt: { $gt: new Date(Date.now() + 3600_000) } }).lean()
  assert(!future, `no forecast is stamped in the future (${future?.generatedAt?.toISOString()})`)

  // --- uniqueness of (buyerId, rubroNodeId) --------------------------------
  // Kept despite the unique index: index creation is not guaranteed (autoIndex may be off
  // on the connection that ran the job), so this can genuinely fail.
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
  // The suppression rule is SAME-NODE, not same-familia. Matching any element of
  // rubroAncestors (leaf codes + F…/SF…/C…/SC… tokens, all of which classificationSet also
  // carries) means one live call anywhere in familia F2 suppresses every alimentos-clase
  // forecast for that buyer. This assertion is therefore pinned to rubroNodeId — encoding
  // the ancestor rule here would confirm that bug instead of catching it.
  const nodeShapedKeys = [...openKeys].filter(k => /\|C\d/.test(k)).length
  assert(nodeShapedKeys > 0, `open_calls classificationSet carries clase (level ${RUBRO_LEVEL}) tokens (got ${nodeShapedKeys}) — a node-level suppression check would be vacuous`)
  let overlaps = 0
  let example = ''
  for await (const f of TenderForecastModel.find().select('buyerId rubroNodeId').lean().cursor()) {
    if (openKeys.has(`${f.buyerId}|${f.rubroNodeId}`)) { overlaps++; if (!example) example = `${f.buyerId}|${f.rubroNodeId}` }
  }
  assert(overlaps === 0, `no forecast sits on the same rubro node as a live open_call for the same buyer (${overlaps} overlap(s), e.g. ${example})`)

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
