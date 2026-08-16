import { defineEventHandler, getQuery } from 'h3'
import { CASO_THEMES, casoThemeCountsAsync, listAllCasoDefs } from '../../utils/casos'

/**
 * The caso index — metadata only, NO database.
 *
 * `/api/curros` resolves one aggregation per case to put a live total on every
 * card. That is affordable for a handful of cases and ruinous for a hundred:
 * it would be a hundred aggregations on every render of the index and of each
 * of the fourteen theme pages. So the list carries no computed money at all.
 *
 * What a card shows instead is `amountReported` — the figure the sources
 * themselves published, verbatim. That is the more honest card anyway: the
 * cross-reference is a claim about OUR data and belongs on the page that can
 * caveat it. The live numbers are resolved by `/api/casos/[slug]`.
 *
 * `?theme=` narrows to one theme. Unknown values return an empty list rather
 * than everything, so a typo cannot silently masquerade as the full index.
 * `?summary=1` returns the theme roster and the totals with NO items — what the
 * investigations hub needs to promote the collection without shipping a
 * hundred cards it will not render.
 *
 * `?page=`/`?perPage=` paginate ON THE SERVER, and that is not a nicety. The
 * list used to ship whole so the client could filter it in memory: 141 dossiers
 * were already 447KB of SSR payload, and the derived files take the collection
 * past a thousand, which is over 2MB on every render of the index.
 */
export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const theme = typeof q.theme === 'string' && q.theme ? q.theme : null
  const summary = q.summary === '1' || q.summary === 'true'
  const page = Math.max(1, Number(q.page ?? 1) || 1)
  const perPage = Math.min(60, Math.max(1, Number(q.perPage ?? 24) || 24))
  const kind = typeof q.kind === 'string' && q.kind ? q.kind : null
  const needle = typeof q.q === 'string' ? q.q.trim().toLowerCase() : ''

  const defs = await listAllCasoDefs()
  // Los tres filtros se aplican ACÁ y no en el cliente. Antes la lista entera viajaba y el
  // navegador filtraba en memoria; con mil fichas eso es más de 2MB por render. Y filtrar en
  // el cliente sobre una sola página mentiría: el contador diría "3 resultados" cuando hay
  // treinta en las páginas que no vinieron.
  const matching = defs.filter((c) => {
    if (theme && c.theme !== theme) return false
    if (kind && c.statusKind !== kind) return false
    if (!needle) return true
    const hay = `${c.es.title} ${c.es.dek} ${c.en.title} ${c.en.dek} ${c.organisms.join(' ')} ${(c.suppliersNamed ?? []).join(' ')} ${c.amountReported ?? ''}`.toLowerCase()
    return hay.includes(needle)
  })
  const start = (page - 1) * perPage
  const items = summary
    ? []
    : matching.slice(start, start + perPage).map(c => ({
        slug: c.slug,
        emoji: c.emoji,
        theme: c.theme,
        period: c.period ?? null,
        statusKind: c.statusKind,
        status: c.status,
        amountReported: c.amountReported ?? null,
        organisms: c.organisms,
        feedCoverage: c.feedCoverage,
        hasQuery: Boolean(c.query),
        sourceCount: c.sources.length,
        investigationPath: c.investigationPath ?? null,
        es: { title: c.es.title, dek: c.es.dek },
        en: { title: c.en.title, dek: c.en.dek },
      }))

  const counts = await casoThemeCountsAsync()

  return {
    success: true,
    data: {
      items,
      // `total` counts what the filter matched, whether or not the items rode
      // along: a summary request still needs to say how many there are.
      total: matching.length,
      totalAll: defs.length,
      page,
      perPage,
      totalPages: Math.max(1, Math.ceil(matching.length / perPage)),
      sourceTotal: defs.reduce((a, c) => a + c.sources.length, 0),
      themes: CASO_THEMES.map(t => ({
        key: t.key,
        emoji: t.emoji,
        count: counts[t.key] ?? 0,
        es: t.es,
        en: t.en,
      })),
      meta: {
        moneyBasis: 'amountReported is the figure published by the cited sources, verbatim; it is not computed from this database',
      },
    },
  }
})
