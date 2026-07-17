import { createError, defineEventHandler, getRouterParam } from 'h3'
import { isValidObjectId } from 'mongoose'
import type { IRelease } from '../../../types'
import { connectToDatabase } from '../../utils/database'
import { ItemPriceBaselineModel, ReleaseModel } from '../../utils/models'
import { ocdsJsonUrl, sourceUrl } from '../../utils/query'

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
  for (const award of contract.awards ?? []) {
    for (const item of award.items ?? []) {
      const classificationId = item.classification?.id?.trim()
      if (!classificationId) continue
      const currency = item.unit?.value?.currency?.trim() || 'UYU'
      const unitName = item.unit?.name?.trim() || ''
      keys.set(`${classificationId}|${currency}|${unitName}`, { classificationId, currency, unitName })
    }
  }
  if (!keys.size) return {}

  const rows = await ItemPriceBaselineModel
    .find({ $or: [...keys.values()] })
    .select('classificationId currency unitName n p25 p50 p75 p95 min max')
    .maxTimeMS(4000)
    .lean()
    .catch(() => [])

  const out: Record<string, unknown> = {}
  for (const b of rows as Array<Record<string, unknown>>) {
    out[`${b.classificationId}|${b.currency}|${b.unitName}`] = {
      n: b.n, p25: b.p25, p50: b.p50, p75: b.p75, p95: b.p95, min: b.min, max: b.max,
    }
  }
  return out
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

    // Calculate additional fields for the detailed view
    const enhancedContract = {
      ...contract,
      // The human-facing government page, keyed on ocid — `id` resolves
      // to a DIFFERENT contract on adjustment/cancellation records.
      // See server/utils/query.ts#sourceUrl.
      sourceUrl: sourceUrl(contract.ocid),
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
      itemBaselines: await itemBaselines(contract),
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
