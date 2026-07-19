/**
 * Recopilatorios — event-driven spending compilations.
 *
 * A recopilatorio is a curated *event* (a festival, a public works push, a
 * scandal) expressed as a saved query over `releases`. The endpoint resolves
 * the query live, so the totals, the supplier mix and the ledger are always
 * current — but the SET of contracts is defined here, by a human, the way a
 * journalist would scope "what did this event cost".
 *
 * The query fields map 1:1 onto the params `buildContractFilters` already
 * understands (see server/api/contracts/index.get.ts), so a recopilatorio is
 * exactly a pre-built explorer filter with a title and a story around it.
 *
 * To relate contracts to an event: give it a `buyerIds` + `search` (and
 * optionally a year range or catalogue codes) that isolates them. Verify the
 * count/total against /api/contracts/stats before shipping a new one.
 */

export interface RecopQuery {
  /** buyer.id values (e.g. "98-1" = Intendencia de Montevideo). */
  buyerIds?: string[]
  /** Free-text phrase — matches objeto, artículos, proveedor (same as the explorer). */
  search?: string
  /** Exact catalogue codes (classification.id), when the event is a product. */
  categoryId?: string[]
  yearFrom?: number
  yearTo?: number
}

export interface RecopText {
  title: string
  dek: string
  /** Optional caveat shown under the ledger (data quirks, scope limits). */
  note?: string
}

export interface RecopDef {
  slug: string
  emoji: string
  /** Free label for the event's date or period, shown as-is. */
  period?: string
  query: RecopQuery
  es: RecopText
  en: RecopText
}

/**
 * The compilations. Seeded with Montevideo's big public festivities — all run
 * by the Intendencia (buyer 98-1), all isolable by a single keyword, all
 * verified against /api/contracts/stats:
 *   carnaval  -> 35 contratos · ~$15,0 M   criolla -> 92 · ~$95,2 M
 *   llamadas  -> 30 contratos · ~$68,1 M
 * Add more by copying an entry and re-checking its count/total.
 */
export const RECOPILATORIOS: RecopDef[] = [
  {
    slug: 'carnaval-montevideo',
    emoji: '🎭',
    period: '2015–2026',
    query: { buyerIds: ['98-1'], search: 'carnaval' },
    es: {
      title: 'El Carnaval de Montevideo',
      dek: 'Lo que la Intendencia de Montevideo gastó en el carnaval más largo del mundo: escenarios, artistas, sonido y producción.',
      note: 'Agrupa las adjudicaciones de la Intendencia de Montevideo cuyo objeto menciona «carnaval». Puede dejar afuera gasto rotulado de otra forma (llamadas, tablados) — ver los otros recopilatorios.',
    },
    en: {
      title: 'Montevideo Carnival',
      dek: 'What the Montevideo city government spent on the world’s longest carnival: staging, artists, sound and production.',
      note: 'Groups awards by the Montevideo city government whose object mentions «carnaval». It may miss spending labelled otherwise (llamadas, tablados) — see the other compilations.',
    },
  },
  {
    slug: 'semana-criolla',
    emoji: '🐎',
    period: '2015–2026',
    query: { buyerIds: ['98-1'], search: 'criolla' },
    es: {
      title: 'La Semana Criolla del Prado',
      dek: 'La fiesta criolla de Semana de Turismo en el Prado: jineteadas, predio y producción, según lo que compró la Intendencia.',
    },
    en: {
      title: 'Prado Criolla Week',
      dek: 'The gaucho festival of Tourism Week at the Prado: rodeo, grounds and production, by what the city government purchased.',
    },
  },
  {
    slug: 'desfile-de-llamadas',
    emoji: '🥁',
    period: '2015–2026',
    query: { buyerIds: ['98-1'], search: 'llamadas' },
    es: {
      title: 'El Desfile de Llamadas',
      dek: 'El desfile de comparsas de candombe por Isla de Flores: tablados, vallado, baños y logística.',
    },
    en: {
      title: 'The Llamadas Parade',
      dek: 'The candombe comparsa parade down Isla de Flores: stands, fencing, toilets and logistics.',
    },
  },
]

export function listRecopDefs(): RecopDef[] {
  return RECOPILATORIOS
}

export function getRecopDef(slug: string): RecopDef | null {
  return RECOPILATORIOS.find(r => r.slug === slug) ?? null
}

/** The bilingual text for a def in one locale, English-fallback. */
export function recopText(def: RecopDef, locale: string): RecopText {
  return locale === 'en' ? def.en : def.es
}

/**
 * Turns a def's query into the exact param bag `buildContractFilters` expects.
 * `tag: 'award'` restricts to the money-bearing stage — a recopilatorio counts
 * what was awarded, not every llamado/aclaración release of the same OCID.
 */
export function recopToQueryParams(q: RecopQuery): Record<string, unknown> {
  const params: Record<string, unknown> = { tag: 'award' }
  if (q.buyerIds?.length) params.buyerIds = q.buyerIds
  if (q.search) params.search = q.search
  if (q.categoryId?.length) params.categoryId = q.categoryId
  if (q.yearFrom != null) params.yearFrom = q.yearFrom
  if (q.yearTo != null) params.yearTo = q.yearTo
  return params
}
