/**
 * Los invariantes de /canales-youtube. No prueban que los canales existan —eso lo
 * hace `canales-youtube.verify.ts` contra YouTube— sino que la lista siga siendo
 * un directorio verificado y no una lista de favoritos:
 *
 *   - Ningún canal entra sin al menos una prueba de identidad.
 *   - La prueba `sitio` obliga a dejar la URL que la sostiene.
 *   - Los enlaces salen del identificador, nunca del handle.
 *   - La página dice qué descartó y por qué, con el mismo detalle que lo que publica.
 */
import assert from 'node:assert/strict'
import {
  ACTIVE_WINDOW_DAYS,
  CHANNELS,
  GAPS,
  LIMITES,
  METODO,
  REJECTED,
  TOPIC_TERMS,
  VERIFIED_ON,
  channelUrl,
  isActive,
  matchesTopic,
} from '../../app/data/canales-youtube'

const ids = CHANNELS.map(c => c.id)
assert.equal(new Set(ids).size, ids.length, 'channel ids must be unique')
assert.ok(CHANNELS.length >= 25, `the directory must stay substantial (${CHANNELS.length})`)

const CATEGORIES = new Set(['estado', 'medios', 'partidos', 'analisis'])

for (const c of CHANNELS) {
  // El identificador de YouTube es la clave estable. Un handle acá sería un enlace
  // que se rompe solo el día que el canal se renombra.
  assert.match(c.id, /^UC[A-Za-z0-9_-]{22}$/, `${c.name}: id must be a YouTube channel id`)
  assert.match(c.handle, /^@/, `${c.name}: handle must start with @`)
  assert.ok(CATEGORIES.has(c.category), `${c.name}: unknown category ${c.category}`)

  // Regla de entrada: sin prueba no entra, y la prueba de sitio deja su URL.
  assert.ok(c.proofs.length > 0, `${c.name}: must carry at least one identity proof`)
  for (const p of c.proofs) {
    assert.ok(p === 'pais' || p === 'sitio', `${c.name}: unknown proof ${p}`)
  }
  assert.equal(new Set(c.proofs).size, c.proofs.length, `${c.name}: duplicated proof`)
  if (c.proofs.includes('sitio')) {
    assert.ok(c.proofUrl?.startsWith('https://'), `${c.name}: proof "sitio" needs the URL that backs it`)
  }

  // Toda ficha dice qué publica y por qué sirve, en los dos idiomas.
  assert.ok(c.what.es && c.what.en, `${c.name}: missing what.es/en`)
  assert.ok(c.why.es && c.why.en, `${c.name}: missing why.es/en`)

  // Las cifras son las que publica YouTube; el número aproximado sólo ordena.
  assert.ok(Number.isFinite(c.subscribersApprox) && c.subscribersApprox > 0, `${c.name}: subscribersApprox must be positive`)
  if (c.lastUpload) {
    assert.match(c.lastUpload, /^\d{4}-\d{2}-\d{2}$/, `${c.name}: lastUpload must be an ISO date`)
    assert.ok(!Number.isNaN(new Date(c.lastUpload).getTime()), `${c.name}: unparseable lastUpload`)
  }

  // buyer.id es inciso-unidad. Un id inventado rompe el enlace a la ficha.
  if (c.buyerId) assert.match(c.buyerId, /^\d+-\d+$/, `${c.name}: buyerId must be inciso-unidad`)
  if (c.related) {
    assert.ok(c.related.to.startsWith('/'), `${c.name}: related.to must be an internal path`)
    assert.ok(c.related.label.es && c.related.label.en, `${c.name}: related.label needs both locales`)
  }
  if (c.site) assert.ok(c.site.startsWith('https://'), `${c.name}: site must be https`)
}

// Cada categoría existe: si una queda vacía, la página muestra una sección hueca.
for (const cat of CATEGORIES) {
  assert.ok(CHANNELS.some(c => c.category === cat), `category ${cat} has no channels`)
}

// Los tres canales de TV privada que cobran pauta llevan el enlace a esa medición.
// Es el cruce que justifica la página dentro de este sitio.
const PAUTA_TV = ['UCp6X5jzfmwbOeclRArOi18g', 'UCJI9kSwvvHX2CJeF8iZ6x8Q', 'UCimPJKAbuM6z6b6DPZz86Mw']
for (const id of PAUTA_TV) {
  const c = CHANNELS.find(x => x.id === id)
  assert.ok(c, `expected the pauta-receiving channel ${id} to stay listed`)
  assert.equal(c.related?.to, '/investigaciones/canales-privados', `${c.name}: must link the pauta measurement`)
}

// Honestidad: lo descartado se publica con su motivo, y los vacíos también.
assert.ok(REJECTED.length >= 4, 'the rejected list is what proves the rule was applied')
for (const r of REJECTED) {
  assert.ok(r.reason.es && r.reason.en, `${r.name}: rejection needs a measured reason in both locales`)
  assert.ok(r.reason.es.length > 60, `${r.name}: the reason must say what was measured, not just "no"`)
}
assert.ok(GAPS.length >= 2, 'a measured absence is information; keep publishing it')
assert.ok(LIMITES.length >= 3, 'the page must state what it does not do')
assert.ok(METODO.length >= 4, 'the method must stay reproducible')
for (const list of [GAPS, LIMITES, METODO]) {
  for (const x of list) assert.ok(x.es && x.en, 'every prose block needs both locales')
}

// Ningún canal descartado puede volver a entrar por la puerta de al lado.
const rejectedHandles = new Set(REJECTED.map(r => r.handle.toLowerCase()))
for (const c of CHANNELS) {
  assert.ok(!rejectedHandles.has(c.handle.toLowerCase()), `${c.name}: handle is in the rejected list`)
}

assert.match(VERIFIED_ON, /^\d{4}-\d{2}-\d{2}$/)
assert.equal(ACTIVE_WINDOW_DAYS, 90)

// La ventana de actividad se mide contra una fecha que entra por parámetro. Si el
// módulo leyera el reloj, un worker de pm2 congelaría "hoy" en su arranque.
const REF = new Date('2026-08-18T00:00:00Z')
const teledoce = CHANNELS.find(c => c.id === 'UCimPJKAbuM6z6b6DPZz86Mw')!
const cabildo = CHANNELS.find(c => c.id === 'UC5MglaJ502q71hg3tIS4vdQ')!
assert.equal(isActive(teledoce, REF), true, 'a channel uploading today is active')
assert.equal(isActive(cabildo, REF), false, 'a channel silent since 2024 is not active')
assert.equal(isActive({ ...teledoce, lastUpload: null }, REF), false, 'no feed means not active')

// El enlace se arma con el identificador, que es lo que no cambia.
assert.equal(channelUrl('UCimPJKAbuM6z6b6DPZz86Mw'), 'https://www.youtube.com/channel/UCimPJKAbuM6z6b6DPZz86Mw')

// El filtro de tema corre sobre títulos de canales YA verificados. Sirve para separar
// la sesión del Senado de la receta de torta, no para descubrir canales.
assert.equal(matchesTopic('Cámara de Senadores | 18/08/2026'), true)
assert.equal(matchesTopic('Sotelo sobre la Rendición de Cuentas: más gasto y más impuestos'), true)
assert.equal(matchesTopic('BLANCOS SOLICITAN QUE SE HAGA CUMPLIR LA LEY DE PUERTOS'), true)
assert.equal(matchesTopic('EL FUTURO DE PERRONE, ¿EN EL FA O EN LA COALICIÓN?'), true)
assert.equal(matchesTopic('Cómo preparar la torta Café-Café, la favorita del momento'), false)
assert.equal(matchesTopic('Fuego Sagrado 6, capítulo 11: Repechaje'), false)
assert.equal(matchesTopic('Capeletis a la caruso en Vamo Arriba'), false)

// LA TRAMPA QUE YA PAGAMOS UNA VEZ, en la búsqueda de prensa: comparar por subcadena
// hace que «OSE» matchee «José» y «ley» matchee «Bradley». La comparación es por
// palabra completa, y estos tres casos son los que lo prueban.
assert.equal(matchesTopic('Bradley y el rosé de José'), false)
assert.equal(matchesTopic('Antes de ayer'), false)
assert.equal(matchesTopic('La política tarifaria de UTE'), true)

// Los términos se interpolan sin escapar dentro de la expresión regular, así que sólo
// pueden traer letras, números, espacios y guiones. Un paréntesis armaría un patrón
// roto que no falla: simplemente deja de matchear.
for (const term of TOPIC_TERMS) {
  assert.equal(term, term.toLowerCase(), `topic term "${term}" must be lowercase`)
  assert.match(term, /^[a-z0-9][a-z0-9 -]*$/, `topic term "${term}" must carry no accents or metacharacters`)
}
assert.equal(new Set(TOPIC_TERMS).size, TOPIC_TERMS.length, 'topic terms must be unique')

console.log(`✓ canales-youtube: ${CHANNELS.length} canales, ${REJECTED.length} descartados, ${GAPS.length} vacíos`)
