/**
 * Parser de resoluciones del Tribunal de Cuentas. El caso principal es HTML real de
 * tcr.gub.uy (id=39583), incluido el caso de control cuyo cruce contra el corpus se
 * verificó a mano: Casinos · Licitación Pública 5/2021 → ocid 890500.
 */
import assert from 'node:assert/strict'
import { extractProcurementRef, parseTcrResolution } from '../../shared/tcr-resolution'

const REAL = `<div class="sub_titulo">Resultado Búsqueda Resoluciones </div>
<div id="mostrar_div">
<div style="color:#214F9F" class="sub_titulo_2" align="right"></div>
<div class="sub_titulo_2" style="color:#214F9F;font-size:15px">Fecha Resolución 27/07/2022</div><br /><br />
<div style="color:#214F9F" class="sub_titulo_2">
   Administración Central / Ministerio de Economía y Finanzas / Dirección General de Casinos
</div><br />
<div style="color:#214F9F">
   Contrataciones de Bienes y Servicios / Licitaciones Públicas
</div><br />
<p> <p>
(E.E. 3387/22 E. 2748 11/07/22) VISTO: las actuaciones remitidas por la Direcci&oacute;n General de Casinos (DGC) del Ministerio de Econom&iacute;a y Finanzas (MEF) relacionadas con la Licitaci&oacute;n P&uacute;blica N&ordm; 5/2021 convocada para la elaboraci&oacute;n del proyecto ejecutivo y ejecuci&oacute;n de obras para el acondicionamiento edilicio de la futura sala de esparcimiento Treinta y Tres en modalidad de llave en mano.</p>
<table><tr><td><a href="archivos/resoluciones_39583_r2022-17-1-0003387.pdf" target="_blank">Descargar resolución(.pdf)</a></td></tr></table>
</div>`

const r = parseTcrResolution(REAL, 39583)
assert.equal(r.date, '27/07/2022')
assert.equal(r.organismPath, 'Administración Central / Ministerio de Economía y Finanzas / Dirección General de Casinos')
assert.equal(r.organism, 'Dirección General de Casinos', 'the buying body is the last leg of the hierarchy')
assert.equal(r.subject, 'Contrataciones de Bienes y Servicios / Licitaciones Públicas')
assert.equal(r.expediente, 'E.E. 3387/22')
assert.ok(r.visto && r.visto.includes('acondicionamiento edilicio'), 'entities in the prose must be decoded')
assert.equal(r.pdfUrl, 'https://www.tcr.gub.uy/archivos/resoluciones_39583_r2022-17-1-0003387.pdf')
assert.equal(r.isProcurement, true)

// El cruce: así es como el corpus guarda el título del llamado.
assert.ok(r.procurement)
assert.equal(r.procurement.method, 'Licitación Pública')
assert.equal(r.procurement.number, '5')
assert.equal(r.procurement.year, 2021)
assert.equal(r.procurement.titleForm, 'Licitación Pública 5/2021')

// --- Formas del número que aparecen en la prosa ------------------------------
assert.equal(extractProcurementRef('la Licitación Abreviada Nº 12/2024 convocada')?.titleForm, 'Licitación Abreviada 12/2024')
assert.equal(extractProcurementRef('Licitacion Publica N° 7/2019')?.titleForm, 'Licitación Pública 7/2019')
assert.equal(extractProcurementRef('la Compra Directa 133/2023')?.titleForm, 'Compra Directa 133/2023')
// Año de dos dígitos: mismo llamado, y el corpus lo guarda con cuatro.
assert.equal(extractProcurementRef('Licitación Pública Nº 5/21')?.year, 2021)

// El TC intercala calificativos que el corpus no usa. Se reconocen para no perder la
// resolución, pero el título buscado es SIEMPRE la forma del corpus.
assert.equal(
  extractProcurementRef('relacionadas con la Compra Directa por Excepción Nº 7/2020 del Comando')?.titleForm,
  'Compra Directa 7/2020',
)
assert.equal(
  extractProcurementRef('la Licitación Pública Internacional Nº 3/2019 para')?.titleForm,
  'Licitación Pública 3/2019',
)
// El calificativo SÓLO vale con el marcador Nº: sin él, cualquier número de la prosa
// se colaría como número de llamado.
assert.equal(extractProcurementRef('la Compra Directa por excepción prevista en el 33/3 del TOCAF'), null)

// 21 y 21bis son compras distintas y el sufijo no se puede perder.
assert.equal(extractProcurementRef('Compra Directa 21bis/2003')?.titleForm, 'Compra Directa 21bis/2003')

// Forma vieja que el corpus sí guarda tal cual.
assert.equal(extractProcurementRef('la Compra por Excepción 601/2003')?.titleForm, 'Compra por Excepción 601/2003')

// --- Falla cerrado -----------------------------------------------------------
// Sin número no hay referencia: colgarle a un contrato el pronunciamiento de otro es
// peor que no mostrar nada.
assert.equal(extractProcurementRef('VISTO: la rendición de cuentas del ejercicio 2023'), null)
assert.equal(extractProcurementRef(''), null)
assert.equal(extractProcurementRef('Licitación Pública sin número'), null)
// Un año imposible no se acepta.
assert.equal(extractProcurementRef('Licitación Pública Nº 5/1899'), null)

// HTML que no es una ficha de resolución.
const nothing = parseTcrResolution('<html><body>404</body></html>', 1)
assert.equal(nothing.date, null)
assert.equal(nothing.isProcurement, false)
assert.equal(nothing.procurement, null)
assert.equal(parseTcrResolution('', 1).date, null)

// Una resolución que NO es de contrataciones no debe marcarse como tal.
const RRHH = REAL
  .replace('Contrataciones de Bienes y Servicios / Licitaciones Públicas', 'Funcionarios / Retribuciones')
  .replace(/relacionadas con[\s\S]*?llave en mano\./, 'relacionadas con la rendición de cuentas del ejercicio.')
const rr = parseTcrResolution(RRHH, 1)
assert.equal(rr.procurement, null)
assert.equal(rr.isProcurement, false, 'subject and prose both have to miss for this to be false')

console.log(`test-tcr-resolution: OK (${r.procurement.titleForm} · ${r.organism})`)
