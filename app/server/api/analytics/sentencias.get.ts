import { createError, defineEventHandler, getQuery } from 'h3'
import { connectToDatabase } from '../../utils/database'
import { JudicialSpendingModel, JudicialSpendingYearModel } from '../../utils/models'
import { loadRateTable } from '../../utils/rates'

/**
 * Lo que el Estado presupuesta y paga por perder juicios — el lado de lectura.
 *
 * Sirve `judicial_spending` y `judicial_spending_years`, que escribe
 * src/jobs/load-judicial-spending.ts desde el crédito presupuestal de OPP. La taxonomía de qué
 * objeto del gasto cuenta vive en shared/judicial-objects.ts y no se decide acá.
 *
 * EL TITULAR ES EL CRÉDITO VIGENTE, NO EL EJECUTADO. Los archivos de OPP publican el ejecutado en
 * cero para todas sus filas en 2019, 2020 y 2021. Un titular armado con el ejecutado mostraría que
 * el Estado dejó de pagar condenas en 2019, que es falso. El crédito vigente está en los once años,
 * y en los años que sí traen ejecución la partida de sentencias se gasta entera —
 * `fullySpentRows/rowsWithExecution` lo mide en cada corrida y la página lo publica.
 *
 * LOS AÑOS PARCIALES SE MARCAN, NO SE ESCONDEN. 2013-2015 traen 10 organismos y 2017-2018 traen 3 y
 * 4, contra los 28-34 de un año completo. Sin la marca, la serie dibuja un derrumbe del gasto que
 * nunca ocurrió. `partial` sale de la cobertura medida, no de una lista escrita a mano.
 *
 * LO QUE ESTA API NO SABE. El presupuesto no nombra causas ni personas. Ninguna fila dice a quién
 * indemnizó el Estado ni por qué.
 */

/** Un año con menos de esta fracción de los organismos del año más completo es un fragmento. */
const PARTIAL_COVERAGE_RATIO = 0.6

const SORT_FIELDS: Record<string, Record<string, 1 | -1>> = {
  vigente: { creditoVigente: -1 },
  ejecutado: { ejecutado: -1 },
  recent: { year: -1, creditoVigente: -1 },
}

interface YearDoc {
  year: number
  fileRows: number
  fileOrganismos: number
  fileVigente: number
  fileEjecutado: number
  executionAvailable: boolean
  judicialRows: number
  judicialVigente: number
  judicialEjecutado: number
  indemnizacionVigente: number
  indemnizacionEjecutado: number
  fullySpentRows: number
  rowsWithExecution: number
  uiYearAvg: number | null
  sourceUrl: string
  loadedAt: Date
}

export default defineEventHandler(async (event) => {
  try {
    await connectToDatabase()

    const query = getQuery(event)
    const { year, category, organismo, sortBy = 'vigente', page = 1, limit = 50, view } = query

    const filter: Record<string, unknown> = {}
    const yearNum = Number(year)
    if (Number.isInteger(yearNum) && yearNum > 2000) filter.year = yearNum
    if (typeof category === 'string' && category) filter.category = category
    if (typeof organismo === 'string' && organismo) filter.organismo = organismo

    const pageNum = Math.max(1, Number(page) || 1)
    const limitNum = Math.min(200, Math.max(1, Number(limit) || 50))
    const sort = SORT_FIELDS[sortBy as string] ?? SORT_FIELDS.vigente!

    /**
     * `view=rows` sirve SÓLO la tabla filtrada.
     *
     * La página lo usa al cambiar un filtro. Antes cada cambio de selector volvía a pedir la
     * respuesta entera —serie, cortes, ranking y tabla—, y la página se desmontaba y volvía a
     * montarse: el lector veía saltar todo por una tabla de 25 filas. La vista general no depende
     * de los filtros y no se vuelve a pedir.
     */
    if (view === 'rows') {
      const [rows, total] = await Promise.all([
        JudicialSpendingModel.find(filter, { _id: 0, __v: 0 })
          .sort({ ...sort, rowKey: 1 })
          .skip((pageNum - 1) * limitNum)
          .limit(limitNum)
          .lean(),
        JudicialSpendingModel.countDocuments(filter),
      ])
      return {
        success: true,
        data: {
          rows,
          pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
        },
      }
    }

    const years = await JudicialSpendingYearModel
      .find({}, { _id: 0, __v: 0 })
      .sort({ year: 1 })
      .lean() as unknown as YearDoc[]

    if (years.length === 0) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Judicial spending not loaded yet. Run the load-judicial-spending job.',
      })
    }

    // Pesos de hoy: cada año se re-expresa dividiendo por su UI promedio y multiplicando por la
    // última UI que tenemos. Se calcula al leer y no se guarda — un valor real guardado queda viejo
    // al mes siguiente.
    const rates = await loadRateTable()
    const latestUi = rates.latestUi
    const factorByYear = new Map<number, number | null>()
    for (const y of years) {
      factorByYear.set(y.year, latestUi && y.uiYearAvg ? latestUi / y.uiYearAvg : null)
    }
    const real = (amount: number, y: number): number | null => {
      const f = factorByYear.get(y)
      return f ? amount * f : null
    }

    const maxOrganismos = Math.max(...years.map(y => y.fileOrganismos))
    const series = years.map(y => ({
      year: y.year,
      judicialVigente: y.judicialVigente,
      judicialVigenteReal: real(y.judicialVigente, y.year),
      judicialEjecutado: y.judicialEjecutado,
      indemnizacionVigente: y.indemnizacionVigente,
      indemnizacionVigenteReal: real(y.indemnizacionVigente, y.year),
      indemnizacionEjecutado: y.indemnizacionEjecutado,
      executionAvailable: y.executionAvailable,
      // La cobertura viaja con cada punto de la serie: el gráfico la necesita para atenuar el año,
      // no alcanza con listarla aparte.
      partial: y.fileOrganismos < maxOrganismos * PARTIAL_COVERAGE_RATIO,
      fileRows: y.fileRows,
      fileOrganismos: y.fileOrganismos,
      fileVigente: y.fileVigente,
      judicialRows: y.judicialRows,
      fullySpentRows: y.fullySpentRows,
      rowsWithExecution: y.rowsWithExecution,
      /** Qué parte de todo el presupuesto del año se fue en objetos judiciales. */
      shareOfBudget: y.fileVigente > 0 ? y.judicialVigente / y.fileVigente : null,
    }))

    // Los años completos son el único terreno donde una comparación se sostiene.
    const solid = series.filter(s => !s.partial)

    // LOS CORTES VAN SIN FILTRAR, A PROPÓSITO. Son el contexto fijo contra el que se lee la tabla.
    // Filtrarlos con el año hacía que elegir 2021 dejara el ranking con un solo año mientras la
    // serie seguía mostrando once: dos cifras distintas de lo mismo en la misma pantalla.
    const [rows, total, byCategory, byOrganismo] = await Promise.all([
      JudicialSpendingModel.find(filter, { _id: 0, __v: 0 })
        .sort({ ...sort, rowKey: 1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      JudicialSpendingModel.countDocuments(filter),
      // 188 documentos en total: los dos rollups son baratos y evitan una segunda colección.
      JudicialSpendingModel.aggregate([
        {
          $group: {
            _id: { category: '$category', year: '$year' },
            vigente: { $sum: '$creditoVigente' },
            ejecutado: { $sum: '$ejecutado' },
            n: { $sum: 1 },
          },
        },
      ]),
      JudicialSpendingModel.aggregate([
        {
          $group: {
            // La unidad ejecutora entra a la clave para poder desambiguar los organismos-bolsa.
            _id: { organismo: '$organismo', unidadEjecutora: '$unidadEjecutora', year: '$year' },
            vigente: { $sum: '$creditoVigente' },
            ejecutado: { $sum: '$ejecutado' },
            n: { $sum: 1 },
          },
        },
      ]),
    ])

    /**
     * Los organismos-bolsa del presupuesto: no son un cuerpo, son la caja desde la que se paga.
     * «Diversos Créditos» concentra 4.638 millones de esta página, y por sí solo no le dice nada al
     * lector — el cuerpo real es su unidad ejecutora («Dir. Gral. de Secretaría (M.E.F.)»). El
     * ranking los muestra con las dos partes.
     */
    const POOLED_ORGANISMOS = new Set([
      'Diversos Créditos',
      'Partidas a Reaplicar',
      'Transferencias Financieras al Sector Seguridad Social',
    ])

    /** Suma una agrupación (clave × año) en pesos de hoy, para poder comparar entre años. */
    function foldByYear<K extends string>(
      groups: Array<{ _id: Record<string, unknown>, vigente: number, ejecutado: number, n: number }>,
      key: K,
    ): Array<{ key: string, vigente: number, vigenteReal: number | null, ejecutado: number, rows: number, years: number[] }> {
      const acc = new Map<string, { vigente: number, vigenteReal: number, realKnown: boolean, ejecutado: number, rows: number, years: Set<number> }>()
      for (const g of groups) {
        const base = String(g._id[key] ?? '')
        const ue = String(g._id.unidadEjecutora ?? '')
        const name = POOLED_ORGANISMOS.has(base) && ue ? `${base} · ${ue}` : base
        const y = Number(g._id.year)
        const cur = acc.get(name) ?? { vigente: 0, vigenteReal: 0, realKnown: true, ejecutado: 0, rows: 0, years: new Set<number>() }
        cur.vigente += g.vigente
        const r = real(g.vigente, y)
        if (r === null) cur.realKnown = false
        else cur.vigenteReal += r
        cur.ejecutado += g.ejecutado
        cur.rows += g.n
        cur.years.add(y)
        acc.set(name, cur)
      }
      return [...acc.entries()]
        .map(([name, v]) => ({
          key: name,
          vigente: v.vigente,
          vigenteReal: v.realKnown ? v.vigenteReal : null,
          ejecutado: v.ejecutado,
          rows: v.rows,
          years: [...v.years].sort((a, b) => a - b),
        }))
        // Ordenar por la misma cifra que la página muestra. Ordenar por el nominal y dibujar el
        // real deja filas fuera de orden en pantalla, que es lo que pasaba.
        .sort((a, b) => (b.vigenteReal ?? b.vigente) - (a.vigenteReal ?? a.vigente))
    }

    const totalVigente = series.reduce((s, y) => s + y.judicialVigente, 0)
    const totalVigenteReal = series.reduce((s, y) => s + (y.judicialVigenteReal ?? 0), 0)
    const first = solid[0]
    const last = solid[solid.length - 1]

    return {
      success: true,
      data: {
        series,
        byCategory: foldByYear(byCategory as never, 'category'),
        byOrganismo: foldByYear(byOrganismo as never, 'organismo').slice(0, 30),
        rows,
        meta: {
          firstYear: years[0]!.year,
          lastYear: years[years.length - 1]!.year,
          totalVigente,
          totalVigenteReal: totalVigenteReal || null,
          totalIndemnizacion: series.reduce((s, y) => s + y.indemnizacionVigente, 0),
          /** Los extremos de la comparación honesta: primer y último año COMPLETO. */
          solidFirst: first ? { year: first.year, vigenteReal: first.judicialVigenteReal } : null,
          solidLast: last ? { year: last.year, vigenteReal: last.judicialVigenteReal } : null,
          solidYears: solid.map(s => s.year),
          partialYears: series.filter(s => s.partial).map(s => s.year),
          yearsWithoutExecution: series.filter(s => !s.executionAvailable).map(s => s.year),
          fullySpentRows: series.reduce((s, y) => s + y.fullySpentRows, 0),
          rowsWithExecution: series.reduce((s, y) => s + y.rowsWithExecution, 0),
          partialCoverageRatio: PARTIAL_COVERAGE_RATIO,
          // El último año que OPP publicó. Sale del dato, no de una constante: el día que OPP
          // retome la serie, la página deja de decir 2021 sola.
          datasetEndsAt: years[years.length - 1]!.year,
          sourceUrl: years[0]!.sourceUrl,
          loadedAt: years[years.length - 1]!.loadedAt,
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
    console.error('Error fetching judicial spending:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch judicial spending' })
  }
})
