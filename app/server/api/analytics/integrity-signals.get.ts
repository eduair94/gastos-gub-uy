import { createError, defineEventHandler, getQuery } from 'h3'
import { connectToDatabase } from '../../utils/database'
import { IntegritySignalModel } from '../../utils/models'
import { SIGNAL_KEYS } from '../../../../shared/integrity-signals'

/**
 * Señales de gestión — the read side.
 *
 * Serves the precomputed `integrity_signals` collection (one document per buying organism) built by
 * src/jobs/refresh-integrity-signals.ts. NOTHING is aggregated here: every measurement behind these
 * numbers is a COLLSCAN over `releases` (buyer.id carries no index), which is why it lives in a
 * scheduled job and this endpoint is a plain indexed find.
 *
 * The documents are descriptive MEASUREMENTS of published records, never findings of wrongdoing.
 * The thresholds, their corpus justification, and the indicators the feed makes impossible (single
 * bidding, estimated-vs-awarded value) are documented in shared/integrity-signals.ts.
 */

const SORT_FIELDS: Record<string, string> = {
  weight: 'weight',
  total: 'totalUyu',
  contracts: 'contracts',
  concentration: 'topSupplierUyu',
  bursts: 'burstMonths',
  express: 'expressCalls',
  unexplained: 'unexplainedFlags',
}

export default defineEventHandler(async (event) => {
  try {
    await connectToDatabase()

    const query = getQuery(event)
    const {
      page = 1,
      limit = 25,
      sortBy = 'weight',
      sortOrder = 'desc',
      signal,
      level,
      buyerId,
      minContracts,
    } = query

    const filter: Record<string, unknown> = {}

    // One organism, for the profile panel.
    if (typeof buyerId === 'string' && buyerId) {
      filter.buyerId = buyerId
    }

    // Only organisms raising a given signal, optionally at a given level. `$elemMatch` so the two
    // conditions must hold on the SAME array entry — a dotted pair would match an organism with
    // `concentration: none` and `bursts: high` when asked for `concentration=high`.
    if (typeof signal === 'string' && SIGNAL_KEYS.includes(signal as never)) {
      const entry: Record<string, unknown> = { key: signal }
      entry.level = level === 'high' ? 'high' : { $in: ['watch', 'high'] }
      filter.signals = { $elemMatch: entry }
    }
    else if (level === 'high' || level === 'watch') {
      filter.signals = { $elemMatch: { level } }
    }

    const minContractsNum = Number(minContracts)
    if (Number.isFinite(minContractsNum) && minContractsNum > 0) {
      filter.contracts = { $gte: minContractsNum }
    }

    const sortField = SORT_FIELDS[sortBy as string] ?? 'weight'
    const direction = sortOrder === 'asc' ? 1 : -1
    // Ties break on money then on a stable key, so pagination cannot repeat or skip a row.
    const sort: Record<string, 1 | -1> = { [sortField]: direction as 1 | -1 }
    if (sortField !== 'totalUyu') sort.totalUyu = -1
    sort._id = -1

    const pageNum = Math.max(1, Number(page) || 1)
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 25))
    const skip = (pageNum - 1) * limitNum

    const [rows, total] = await Promise.all([
      IntegritySignalModel.find(filter).sort(sort).skip(skip).limit(limitNum).lean(),
      IntegritySignalModel.countDocuments(filter),
    ])

    // A single sample carries the run's cutoffs and window, which are identical across the
    // generation. Fetching them from the first row keeps this to one extra query at most, and only
    // when the filtered page is empty.
    const sample = rows[0] ?? (await IntegritySignalModel.findOne().lean())
    if (!sample) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Integrity signals not computed yet. Run the refresh-integrity-signals job.',
      })
    }

    return {
      success: true,
      data: {
        organisms: rows,
        meta: {
          // The window the measurements cover, so a stale page is self-describing.
          windowStart: sample.windowStart,
          windowEnd: sample.windowEnd,
          calculatedAt: sample.calculatedAt,
          // p90/p97 per indicator — what "watch" and "high" actually mean for this run.
          cutoffs: sample.cutoffs ?? {},
          measuredOrganisms: await IntegritySignalModel.estimatedDocumentCount(),
        },
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      },
    }
  }
  catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    console.error('Error fetching integrity signals:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch integrity signals' })
  }
})
