/**
 * Arma las fichas de «gasto observado y reiterado» a partir de `reiteracion_docs`.
 *
 *   npx tsx src/jobs/build-derived-casos.ts            # arma y escribe
 *   npx tsx src/jobs/build-derived-casos.ts --dry-run  # sólo informa cuántas salen
 *
 * QUÉ ES UNA REITERACIÓN. Cuando el Tribunal de Cuentas observa un gasto, el ordenador puede
 * reiterarlo y ejecutarlo bajo su responsabilidad. Cada vez que eso pasa queda un documento
 * en el portal de Compras Estatales. Ese documento es la prueba: existe sólo si hubo
 * observación.
 *
 * CUATRO GRANOS, y cada uno tiene su umbral. Un grano sin umbral publica ruido: una compra
 * suelta bajo un titular es una coincidencia, no un caso. Son los mismos umbrales que
 * scripts/verify-casos.ts ya le hace cumplir a las fichas curadas.
 *
 *   1. Por organismo    — desde 3 reiteraciones
 *   2. Por proveedor    — desde 3 reiteraciones
 *   3. Por causal       — desde 5 compras que declaran el mismo motivo
 *   4. Por compra       — las de monto mayor, y sólo si se pudo leer la cláusula
 *
 * LO QUE NINGUNA FICHA PUEDE DECIR. Reiterar es LEGAL: lo habilita el artículo 114 del
 * TOCAF. La ficha cuenta que pasó, cita el documento y dice qué falta para afirmar más. No
 * dice «irregular» y no dice «delito». scripts/verify-derived-casos.ts lo hace cumplir.
 *
 * EL BORRADO NO USA `$ne`. Dos corridas simultáneas con borrado por generación se aniquilan
 * entre sí: en este repo ya pasó y dejó una colección vacía en producción. Se junta la lista
 * de slugs de ESTA corrida y se borra sólo lo que sobra de esa lista.
 */
import type { CasoDef, CasoText } from '../../app/server/utils/casos/types'
import { connectToDatabase, disconnectFromDatabase } from '../../shared/connection/database'
import { DerivedCasoModel } from '../../shared/models/derived_caso'
import { ReiteracionDocModel } from '../../shared/models/reiteracion_doc'

process.env.MONGO_SOCKET_TIMEOUT_MS = process.env.MONGO_SOCKET_TIMEOUT_MS ?? '600000'

const dryRun = process.argv.includes('--dry-run')

const MIN_POR_ORGANISMO = 3
const MIN_POR_PROVEEDOR = 3
const MIN_POR_CAUSAL = 5
const FICHAS_POR_COMPRA = 300

/** El aviso que toda ficha derivada lleva, palabra por palabra. */
const TOCAF_ES = 'Reiterar un gasto observado es un acto previsto por el artículo 114 del TOCAF: '
  + 'el ordenador puede disponerlo bajo su responsabilidad. Observado no quiere decir ilegal.'
const TOCAF_EN = 'Overriding an objection is lawful under article 114 of the TOCAF: the spending '
  + 'officer may order it under their own responsibility. Objected does not mean unlawful.'

interface Row {
  ocid: string
  url: string
  buyerId: string | null
  buyerName: string | null
  supplierIds: string[]
  supplierNames: string[]
  sourceYear: number | null
  primaryAmount: number | null
  observed: boolean
  reason: string | null
  resolutionNumber: string | null
  resolutionDate: string | null
  breachedArticles: string[]
}

// ── Formato ─────────────────────────────────────────────────────────────────

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

function money(uyu: number): string {
  if (uyu >= 1e9) return `$ ${(uyu / 1e9).toFixed(1)} mil millones`
  if (uyu >= 1e6) return `$ ${(uyu / 1e6).toFixed(1)} millones`
  return `$ ${Math.round(uyu).toLocaleString('es-UY')}`
}

function moneyEn(uyu: number): string {
  if (uyu >= 1e9) return `$${(uyu / 1e9).toFixed(1)} billion`
  if (uyu >= 1e6) return `$${(uyu / 1e6).toFixed(1)} million`
  return `$${Math.round(uyu).toLocaleString('en-US')}`
}

function period(years: (number | null)[]): string {
  const ys = years.filter((y): y is number => Boolean(y)).sort((a, b) => a - b)
  if (!ys.length) return ''
  return ys[0] === ys[ys.length - 1] ? String(ys[0]) : `${ys[0]}–${ys[ys.length - 1]}`
}

function totalOf(rows: Row[]): number {
  return rows.reduce((a, r) => a + (r.primaryAmount ?? 0), 0)
}

function compraId(ocid: string): string {
  return ocid.replace('ocds-yfs5dr-', '')
}

/** Las fuentes son los documentos oficiales mismos. Seis alcanzan para mostrar el patrón. */
function sourcesFrom(rows: Row[]): CasoDef['sources'] {
  return rows.slice(0, 6).map(r => ({
    outlet: 'Compras Estatales',
    title: `Resolución de reiteración del gasto — compra ${compraId(r.ocid)}`,
    url: r.url,
    date: r.resolutionDate ?? (r.sourceYear ? String(r.sourceYear) : undefined),
  }))
}

/**
 * Qué se puede decir del motivo, y qué no.
 *
 * Dos de cada tres documentos son escaneos sin capa de texto. Cuando ninguno del grupo se
 * pudo leer, la ficha lo DICE en vez de callarlo: el silencio se leería como que no hubo
 * motivo, y lo que pasa es que no lo pudimos leer.
 */
function reasonLine(rows: Row[]): { es: string, en: string } {
  const reasons = rows.map(r => r.reason).filter((x): x is string => Boolean(x))
  if (!reasons.length) {
    return {
      es: 'Los documentos de esta ficha no traen capa de texto —son escaneos—, así que el motivo de la observación no se pudo leer.',
      en: 'The documents behind this file carry no text layer — they are scans — so the reason for the objection could not be read.',
    }
  }
  const counts = new Map<string, number>()
  for (const r of reasons) counts.set(r, (counts.get(r) ?? 0) + 1)
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]!
  return {
    es: `El motivo que más se repite es «${top[0]}»: aparece en ${top[1]} de los ${reasons.length} documentos que sí traen texto.`,
    en: `The most frequent stated reason is "${top[0]}": it appears in ${top[1]} of the ${reasons.length} documents that carry readable text.`,
  }
}

/** Los artículos del TOCAF que las observaciones del grupo señalan como incumplidos. */
function articlesLine(rows: Row[]): { es: string, en: string } {
  const arts = [...new Set(rows.flatMap(r => r.breachedArticles ?? []))].sort((a, b) => Number(a) - Number(b))
  if (!arts.length) return { es: '', en: '' }
  const list = arts.map(a => `${a}`).join(', ')
  return {
    es: ` Las observaciones legibles invocan el artículo ${list} del TOCAF.`,
    en: ` The readable objections invoke article ${list} of the TOCAF.`,
  }
}

// ── Los cuatro granos ───────────────────────────────────────────────────────

function buildOrganismo(buyerName: string, rows: Row[]): CasoDef {
  const total = totalOf(rows)
  const per = period(rows.map(r => r.sourceYear))
  const reason = reasonLine(rows)
  const arts = articlesLine(rows)
  const es: CasoText = {
    title: `${buyerName}: ${rows.length} compras observadas y pagadas igual`,
    dek: `El Tribunal de Cuentas observó ${rows.length} compras de este organismo. El organismo las reiteró y las pagó.`,
    contexto: `Cuando el Tribunal de Cuentas observa un gasto, el organismo puede reiterarlo y ejecutarlo bajo su responsabilidad. Cada reiteración deja un documento en el portal de Compras Estatales. En este corpus, ${buyerName} tiene ${rows.length} compras con ese documento, entre ${per}.`,
    hallazgo: `Las ${rows.length} compras suman ${money(total)} en valores normalizados a pesos uruguayos. ${reason.es}${arts.es}`,
    statusNote: `Cifra medida sobre el corpus el día que corrió el armador. El documento de cada compra se enlaza en las fuentes.`,
    porQueImporta: `Una observación del Tribunal de Cuentas es el aviso del auditor del propio Estado. Reiterar el gasto es la decisión de gastar igual. Con qué frecuencia un organismo toma esa decisión dice algo sobre cómo administra.`,
    caveat: `${TOCAF_ES} Esta ficha cuenta cuántas veces pasó y con qué motivo declarado. No afirma que ninguna de estas compras sea observable hoy. El total suma el monto normalizado de cada compra alcanzada, y no el monto observado, que el documento no siempre trae.`,
  }
  const en: CasoText = {
    title: `${buyerName}: ${rows.length} purchases objected to and paid anyway`,
    dek: `The Court of Auditors objected to ${rows.length} of this body's purchases. The body overrode the objection and paid.`,
    contexto: `When the Court of Auditors objects to a spending commitment, the body may reiterate it and execute it under its own responsibility. Each override leaves a document on the state procurement portal. In this corpus, ${buyerName} has ${rows.length} purchases carrying that document, between ${per}.`,
    hallazgo: `The ${rows.length} purchases add up to ${moneyEn(total)} in Uruguayan pesos, normalised. ${reason.en}${arts.en}`,
    statusNote: `Figure measured against the corpus on the day the builder ran. Each purchase's document is linked in the sources.`,
    porQueImporta: `An objection from the Court of Auditors is a warning from the state's own auditor. Overriding it is a decision to spend regardless. How often a body takes that decision says something about how it is run.`,
    caveat: `${TOCAF_EN} This file counts how often it happened and the stated reason. The total adds up each purchase's normalised amount, not the objected amount, which the document does not always give.`,
  }
  return {
    slug: `reiteraciones-${slugify(buyerName)}`,
    emoji: '\u{1F9FE}',
    theme: 'gasto-observado',
    period: per,
    statusKind: 'auditoria',
    status: 'auditoria',
    amountReported: `${money(total)} en ${rows.length} compras con gasto reiterado (medido sobre este corpus, ${per})`,
    organisms: [buyerName],
    feedCoverage: 'likely',
    // Comprador + reiteración. Sólo por comprador sería el padrón entero del organismo.
    query: { buyers: [buyerName], hasReiteracion: true },
    sources: sourcesFrom(rows),
    es,
    en,
  }
}

function buildProveedor(supplierId: string, name: string, rows: Row[]): CasoDef {
  const total = totalOf(rows)
  const per = period(rows.map(r => r.sourceYear))
  const reason = reasonLine(rows)
  const organisms = [...new Set(rows.map(r => r.buyerName).filter((x): x is string => Boolean(x)))]
  const es: CasoText = {
    title: `${name}: ${rows.length} compras que se pagaron sobre una observación`,
    dek: `El Tribunal de Cuentas observó ${rows.length} compras a esta empresa. Los organismos las reiteraron y las pagaron.`,
    contexto: `Esta ficha mira el mismo hecho desde el lado del proveedor. Agrupa por RUT y no por nombre, porque el corpus guarda la misma empresa con más de una grafía. Entre ${per}, ${organisms.length} organismo(s) reiteraron gastos observados en compras a ${name}.`,
    hallazgo: `Las ${rows.length} compras suman ${money(total)} en pesos uruguayos normalizados. ${reason.es}`,
    statusNote: `Cifra medida sobre el corpus el día que corrió el armador.`,
    porQueImporta: `La observación la recibe el organismo que compra, no la empresa que vende. Ver la lista por proveedor muestra en qué contrataciones se repite la decisión de gastar igual.`,
    caveat: `${TOCAF_ES} La observación es al gasto del organismo. Esta ficha NO afirma nada sobre la conducta de ${name}, que puede no tener ninguna participación en el motivo observado.`,
  }
  const en: CasoText = {
    title: `${name}: ${rows.length} purchases paid over an objection`,
    dek: `The Court of Auditors objected to ${rows.length} purchases from this company. The buying bodies overrode and paid.`,
    contexto: `This file looks at the same fact from the supplier's side. It groups by tax id, not by name, because the corpus stores the same company under more than one spelling. Between ${per}, ${organisms.length} body/bodies overrode objections on purchases from ${name}.`,
    hallazgo: `The ${rows.length} purchases add up to ${moneyEn(total)} in normalised Uruguayan pesos. ${reason.en}`,
    statusNote: `Figure measured against the corpus on the day the builder ran.`,
    porQueImporta: `The objection lands on the buying body, not on the selling company. Listing by supplier shows which contracting relationships repeat the decision to spend regardless.`,
    caveat: `${TOCAF_EN} The objection concerns the body's spending. This file makes NO claim about the conduct of ${name}, which may have no part in the stated reason.`,
  }
  return {
    slug: `reiteraciones-proveedor-${slugify(name)}`,
    emoji: '\u{1F3E2}',
    theme: 'gasto-observado',
    period: per,
    statusKind: 'auditoria',
    status: 'auditoria',
    amountReported: `${money(total)} en ${rows.length} compras con gasto reiterado (medido sobre este corpus, ${per})`,
    organisms: organisms.length ? organisms.slice(0, 6) : ['Organismo no declarado'],
    suppliersNamed: [name],
    feedCoverage: 'likely',
    query: { supplierIds: [supplierId], hasReiteracion: true },
    sources: sourcesFrom(rows),
    es,
    en,
  }
}

function buildCausal(causal: string, rows: Row[]): CasoDef {
  const total = totalOf(rows)
  const per = period(rows.map(r => r.sourceYear))
  const organisms = [...new Set(rows.map(r => r.buyerName).filter((x): x is string => Boolean(x)))]
  const arts = articlesLine(rows)
  const es: CasoText = {
    title: `«${causal}»: el motivo detrás de ${rows.length} gastos reiterados`,
    dek: `${rows.length} compras de ${organisms.length} organismos llevan la misma causal escrita en su resolución de reiteración.`,
    contexto: `Cada resolución de reiteración declara por qué el Tribunal de Cuentas observó el gasto. Agrupando por esa frase se ve qué falla se repite en todo el Estado, y no dentro de un organismo solo.`,
    hallazgo: `${rows.length} compras, ${money(total)} en pesos normalizados, entre ${per}. Los organismos alcanzados son ${organisms.slice(0, 6).join('; ')}${organisms.length > 6 ? ' y otros' : ''}.${arts.es}`,
    statusNote: `La causal se lee textual del documento. Sólo entran las compras cuyo documento trae capa de texto.`,
    porQueImporta: `Una causal que se repite en decenas de compras y en varios organismos no es un descuido puntual. Es un patrón, y un patrón se puede corregir.`,
    caveat: `${TOCAF_ES} Las compras cuyo documento es un escaneo sin texto no entran en este conteo, así que el número es un piso y no un total.`,
  }
  const en: CasoText = {
    title: `"${causal}": the reason behind ${rows.length} overridden spends`,
    dek: `${rows.length} purchases across ${organisms.length} bodies carry the same stated reason in their override resolution.`,
    contexto: `Every override resolution states why the Court of Auditors objected. Grouping by that phrase shows which failure repeats across the state rather than inside a single body.`,
    hallazgo: `${rows.length} purchases, ${moneyEn(total)} in normalised pesos, between ${per}.${arts.en}`,
    statusNote: `The reason is quoted verbatim from the document. Only purchases whose document carries a text layer are counted.`,
    porQueImporta: `A reason that repeats across dozens of purchases and several bodies is not an isolated slip. It is a pattern, and a pattern can be fixed.`,
    caveat: `${TOCAF_EN} Purchases whose document is a scan with no text layer are excluded, so this number is a floor, not a total.`,
  }
  return {
    slug: `causal-${slugify(causal)}`,
    emoji: '\u{1F4CB}',
    theme: 'gasto-observado',
    period: per,
    statusKind: 'auditoria',
    status: 'auditoria',
    amountReported: `${money(total)} en ${rows.length} compras observadas por el mismo motivo (${per})`,
    organisms: organisms.slice(0, 8),
    feedCoverage: 'likely',
    // Sin `query`: la causal no es un filtro que el explorador entienda. La ficha muestra el
    // conjunto por sus documentos, que es de donde salió.
    sources: sourcesFrom(rows),
    es,
    en,
  }
}

function buildCompra(r: Row): CasoDef {
  const monto = r.primaryAmount ?? 0
  const comprador = r.buyerName ?? 'Organismo no declarado'
  const prov = r.supplierNames[0] ?? null
  const cid = compraId(r.ocid)
  const resol = r.resolutionNumber ? `, según la Resolución ${r.resolutionNumber}` : ''
  const resolEn = r.resolutionNumber ? `, under resolution ${r.resolutionNumber}` : ''
  const fecha = r.resolutionDate ? `, del ${r.resolutionDate}` : ''
  const arts = (r.breachedArticles ?? []).length
    ? ` La observación invoca el artículo ${r.breachedArticles.join(', ')} del TOCAF.`
    : ''
  const artsEn = (r.breachedArticles ?? []).length
    ? ` The objection invokes article ${r.breachedArticles.join(', ')} of the TOCAF.`
    : ''
  const es: CasoText = {
    title: `${comprador}: ${money(monto)} pagados sobre una observación`,
    dek: `El Tribunal de Cuentas observó esta compra por «${r.reason}». El organismo la reiteró y la pagó.`,
    contexto: `Compra ${cid} de ${comprador}${prov ? `, adjudicada a ${prov}` : ''}${r.sourceYear ? `, del año ${r.sourceYear}` : ''}. El monto normalizado a pesos uruguayos es ${money(monto)}.`,
    hallazgo: `La resolución de reiteración dice que el gasto fue observado por «${r.reason}»${resol}${fecha}.${arts} El documento está enlazado en las fuentes.`,
    statusNote: `El texto sale del documento oficial que publica el portal de Compras Estatales.`,
    porQueImporta: `${money(monto)} es lo que el organismo decidió gastar después de que el auditor del Estado le avisara que había un reparo.`,
    caveat: `${TOCAF_ES} Esta ficha cita el motivo que declara el documento. No afirma que la compra sea observable hoy, ni que el reparo siga vigente.`,
  }
  const en: CasoText = {
    title: `${comprador}: ${moneyEn(monto)} paid over an objection`,
    dek: `The Court of Auditors objected to this purchase for "${r.reason}". The body overrode it and paid.`,
    contexto: `Purchase ${cid} by ${comprador}${prov ? `, awarded to ${prov}` : ''}${r.sourceYear ? `, from ${r.sourceYear}` : ''}. The amount, normalised to Uruguayan pesos, is ${moneyEn(monto)}.`,
    hallazgo: `The override resolution states the spending was objected to for "${r.reason}"${resolEn}${fecha}.${artsEn}`,
    statusNote: `The wording comes from the official document published on the state procurement portal.`,
    porQueImporta: `${moneyEn(monto)} is what the body chose to spend after the state's own auditor flagged a problem.`,
    caveat: `${TOCAF_EN} This file quotes the reason the document states.`,
  }
  return {
    slug: `reiteracion-${cid}`,
    emoji: '\u{1F4B8}',
    theme: 'gasto-observado',
    period: r.sourceYear ? String(r.sourceYear) : '',
    statusKind: 'auditoria',
    status: 'auditoria',
    amountReported: `${money(monto)} (monto de la compra, normalizado a pesos)`,
    organisms: [comprador],
    suppliersNamed: prov ? [prov] : [],
    feedCoverage: 'likely',
    // Por OCID exacto, no por `search`: el buscador re-chequea la frase contra títulos y
    // nombres, y el id de la compra no vive ahí. Con `search` el cruce daba cero.
    query: { ocids: [r.ocid] },
    sources: sourcesFrom([r]),
    es,
    en,
  }
}

// ── Corrida ─────────────────────────────────────────────────────────────────

async function main() {
  await connectToDatabase()
  const rows = (await ReiteracionDocModel.find({}, {
    ocid: 1,
    url: 1,
    buyerId: 1,
    buyerName: 1,
    supplierIds: 1,
    supplierNames: 1,
    sourceYear: 1,
    primaryAmount: 1,
    observed: 1,
    reason: 1,
    resolutionNumber: 1,
    resolutionDate: 1,
    breachedArticles: 1,
  }).lean()) as unknown as Row[]
  console.log(`→ ${rows.length} documentos de reiteración en la base`)
  console.log(`  con cláusula leída: ${rows.filter(r => r.observed).length}`)

  const defs: CasoDef[] = []

  // Grano 1 — por organismo.
  const porOrganismo = new Map<string, Row[]>()
  for (const r of rows) {
    if (!r.buyerName) continue
    porOrganismo.set(r.buyerName, [...(porOrganismo.get(r.buyerName) ?? []), r])
  }
  let nOrg = 0
  for (const [buyerName, group] of porOrganismo) {
    if (group.length < MIN_POR_ORGANISMO) continue
    defs.push(buildOrganismo(buyerName, group))
    nOrg++
  }
  console.log(`  grano organismo: ${nOrg} fichas`)

  // Grano 2 — por proveedor. Se agrupa por RUT y NUNCA por nombre: el corpus guarda la misma
  // empresa con dos grafías, y agrupar por nombre parte el grupo en dos.
  const porProveedor = new Map<string, Row[]>()
  for (const r of rows) {
    for (const id of r.supplierIds ?? []) {
      porProveedor.set(id, [...(porProveedor.get(id) ?? []), r])
    }
  }
  let nProv = 0
  for (const [supplierId, group] of porProveedor) {
    if (group.length < MIN_POR_PROVEEDOR) continue
    const name = group.flatMap(g => g.supplierNames)[0]
    if (!name) continue
    defs.push(buildProveedor(supplierId, name, group))
    nProv++
  }
  console.log(`  grano proveedor: ${nProv} fichas`)

  // Grano 3 — por causal declarada.
  const porCausal = new Map<string, Row[]>()
  for (const r of rows) {
    if (!r.observed || !r.reason) continue
    porCausal.set(r.reason, [...(porCausal.get(r.reason) ?? []), r])
  }
  let nCausal = 0
  for (const [causal, group] of porCausal) {
    if (group.length < MIN_POR_CAUSAL) continue
    defs.push(buildCausal(causal, group))
    nCausal++
  }
  console.log(`  grano causal: ${nCausal} fichas`)

  // Grano 4 — la compra sola, sólo cuando es grande Y su cláusula se pudo leer. Sin las dos
  // condiciones la ficha no tiene relato ni peso: sería una fila con título.
  const singles = rows
    .filter(r => r.observed && r.reason && (r.primaryAmount ?? 0) > 0)
    .sort((a, b) => (b.primaryAmount ?? 0) - (a.primaryAmount ?? 0))
    .slice(0, FICHAS_POR_COMPRA)
  for (const r of singles) defs.push(buildCompra(r))
  console.log(`  grano compra: ${singles.length} fichas`)

  // Un slug repetido rompe el índice único. Pero descartarlo pierde una ficha entera, y las
  // colisiones acá son REALES y frecuentes: dos RUT distintos cargados con el mismo nombre
  // comercial, o dos nombres largos que el corte a 70 caracteres deja iguales. Se desempata
  // con un sufijo en vez de tirar la ficha.
  const bySlug = new Map<string, CasoDef>()
  let collisions = 0
  for (const d of defs) {
    if (!bySlug.has(d.slug)) {
      bySlug.set(d.slug, d)
      continue
    }
    collisions++
    let n = 2
    while (bySlug.has(`${d.slug}-${n}`)) n++
    bySlug.set(`${d.slug}-${n}`, { ...d, slug: `${d.slug}-${n}` })
  }
  const unique = [...bySlug.values()]
  console.log(`\n  total: ${unique.length} fichas (${collisions} slugs desempatados con sufijo)`)

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
      { $set: { slug: def.slug, origin: 'reiteracion', generation, builtAt: new Date(), rank: i, def } },
      { upsert: true },
    )
  }

  // Borrado seguro: sólo lo de ESTE origen que no está en la lista que acabo de escribir.
  // Nunca `$ne: generation`, que dos corridas simultáneas convierten en un borrado total.
  const stale = await DerivedCasoModel.deleteMany({ origin: 'reiteracion', slug: { $nin: slugs } })
  console.log(`\n✓ ${slugs.length} fichas escritas, ${stale.deletedCount ?? 0} viejas borradas`)
  await disconnectFromDatabase()
  process.exit(0)
}

main().catch((e) => { console.error('FAIL', e); process.exit(1) })
