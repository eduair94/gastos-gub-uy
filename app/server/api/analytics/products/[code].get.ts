import { createError, defineEventHandler, getRouterParam } from 'h3'
import { connectToDatabase } from '../../../utils/database'
import { ItemPriceBaselineModel, ProductAnalyticsModel, ProductVariantsModel } from '../../../utils/models'

/**
 * One catalogue code's analytics, plus its price reference.
 *
 * The `product_analytics` doc carries the who/how-much/when (top buyers, top suppliers, year
 * series, counts, spend). The price distribution comes from `item_price_baselines` — the same
 * per-{classificationId, currency, unitName} baseline the contract detail page and the anomaly
 * detector use — read by the compound-indexed point lookup, never a releases scan.
 */
export default defineEventHandler(async (event) => {
  try {
    await connectToDatabase()

    const code = getRouterParam(event, 'code')?.trim()
    if (!code) {
      throw createError({ statusCode: 400, statusMessage: 'Product code is required' })
    }

    const product = await ProductAnalyticsModel.findOne({ code }).lean()
    if (!product) {
      throw createError({ statusCode: 404, statusMessage: 'Product not found' })
    }

    // Every price baseline for this code (one per currency + unit). The scorer
    // needs n >= a handful for the percentiles to mean anything, so surface
    // only those and let the page decide how to present a thin one.
    const priceUnits = await ItemPriceBaselineModel
      .find({ classificationId: code })
      .select('currency unitName n p25 p50 p75 p95 min max recurringPrices')
      .sort({ n: -1 })
      .maxTimeMS(4000)
      .lean()
      .catch(() => [])

    // Scraped-característica variant distribution — present only for the
    // unexplained-anomaly codes the offline job precomputes (product_variants).
    // Non-fatal: absent → the page falls back to a lazy client-side aggregate.
    const variants = await ProductVariantsModel
      .findOne({ code })
      .select('attributes varies sampledContracts calculatedAt')
      .lean()
      .catch(() => null)

    return {
      success: true,
      data: { ...product, priceUnits, variants },
    }
  }
  catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    console.error('Error fetching product detail:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch product detail' })
  }
})
