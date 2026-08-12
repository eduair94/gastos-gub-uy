/**
 * Parser de "Proveedores participantes". Cada caso sale de HTML real de
 * comprasestatales, no inventado — incluidos los que deben devolver `found:false`,
 * que son los que evitan publicar "no hubo competencia" cuando la compra sigue abierta.
 */
import assert from 'node:assert/strict'
import { parseCallBidders, rutFromDocument } from '../../shared/call-bidders'

// --- Ficha real de la compra 1290419 (adjudicada, 10 oferentes) ----------------
const REAL = `<div class="well"><div class="h4"><strong>Proveedores participantes</strong></div>
<table class="table"><caption class="sr-only">Proveedores participantes</caption>
<thead><tr><th>Tipo</th><th>Nro. Documento</th><th>Nombre Proveedor</th></tr></thead>
<tbody>
<tr><td>RUT</td><td>210936040017</td><td>ABACOM LIMITADA</td></tr>
<tr><td>RUT</td><td>215550120018</td><td>BIKO SA</td></tr>
<tr><td>Gen&eacute;rico</td><td>66137513378</td><td>CATAPULT SPORTS PTY LTD</td></tr>
<tr><td>Gen&eacute;rico</td><td>NL8483280B01</td><td>LODE B.V.</td></tr>
<tr><td>Gen&eacute;rico</td><td>ES-B09714759</td><td>MYOQUALITY SOLUTIONS SL</td></tr>
<tr><td>RUT</td><td>020617950010</td><td>TECNOLOGIA DEPORTIVA SAS EN FORMACION</td></tr>
</tbody></table></div>`

const parsed = parseCallBidders(REAL)
assert.equal(parsed.found, true)
assert.equal(parsed.bidders.length, 6, 'the header row must not be counted as a bidder')
assert.equal(parsed.bidders[0]!.name, 'ABACOM LIMITADA')
assert.equal(parsed.bidders[0]!.rut, '210936040017')

// Los extranjeros entran, pero NUNCA con rut: su id fiscal no es un RUT y cruzarlo
// contra supplier_patterns colisionaría empresas distintas.
const lode = parsed.bidders.find(b => b.name === 'LODE B.V.')
assert.ok(lode, 'foreign bidders must be kept')
assert.equal(lode.rut, null)
assert.equal(lode.docNumber, 'NL8483280B01', 'the foreign tax id is kept verbatim')
assert.match(lode.docType, /Gen/, 'entities in the type cell must be decoded')
assert.equal(parsed.bidders.find(b => b.name === 'CATAPULT SPORTS PTY LTD')!.rut, null)

// El RUT que empieza con cero no puede perder el cero.
assert.equal(parsed.bidders.find(b => /TECNOLOGIA/.test(b.name))!.rut, '020617950010')

// --- Compra ABIERTA: el bloque no existe --------------------------------------
// Esta es la distinción que sostiene todo el indicador. Una compra sin publicar
// oferentes NO es una compra sin competencia.
const OPEN = `<div class="well"><ul><li>Recepci&oacute;n de ofertas hasta:&nbsp;14/08/2026</li></ul></div>`
const open = parseCallBidders(OPEN)
assert.equal(open.found, false)
assert.equal(open.bidders.length, 0)

assert.equal(parseCallBidders('').found, false)
assert.equal(parseCallBidders('<html><body>nada</body></html>').found, false)

// Bloque presente pero tabla vacía → found:false, no "cero oferentes".
const EMPTY = `<div class="h4"><strong>Proveedores participantes</strong></div>
<table class="table"><caption class="sr-only">Proveedores participantes</caption>
<thead><tr><th>Tipo</th><th>Nro. Documento</th><th>Nombre Proveedor</th></tr></thead>
<tbody></tbody></table>`
assert.equal(parseCallBidders(EMPTY).found, false)

// --- Oferente único: el caso que el indicador va a contar ----------------------
const SINGLE = `<table class="table"><caption class="sr-only">Proveedores participantes</caption>
<thead><tr><th>Tipo</th><th>Nro. Documento</th><th>Nombre Proveedor</th></tr></thead>
<tbody><tr><td>RUT</td><td>210936040017</td><td>UNICO SA</td></tr></tbody></table>`
const single = parseCallBidders(SINGLE)
assert.equal(single.found, true)
assert.equal(single.bidders.length, 1)

// --- Duplicados: la ficha repite la empresa cuando lista por ítem --------------
const DUP = `<table class="table"><caption class="sr-only">Proveedores participantes</caption>
<tbody>
<tr><td>RUT</td><td>210936040017</td><td>ABACOM LIMITADA</td></tr>
<tr><td>RUT</td><td>210936040017</td><td>ABACOM LIMITADA</td></tr>
<tr><td>RUT</td><td>215550120018</td><td>BIKO SA</td></tr>
</tbody></table>`
assert.equal(parseCallBidders(DUP).bidders.length, 2, 'the same firm must count once')

// --- Sin <caption> (fichas viejas): cae al encabezado --------------------------
const NOCAPTION = `<div class="h4"><strong>Proveedores participantes</strong></div>
<table class="table"><tbody>
<tr><td>Tipo</td><td>Nro. Documento</td><td>Nombre Proveedor</td></tr>
<tr><td>RUT</td><td>215550120018</td><td>BIKO SA</td></tr>
</tbody></table>`
const nocap = parseCallBidders(NOCAPTION)
assert.equal(nocap.found, true)
assert.equal(nocap.bidders.length, 1, 'a header row inside tbody must be dropped')
assert.equal(nocap.bidders[0]!.name, 'BIKO SA')

// --- rutFromDocument ----------------------------------------------------------
assert.equal(rutFromDocument('RUT', '210936040017'), '210936040017')
assert.equal(rutFromDocument('RUT', '21.093.604.0017'), '210936040017', 'punctuation is stripped')
assert.equal(rutFromDocument('RUT', '12345678'), null, '8 digits is a cédula, not a RUT')
assert.equal(rutFromDocument('Genérico', '210936040017'), null, 'only RUT rows yield a rut')
assert.equal(rutFromDocument('RUT', ''), null)

console.log(`test-call-bidders: OK (${parsed.bidders.length} oferentes reales parseados)`)
