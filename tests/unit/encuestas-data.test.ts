#!/usr/bin/env tsx
/**
 * Guardián de la regla de entrada de /analytics/encuestas.
 *
 *   npx tsx tests/unit/encuestas-data.test.ts
 *
 * La página promete por escrito que ninguna fila entra sin encuestadora, fechas EXACTAS de campo y
 * tamaño de muestra, que no se promedia entre casas, y que el rango publicado en la portada sale de
 * las cifras de la tabla y no de una constante escrita a mano. Una promesa así no se sostiene con
 * disciplina: se sostiene con un test que falla cuando alguien agrega una fila incompleta.
 *
 * Es puro — no toca la red ni la base — así que corre bajo `npm test`.
 */
import { strict as assert } from 'node:assert'
import {
  EXCLUSIONS,
  HISTORIC_CIFRA,
  MINISTERS,
  MODES,
  ORSI_IMAGE,
  POLLS,
  UNIVERSES,
  WEIGHTS,
  WINDOW_KEYS,
  balance,
  pollContent,
  windowSpread,
} from '../../app/data/encuestas'

let checks = 0
function check(name: string, fn: () => void): void {
  fn()
  checks++
  console.log(`  ok · ${name}`)
}

const ISO = /^\d{4}-\d{2}-\d{2}$/

console.log('=== regla de entrada: encuestadora, fechas exactas de campo y n ===')

check('toda fila trae las tres condiciones de entrada', () => {
  for (const p of POLLS) {
    assert.ok(p.house, `${p.key}: sin encuestadora`)
    assert.match(p.fieldStart, ISO, `${p.key}: fecha de inicio de campo no exacta`)
    assert.match(p.fieldEnd, ISO, `${p.key}: fecha de fin de campo no exacta`)
    assert.ok(Number.isInteger(p.n) && p.n > 0, `${p.key}: sin tamaño de muestra`)
  }
})

check('el campo termina después de empezar y antes de hoy', () => {
  const today = new Date().toISOString().slice(0, 10)
  for (const p of POLLS) {
    assert.ok(p.fieldStart <= p.fieldEnd, `${p.key}: el campo termina antes de empezar`)
    assert.ok(p.fieldEnd <= today, `${p.key}: el campo termina en el futuro`)
  }
})

check('las claves son únicas', () => {
  const keys = POLLS.map(p => p.key)
  assert.equal(new Set(keys).size, keys.length, 'hay claves repetidas')
})

check('cada fila enlaza a una fuente', () => {
  for (const p of POLLS) assert.match(p.source, /^https:\/\//, `${p.key}: fuente sin URL`)
})

console.log('\n=== vocabulario de las fichas ===')

check('modalidad, universo y ponderación existen en su tabla', () => {
  for (const p of POLLS) {
    assert.ok(MODES[p.mode], `${p.key}: modalidad desconocida`)
    assert.ok(UNIVERSES[p.universe], `${p.key}: universo desconocido`)
    assert.ok(WEIGHTS[p.weighting], `${p.key}: ponderación desconocida`)
  }
})

check('todo texto de ficha está en los dos idiomas', () => {
  for (const table of [MODES, UNIVERSES, WEIGHTS]) {
    for (const [k, v] of Object.entries(table)) {
      assert.ok(v.es?.length, `${k}: falta el español`)
      assert.ok(v.en?.length, `${k}: falta el inglés`)
    }
  }
  for (const p of POLLS) {
    if (!p.note) continue
    assert.ok(p.note.es?.length && p.note.en?.length, `${p.key}: nota incompleta`)
  }
})

console.log('\n=== porcentajes ===')

check('los porcentajes son porcentajes', () => {
  for (const p of POLLS) {
    for (const [label, v] of [['aprueba', p.approve], ['desaprueba', p.disapprove]] as const) {
      assert.ok(v >= 0 && v <= 100, `${p.key}: ${label} fuera de rango`)
    }
    if (p.middle != null) assert.ok(p.middle >= 0 && p.middle <= 100, `${p.key}: intermedio fuera de rango`)
  }
})

check('aprobación, intermedio y desaprobación no superan 100', () => {
  // No exigimos que sumen 100: la página dice expresamente que no renormaliza. Pero pasarse de
  // 100 sería un error de transcripción, no una decisión de la casa.
  for (const p of POLLS) {
    const total = p.approve + (p.middle ?? 0) + p.disapprove
    assert.ok(total <= 100, `${p.key}: los tramos suman ${total}`)
  }
})

check('el bloque intermedio NUNCA se deduce restando', () => {
  // Cuando la casa no lo publica, la celda tiene que decirlo. La verificación contra fuente
  // primaria del 14/08/2026 dejó exactamente dos filas sin bloque publicado; si aparece una
  // tercera, o desaparece una de éstas, alguien rellenó o borró un hueco y hay que mirarlo.
  const missing = POLLS.filter(p => p.middle == null).map(p => p.key).sort()
  assert.deepEqual(
    missing,
    ['equipos-2025-12', 'equipos-2026-03'],
    `cambió el conjunto de filas sin bloque intermedio publicado: ${missing.join(', ')}`,
  )
})

check('el bloque agregado nunca contradice su propio desglose', () => {
  // El desglose es prosa (la fuente escribe "más de un cuarto"), así que no se puede sumar. Lo
  // que sí se puede exigir es que cuando el desglose trae DOS números explícitos, sumen el
  // agregado: ahí es donde se colaría un error de transcripción como los tres que ya corregimos.
  for (const p of POLLS) {
    if (!p.middleSplit || p.middle == null) continue
    const nums = (p.middleSplit.es.match(/\b\d+\b/g) ?? []).map(Number)
    if (nums.length !== 2) continue
    assert.equal(
      nums[0]! + nums[1]!,
      p.middle,
      `${p.key}: el desglose (${nums.join(' + ')}) no da el agregado ${p.middle}`,
    )
  }
})

console.log('\n=== la ventana de la portada ===')

check('las claves de la ventana existen y son del presidente', () => {
  for (const k of WINDOW_KEYS) {
    const p = POLLS.find(q => q.key === k)
    assert.ok(p, `${k}: la ventana apunta a una fila que no existe`)
    assert.equal(p!.unit, 'presidente', `${k}: la ventana mezcla objetos medidos`)
  }
})

check('la ventana es una ventana: cinco casas distintas', () => {
  const houses = new Set(WINDOW_KEYS.map(k => POLLS.find(p => p.key === k)!.house))
  assert.equal(houses.size, WINDOW_KEYS.length, 'la ventana repite encuestadora')
})

check('el rango de la portada se deriva de la tabla', () => {
  const rows = WINDOW_KEYS.map(k => POLLS.find(p => p.key === k)!)
  const spread = windowSpread()
  assert.equal(spread.min, Math.min(...rows.map(r => r.disapprove)))
  assert.equal(spread.max, Math.max(...rows.map(r => r.disapprove)))
  assert.ok(spread.max > spread.min, 'un rango de un solo punto no es un rango')
})

check('el saldo es aprobación menos desaprobación y nada más', () => {
  for (const p of POLLS) assert.equal(balance(p), p.approve - p.disapprove, `${p.key}: saldo mal derivado`)
})

console.log('\n=== atribución ===')

check('no volvió la tabla de dirigentes que no tiene fuente primaria', () => {
  // Se bajó a propósito el 14/08/2026: Cifra no publicó ese estudio y los dos medios que lo
  // difundieron se contradicen en la antipatía de Lacalle Pou (34% contra "apenas un 1%").
  const mod = require('../../app/data/encuestas') as Record<string, unknown>
  assert.equal(mod.LEADERS, undefined, 'volvió una tabla de dirigentes sin fuente primaria')
})

check('la serie de imagen admite prosa donde la fuente no dio un número', () => {
  const oct = ORSI_IMAGE[0]!
  assert.equal(typeof oct.anti, 'object', 'la antipatía de octubre de 2025 volvió a ser un número inventado')
})

check('los ministros cuelgan de una medición con ficha', () => {
  assert.ok(POLLS.find(p => p.key === MINISTERS.pollKey), `${MINISTERS.pollKey}: no existe la medición de referencia`)
})

check('las cifras históricas sin ficha están marcadas como tales', () => {
  const conFicha = HISTORIC_CIFRA.filter(r => r.level === 'ficha')
  const citadas = HISTORIC_CIFRA.filter(r => r.level === 'citada')
  assert.ok(conFicha.length >= 2, 'la comparación histórica perdió sus filas con ficha')
  assert.ok(citadas.length >= 1, 'la comparación histórica ya no distingue niveles de evidencia')
  for (const r of conFicha) assert.ok(r.n, `${r.president}: fila "con ficha" sin tamaño de muestra`)
  for (const r of citadas) assert.equal(r.n, undefined, `${r.president}: fila citada con muestra inventada`)
})

check('las exclusiones tienen nombre y motivo, en los dos idiomas', () => {
  assert.ok(EXCLUSIONS.length >= 5, 'la lista de exclusiones quedó demasiado corta para ser un criterio')
  for (const e of EXCLUSIONS) {
    assert.ok(e.what.es?.length && e.what.en?.length, 'exclusión sin nombre en algún idioma')
    assert.ok(e.why.es?.length && e.why.en?.length, 'exclusión sin motivo en algún idioma')
  }
})

console.log('\n=== copia ===')

check('la copia tiene las mismas claves en los dos idiomas', () => {
  const walk = (o: any, prefix = ''): string[] =>
    Object.entries(o).flatMap(([k, v]) =>
      v && typeof v === 'object' && !Array.isArray(v) ? walk(v, `${prefix}${k}.`) : [`${prefix}${k}`],
    )
  const es = walk(pollContent('es')).sort()
  const en = walk(pollContent('en')).sort()
  assert.deepEqual(es, en, 'las dos copias no declaran las mismas claves')
})

check('la página no promete un promedio en ningún idioma', () => {
  // La promesa editorial es explícita: no se promedia entre casas. Si alguna vez se promediara,
  // habría que cambiar la copia a conciencia y este test obliga a hacerlo a conciencia.
  for (const loc of ['es', 'en'] as const) {
    const flat = JSON.stringify(pollContent(loc))
    const claim = loc === 'es' ? 'ni promediamos' : 'correct or average'
    assert.ok(flat.toLowerCase().includes(claim.toLowerCase()), `${loc}: se perdió la promesa de no promediar`)
  }
})

console.log(`\n${checks} comprobaciones, ${POLLS.length} mediciones. Todo en orden.`)
