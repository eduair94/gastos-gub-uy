/**
 * Arma las fichas de «el Tribunal de Cuentas, compra por compra» desde `tcr_resolutions`.
 *
 *   npx tsx src/jobs/build-tcr-casos.ts            # arma y escribe
 *   npx tsx src/jobs/build-tcr-casos.ts --dry-run  # sólo informa cuántas salen
 *
 * EL LÍMITE QUE MANDA SOBRE TODO ESTE ARCHIVO. La ficha del archivo del Tribunal publica
 * SÓLO el VISTO: el encabezado del expediente y qué llamado se miró. Si el gasto fue
 * observado, por cuánto y con qué fundamento está únicamente en el PDF, y ese PDF es un
 * escaneo sin capa de texto.
 *
 * Entonces acá se puede decir «el Tribunal de Cuentas se pronunció sobre esta compra», se
 * cita el VISTO textual y se enlaza la resolución. NADA más fuerte. Decir «observó» sería
 * inventar el fallo. scripts/verify-derived-casos.ts rechaza la ficha que lo diga.
 *
 * DOS GRANOS:
 *   1. Por compra    — una ficha por compra atada. Son 307.
 *   2. Por organismo — desde 3 compras atadas. Son 33.
 *
 * Escribe en la misma colección `derived_casos` que build-derived-casos.ts, con
 * `origin: 'tcr'`, así que el borrado seguro se limita a ese origen y los dos trabajos no se
 * pisan.
 */
import type { CasoDef, CasoText } from '../../app/server/utils/casos/types'
import { connectToDatabase, disconnectFromDatabase } from '../../shared/connection/database'
import { DerivedCasoModel } from '../../shared/models/derived_caso'
import { ReleaseModel } from '../../shared/models/release'
import { TcrResolutionModel } from '../../shared/models/tcr_resolution'

process.env.MONGO_SOCKET_TIMEOUT_MS = process.env.MONGO_SOCKET_TIMEOUT_MS ?? '600000'

const dryRun = process.argv.includes('--dry-run')
const MIN_POR_ORGANISMO = 3
/** El VISTO más corto que vale la pena citar. Menos que esto es un encabezado sin contenido. */
const MIN_VISTO = 80

const LIMITE_ES = 'La ficha pública del Tribunal de Cuentas publica sólo el VISTO, que dice qué '
  + 'expediente se miró. Si el gasto fue observado, por cuánto y con qué fundamento consta '
  + 'únicamente en el PDF de la resolución, que se enlaza acá. Por eso esta ficha dice que el '
  + 'Tribunal se pronunció sobre la compra, y no afirma en qué sentido lo hizo.'
const LIMITE_EN = 'The Court of Auditors\' public record publishes only the VISTO, which states '
  + 'which file was examined. Whether the spending was objected to, for how much and on what '
  + 'grounds appears only in the resolution PDF, linked here. This file therefore states that the '
  + 'Court ruled on the purchase, and makes no claim about which way it ruled.'

interface Res {
  tcrId: number
  organism: string | null
  organismKey: string | null
  subject: string | null
  visto: string | null
  date: string | null
  resolvedAt: Date | null
  pdfUrl: string | null
  sourceUrl: string
  procurementTitle: string | null
  matchedOcid: string | null
  matchedCompraId: string | null
  matchedBuyerName: string | null
}

function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70)
    .replace(/-+$/g, '')
}

/** El VISTO viene con el código de expediente adelante. Para citarlo se saca. */
function cleanVisto(v: string): string {
  return v
    .replace(/^\([^)]*\)\s*/, '')
    .replace(/^VISTO:?\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function shortVisto(v: string, max = 420): string {
  const c = cleanVisto(v)
  if (c.length <= max) return c
  return `${c.slice(0, max).replace(/[\s,;.]+\S*$/, '')}…`
}

function years(rows: Res[]): string {
  const ys = rows.map(r => (r.resolvedAt ? new Date(r.resolvedAt).getUTCFullYear() : 0)).filter(Boolean).sort()
  if (!ys.length) return ''
  return ys[0] === ys[ys.length - 1] ? String(ys[0]) : `${ys[0]}–${ys[ys.length - 1]}`
}

function sourcesFrom(rows: Res[]): CasoDef['sources'] {
  const out: CasoDef['sources'] = []
  for (const r of rows.slice(0, 8)) {
    out.push({
      outlet: 'Tribunal de Cuentas',
      title: `Resolución ${r.tcrId}${r.procurementTitle ? ` — ${r.procurementTitle}` : ''}`,
      url: r.sourceUrl,
      date: r.date ?? undefined,
    })
    // El PDF es el documento donde está el fallo. Se enlaza siempre, aunque no lo podamos leer.
    if (r.pdfUrl) {
      out.push({
        outlet: 'Tribunal de Cuentas',
        title: `Resolución ${r.tcrId} (PDF)`,
        url: r.pdfUrl,
        date: r.date ?? undefined,
      })
    }
  }
  return out
}

function buildCompra(ocid: string, rows: Res[]): CasoDef {
  const first = rows[0]!
  const compraId = first.matchedCompraId ?? ocid.replace('ocds-yfs5dr-', '')
  const organism = first.matchedBuyerName || first.organism || 'Organismo no declarado'
  const titulo = first.procurementTitle ?? `compra ${compraId}`
  const per = years(rows)
  const visto = shortVisto(first.visto ?? '')
  const veces = rows.length
  // Que el Tribunal vuelva sobre la misma compra varias veces es, en sí, el dato.
  const repeticion = veces > 1
    ? ` El Tribunal volvió sobre esta misma compra ${veces} veces, entre ${per}.`
    : ''
  const repeticionEn = veces > 1
    ? ` The Court returned to this same purchase ${veces} times, between ${per}.`
    : ''
  const es: CasoText = {
    title: `${organism}: el Tribunal de Cuentas miró la ${titulo}`,
    dek: `El auditor del propio Estado se pronunció sobre esta compra${veces > 1 ? `, y lo hizo ${veces} veces` : ''}.`,
    contexto: `El Tribunal de Cuentas interviene el gasto público antes de que se pague. Su archivo publica una ficha por resolución, y esa ficha nombra el llamado: «${titulo}». Ese nombre es exactamente la forma en que el corpus de Compras Estatales guarda el título del llamado, y por eso se pudo atar la resolución a la compra ${compraId}.${repeticion}`,
    hallazgo: `El VISTO de la resolución ${first.tcrId} dice: «${visto}»`,
    statusNote: `Resolución del ${first.date ?? per}. Materia: ${first.subject ?? 'no declarada'}.`,
    porQueImporta: `Saber qué compras pasaron por el Tribunal de Cuentas, y cuáles volvieron a pasar, muestra dónde el control del gasto se detuvo más de una vez.`,
    caveat: LIMITE_ES,
  }
  const en: CasoText = {
    title: `${organism}: the Court of Auditors examined ${titulo}`,
    dek: `The state's own auditor ruled on this purchase${veces > 1 ? `, and did so ${veces} times` : ''}.`,
    contexto: `The Court of Auditors reviews public spending before it is paid. Its archive publishes one record per resolution, and that record names the tender: "${titulo}". That is exactly how the state procurement corpus stores the tender title, which is how this resolution was tied to purchase ${compraId}.${repeticionEn}`,
    hallazgo: `The VISTO of resolution ${first.tcrId} reads: "${visto}"`,
    statusNote: `Resolution dated ${first.date ?? per}. Subject: ${first.subject ?? 'not stated'}.`,
    porQueImporta: `Knowing which purchases went through the Court of Auditors, and which came back more than once, shows where spending control stopped more than once.`,
    caveat: LIMITE_EN,
  }
  return {
    slug: `tcr-compra-${slugify(compraId)}`,
    emoji: '⚖️',
    theme: 'tribunal-de-cuentas',
    period: per,
    statusKind: 'auditoria',
    status: 'auditoria',
    organisms: [organism],
    feedCoverage: 'likely',
    // Por OCID exacto: la resolución nombra UNA compra y la ficha muestra esa compra.
    // Sin acotar la etapa: la resolución nombra el LLAMADO, y el título del llamado vive en
    // el release `tender`. Muchas de estas compras no tienen adjudicación con el mismo ocid.
    query: { ocids: [ocid], allStages: true },
    sources: sourcesFrom(rows),
    es,
    en,
  }
}

function buildOrganismo(organism: string, rows: Res[]): CasoDef {
  const per = years(rows)
  const compras = new Set(rows.map(r => r.matchedOcid)).size
  const materias = [...new Set(rows.map(r => r.subject).filter((s): s is string => Boolean(s)))]
  const es: CasoText = {
    title: `${organism}: ${compras} compras que pasaron por el Tribunal de Cuentas`,
    dek: `El auditor del propio Estado se pronunció sobre ${compras} compras de este organismo, en ${rows.length} resoluciones.`,
    contexto: `El Tribunal de Cuentas interviene el gasto antes de que se pague, y publica una ficha por resolución. Atando el llamado que cada resolución nombra con el título que guarda el corpus de Compras Estatales, ${compras} compras de ${organism} quedaron identificadas, entre ${per}.`,
    hallazgo: `${rows.length} resoluciones sobre ${compras} compras. Las materias que más aparecen son: ${materias.slice(0, 3).join('; ') || 'no declaradas'}.`,
    statusNote: `El recorrido del archivo del Tribunal cubre hasta ahora los identificadores 36.251 a 44.205, así que este conteo es un piso y no el total histórico.`,
    porQueImporta: `Un organismo que aparece muchas veces en el archivo del Tribunal es un organismo cuyo gasto se frenó muchas veces para revisarlo.`,
    caveat: `${LIMITE_ES} Además, sólo entran las resoluciones cuyo llamado se pudo atar sin ambigüedad a una compra del corpus: las que nombran un llamado que comparte título con otras compras quedan fuera.`,
  }
  const en: CasoText = {
    title: `${organism}: ${compras} purchases that went through the Court of Auditors`,
    dek: `The state's own auditor ruled on ${compras} of this body's purchases, across ${rows.length} resolutions.`,
    contexto: `The Court of Auditors reviews spending before it is paid and publishes one record per resolution. By tying the tender each resolution names to the title stored in the state procurement corpus, ${compras} purchases by ${organism} were identified, between ${per}.`,
    hallazgo: `${rows.length} resolutions covering ${compras} purchases. The most frequent subjects are: ${materias.slice(0, 3).join('; ') || 'not stated'}.`,
    statusNote: `The archive walk currently covers identifiers 36,251 to 44,205, so this count is a floor, not the historical total.`,
    porQueImporta: `A body that appears often in the Court's archive is a body whose spending was halted for review often.`,
    caveat: `${LIMITE_EN} Only resolutions whose tender could be tied unambiguously to a purchase are included.`,
  }
  return {
    slug: `tcr-organismo-${slugify(organism)}`,
    emoji: '🏛️',
    theme: 'tribunal-de-cuentas',
    period: per,
    statusKind: 'auditoria',
    status: 'auditoria',
    organisms: [organism],
    feedCoverage: 'likely',
    // Las compras atadas de este organismo, por OCID exacto. Es el conjunto, no el padrón.
    query: { ocids: [...new Set(rows.map(r => r.matchedOcid!).filter(Boolean))].slice(0, 120), allStages: true },
    sources: sourcesFrom(rows),
    es,
    en,
  }
}

async function main() {
  await connectToDatabase()
  const rows = (await TcrResolutionModel.find(
    { matchedOcid: { $ne: null }, visto: { $nin: [null, ''] } },
    {
      tcrId: 1,
      organism: 1,
      organismKey: 1,
      subject: 1,
      visto: 1,
      date: 1,
      resolvedAt: 1,
      pdfUrl: 1,
      sourceUrl: 1,
      procurementTitle: 1,
      matchedOcid: 1,
      matchedCompraId: 1,
      matchedBuyerName: 1,
    },
  ).sort({ resolvedAt: -1 }).lean()) as unknown as Res[]
  console.log(`→ ${rows.length} resoluciones atadas con VISTO`)

  const withVisto = rows.filter(r => (r.visto ?? '').length >= MIN_VISTO)
  console.log(`  con VISTO citable (>=${MIN_VISTO} caracteres): ${withVisto.length}`)

  // Una compra atada puede no existir en el corpus: el matcher ató por título y el ocid quedó
  // apuntando a algo que no está. Publicar esa ficha sería mostrar un cruce vacío bajo un
  // titular que promete una compra. Se comprueba de una sola consulta y no de una por ficha.
  const candidatos = [...new Set(withVisto.map(r => r.matchedOcid).filter((o): o is string => Boolean(o)))]
  const existentes = new Set<string>(
    await ReleaseModel.distinct('ocid', { ocid: { $in: candidatos } }) as unknown as string[],
  )
  const usable = withVisto.filter(r => r.matchedOcid && existentes.has(r.matchedOcid))
  console.log(`  con compra que existe en el corpus: ${usable.length} (${withVisto.length - usable.length} descartadas)`)

  const defs: CasoDef[] = []

  // Grano 1 — por compra.
  const porCompra = new Map<string, Res[]>()
  for (const r of usable) {
    if (!r.matchedOcid) continue
    porCompra.set(r.matchedOcid, [...(porCompra.get(r.matchedOcid) ?? []), r])
  }
  for (const [ocid, group] of porCompra) defs.push(buildCompra(ocid, group))
  console.log(`  grano compra: ${porCompra.size} fichas`)

  // Grano 2 — por organismo.
  const porOrganismo = new Map<string, Res[]>()
  for (const r of usable) {
    if (!r.organismKey || !r.organism) continue
    porOrganismo.set(r.organismKey, [...(porOrganismo.get(r.organismKey) ?? []), r])
  }
  let nOrg = 0
  for (const group of porOrganismo.values()) {
    // El umbral cuenta COMPRAS distintas, no resoluciones: un organismo con una sola compra
    // mirada cuatro veces no es un organismo con cuatro compras miradas.
    if (new Set(group.map(g => g.matchedOcid)).size < MIN_POR_ORGANISMO) continue
    defs.push(buildOrganismo(group[0]!.organism!, group))
    nOrg++
  }
  console.log(`  grano organismo: ${nOrg} fichas`)

  const bySlug = new Map<string, CasoDef>()
  let collisions = 0
  for (const d of defs) {
    if (!bySlug.has(d.slug)) { bySlug.set(d.slug, d); continue }
    collisions++
    let n = 2
    while (bySlug.has(`${d.slug}-${n}`)) n++
    bySlug.set(`${d.slug}-${n}`, { ...d, slug: `${d.slug}-${n}` })
  }
  const unique = [...bySlug.values()]
  console.log(`\n  total: ${unique.length} fichas (${collisions} slugs desempatados)`)

  if (dryRun) {
    console.log('\n(dry-run) no se escribió nada')
    await disconnectFromDatabase()
    process.exit(0)
  }

  const generation = new Date().toISOString()
  const slugs: string[] = []
  for (const [i, def] of unique.entries()) {
    slugs.push(def.slug)
    await DerivedCasoModel.updateOne(
      { slug: def.slug },
      { $set: { slug: def.slug, origin: 'tcr', generation, builtAt: new Date(), rank: 10000 + i, def } },
      { upsert: true },
    )
  }
  // Borrado acotado a ESTE origen, y por lista explícita. Nunca `$ne` de generación.
  const stale = await DerivedCasoModel.deleteMany({ origin: 'tcr', slug: { $nin: slugs } })
  console.log(`\n✓ ${slugs.length} fichas escritas, ${stale.deletedCount ?? 0} viejas borradas`)
  await disconnectFromDatabase()
  process.exit(0)
}

main().catch((e) => { console.error('FAIL', e); process.exit(1) })
