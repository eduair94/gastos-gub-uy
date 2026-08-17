/**
 * El parser de la resolución de reiteración, contra recortes reales.
 *
 *   npx tsx tests/unit/reiteracion-parse.test.ts
 *
 * TODOS los textos de acá salen de documentos que bajé del portal de Compras Estatales el
 * 16-08-2026, uno por época. No los edites para que el parser pase: si el parser falla contra
 * el texto real, el que está mal es el parser.
 *
 * POR QUÉ HAY NUEVE FORMAS Y NO UNA. Cada organismo redacta su resolución. Una muestra por
 * año devolvió nueve maneras distintas de decir lo mismo, y la de las intendencias
 * («observa el gasto al programa 203, rubro 1.9.3 … no cumple con Art. 15° del T.O.C.A.F»)
 * no se parece en nada a la de UTE. Un solo patrón leería una época y perdería las otras.
 */
import { parseReiteracion, normalizeReason } from '../../shared/reiteracion'

const failures: string[] = []
function check(cond: boolean, msg: string) {
  if (!cond) failures.push(msg)
}

// ── 1. UTE, 2026. Resolución del Tribunal, con número y fecha. ───────────────
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
check(ute.authorityArticle === '114', `UTE: authorityArticle fue ${ute.authorityArticle}`)
check(
  ute.reason === 'no contar con disponibilidad presupuestal',
  `UTE: reason fue "${ute.reason}"`,
)

// ── 2. UTE, 2026. Observa el Contador Delegado, no el Tribunal. ──────────────
const DELEGADO = `RESULTANDO que la contratación fue observada por el Contador Delegado del
Tribunal de Cuentas de la República con fecha 04/07/2025, por no contar con disponibilidad
presupuestal. ATENTO a lo establecido en el artículo 114 del TOCAF`

const del = parseReiteracion(DELEGADO)
check(del.observed === true, 'Delegado: observed debe ser true')
check(del.observedBy === 'contador-delegado', `Delegado: observedBy fue ${del.observedBy}`)
check(del.resolutionDate === '2025-07-04', `Delegado: resolutionDate fue ${del.resolutionDate}`)
check(
  del.reason === 'no contar con disponibilidad presupuestal',
  `Delegado: reason fue "${del.reason}"`,
)

// ── 3. Intendencia de Rivera, 2020. La forma más común del corpus. ───────────
const RIVERA = `RESULTANDO: Que el Sr. Contador Delegado del Tribunal de Cuentas a Fs. 223,
observa el gasto al programa 203, rubro 1.9.3, por un importe de $ 1.618.235 no cumple con
Art. 15° del T.O.C.A.F; CONSIDERANDO: I) Lo informado por el Director de División`

const riv = parseReiteracion(RIVERA)
check(riv.observed === true, 'Rivera: observed debe ser true')
check(riv.observedBy === 'contador-delegado', `Rivera: observedBy fue ${riv.observedBy}`)
check(
  riv.breachedArticles.includes('15'),
  `Rivera: breachedArticles fue ${JSON.stringify(riv.breachedArticles)}`,
)

// ── 4. Intendencia, 2022. El motivo va en prosa antes del artículo. ──────────
const RIVERA2 = `RESULTANDO: Que el Sr. Contador Delegado del Tribunal de Cuentas a fojas 62,
observa el gasto en el programa 106, rubro 1.9.9 por no existir disponibilidad suficiente y
contraviene al artículo 15º del TOCAF; CONSIDERANDO: I) Lo informado por la Dirección`

const riv2 = parseReiteracion(RIVERA2)
check(riv2.observed === true, 'Rivera2: observed debe ser true')
check(
  riv2.reason === 'no existir disponibilidad suficiente',
  `Rivera2: reason fue "${riv2.reason}"`,
)
check(riv2.breachedArticles.includes('15'), `Rivera2: breachedArticles fue ${JSON.stringify(riv2.breachedArticles)}`)

// ── 5. 2021. El documento rotula el motivo. Es la forma más limpia. ──────────
const ROTULADO = `Resolución de reiteración del gasto Nº 275/2021 de fecha 08/06/2021.-
Motivo de Observación: Contravenir lo establecido en el Artículo 48 lit c) Numeral 1 del
TOCAF.-`

const rot = parseReiteracion(ROTULADO)
check(rot.observed === true, 'Rotulado: observed debe ser true')
check(
  rot.reason === 'contravenir lo establecido en el artículo 48 lit c) numeral 1 del tocaf',
  `Rotulado: reason fue "${rot.reason}"`,
)
check(rot.breachedArticles.includes('48'), `Rotulado: breachedArticles fue ${JSON.stringify(rot.breachedArticles)}`)

// ── 6. 2013. Observación en pasiva, con el motivo al final. ──────────────────
const P2013 = `RESULTANDO ll: que remitidos los antecedentes al Tribunal de Cuentas de la
República para su intervención, fue observado el gasto correspondiente al Ejercicio 2013 por
un importe de U$S 415.000,oo, más impuestos, por falta de disponibilidad en el Rubro
presupuestal correspondiente.`

const p13 = parseReiteracion(P2013)
check(p13.observed === true, '2013: observed debe ser true')
check(
  p13.reason === 'falta de disponibilidad en el rubro presupuestal correspondiente',
  `2013: reason fue "${p13.reason}"`,
)

// ── 7. 2008. «La observación realizada por el Contador Delegado». ────────────
const P2008 = `VISTO: La observación realizada por el Contador Delegado del Tribunal de
Cuentas de la República a la Licitación Abreviada Nº06/2008, para la "Refacción de
equipamiento gastronómico".`

const p08 = parseReiteracion(P2008)
check(p08.observed === true, '2008: observed debe ser true')
check(p08.observedBy === 'contador-delegado', `2008: observedBy fue ${p08.observedBy}`)

// ── 8. 2011. «La observación del Tribunal de Cuentas al gasto». ──────────────
const P2011 = `Montevideo, 20 de mayo de 2011. VISTO: La observación del Tribunal de Cuentas
al gasto referido a la contratación de un servicio integral de limpieza`

const p11 = parseReiteracion(P2011)
check(p11.observed === true, '2011: observed debe ser true')
check(p11.observedBy === 'tribunal', `2011: observedBy fue ${p11.observedBy}`)

// ── 9. 2023. «Reitérese el gasto observado por Resolución … del Tribunal». ───
const P2023 = `VI) Que por Resolución N° 2037/2022 del 6 de Octubre 2022 se Reitérese el gasto
observado por Resolución adoptada por el Tribunal de Cuentas en Sesión de fecha 17 de Agosto
de 2022 (E.E. N° 2021-17-1-0006350).`

const p23 = parseReiteracion(P2023)
check(p23.observed === true, '2023: observed debe ser true')
check(p23.observedBy === 'tribunal', `2023: observedBy fue ${p23.observedBy}`)

// ── Lo que NO debe afirmar ───────────────────────────────────────────────────

// Un PDF escaneado no da texto.
const vacio = parseReiteracion('')
check(vacio.observed === false, 'Vacío: observed debe ser false')
check(vacio.reason === null, 'Vacío: reason debe ser null')
check(vacio.breachedArticles.length === 0, 'Vacío: breachedArticles debe ir vacío')

// El sello del folio es lo único que devuelve un escaneo. No es una observación.
const folio = parseReiteracion('Expediente N°: 2022-17-1-0002415 Folio n° 5920220720123025621.pdf')
check(folio.observed === false, 'Folio: observed debe ser false')

// El .doc a veces trae la resolución de adjudicación, sin observación ninguna.
const adjudicacion = `MINISTERIO DE TURISMO EXP. 200400420-3 VISTO: La Resolución Ministerial
Nº 236/04. RESULTANDO: Que por la misma se autorizó el llamado a Licitación Abreviada Nº
14/04 para la contratación de una Agencia que provea Promotoras para la temporada de verano.`
const adj = parseReiteracion(adjudicacion)
check(adj.observed === false, 'Adjudicación: observed debe ser false')

// TRAMPA: «intervenida SIN observaciones» es lo contrario de una observación.
const sinObs = `3) Que fue intervenida sin observaciones la adjudicación y su prórroga, el 22
de diciembre de 2017 y el 24 de diciembre de 2018.`
const sin = parseReiteracion(sinObs)
check(sin.observed === false, `Sin observaciones: observed fue ${sin.observed}`)

// TRAMPA: el artículo 114 es la facultad de reiterar, NO la norma incumplida. Contarlo como
// incumplida diría que el organismo violó el artículo que lo habilita.
check(
  !ute.breachedArticles.includes('114'),
  `UTE: el artículo 114 no puede ir en breachedArticles (${JSON.stringify(ute.breachedArticles)})`,
)

// ── normalizeReason ─────────────────────────────────────────────────────────
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
