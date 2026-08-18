/**
 * Vuelve a medir contra el corpus las cifras que publica /investigaciones/suicidios-recursos.
 *
 * Necesita MONGODB_URI en vivo. Por eso lleva el sufijo `.verify.ts` y `npm test` lo saltea.
 * Corrélo con: npx tsx tests/unit/suicidios-recursos.verify.ts
 *
 * REGLA C, Y ES LA ÚNICA REGLA DE MONTO. Un ocid vale el máximo de `amount.primaryAmount` entre
 * TODOS sus releases, con tope de 50.000 millones de pesos por compra. La misma regla corre en el
 * numerador y en el denominador. La regla vieja tomaba el máximo entre los releases que matchean
 * el texto, y tiraba el 94,94% del monto de `/suicid/`: en `ocds-yfs5dr-497746` el texto vive en
 * el llamado de 2015 y los 4.540.800 pesos viven en la adjudicación de 2016.
 *
 * EL TEXTO SE BARRE EN JS, NUNCA CON `$text`. La expresión corre con opción `i` sobre los siete
 * campos de texto concatenados. Una consulta Mongo con `$regex` sobre uno o dos campos devuelve
 * cero donde el barrido devuelve la compra entera.
 *
 * EL COMPRADOR ES `buyer.id`, NUNCA `buyer.name`. El nombre no es estable entre registros y el id
 * sí. `buyer.id` es inciso-unidad.
 *
 * QUÉ ES EXACTO Y QUÉ LLEVA TOLERANCIA. Las siete compras de `/suicid/` son exactas: los ocids,
 * sus montos y sus compradores no se movieron desde 2025. El corpus CRECE todos los días, así que
 * los conteos totales sólo se controlan hacia abajo. Un total que baja es un defecto de carga. Un
 * total que sube es carga nueva, y el script lo informa en vez de fallar.
 */
process.env.MONGO_SOCKET_TIMEOUT_MS = '900000'

import { COMPARADORES, COMPRAS, CORPUS } from '../../app/data/investigaciones-suicidios'
import { SR_CORPUS, SR_LINEAS, SR_SALUD_MENTAL, SR_SUICID } from '../../app/data/investigaciones-suicidios-recursos'
import { connectToDatabase, disconnectFromDatabase, mongoose } from '../../shared/connection/database'

/** Tope de la regla C. Por encima, la compra es un artefacto de suma global y se descarta. */
const CAP = 50_000_000_000

const RE_SUICID = /suicid/i
const RE_SALUD_MENTAL = /salud\s+mental/i

/**
 * Los tres registros del INAU con el mismo monto hasta la milésima.
 * Son el par obligatorio de «salud mental»: deciden el signo de la corrección.
 */
const INAU_TRIPLICADO = ['ocds-yfs5dr-693726', 'ocds-yfs5dr-1039592', 'ocds-yfs5dr-1039607']

/** El comprador de cada una de las siete compras, por `buyer.id`. Inciso-unidad. */
const COMPRADOR: Record<string, string> = {
  'ocds-yfs5dr-187653': '12-70',
  'ocds-yfs5dr-339508': '4-30',
  'ocds-yfs5dr-497746': '4-30',
  'ocds-yfs5dr-1004831': '25-1',
  'ocds-yfs5dr-i418911': '98-1',
  'ocds-yfs5dr-i418912': '98-1',
  'ocds-yfs5dr-i418913': '98-1',
}

interface ItemLike {
  description?: string | undefined
  classification?: { description?: string | undefined } | undefined
}

interface AwardLike {
  title?: string | undefined
  items?: ItemLike[] | undefined
}

interface TenderLike {
  title?: string | undefined
  description?: string | undefined
  items?: ItemLike[] | undefined
}

interface Proyeccion {
  ocid?: string | undefined
  amount?: { primaryAmount?: number | undefined } | undefined
  buyer?: { id?: string | undefined, name?: string | undefined } | undefined
  awards?: AwardLike[] | undefined
  tender?: TenderLike | undefined
}

/** Los siete campos de texto, concatenados. El mismo orden que usó la medición publicada. */
function textOf(doc: Proyeccion): string {
  const out: string[] = []
  for (const a of doc.awards ?? []) {
    if (a.title) out.push(String(a.title))
    for (const it of a.items ?? []) {
      if (it.description) out.push(String(it.description))
      if (it.classification?.description) out.push(String(it.classification.description))
    }
  }
  const t = doc.tender
  if (t?.title) out.push(String(t.title))
  if (t?.description) out.push(String(t.description))
  for (const it of t?.items ?? []) {
    if (it.description) out.push(String(it.description))
    if (it.classification?.description) out.push(String(it.classification.description))
  }
  return out.join(' | ')
}

let failures = 0

const n0 = (v: number) => v.toLocaleString('es-UY', { maximumFractionDigits: 0 })
const n2 = (v: number) => v.toLocaleString('es-UY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Aserción exacta. La usa todo lo que no puede moverse con el crecimiento del corpus. */
function exacto(label: string, medido: string | number, esperado: string | number): void {
  const ok = medido === esperado
  if (!ok) failures++
  console.log(`${ok ? 'OK   ' : 'FALLA'} ${label}: ${medido}${ok ? '' : ` (esperado ${esperado})`}`)
}

/** Aserción de piso. El corpus crece todos los días, así que sólo falla cuando el conteo BAJA. */
function piso(label: string, medido: number, publicado: number): void {
  const ok = medido >= publicado
  if (!ok) failures++
  const delta = medido - publicado
  const signo = delta >= 0 ? '+' : ''
  console.log(`${ok ? 'OK   ' : 'FALLA'} ${label}: ${n0(medido)} (publicado ${n0(publicado)}, ${signo}${n0(delta)})`)
}

/** Informe sin aserción. El monto agregado se mueve con cada carga y no decide ninguna frase. */
function informe(label: string, medido: number, publicado: number): void {
  const delta = publicado === 0 ? 0 : (100 * (medido - publicado)) / publicado
  console.log(`      ${label}: ${n2(medido)} (publicado ${n2(publicado)}, ${delta.toFixed(2)}%)`)
}

async function main(): Promise<void> {
  await connectToDatabase()
  const releases = mongoose.connection.db!.collection('releases')

  /** Regla C, antes del tope: el máximo de `amount.primaryAmount` por ocid. */
  const montoPorOcid = new Map<string, number>()
  const ocidsSuicid = new Set<string>()
  const ocidsSaludMental = new Set<string>()
  /** Compradores vistos por ocid. Sólo se guardan los ocids que la pieza nombra. */
  const compradores = new Map<string, Set<string>>()
  const nombres = new Map<string, string>()

  const seguidos = new Set<string>([
    ...Object.keys(COMPRADOR),
    ...SR_LINEAS.map(l => l.ocid),
    ...INAU_TRIPLICADO,
  ])

  const cursor = releases.find<Proyeccion>({}, {
    projection: {
      _id: 0,
      ocid: 1,
      'amount.primaryAmount': 1,
      'buyer.id': 1,
      'buyer.name': 1,
      'awards.title': 1,
      'awards.items.description': 1,
      'awards.items.classification.description': 1,
      'tender.title': 1,
      'tender.description': 1,
      'tender.items.description': 1,
      'tender.items.classification.description': 1,
    },
  }).batchSize(2000)

  let leidos = 0
  for await (const doc of cursor) {
    leidos++
    if (leidos % 250_000 === 0) console.log(`      ... ${n0(leidos)} registros, ${n0(montoPorOcid.size)} compras`)

    const ocid = doc.ocid
    if (!ocid) continue

    const monto = Number(doc.amount?.primaryAmount ?? 0) || 0
    const previo = montoPorOcid.get(ocid)
    if (previo === undefined || monto > previo) montoPorOcid.set(ocid, monto)

    if (seguidos.has(ocid)) {
      const id = doc.buyer?.id
      if (id) {
        const vistos = compradores.get(ocid) ?? new Set<string>()
        vistos.add(String(id))
        compradores.set(ocid, vistos)
      }
      const nombre = doc.buyer?.name
      if (nombre && !nombres.has(ocid)) nombres.set(ocid, String(nombre))
    }

    const texto = textOf(doc)
    if (!texto) continue
    if (RE_SUICID.test(texto)) ocidsSuicid.add(ocid)
    if (RE_SALUD_MENTAL.test(texto)) ocidsSaludMental.add(ocid)
  }

  /** Aplica el tope. Una compra por encima de 50.000 millones es un artefacto y vale cero. */
  function reglaC(ocid: string): number {
    const v = montoPorOcid.get(ocid) ?? 0
    return v > CAP ? 0 : v
  }

  function sumaReglaC(ocids: Iterable<string>): number {
    let total = 0
    for (const o of ocids) total += reglaC(o)
    return total
  }

  let descartadas = 0
  let gastoCorpus = 0
  for (const v of montoPorOcid.values()) {
    if (v > CAP) { descartadas++; continue }
    gastoCorpus += v
  }

  console.log('\n=== 1 · escala del corpus, con la regla C ===')
  piso('registros', leidos, SR_CORPUS.releases)
  piso('compras', montoPorOcid.size, SR_CORPUS.ocids)
  informe('gasto del corpus', gastoCorpus, SR_CORPUS.gasto)
  console.log(`      compras sobre el tope de 50.000 millones: ${n0(descartadas)} (publicado ${n0(SR_CORPUS.descartadas)})`)

  console.log('\n=== 2 · las siete compras de /suicid/, exactas ===')
  const esperados = Object.keys(COMPRADOR)
  exacto('cantidad de compras', ocidsSuicid.size, esperados.length)
  const sobran = [...ocidsSuicid].filter(o => !COMPRADOR[o])
  if (sobran.length > 0) {
    failures++
    console.log(`FALLA compras nuevas en el corpus: ${sobran.join(', ')}`)
    console.log('      Una compra nueva que nombra el suicidio obliga a rehacer las dos piezas.')
  }
  for (const ocid of esperados) {
    const fila = COMPRAS.find(c => c.ocid === ocid)
    exacto(`${ocid} · presente`, ocidsSuicid.has(ocid) ? 'sí' : 'no', 'sí')
    exacto(`${ocid} · regla C`, reglaC(ocid), fila?.award ?? 0)
    const vistos = [...(compradores.get(ocid) ?? [])].sort().join(',')
    exacto(`${ocid} · buyer.id`, vistos, COMPRADOR[ocid] ?? '')
  }

  console.log('\n=== 3 · la suma que publican las dos piezas ===')
  const sumaSuicid = sumaReglaC(esperados)
  exacto('suma regla C de las siete', sumaSuicid, SR_SUICID.uyu)
  exacto('SR_SUICID.ocids', SR_SUICID.ocids, esperados.length)
  const comparador = COMPARADORES.find(c => c.key === 'suicid')
  exacto('COMPARADORES.suicid.ocids', comparador?.ocids ?? 0, esperados.length)
  exacto('COMPARADORES.suicid.uyu', comparador?.uyu ?? 0, sumaSuicid)
  exacto('CORPUS.suicidOcids', CORPUS.suicidOcids, esperados.length)
  exacto('CORPUS.suicidUyuMax, la lectura publicada', CORPUS.suicidUyuMax, sumaSuicid)
  console.log(`      La lectura que NO se publica, si el taller repetido fuera una sola compra: ${n0(CORPUS.suicidUyu)} en 6 compras.`)

  console.log('\n=== 4 · la familia «salud mental» ===')
  piso('compras', ocidsSaludMental.size, SR_SALUD_MENTAL.ocidsSeparados)
  const sumaSaludMental = sumaReglaC(ocidsSaludMental)
  informe('monto regla C, con los tres del INAU por separado', sumaSaludMental, SR_SALUD_MENTAL.uyuSeparados)
  const sinMonto = [...ocidsSaludMental].filter(o => reglaC(o) === 0).length
  console.log(`      compras sin monto: ${n0(sinMonto)}. Cero en el corpus no prueba que no se adjudicara.`)
  console.log('      PAR OBLIGATORIO. El triplicado del INAU decide el signo de la corrección:')
  for (const ocid of INAU_TRIPLICADO) {
    const dentro = ocidsSaludMental.has(ocid) ? 'en la familia' : 'FUERA de la familia'
    console.log(`      ${ocid} · ${n2(reglaC(ocid))} · ${dentro} · ${nombres.get(ocid) ?? 'sin comprador'}`)
  }
  const duplicados = INAU_TRIPLICADO.slice(1)
  informe(
    'monto si el triplicado es una sola compra',
    sumaSaludMental - sumaReglaC(duplicados),
    SR_SALUD_MENTAL.uyuUnificados,
  )

  console.log('\n=== 5 · las dos compras de línea de respuesta en 24 años ===')
  // `SR_LINEAS` publica pesos enteros. La de ASSE vale 770.272,5576 en el corpus, así que la
  // aserción compara el redondeo y la línea de detalle imprime los centavos.
  for (const linea of SR_LINEAS) {
    const medido = reglaC(linea.ocid)
    exacto(`${linea.key} · regla C, en pesos enteros`, Math.round(medido), linea.uyu)
    const vistos = [...(compradores.get(linea.ocid) ?? [])].sort().join(',')
    exacto(`${linea.key} · tiene buyer.id`, vistos === '' ? 'no' : 'sí', 'sí')
    console.log(`      ${linea.ocid} · ${linea.year} · ${n2(medido)} · buyer.id ${vistos} · ${nombres.get(linea.ocid) ?? 'sin comprador'}`)
  }
  const idPorClave = (key: string): string => {
    const linea = SR_LINEAS.find(l => l.key === key)
    return [...(compradores.get(linea?.ocid ?? '') ?? [])].sort().join(',')
  }
  exacto('las dos líneas son de dos compradores distintos', idPorClave('asse2024') === idPorClave('sanidad2016') ? 'no' : 'sí', 'sí')

  await disconnectFromDatabase()

  console.log(`\n${failures === 0 ? 'TODO OK' : `${failures} ASERCIONES FALLARON`}`)
  if (failures > 0) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
