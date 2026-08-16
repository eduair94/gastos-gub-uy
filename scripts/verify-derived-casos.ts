/**
 * El contrato editorial, aplicado a las fichas ARMADAS.
 *
 *   npx tsx scripts/verify-derived-casos.ts
 *   npx tsx scripts/verify-derived-casos.ts --queries   # además resuelve cada cruce
 *
 * POR QUÉ ESTE ARCHIVO EXISTE APARTE. Las fichas curadas las escribe una persona y las revisa
 * un diff. Las armadas las escribe un trabajo por lotes, así que el único control posible es
 * automático y tiene que correr sobre lo que está en la base, no sobre el código que lo
 * generó.
 *
 * Las derivadas cumplen lo mismo que las curadas, más tres reglas propias:
 *   - Nunca las palabras que dictarían un fallo que no nos toca dictar.
 *   - Siempre el aviso del artículo 114 del TOCAF, porque reiterar es LEGAL.
 *   - Siempre un `caveat`, que en las curadas es opcional.
 */
import { buildContractFilters, toMatchDocument } from '../app/server/api/contracts/index.get'
import { casoToQueryParams, listAllCasoDefs } from '../app/server/utils/casos'
import { connectToDatabase } from '../shared/connection/database'
import { ReleaseModel } from '../shared/models/release'

process.env.MONGO_SOCKET_TIMEOUT_MS = process.env.MONGO_SOCKET_TIMEOUT_MS ?? '600000'

const doQueries = process.argv.includes('--queries')

/**
 * Palabras que dictarían un fallo. Una reiteración es un acto legal: llamarla «irregular»
 * convierte un dato en una acusación, y no tenemos ni el expediente ni la potestad.
 */
const PROHIBIDAS = [
  /\birregular/i,
  /\bdelito\b/i,
  /\bfraude\b/i,
  /\bcorrupci[oó]n\b/i,
  /\bil[ie]gal/i,
  /\bdesv[ií]o de fondos\b/i,
  /\brob[oó]\b/i,
]

/**
 * Lo que el tema del Tribunal de Cuentas NO puede decir.
 *
 * Su archivo público trae sólo el VISTO: qué expediente se miró. El fallo —si el gasto fue
 * observado, por cuánto, con qué fundamento— está únicamente en el PDF, y ese PDF es un
 * escaneo sin capa de texto. Escribir «observó» sería inventar el fallo. La ficha dice «se
 * pronunció» y nada más fuerte.
 */
const PROHIBIDAS_TCR = [
  /\bobserv[óo]\b/i,
  /\bfue\s+observad[ao]\b/i,
  /\bobjet[óo]\b/i,
  /\brechaz[óo]\b/i,
  /\bobjected\b/i,
]

/** Los temas que arma un trabajo por lotes. Son los únicos que este verificador mira. */
const DERIVED_THEMES = new Set(['gasto-observado', 'tribunal-de-cuentas'])

/** El mismo piso que verify-casos: menos de dos contratos es una coincidencia. */
const MIN_CONTRACTS = 2
const QUERY_TIMEOUT_MS = 25000

async function main() {
  await connectToDatabase()
  const all = await listAllCasoDefs()
  const derived = all.filter(c => DERIVED_THEMES.has(c.theme))
  console.log(`verificando ${derived.length} fichas derivadas…\n`)

  if (!derived.length) {
    console.error('✗ no hay ninguna ficha derivada — ¿corriste build-derived-casos?')
    process.exit(1)
  }

  const errors: string[] = []
  const slugs = new Set<string>()

  for (const c of derived) {
    const at = `ficha "${c.slug}"`

    if (slugs.has(c.slug)) errors.push(`${at}: slug repetido`)
    slugs.add(c.slug)
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(c.slug)) errors.push(`${at}: el slug no es kebab-case ascii`)
    if (!c.sources.length) errors.push(`${at}: sin documento de fuente`)
    if (!c.organisms.length) errors.push(`${at}: sin organismo`)
    if (!c.emoji) errors.push(`${at}: sin emoji`)
    if (c.statusKind !== 'auditoria') errors.push(`${at}: statusKind debe ser "auditoria", es "${c.statusKind}"`)

    for (const s of c.sources) {
      if (!/^https?:\/\/\S+$/i.test(s.url)) errors.push(`${at}: fuente sin URL válida: ${s.url}`)
    }

    for (const [loc, txt] of [['es', c.es], ['en', c.en]] as const) {
      if (!txt.title?.trim()) errors.push(`${at}: falta el título en ${loc}`)
      if (!txt.dek?.trim()) errors.push(`${at}: falta el dek en ${loc}`)
      if (!txt.hallazgo?.trim()) errors.push(`${at}: falta el hallazgo en ${loc}`)
      if (!txt.caveat?.trim()) errors.push(`${at}: falta el caveat en ${loc}`)
      // Cada tema armado tiene su límite propio, y el caveat tiene que declararlo.
      if (c.theme === 'gasto-observado' && !/\b114\b/.test(txt.caveat ?? '')) {
        errors.push(`${at}: el caveat en ${loc} no cita el artículo 114 del TOCAF`)
      }
      if (c.theme === 'tribunal-de-cuentas' && !/VISTO/.test(txt.caveat ?? '')) {
        errors.push(`${at}: el caveat en ${loc} no aclara que sólo se publica el VISTO`)
      }
      // El título no puede quedar con un hueco sin llenar.
      if (/\bnull\b|\bundefined\b|\bNaN\b/.test(`${txt.title} ${txt.dek} ${txt.hallazgo}`)) {
        errors.push(`${at}: el texto en ${loc} tiene un hueco sin llenar (null/undefined/NaN)`)
      }
      const blob = `${txt.title} ${txt.dek} ${txt.contexto} ${txt.hallazgo} ${txt.porQueImporta}`
      for (const re of PROHIBIDAS) {
        if (re.test(blob)) errors.push(`${at}: el texto en ${loc} dicta un fallo (${re.source})`)
      }
      if (c.theme === 'tribunal-de-cuentas') {
        // El VISTO va citado textual, así que lo que diga el Tribunal adentro de las comillas
        // no cuenta: lo que se controla es lo que escribimos NOSOTROS alrededor.
        const nuestro = `${txt.title} ${txt.dek} ${txt.porQueImporta} ${txt.statusNote}`
        for (const re of PROHIBIDAS_TCR) {
          if (re.test(nuestro)) {
            errors.push(`${at}: el texto en ${loc} afirma un fallo que sólo está en el PDF (${re.source})`)
          }
        }
      }
    }
  }

  if (doQueries) {
    const withQuery = derived.filter(c => c.query)
    console.log(`→ resolviendo ${withQuery.length} cruces…`)
    for (const c of withQuery) {
      const match = toMatchDocument(buildContractFilters(casoToQueryParams(c.query!)))
      // El piso de dos contratos existe para que una coincidencia de palabra no pase por
      // conjunto. Una consulta por OCID exacto no puede coincidir por azar: es un
      // identificador. Ahí un contrato es el resultado correcto, y exigir dos borraría toda
      // la ficha por compra.
      const floor = c.query?.ocids?.length ? 1 : MIN_CONTRACTS
      // `buyerIds` sin nada que lo acote es la regla 1 de verify-casos: `buyer.id` no tiene
      // índice y una consulta que lo lidera tarda más que el presupuesto del endpoint. Con
      // `hasReiteracion` la consulta la lidera `reiteracion_partial`, que deja 5.825
      // candidatos, y el filtro por id se resuelve sobre eso. Medido: 793ms.
      if (c.query?.buyerIds?.length && !c.query.hasReiteracion) {
        errors.push(`${c.slug}: usa buyerIds sin acotar — buyer.id no tiene índice (regla 1)`)
      }
      const t = Date.now()
      try {
        const n = await ReleaseModel.countDocuments(match).maxTimeMS(QUERY_TIMEOUT_MS)
        const ms = Date.now() - t
        if (n < floor) {
          errors.push(`${c.slug}: el cruce devuelve ${n} contrato(s), por debajo de ${floor}`)
        }
        // El presupuesto real del endpoint. Más lento que esto y la página renderiza vacía.
        else if (ms > 9000) {
          errors.push(`${c.slug}: el cruce tardó ${ms}ms, por encima del presupuesto de 9s`)
        }
      }
      catch (e) {
        errors.push(`${c.slug}: el cruce falló (${String((e as Error).message).slice(0, 90)})`)
      }
    }
  }

  if (errors.length) {
    console.error(`\n✗ ${errors.length} error(es):`)
    for (const e of errors.slice(0, 40)) console.error(`  - ${e}`)
    if (errors.length > 40) console.error(`  … y ${errors.length - 40} más`)
    process.exit(1)
  }
  console.log(`✓ verify-derived-casos: ${derived.length} fichas pasan`)
  process.exit(0)
}

main().catch((e) => { console.error('FAIL', e); process.exit(1) })
