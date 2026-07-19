import { createError, defineEventHandler } from 'h3'
import { connectToDatabase } from '../../utils/database'
import { DeptIndicatorModel } from '../../utils/models'
import { mandateForBuyer } from '../../../../shared/political-mandates'

/**
 * Departmental procurement indicators, tagged with the governing party — the data
 * behind /analytics/partidos (map + descriptive comparison).
 *
 * Reads the precomputed `dept_indicators` rollup (rebuilt monthly by
 * src/jobs/refresh-dept-indicators.ts) and attaches, per (dept, year), the party in
 * office via mandateForBuyer — a deterministic lookup, so nothing is aggregated over
 * `releases` on the request path (buyer.id is unindexed there). Returns EVERY
 * dept×year row once (~350, small) so the page switches year/metric client-side
 * without refetching, and computes the per-party views (median / sum / per-capita)
 * itself with the census population it already holds.
 *
 * This is descriptive context. Party is attached as "who governed when this was
 * recorded", never as an attribution of the spending. See shared/political-mandates.ts.
 */
export default defineEventHandler(async () => {
  try {
    await connectToDatabase()

    const rows = await DeptIndicatorModel.find({}).lean()
    if (!rows.length) {
      throw createError({
        statusCode: 503,
        statusMessage: 'Dept indicators not computed yet. Run the refresh-dept-indicators job.',
      })
    }

    const data = rows.map((r: any) => {
      const m = mandateForBuyer(r.buyerId, r.year)
      return {
        buyerId: r.buyerId,
        year: r.year,
        total: r.total,
        contracts: r.contracts,
        totalRecords: r.totalRecords,
        pricedRecords: r.pricedRecords,
        directCount: r.directCount,
        tenderCount: r.tenderCount,
        otherMethodCount: r.otherMethodCount,
        methodKnown: r.methodKnown,
        top5Share: r.top5Share,
        supplierCount: r.supplierCount,
        anomalyCountRank3: r.anomalyCountRank3,
        // Party in office that year (departmental mandate). Blank if outside the
        // curated 2005→ range (e.g. 2004 rows) — the page renders "sin dato".
        party: m.hasMandate ? m.party : null,
        partyLabel: m.hasMandate ? m.partyLabel : null,
        partyColor: m.hasMandate ? m.partyColor : null,
        holder: m.hasMandate ? m.holder : null,
        termLabel: m.hasMandate ? m.termLabel : null,
        isTransition: !!m.isTransition,
      }
    }).sort((a, b) => a.year - b.year || a.buyerId.localeCompare(b.buyerId))

    const years = [...new Set(data.map(d => d.year))].sort((a, b) => a - b)
    const calculatedAt = rows[0]?.calculatedAt ?? null

    return {
      success: true,
      data: {
        rows: data,
        years,
        calculatedAt,
        source: 'precomputed',
      },
    }
  }
  catch (error: any) {
    if (error?.statusCode) throw error
    console.error('Error building party comparison:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to build party comparison' })
  }
})
