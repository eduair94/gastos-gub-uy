import { createError, defineEventHandler, getQuery } from 'h3'
import { connectToDatabase } from '../../utils/database'
import { UdecoSupplierStatsModel } from '../../utils/models'
import { escapeRegex } from '../../utils/query'

/**
 * State suppliers sanctioned by the Unidad de Defensa del Consumidor — the read side.
 *
 * Serves the precomputed `udeco_supplier_stats` (one document per sanctioned firm that also sells to
 * the State), rebuilt by src/jobs/refresh-udeco-crossref.ts. Nothing is joined here: the RUT match
 * needs a 12-digit normalisation that no index can serve, because the corpus stores the same RUT as
 * "R/214803890012", "R/214803890012 ", "R211003420017" and bare — an `$in` of exact strings finds
 * 379 of the 530 supplier documents, a 28% miss.
 *
 * FRAMING, repeated on the page and not to be softened: a UDECO sanction is about how the firm
 * treated CONSUMERS. It is not a finding about any public contract and does not make one irregular.
 * The published fact is narrower — the State's own consumer agency fined this firm, and the State
 * keeps buying from it.
 */

const SORT_FIELDS: Record<string, Record<string, 1 | -1>> = {
  spend: { totalUyu: -1 },
  sanctions: { sanctions: -1, totalUyu: -1 },
  fines: { totalUr: -1, totalUyu: -1 },
  recent: { lastSanctionAt: -1 },
}

export default defineEventHandler(async (event) => {
  try {
    await connectToDatabase()

    const query = getQuery(event)
    const { page = 1, limit = 25, sortBy = 'spend', rut, tipo, search, onlyFines } = query

    const filter: Record<string, unknown> = {}

    // One firm, for the supplier-profile panel.
    if (typeof rut === 'string' && rut) filter.rut = rut.replace(/\D/g, '')
    if (typeof tipo === 'string' && tipo) filter.tipos = tipo
    if (onlyFines === 'true') filter.fines = { $gt: 0 }
    if (typeof search === 'string' && search.trim().length >= 3) {
      const rx = new RegExp(escapeRegex(search.trim()), 'i')
      filter.$or = [{ razonSocial: rx }, { nombreComercial: rx }, { supplierName: rx }]
    }

    const sort = SORT_FIELDS[sortBy as string] ?? SORT_FIELDS.spend!
    const pageNum = Math.max(1, Number(page) || 1)
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 25))

    const [firms, total, sample] = await Promise.all([
      UdecoSupplierStatsModel.find(filter, { _id: 0, dataVersion: 0 })
        .sort({ ...sort, rut: 1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      UdecoSupplierStatsModel.countDocuments(filter),
      UdecoSupplierStatsModel.findOne({}, { _id: 0, sanctionedFirmsTotal: 1, calculatedAt: 1 }).lean(),
    ])

    if (!sample) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Sanctions cross-reference not computed yet. Run the refresh-udeco-crossref job.',
      })
    }

    // Headline figures over the WHOLE cross-reference, not the filtered page.
    const [totals] = await UdecoSupplierStatsModel.aggregate([
      {
        $group: {
          _id: null,
          firms: { $sum: 1 },
          uyu: { $sum: '$totalUyu' },
          sanctions: { $sum: '$sanctions' },
          ur: { $sum: '$totalUr' },
        },
      },
    ])

    return {
      success: true,
      data: {
        firms,
        meta: {
          // Both numbers, always: "381 firms" means nothing without "of 1,103 sanctioned".
          sellingToState: totals?.firms ?? 0,
          sanctionedFirmsTotal: sample.sanctionedFirmsTotal ?? 0,
          totalStateUyu: totals?.uyu ?? 0,
          totalSanctions: totals?.sanctions ?? 0,
          totalUr: totals?.ur ?? 0,
          calculatedAt: sample.calculatedAt,
          sourceUrl: 'https://catalogodatos.gub.uy/dataset/defensa-del-consumidor-sanciones-a-empresas',
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
    console.error('Error fetching UDECO sanctions:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch sanctions' })
  }
})
