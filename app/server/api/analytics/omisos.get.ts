import { createError, defineEventHandler, getQuery } from 'h3'
import { connectToDatabase } from '../../utils/database'
import { JutepOmisoModel } from '../../utils/models'
import { escapeRegex } from '../../utils/query'
import { maskDocument } from '../../../../shared/jutep-incisos'

/**
 * Funcionarios declarados omisos (JUTEP) — the read side.
 *
 * Serves the roster loaded by src/jobs/load-jutep-omisos.ts: officials formally declared delinquent
 * in their duty to file the sworn declaration of assets and income (Ley 17.060 arts. 10, 11, 13).
 *
 * PUBLICATION IS THE LAW'S OWN CHOICE. Art. 18 makes the CONTENT of a declaration confidential; the
 * fact of the omission is required to be published in the Diario Oficial by art. 13, and JUTEP
 * publishes this roster as open data. Nothing here exposes declaration content, assets or income.
 *
 * The document number is MASKED on the way out. It is public in the source file and it is what
 * disambiguates two officials with the same name, but reproducing full identity documents on a
 * high-traffic page invites identity fraud and adds nothing a reader needs.
 */
export default defineEventHandler(async (event) => {
  try {
    await connectToDatabase()

    const query = getQuery(event)
    const { page = 1, limit = 50, incisoCode, organismo, search, sinceYear } = query

    const filter: Record<string, unknown> = {}

    if (typeof incisoCode === 'string' && incisoCode) {
      filter.incisoCode = incisoCode
    }
    if (typeof organismo === 'string' && organismo) {
      filter.organismo = organismo
    }
    if (typeof search === 'string' && search.trim().length >= 3) {
      // Name OR position. Anchored nowhere on purpose: readers search a surname fragment.
      const rx = new RegExp(escapeRegex(search.trim()), 'i')
      filter.$or = [{ displayName: rx }, { cargo: rx }, { organismo: rx }]
    }
    const sinceYearNum = Number(sinceYear)
    if (Number.isInteger(sinceYearNum) && sinceYearNum > 1990) {
      filter.fechaOmision = { $gte: new Date(Date.UTC(sinceYearNum, 0, 1)) }
    }

    const pageNum = Math.max(1, Number(page) || 1)
    const limitNum = Math.min(200, Math.max(1, Number(limit) || 50))

    const [rows, total, byOrganism, byYear, grandTotal] = await Promise.all([
      JutepOmisoModel.find(filter)
        .sort({ fechaOmision: -1, _id: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      JutepOmisoModel.countDocuments(filter),
      // Small collection (~2.4k docs); these two rollups are cheap and give the page its shape
      // without a second precomputed collection.
      JutepOmisoModel.aggregate([
        { $match: filter },
        { $group: { _id: { organismo: '$organismo', incisoCode: '$incisoCode' }, n: { $sum: 1 } } },
        { $sort: { n: -1 } },
        { $limit: 25 },
      ]),
      JutepOmisoModel.aggregate([
        { $match: filter },
        { $group: { _id: { $year: '$fechaOmision' }, n: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      JutepOmisoModel.estimatedDocumentCount(),
    ])

    return {
      success: true,
      data: {
        omisos: rows.map((row: any) => ({
          displayName: row.displayName,
          documentoMasked: maskDocument(row.documento),
          cargo: row.cargo,
          fechaOmision: row.fechaOmision,
          organismo: row.organismo,
          inciso: row.inciso,
          incisoCode: row.incisoCode,
        })),
        byOrganism: byOrganism.map((g: any) => ({
          organismo: g._id.organismo,
          incisoCode: g._id.incisoCode,
          count: g.n,
        })),
        byYear: byYear.filter((g: any) => g._id).map((g: any) => ({ year: g._id, count: g.n })),
        meta: {
          total,
          grandTotal,
          sourceUrl: rows[0]?.sourceUrl ?? 'https://catalogodatos.gub.uy/dataset/funcionarios-declarados-omisos',
          loadedAt: rows[0]?.loadedAt ?? null,
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
    console.error('Error fetching JUTEP omisos:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch omisos' })
  }
})
