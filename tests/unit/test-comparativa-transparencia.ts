/**
 * Los invariantes de /comparativa-transparencia. No prueban que los datos sean
 * ciertos —eso se verifica contra cada sitio, con curl y fecha— sino que la página
 * siga siendo honesta a medida que alguien la edite:
 *
 *   - Toda plataforma enumera limitaciones, y la nuestra al menos tantas como la que
 *     más tenga. Es la regla que impide que esto degenere en un folleto.
 *   - La guía por necesidad manda a otros sitios más veces que al nuestro.
 *   - Ninguna afirmación sobre un tercero queda sin URL de origen.
 */
import assert from 'node:assert/strict'
import {
  DECISION_GUIDE,
  DIMENSIONS,
  INTERNATIONAL,
  METHODOLOGY,
  PLATFORMS,
  SELF_DISCLOSURE,
  VERIFIED_ON,
  type Capabilities,
} from '../../app/data/comparativa-transparencia'

const ids = PLATFORMS.map(p => p.id)
assert.equal(new Set(ids).size, ids.length, 'platform ids must be unique')

// Exactamente una ficha es la nuestra, y está rotulada como tal.
const us = PLATFORMS.filter(p => p.isUs)
assert.equal(us.length, 1, 'exactly one platform must be flagged as ours')
assert.equal(us[0]!.id, 'conlatuya')
assert.equal(us[0]!.group, 'nosotros')
assert.equal(PLATFORMS.filter(p => p.group === 'nosotros').length, 1)

// Regla de honestidad 1: nadie entra sin limitaciones, y la nuestra es la más larga.
for (const p of PLATFORMS) {
  assert.ok(p.limits.length > 0, `${p.id} must list at least one limitation`)
  assert.ok(p.bestFor.es && p.bestFor.en, `${p.id} must say what it is best at`)
}
const worstOther = Math.max(...PLATFORMS.filter(p => !p.isUs).map(p => p.limits.length))
assert.ok(
  us[0]!.limits.length >= worstOther,
  `our own entry must list at least as many limitations as any other (${us[0]!.limits.length} < ${worstOther})`,
)

// Regla de honestidad 2: la guía reparte. Si todo apunta acá, es un folleto.
for (const g of DECISION_GUIDE) {
  assert.ok(ids.includes(g.platformId), `decision guide points at unknown platform ${g.platformId}`)
}
const toUs = DECISION_GUIDE.filter(g => g.platformId === 'conlatuya').length
const toOthers = DECISION_GUIDE.length - toUs
assert.ok(toOthers > toUs, `the guide must point elsewhere more often than at us (${toOthers} vs ${toUs})`)

// Regla de honestidad 3: todo dato sobre un tercero es reproducible.
for (const p of PLATFORMS) {
  assert.ok(p.sources.length > 0, `${p.id} must cite at least one source`)
  for (const s of p.sources) {
    assert.match(s, /^https:\/\//, `${p.id} source must be an https URL: ${s}`)
  }
  assert.match(p.verifiedOn, /^\d{4}-\d{2}-\d{2}$/, `${p.id} must carry a verification date`)
  for (const m of p.metrics) {
    assert.ok(m.source.es && m.source.en, `${p.id} metric "${m.value}" must say where it came from`)
  }
}

// La matriz sólo puede pedir columnas que existan: 'access' vive en Platform, el
// resto en Capabilities. Una key mal escrita renderizaría "no pudimos verificarlo"
// en silencio para todas las plataformas.
const CAPABILITY_KEYS: (keyof Capabilities)[] = [
  'perContract', 'ownAnalysis', 'freeExport', 'publicApi', 'openSource', 'alerts', 'beyondProcurement',
]
for (const d of DIMENSIONS) {
  const known = d.key === 'access' || CAPABILITY_KEYS.includes(d.key as keyof Capabilities)
  assert.ok(known, `matrix dimension "${d.key}" maps to nothing`)
}
for (const p of PLATFORMS) {
  for (const k of CAPABILITY_KEYS) {
    assert.ok(p.capabilities[k], `${p.id} is missing capability ${k}`)
  }
}

// Precios sin etiqueta de moneda: se marcan, no se adivinan.
const datospublicos = PLATFORMS.find(p => p.id === 'datospublicos')
assert.ok(datospublicos, 'datospublicos.uy must be included')
assert.equal(datospublicos.currencyUnlabeled, true, 'its $990 price carries no currency label')
assert.match(datospublicos.priceText.es, /990/)

// Control Ciudadano: la cifra medida contra su propio endpoint, y el muro de pago del CSV.
const cc = PLATFORMS.find(p => p.id === 'controlciudadano')
assert.ok(cc, 'Control Ciudadano must be included')
assert.equal(cc.capabilities.freeExport, 'no')
assert.ok(cc.sources.some(s => s.includes('/api/gastos/stats')), 'the 277 figure must cite the endpoint it came from')

// Textos de encuadre presentes.
assert.ok(SELF_DISCLOSURE.es.length > 120 && SELF_DISCLOSURE.en.length > 120)
assert.ok(METHODOLOGY.length >= 3)
assert.ok(INTERNATIONAL.length >= 4)
for (const r of INTERNATIONAL) assert.match(r.url, /^https:\/\//)
assert.match(VERIFIED_ON, /^\d{4}-\d{2}-\d{2}$/)

// Bilingüe completo: un .en vacío se cae al español sin avisar.
for (const p of PLATFORMS) {
  const pairs = [p.tagline, p.operator, p.scope, p.priceText, p.bestFor, ...p.limits]
  for (const pair of pairs) {
    assert.ok(pair.es.trim() && pair.en.trim(), `${p.id} has an untranslated string`)
  }
}

console.log(`test-comparativa-transparencia: OK (${PLATFORMS.length} plataformas, ${toOthers}/${DECISION_GUIDE.length} de la guía apuntan a otros sitios)`)
