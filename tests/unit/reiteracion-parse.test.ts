/**
 * El parser de la resolución de reiteración, contra recortes reales.
 *
 *   npx tsx tests/unit/reiteracion-parse.test.ts
 *
 * Los dos textos largos salen de PDF que bajé el 16-08-2026. No los edites para que el
 * parser pase: si el parser falla contra el texto real, el que está mal es el parser.
 */
import { normalizeReason, parseReiteracion } from '../../shared/reiteracion'

const failures: string[] = []
function check(cond: boolean, msg: string) {
  if (!cond) failures.push(msg)
}

// reiter_1186812.pdf — UTE, 2026.
const UTE = `RESULTANDO que la contratación fue observada por el Tribunal de Cuentas de la
República por Resolución 1151/2025 en sesión de fecha 21/05/2025, por no contar con
disponibilidad presupuestal. CONSIDERANDO: I) que el Rubro 3 no cuenta con disponibilidad
suficiente para imputar el monto de esta compra; ATENTO a lo establecido en el artículo 114
del TOCAF y a las facultades delegadas`

const ute = parseReiteracion(UTE)
check(ute.observed === true, 'UTE: observed debe ser true')
check(ute.observedBy === 'tribunal', `UTE: observedBy fue ${ute.observedBy}`)
check(ute.resolutionNumber === '1151/2025', `UTE: resolutionNumber fue ${ute.resolutionNumber}`)
check(ute.resolutionDate === '2025-05-21', `UTE: resolutionDate fue ${ute.resolutionDate}`)
check(ute.tocafArticle === '114', `UTE: tocafArticle fue ${ute.tocafArticle}`)
check(
  ute.reason === 'no contar con disponibilidad presupuestal',
  `UTE: reason fue "${ute.reason}"`,
)

// reiter_1165492.pdf — UTE, 2026. Observa el Contador Delegado, no el Tribunal.
const DELEGADO = `RESULTANDO que la contratación fue observada por el Contador Delegado del
Tribunal de Cuentas de la República con fecha 04/07/2025, por no contar con disponibilidad
presupuestal. CONSIDERANDO: I) que el Rubro 2 no cuenta con disponibilidad suficiente;
ATENTO a lo establecido en el artículo 114 del TOCAF`

const del = parseReiteracion(DELEGADO)
check(del.observed === true, 'Delegado: observed debe ser true')
check(del.observedBy === 'contador-delegado', `Delegado: observedBy fue ${del.observedBy}`)
check(del.resolutionDate === '2025-07-04', `Delegado: resolutionDate fue ${del.resolutionDate}`)
check(del.resolutionNumber === null, `Delegado: resolutionNumber fue ${del.resolutionNumber}`)
check(
  del.reason === 'no contar con disponibilidad presupuestal',
  `Delegado: reason fue "${del.reason}"`,
)

// El CONSIDERANDO cita OTRAS resoluciones, las que delegan facultades. Tomar ésas ataría la
// ficha al acto equivocado, así que el número sale sólo del tramo previo al motivo.
const TRAMPA = `RESULTANDO que la contratación fue observada por el Tribunal de Cuentas de la
República por Resolución 900/2024 en sesión de fecha 10/03/2024, por falta de disponibilidad.
ATENTO a las facultades delegadas por Resoluciones R.20.-803 del 14/05/20 y R.24.-830 del
22/08/24 y al artículo 114 del TOCAF`

const trampa = parseReiteracion(TRAMPA)
check(trampa.resolutionNumber === '900/2024', `Trampa: resolutionNumber fue ${trampa.resolutionNumber}`)
check(trampa.resolutionDate === '2024-03-10', `Trampa: resolutionDate fue ${trampa.resolutionDate}`)

// Un PDF escaneado no da texto. No se puede afirmar nada.
const vacio = parseReiteracion('')
check(vacio.observed === false, 'Vacío: observed debe ser false')
check(vacio.reason === null, 'Vacío: reason debe ser null')

// Un documento sin la cláusula tampoco afirma. Esto es lo que devuelve un escaneo: el sello
// del folio, y nada más.
const otro = parseReiteracion('Expediente N° 2022-17-1-0002415 Folio n° 5920220720123025621.pdf')
check(otro.observed === false, 'Sin cláusula: observed debe ser false')

// Las causales se agrupan: la misma razón llega con puntuación y caja distintas.
check(
  normalizeReason('no contar con disponibilidad presupuestal.') === 'no contar con disponibilidad presupuestal',
  'normalizeReason debe sacar el punto final',
)
check(
  normalizeReason('NO CONTAR CON DISPONIBILIDAD PRESUPUESTAL') === 'no contar con disponibilidad presupuestal',
  'normalizeReason debe bajar a minúsculas',
)
check(
  normalizeReason('  no  contar   con disponibilidad  ') === 'no contar con disponibilidad',
  'normalizeReason debe colapsar los espacios',
)

if (failures.length) {
  console.error(`✗ ${failures.length} fallo(s):`)
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}
console.log('✓ reiteracion-parse: todo pasa')
