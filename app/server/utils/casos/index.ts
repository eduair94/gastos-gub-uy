/**
 * The caso registry — one module per theme, aggregated here.
 *
 * The modules under `dossiers/` hold the content and are re-checked by
 * `scripts/verify-casos.ts` (every source URL fetched, every query resolved
 * against the live collection). Nothing else in the app reads them directly:
 * pages and API handlers go through the accessors below so that ordering,
 * dedupe and the locale fallback exist in exactly one place.
 *
 * The directory is `dossiers/` and not `data/` on purpose — the repo's
 * .gitignore ignores `data/` everywhere except `app/data/`, so a folder named
 * `data` here would never be committed and the production build would fail on
 * a missing import.
 *
 * See ./types.ts for the editorial contract.
 */
import { encodeQueryList } from '../../../../shared/utils/query-list'
import type { CasoDef, CasoQuery, CasoText, CasoThemeKey } from './types'
import { CASO_THEMES } from './types'

import { CASOS_AGUA } from './dossiers/agua'
import { CASOS_AMBIENTE } from './dossiers/ambiente'
import { CASOS_CANCER } from './dossiers/cancer'
import { CASOS_DEFENSA } from './dossiers/defensa'
import { CASOS_DEPORTE_Y_CULTURA } from './dossiers/deporte-y-cultura'
import { CASOS_EDUCACION } from './dossiers/educacion'
import { CASOS_ENERGIA } from './dossiers/energia'
import { CASOS_ESTADO_Y_FONDOS } from './dossiers/estado-y-fondos'
import { CASOS_OBRA_PUBLICA } from './dossiers/obra-publica'
import { CASOS_SALUD_MENTAL } from './dossiers/salud-mental'
import { CASOS_SEGURIDAD } from './dossiers/seguridad'
import { CASOS_TELECOMUNICACIONES } from './dossiers/telecomunicaciones'
import { CASOS_TRANSPORTE } from './dossiers/transporte'
import { CASOS_VIVIENDA } from './dossiers/vivienda'

export * from './types'

/**
 * Theme order drives every list on the site, so it is CASO_THEMES' order and
 * not the import order (which is alphabetical to keep the linter quiet).
 */
const BY_THEME: Record<CasoThemeKey, CasoDef[]> = {
  'salud-mental': CASOS_SALUD_MENTAL,
  'cancer': CASOS_CANCER,
  'defensa': CASOS_DEFENSA,
  'telecomunicaciones': CASOS_TELECOMUNICACIONES,
  'obra-publica': CASOS_OBRA_PUBLICA,
  'educacion': CASOS_EDUCACION,
  'energia': CASOS_ENERGIA,
  'seguridad': CASOS_SEGURIDAD,
  'agua': CASOS_AGUA,
  'vivienda': CASOS_VIVIENDA,
  'transporte': CASOS_TRANSPORTE,
  'estado-y-fondos': CASOS_ESTADO_Y_FONDOS,
  'ambiente': CASOS_AMBIENTE,
  'deporte-y-cultura': CASOS_DEPORTE_Y_CULTURA,
}

export const CASOS: CasoDef[] = CASO_THEMES.flatMap(t => BY_THEME[t.key] ?? [])

export function listCasoDefs(): CasoDef[] {
  return CASOS
}

export function listCasoDefsByTheme(theme: string): CasoDef[] {
  return CASOS.filter(c => c.theme === theme)
}

export function getCasoDef(slug: string): CasoDef | null {
  return CASOS.find(c => c.slug === slug) ?? null
}

/** The bilingual text for a def in one locale, Spanish-fallback. */
export function casoText(def: CasoDef, locale: string): CasoText {
  return locale === 'en' ? def.en : def.es
}

/** How many casos each theme holds — for the hub's theme grid. */
export function casoThemeCounts(): Record<string, number> {
  const out: Record<string, number> = {}
  for (const t of CASO_THEMES) out[t.key] = (BY_THEME[t.key] ?? []).length
  return out
}

/**
 * Turns a def's query into the exact param bag `buildContractFilters` expects.
 *
 * `tag: 'award'` restricts to the money-bearing stage: a caso counts what was
 * awarded, not every llamado/aclaración release sharing the OCID. Same choice
 * `recopilatorios` and `curros` make, for the same reason.
 */
export function casoToQueryParams(q: CasoQuery): Record<string, unknown> {
  const params: Record<string, unknown> = { tag: 'award' }
  if (q.buyerIds?.length) params.buyerIds = q.buyerIds
  if (q.buyers?.length) params.buyers = q.buyers
  if (q.suppliers?.length) params.suppliers = q.suppliers
  if (q.supplierIds?.length) params.supplierIds = q.supplierIds
  if (q.search) params.search = q.search
  if (q.categoryId?.length) params.categoryId = q.categoryId
  if (q.procurementMethodDetails?.length) params.procurementMethodDetails = q.procurementMethodDetails
  if (q.yearFrom != null) params.yearFrom = q.yearFrom
  if (q.yearTo != null) params.yearTo = q.yearTo
  if (q.hasReiteracion) params.hasReiteracion = true
  if (q.ocids?.length) params.ocids = q.ocids
  return params
}

/**
 * The same params as a querystring for `/contracts`, so "ver los contratos en
 * el explorador" lands on the identical set the page just showed.
 *
 * Multi-value params go through `encodeQueryList`, never a bare `join(',')`:
 * the largest buyer in the corpus is "Administración Nacional de Combustible,
 * Alcohol y Portland", and a raw comma inside a value is indistinguishable
 * from the separator — the filter would split it into two fragments that name
 * nothing and match zero contracts.
 */
export function casoExplorerQuery(q: CasoQuery): Record<string, string> {
  const params = casoToQueryParams(q)
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(params)) {
    if (v == null) continue
    out[k] = Array.isArray(v) ? encodeQueryList(v.map(String)) : String(v)
  }
  return out
}

// ── Las dos fuentes ─────────────────────────────────────────────────────────

/**
 * Una ficha puede venir de dos lugares, y conviene tener claro por qué son dos.
 *
 * Lo CURADO son los módulos de `dossiers/`: texto que escribió y revisó una persona, con
 * fuentes de prensa verificadas una por una. Vive en git porque su valor es que alguien
 * responde por cada frase, y porque el diff es la revisión.
 *
 * Lo DERIVADO lo arma `src/jobs/build-derived-casos.ts` a partir de documentos oficiales.
 * Vive en Mongo porque se puede volver a armar con un comando, y porque mil fichas en un
 * módulo de TS quedarían residentes en la memoria de cada worker de pm2.
 *
 * De acá para afuera la diferencia no existe: las dos salen como `CasoDef`.
 */

/** Sólo los dossiers escritos a mano. Sin red y sin base. */
export function listCuratedCasoDefs(): CasoDef[] {
  return CASOS
}

let derivedCache: { at: number, defs: CasoDef[] } | null = null
/** Cinco minutos. El armador corre por lotes, no por request. */
const DERIVED_TTL_MS = 5 * 60 * 1000

async function loadDerived(): Promise<CasoDef[]> {
  if (derivedCache && Date.now() - derivedCache.at < DERIVED_TTL_MS) return derivedCache.defs
  try {
    const { DerivedCasoModel } = await import('../../../../shared/models/derived_caso')
    const { connectToDatabase } = await import('../database')
    await connectToDatabase()
    const rows = await DerivedCasoModel.find({}, { def: 1, rank: 1 })
      .sort({ rank: 1 })
      .lean()
      .maxTimeMS(8000)
    const defs = rows.map((r: { def?: unknown }) => r.def as CasoDef).filter(Boolean)
    derivedCache = { at: Date.now(), defs }
    return defs
  }
  catch {
    // Que la base no conteste no puede tirar abajo las 141 fichas curadas, que no la
    // necesitan para nada. Se sirve lo último que hubo, o nada.
    return derivedCache?.defs ?? []
  }
}

/** Curadas primero, derivadas después. El orden es editorial y no se invierte. */
export async function listAllCasoDefs(): Promise<CasoDef[]> {
  return [...CASOS, ...(await loadDerived())]
}

export async function listAllCasoDefsByTheme(theme: string): Promise<CasoDef[]> {
  // El tema armado es el único que obliga a ir a la base. Para los otros catorce alcanza con
  // lo curado, y así una página de tema curado no paga una consulta que no necesita.
  if (theme !== 'gasto-observado') return CASOS.filter(c => c.theme === theme)
  return (await loadDerived()).filter(c => c.theme === theme)
}

export async function getAnyCasoDef(slug: string): Promise<CasoDef | null> {
  const curated = getCasoDef(slug)
  if (curated) return curated
  try {
    const { DerivedCasoModel } = await import('../../../../shared/models/derived_caso')
    const { connectToDatabase } = await import('../database')
    await connectToDatabase()
    const row = await DerivedCasoModel.findOne({ slug }, { def: 1 }).lean().maxTimeMS(8000)
    return ((row as { def?: unknown } | null)?.def as CasoDef) ?? null
  }
  catch {
    return null
  }
}

export async function casoThemeCountsAsync(): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  for (const t of CASO_THEMES) out[t.key] = 0
  for (const c of await listAllCasoDefs()) {
    out[c.theme] = (out[c.theme] ?? 0) + 1
  }
  return out
}
