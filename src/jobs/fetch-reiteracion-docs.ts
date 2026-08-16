/**
 * Baja el documento de reiteración del gasto de cada compra que lo tiene, extrae su texto y
 * guarda el parseo.
 *
 *   npx tsx src/jobs/fetch-reiteracion-docs.ts             # sigue donde quedó
 *   npx tsx src/jobs/fetch-reiteracion-docs.ts --limit=50  # prueba corta
 *   npx tsx src/jobs/fetch-reiteracion-docs.ts --refetch   # vuelve a bajar todo
 *
 * ATENCIÓN, ESTO GOLPEA UN SITIO DEL ESTADO. Hay un intervalo fijo entre pedidos y un solo
 * hilo. No lo subas. Una corrida anterior de este repo llegó a frenar el sitio de compras
 * estatales, y otro proceso podía estar recorriéndolo al mismo tiempo. Antes de correrlo en
 * el servidor 167, fijate si hay un lazo andando.
 *
 * Es resumible: una compra ya bajada no se vuelve a pedir salvo con `--refetch`.
 *
 * POR QUÉ GUARDA LO QUE FALLA. Dos de cada tres documentos son escaneos sin capa de texto.
 * Esa descarga igual se guarda, con `hasText:false`, porque si no la próxima corrida la
 * volvería a pedir para volver a no leer nada.
 */
import WordExtractor from 'word-extractor'
import { connectToDatabase, disconnectFromDatabase } from '../../shared/connection/database'
import { ReiteracionDocModel } from '../../shared/models/reiteracion_doc'
import { ReleaseModel } from '../../shared/models/release'
import { parseReiteracion } from '../../shared/reiteracion'

const extractor = new WordExtractor()

process.env.MONGO_SOCKET_TIMEOUT_MS = process.env.MONGO_SOCKET_TIMEOUT_MS ?? '600000'

const args = process.argv.slice(2)
const limit = Number(args.find(a => a.startsWith('--limit='))?.slice('--limit='.length) ?? 0)
const refetch = args.includes('--refetch')

/** Un pedido por segundo. Es el techo, no el objetivo. */
const PACE_MS = 1000
const TIMEOUT_MS = 30000
const UA = 'gastos-gub/1.0 (+https://conlatuya.checkleaked.cc)'
/** Más allá de esto el texto no aporta y sí infla la colección. */
const MAX_TEXT_CHARS = 20000

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

interface Target {
  ocid: string
  url: string
  buyerId: string | null
  buyerName: string | null
  supplierIds: string[]
  supplierNames: string[]
  sourceYear: number | null
  primaryAmount: number | null
}

/**
 * El `.doc` viejo de Word es un OLE binario, no texto.
 *
 * TRAMPA QUE COSTÓ UNA CORRIDA: leerlo como latin1 y sacarle los bytes de control devuelve
 * 110.000 caracteres de basura —el JPEG que el documento lleva incrustado— y esa basura
 * marcaba `hasText: true` en las 40 primeras filas. Hay que abrir el formato de verdad.
 */
async function textFromLegacyDoc(buf: Buffer): Promise<string> {
  const doc = await extractor.extract(buf)
  return String(doc.getBody() ?? '')
}

async function textFromPdf(buf: Buffer): Promise<string> {
  const { extractText, getDocumentProxy } = await import('unpdf')
  const pdf = await getDocumentProxy(new Uint8Array(buf))
  const out = await extractText(pdf, { mergePages: true })
  return String(out.text ?? '')
}

/**
 * ¿Esto es prosa o son bytes que parecen letras?
 *
 * Un escaneo devuelve el sello del folio y nada más. Un OLE mal leído devuelve ruido. Las dos
 * cosas tienen largo mayor que cero, así que el largo no alcanza para decidir. Una resolución
 * de verdad es mayormente letras y espacios.
 */
function looksLikeProse(flat: string): boolean {
  if (flat.length < 200) return false
  const letters = (flat.match(/[a-záéíóúñü ]/gi) ?? []).length
  return letters / flat.length > 0.8
}

async function collectTargets(): Promise<Target[]> {
  const cursor = ReleaseModel.collection.find(
    { 'awards.documents.documentType': 'reiteracionGasto' },
    {
      projection: {
        'ocid': 1,
        'sourceYear': 1,
        'buyer.id': 1,
        'buyer.name': 1,
        'amount.primaryAmount': 1,
        'awards.documents': 1,
        'awards.suppliers': 1,
      },
    },
  )
  const out: Target[] = []
  const seen = new Set<string>()
  for await (const r of cursor) {
    const rel = r as Record<string, any>
    if (!rel.ocid || seen.has(rel.ocid)) continue
    let url: string | null = null
    const supplierIds: string[] = []
    const supplierNames: string[] = []
    for (const a of rel.awards ?? []) {
      for (const d of a.documents ?? []) {
        if (d.documentType === 'reiteracionGasto' && d.url) url = url ?? d.url
      }
      for (const s of a.suppliers ?? []) {
        if (s?.id && !supplierIds.includes(s.id)) supplierIds.push(s.id)
        if (s?.name && !supplierNames.includes(s.name)) supplierNames.push(s.name)
      }
    }
    if (!url) continue
    seen.add(rel.ocid)
    out.push({
      ocid: rel.ocid,
      url,
      buyerId: rel.buyer?.id ?? null,
      buyerName: rel.buyer?.name ?? null,
      supplierIds,
      supplierNames,
      sourceYear: rel.sourceYear ?? null,
      primaryAmount: rel.amount?.primaryAmount ?? null,
    })
  }
  return out
}

async function main() {
  await connectToDatabase()
  console.log('→ juntando las compras con documento de reiteración…')
  let targets = await collectTargets()
  console.log(`  ${targets.length} compras con documento`)

  if (!refetch) {
    const done = new Set<string>(await ReiteracionDocModel.distinct('ocid'))
    targets = targets.filter(t => !done.has(t.ocid))
    console.log(`  ${done.size} ya bajadas; quedan ${targets.length}`)
  }
  if (limit > 0) targets = targets.slice(0, limit)

  let ok = 0
  let withText = 0
  let observed = 0
  for (const [i, t] of targets.entries()) {
    let httpStatus = 0
    let text: string | null = null
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
      const res = await fetch(t.url, { signal: ctrl.signal, headers: { 'user-agent': UA } })
      clearTimeout(timer)
      httpStatus = res.status
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer())
        const ct = res.headers.get('content-type') ?? ''
        text = ct.includes('pdf') || t.url.toLowerCase().endsWith('.pdf')
          ? await textFromPdf(buf)
          : await textFromLegacyDoc(buf)
      }
    }
    catch (e) {
      console.warn(`  ! ${t.ocid}: ${String((e as Error).message).slice(0, 80)}`)
    }

    const flat = (text ?? '').replace(/\s+/g, ' ').trim()
    const readable = looksLikeProse(flat)
    // Sobre basura no se parsea: un OLE mal leído produce coincidencias por azar.
    const parsed = parseReiteracion(readable ? flat : '')
    await ReiteracionDocModel.updateOne(
      { ocid: t.ocid },
      {
        $set: {
          ...t,
          fetchedAt: new Date(),
          httpStatus,
          hasText: readable,
          textChars: readable ? flat.length : 0,
          // El texto se guarda sólo cuando trae la cláusula. Un escaneo devuelve el sello
          // del folio y nada más: guardarlo infla la colección sin aportar.
          text: parsed.observed ? flat.slice(0, MAX_TEXT_CHARS) : null,
          ...parsed,
        },
      },
      { upsert: true },
    )
    ok++
    if (readable) withText++
    if (parsed.observed) observed++
    if ((i + 1) % 25 === 0) {
      console.log(`  ${i + 1}/${targets.length} — con texto ${withText}, con cláusula ${observed}`)
    }
    await sleep(PACE_MS)
  }

  console.log(`\n✓ ${ok} documentos procesados`)
  console.log(`  con capa de texto: ${withText}`)
  console.log(`  con cláusula de observación: ${observed}`)
  await disconnectFromDatabase()
  process.exit(0)
}

main().catch((e) => { console.error('FAIL', e); process.exit(1) })
