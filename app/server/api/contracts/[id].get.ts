import { createError, defineEventHandler, getRouterParam } from 'h3'
import { isValidObjectId } from 'mongoose'
import type { IRelease } from '../../../types'
import { connectToDatabase } from '../../utils/database'
import { ContractItemFeaturesModel, ItemPriceBaselineModel, ReleaseModel } from '../../utils/models'
import { awardUrl, compraIdFromOcid, ocdsJsonUrl, sourceUrl } from '../../utils/query'
import { loadRateTable } from '../../utils/rates'
import { toTodayUyu } from '../../../../shared/utils/real-value'

/**
 * The reference price distribution for each item this contract bought.
 *
 * This is the exact data the price-alert job scores against
 * (`item_price_baselines`, keyed by classification + currency + unit over
 * a trailing 36-month window). Attaching it lets the detail page show
 * "compared against N similar purchases, usual range X–Y" — answering the
 * reader's question of what the alert's comparison actually is, from a
 * compound-indexed point lookup rather than an unindexed live scan of the
 * 2.2M-row releases collection.
 */
async function itemBaselines(contract: IRelease) {
  const keys = new Map<string, { classificationId: string, currency: string, unitName: string }>()
  // What this contract actually paid, per key — recurringPrices is intersected
  // against it below, so the page only receives the matches it can ever use.
  const paidByKey = new Map<string, Set<number>>()
  for (const award of contract.awards ?? []) {
    for (const item of award.items ?? []) {
      const classificationId = item.classification?.id?.trim()
      if (!classificationId) continue
      const currency = item.unit?.value?.currency?.trim() || 'UYU'
      const unitName = item.unit?.name?.trim() || ''
      const key = `${classificationId}|${currency}|${unitName}`
      keys.set(key, { classificationId, currency, unitName })
      const paid = item.unit?.value?.amount
      if (typeof paid === 'number' && paid > 0) {
        if (!paidByKey.has(key)) paidByKey.set(key, new Set())
        paidByKey.get(key)!.add(paid)
      }
    }
  }
  if (!keys.size) return {}

  const rows = await ItemPriceBaselineModel
    .find({ $or: [...keys.values()] })
    .select('classificationId currency unitName n p25 p50 p75 p95 min max recurringPrices')
    .maxTimeMS(4000)
    .lean()
    .catch(() => [])

  const out: Record<string, unknown> = {}
  for (const b of rows as Array<Record<string, unknown>>) {
    const key = `${b.classificationId}|${b.currency}|${b.unitName}`
    // Tariff/list prices this item recurs at (e.g. legal timbre denominations).
    // The page uses an exact match to present such prices as a known tariff
    // instead of "way above range" — a timbre de parto at its official 590
    // is not an overpayment however far it sits from the p95. Only the prices
    // this contract actually paid are shipped: the full per-baseline array is
    // unbounded (thousands of entries on high-volume classifications) and the
    // page can only ever match its own items against it.
    const paid = paidByKey.get(key)
    const recurring = Array.isArray(b.recurringPrices) && paid
      ? (b.recurringPrices as number[]).filter(p => paid.has(p))
      : []
    out[key] = {
      n: b.n, p25: b.p25, p50: b.p50, p75: b.p75, p95: b.p95, min: b.min, max: b.max,
      ...(recurring.length ? { recurringPrices: recurring } : {}),
    }
  }
  return out
}

/**
 * The "objeto del llamado" — the free-text subject of the purchase.
 *
 * It is published on the TENDER-stage release (`tag: 'tender'`, id
 * `llamado-<compra>`) and is EMPTY on the award/adjustment releases that
 * share the ocid — so an award page (e.g. `adjudicacion-1354176`, which the
 * card and the price-anomaly triage both key on) would otherwise show only
 * the item name ("TRANSPORTE CON CHOFER") and never the actual object ("…
 * traslado para 46 pasajeros … Paysandú … Rocha"). When the release in hand
 * carries no description of its own, borrow the tender sibling's — a single
 * point lookup on the ocid.
 */
async function siblingTenderDescription(contract: IRelease): Promise<string | null> {
  if (contract.tender?.description?.trim()) return null // already has its own
  if (!contract.ocid) return null

  // 1) The tender-stage sibling's description (same ocid).
  const sib = await ReleaseModel.findOne(
    { ocid: contract.ocid, tag: 'tender' },
    { 'tender.description': 1 },
  ).maxTimeMS(3000).lean().catch(() => null) as { tender?: { description?: string } } | null
  if (sib?.tender?.description?.trim()) return sib.tender.description.trim()

  // 2) The object scraped from the gov page (cached), for compras OCDS
  //    describes nowhere at all — e.g. "Sistema Veeam". Populated lazily by the
  //    features endpoint and the AI triage job; null until first scraped.
  const compraId = compraIdFromOcid(contract.ocid)
  if (compraId) {
    const feat = await ContractItemFeaturesModel.findOne(
      { compraId },
      { object: 1 },
    ).maxTimeMS(3000).lean().catch(() => null) as { object?: string } | null
    if (feat?.object?.trim()) return feat.object.trim()
  }

  return null
}

export default defineEventHandler(async (event) => {
  try {
    await connectToDatabase()

    const contractId = getRouterParam(event, 'id')

    if (!contractId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Contract ID is required',
      })
    }

    // Build query conditions based on whether contractId is a valid ObjectId
    const queryConditions: Array<Record<string, string>> = [
      { id: contractId },
      { ocid: contractId },
    ]

    // Only add _id condition if contractId is a valid ObjectId
    if (isValidObjectId(contractId)) {
      queryConditions.push({ _id: contractId })
    }

    // Find contract by ID or OCID
    const contract = await ReleaseModel.findOne({
      $or: queryConditions,
    }).lean() as IRelease | null

    if (!contract) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Contract not found',
      })
    }

    // The object text, item baselines, and rate table are independent — run
    // them together.
    const [baselines, borrowedDescription, rateTable] = await Promise.all([
      itemBaselines(contract),
      siblingTenderDescription(contract),
      loadRateTable(),
    ])

    // The contract amount in TODAY's pesos: the NATIVE total (in its own
    // currency) converted to UYU at its OWN month's BCU rate, then deflated by
    // the Unidad Indexada to today. Null when the contract's month/currency is
    // outside the rate table (older than our window, EUR, or mixed currencies) —
    // the page then shows only the nominal figure.
    //
    // Crucially, use the native currency (e.g. USD from `totalAmounts.USD`), NOT
    // `primaryAmount`: for a foreign contract `primaryAmount` is already a UYU
    // conversion done at the *current* rate, which is exactly the error this
    // fixes. `primaryCurrency` is 'UYU' on foreign contracts, so it can't be
    // trusted as the native currency; `currencies` carries the real one.
    const amt = (contract as unknown as { amount?: { currencies?: string[], totalAmounts?: Record<string, number>, primaryAmount?: number } }).amount ?? {}
    const currencies = Array.isArray(amt.currencies) ? amt.currencies.filter(Boolean) : []
    let nativeCurrency = 'UYU'
    let nativeAmount: number | null = null
    if (currencies.length === 1 && typeof amt.totalAmounts?.[currencies[0]!] === 'number') {
      nativeCurrency = currencies[0]!
      nativeAmount = amt.totalAmounts![currencies[0]!]!
    }
    else if (typeof amt.totalAmounts?.UYU === 'number') {
      nativeAmount = amt.totalAmounts.UYU
    }
    const realTodayAmount = (nativeAmount && nativeAmount > 0)
      ? toTodayUyu(nativeAmount, nativeCurrency, (contract as unknown as { date?: string | Date }).date, rateTable)
      : null

    // Calculate additional fields for the detailed view
    const enhancedContract = {
      ...contract,
      // Award releases carry no `tender.description`; borrow the tender
      // sibling's so the page's subject line and the AI triage both see the
      // real object of the purchase. Only set when the release lacked one.
      tender: borrowedDescription
        ? { ...contract.tender, description: borrowedDescription }
        : contract.tender,
      // The human-facing government page, keyed on ocid — `id` resolves
      // to a DIFFERENT contract on adjustment/cancellation records.
      // See server/utils/query.ts#sourceUrl.
      sourceUrl: sourceUrl(contract.ocid),
      // The government's award-detail page (distinct from the call page).
      awardUrl: awardUrl(contract.ocid),
      // The raw OCDS document for this specific release, keyed on id.
      ocdsUrl: ocdsJsonUrl(contract.id),
      totalAmount: contract.awards?.reduce((total, award) => {
        const awardTotal = award.items?.reduce((awardSum, item) => {
          return awardSum + (item.unit?.value?.amount || 0)
        }, 0) || 0
        return total + awardTotal
      }, 0) || 0,
      supplierCount: contract.awards?.reduce((count, award) => {
        return count + (award.suppliers?.length || 0)
      }, 0) || 0,
      itemCount: contract.awards?.reduce((count, award) => {
        return count + (award.items?.length || 0)
      }, 0) || 0,
      documentCount: (contract.tender?.documents?.length || 0)
        + (contract.awards?.reduce((count, award) => {
          return count + (award.documents?.length || 0)
        }, 0) || 0),
      // Keyed `classificationId|currency|unitName` — the page looks each
      // item up by the same key.
      itemBaselines: baselines,
      // The amount restated in today's pesos (see above). `realNativeCurrency`
      // lets the page note when a conversion from USD/EUR also happened.
      realTodayAmount,
      realNativeCurrency: nativeCurrency,
    }

    return {
      success: true,
      data: enhancedContract,
    }
  }
  catch (error) {
    console.error('Error fetching contract details:', error)

    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch contract details',
    })
  }
})
