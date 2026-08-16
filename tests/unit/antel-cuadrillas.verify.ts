/**
 * Vuelve a medir las cifras publicadas en /investigaciones/antel-cuadrillas.
 *
 * Necesita MONGODB_URI en vivo, por eso lleva el sufijo `.verify.ts` y `npm test` lo saltea.
 * Corrélo con: npx tsx tests/unit/antel-cuadrillas.verify.ts
 *
 * TRAMPA QUE VERIFICA ESTE SCRIPT. El objeto de compra de ANTEL vive en `tender.description`, no en
 * `tender.title` — el título es el procedimiento pelado. Un conteo por título da cero.
 *
 * SEGUNDA TRAMPA. La cobertura se cuenta con `awards.suppliers.0` y `$exists`. Contar
 * `$size: '$awards'` da 3.698 en vez de 250, porque ANTEL publica el llamado con sus ítems dentro de
 * `awards` pero sin proveedor.
 */
import { connectToDatabase, disconnectFromDatabase } from '../../shared/connection/database'
import { ReleaseModel } from '../../shared/models'
import { ANTEL_FTTH, antelContent } from '../../app/data/investigaciones-antel'

const ANTEL = '65-1'
/** Los llamados de obra de red: fibra, planta externa, red de acceso, canalizaciones. */
const RE_OBRA = /fibra [oó]ptica|FTTH|fiber to the home|planta externa|red de acceso|tendido|canalizaci|empalme/i

let failures = 0

function check(label: string, actual: number | string, expected: number | string, tol = 0) {
  const ok = typeof actual === 'number' && typeof expected === 'number'
    ? Math.abs(actual - expected) <= tol
    : actual === expected
  if (!ok) failures++
  const mark = ok ? 'OK  ' : 'FAIL'
  console.log(`${mark} ${label}: ${actual}${ok ? '' : ` (esperado ${expected})`}`)
}

async function main() {
  await connectToDatabase()
  const es = antelContent('es')

  // 1. Cobertura de adjudicatarios: ANTEL contra las otras empresas públicas.
  const ENTES: [string, string][] = [
    ['ANTEL', ANTEL], ['OSE', '10-1'], ['AFE', '13-1'], ['UTE', '9-2'],
    ['ANCAP', '11-1'], ['ANP', '12-1'], ['Banco de Seguros', '17-1'],
  ]
  const num = (s: string) => Number(s.replace(/[.,]/g, m => (m === ',' ? '.' : '')).replace(/\.(?=\d{3}\b)/g, ''))

  for (const [nombre, buyerId] of ENTES) {
    const fila = es.cobertura.filas.find(f => f.ente === nombre)
    if (!fila) { console.log(`FAIL fila ausente para ${nombre}`); failures++; continue }
    const releases = await ReleaseModel.countDocuments({ 'buyer.id': buyerId })
    const conAdj = await ReleaseModel.countDocuments({ 'buyer.id': buyerId, 'awards.suppliers.0': { $exists: true } })
    check(`${nombre} · registros`, releases, num(fila.releases.replace(/\./g, '')))
    check(`${nombre} · con adjudicatario`, conAdj, num(fila.conAdj.replace(/\./g, '')))
    const pct = Number((conAdj / releases * 100).toFixed(1))
    check(`${nombre} · proporción`, `${pct.toFixed(1).replace('.', ',')}%`, fila.pct)
  }

  // 2. Los llamados de obra de red y cuántos publican quién ganó.
  const obra = await ReleaseModel.aggregate([
    { $match: { 'buyer.id': ANTEL, 'tender.description': RE_OBRA } },
    { $group: { _id: '$ocid' } },
  ]).allowDiskUse(true)
  const ocids = obra.map(o => o._id as string)
  check('llamados de obra de red (ocid únicos)', ocids.length, 164)

  const conAdjObra = await ReleaseModel.countDocuments({ ocid: { $in: ocids }, 'awards.suppliers.0': { $exists: true } })
  check('de esos, con adjudicatario publicado', conAdjObra, 6)

  // 3. La plata: con nombre contra sin nombre.
  const [conNombre] = await ReleaseModel.aggregate([
    { $match: { 'buyer.id': ANTEL, 'awards.suppliers.0': { $exists: true } } },
    { $group: { _id: null, n: { $sum: 1 }, s: { $sum: '$amount.primaryAmount' } } },
  ])
  const [sinNombre] = await ReleaseModel.aggregate([
    { $match: { 'buyer.id': ANTEL, 'amount.primaryAmount': { $gt: 0 }, 'awards.suppliers.0': { $exists: false } } },
    { $group: { _id: null, n: { $sum: 1 }, s: { $sum: '$amount.primaryAmount' } } },
  ])
  check('registros con nombre de empresa', conNombre?.n ?? 0, 250)
  check('millones con nombre', Math.round((conNombre?.s ?? 0) / 1e6), 2426, 5)
  check('registros con monto y sin nombre', sinNombre?.n ?? 0, 538)
  check('millones sin nombre', Math.round((sinNombre?.s ?? 0) / 1e6), 11641, 20)

  // 4. La adjudicación de la obra de fibra al hogar, que es la que sostiene la cuenta.
  const adj = await ReleaseModel.findOne({ ocid: ANTEL_FTTH.ocid, 'awards.suppliers.0': { $exists: true } }).lean()
  if (!adj) { console.log('FAIL no aparece la adjudicación de la obra FTTH'); failures++ }
  else {
    check('monto adjudicado (sin impuestos)', Math.round((adj as any).amount?.primaryAmount ?? 0), ANTEL_FTTH.montoSinIva)
    const sups = ((adj as any).awards ?? []).flatMap((a: any) => (a.suppliers ?? []).map((s: any) => s.name))
    check('adjudicatarios', sups.sort().join(' + '), 'CIETEL S.A. + ORITECNO S A')
    // Sin redondear: la mitad del consorcio termina en ,50 y `Math.round` la subiría un centavo.
    const unit = ((adj as any).awards ?? [])[0]?.items?.[0]?.unit?.value?.amount
    check('mitad por empresa', Number(unit ?? 0), ANTEL_FTTH.porEmpresa, 0.01)
  }

  // 5. La cuenta publicada, rehecha desde el monto adjudicado.
  const cantidad = Number(es.aritmetica.rubro.cantidad)
  const techo = Math.round(ANTEL_FTTH.montoSinIva / cantidad)
  check('techo por soldadura = total / cantidad', techo, 4775438)
  check('el techo publicado coincide', es.aritmetica.pasos[2]?.valor ?? '', '4.775.438')
  if (techo >= 7_000_000) { console.log('FAIL el techo no desarma el dicho'); failures++ }
  else console.log(`OK   el techo (${techo}) queda por debajo de los 7.000.000 del dicho`)

  console.log(failures === 0 ? '\nTodo reproduce.' : `\n${failures} verificaciones fallaron.`)
  await disconnectFromDatabase()
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
