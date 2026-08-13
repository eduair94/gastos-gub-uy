import { defineEventHandler, getQuery } from 'h3'
import { CASO_THEMES, casoThemeCounts, listCasoDefs } from '../../utils/casos'

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
 */
export default defineEventHandler((event) => {
  const q = getQuery(event)
  const theme = typeof q.theme === 'string' && q.theme ? q.theme : null
  const summary = q.summary === '1' || q.summary === 'true'

  const defs = listCasoDefs()
  const matching = theme ? defs.filter(c => c.theme === theme) : defs
  const items = summary
    ? []
    : matching.map(c => ({
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

  const counts = casoThemeCounts()

  return {
    success: true,
    data: {
      items,
      // `total` counts what the filter matched, whether or not the items rode
      // along: a summary request still needs to say how many there are.
      total: matching.length,
      totalAll: defs.length,
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
