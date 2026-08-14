#!/usr/bin/env tsx
/**
 * Guardián de las traducciones. Puro, así que corre bajo `npm test`.
 *
 *   npx tsx tests/unit/i18n-contract.test.ts
 *
 * POR QUÉ EXISTE. En producción aparecieron seis tarjetas del hub de /analytics mostrando la clave
 * cruda en vez del texto, y faltaban en LOS DOS idiomas. La comparación es/en no las detecta: sólo
 * ve divergencias entre locales, y una clave que falta en ambos lados no diverge.
 *
 * De ahí las tres comprobaciones, en orden de lo que cada una atrapa:
 *   1. El contrato del nav. El hub de /analytics arma sus tarjetas desde `buildNav`, así que toda
 *      hoja del menú necesita `nav.<key>` y, si cuelga de `senales`, `analyticsHub.cards.<key>`.
 *      Agregar una página al menú y olvidar la copia es el defecto que ya pasó dos veces.
 *   2. Toda clave literal `t('...')` del código existe en los dos idiomas.
 *   3. Los dos locales declaran el MISMO conjunto de claves, sin valores vacíos.
 *
 * LÍMITE CONOCIDO: la comprobación 2 sólo ve claves literales. Una clave armada en tiempo de
 * ejecución —`t(\`analyticsHub.cards.${k}.title\`)`— se le escapa, y es justamente la forma del
 * defecto original. Por eso la comprobación 1 existe aparte y es específica.
 */
import { strict as assert } from 'node:assert'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// `__dirname`, no `import.meta.dirname`: tsx compila estos tests a CommonJS, donde el segundo
// llega undefined y `join` explota con un mensaje que no dice nada del problema real.
const APP = join(__dirname, '..', '..', 'app')

const es = JSON.parse(readFileSync(join(APP, 'i18n', 'locales', 'es.json'), 'utf8'))
const en = JSON.parse(readFileSync(join(APP, 'i18n', 'locales', 'en.json'), 'utf8'))

function flatten(o: any, prefix = '', out: Record<string, unknown> = {}): Record<string, unknown> {
  for (const [k, v] of Object.entries(o)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out)
    else out[key] = v
  }
  return out
}

const fes = flatten(es)
const fen = flatten(en)

let checks = 0
function check(name: string, fn: () => void): void {
  fn()
  checks++
  console.log(`  ok · ${name}`)
}

/* ------------------------------------------------------------------ */
/* 1. El contrato del nav                                              */
/* ------------------------------------------------------------------ */

const navSrc = readFileSync(join(APP, 'utils', 'nav.ts'), 'utf8')
const leaves = [...navSrc.matchAll(/\{\s*key:\s*'([^']+)'\s*,\s*to:/g)].map(m => m[1]!)
const sections = [...navSrc.matchAll(/key:\s*'([^']+)',\n\s*items:/g)].map(m => m[1]!)

/** Las hojas de este bloque son las que el hub de /analytics convierte en tarjetas. */
const senalesBlock = navSrc.slice(navSrc.indexOf("key: 'senales'"), navSrc.indexOf("key: 'investigaciones'"))
const senalesLeaves = [...senalesBlock.matchAll(/\{\s*key:\s*'([^']+)'\s*,\s*to:/g)].map(m => m[1]!)

/** El hub renombra una sola clave: su copia es anterior a los nombres del nav. */
const COPY_KEY: Record<string, string> = { anomalies: 'alertas' }

console.log('=== el contrato del nav ===')

check('el nav se pudo leer', () => {
  assert.ok(leaves.length > 30, `sólo ${leaves.length} hojas: cambió la forma de nav.ts y la regex quedó ciega`)
  assert.ok(senalesLeaves.length > 10, `sólo ${senalesLeaves.length} hojas bajo senales`)
})

check('toda hoja del menú tiene etiqueta en los dos idiomas', () => {
  for (const k of leaves) {
    assert.ok(`nav.${k}` in fes, `falta nav.${k} en es`)
    assert.ok(`nav.${k}` in fen, `falta nav.${k} en en`)
  }
})

check('todo grupo del menú tiene encabezado en los dos idiomas', () => {
  for (const s of new Set(sections)) {
    assert.ok(`nav.grp.${s}` in fes, `falta nav.grp.${s} en es`)
    assert.ok(`nav.grp.${s}` in fen, `falta nav.grp.${s} en en`)
  }
})

check('toda herramienta de "señales" tiene su tarjeta en el hub', () => {
  for (const k of senalesLeaves) {
    const c = COPY_KEY[k] ?? k
    for (const [loc, f] of [['es', fes], ['en', fen]] as const) {
      assert.ok(`analyticsHub.cards.${c}.title` in f, `falta analyticsHub.cards.${c}.title en ${loc}`)
      assert.ok(`analyticsHub.cards.${c}.dek` in f, `falta analyticsHub.cards.${c}.dek en ${loc}`)
    }
  }
})

/* ------------------------------------------------------------------ */
/* 2. Las claves literales del código                                  */
/* ------------------------------------------------------------------ */

const SCAN_DIRS = ['pages', 'components', 'layouts', 'composables', 'utils', 'data']
const SCAN_EXT = ['.vue', '.ts']

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e.startsWith('.')) continue
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (SCAN_EXT.some(x => e.endsWith(x))) out.push(p)
  }
  return out
}

const files = SCAN_DIRS.flatMap(d => {
  try { return walk(join(APP, d)) }
  catch { return [] }
})

/** Sólo claves LITERALES. Las armadas con plantilla no se pueden resolver sin ejecutar la app. */
const used = new Map<string, string>()
for (const f of files) {
  const src = readFileSync(f, 'utf8')
  for (const m of src.matchAll(/\bt\(\s*'([a-zA-Z][\w.]*)'/g)) used.set(m[1]!, f)
  for (const m of src.matchAll(/\bt\(\s*"([a-zA-Z][\w.]*)"/g)) used.set(m[1]!, f)
}

console.log('\n=== las claves literales del código ===')

check(`se encontraron claves para revisar (${used.size} en ${files.length} archivos)`, () => {
  assert.ok(used.size > 200, `sólo ${used.size} claves: el escaneo dejó de encontrar archivos`)
})

check('toda clave literal existe en los dos idiomas', () => {
  const faltan: string[] = []
  for (const [k, f] of used) {
    // vue-i18n resuelve una rama a un objeto; lo que importa es que la rama exista.
    const hitEs = k in fes || Object.keys(fes).some(x => x.startsWith(`${k}.`))
    const hitEn = k in fen || Object.keys(fen).some(x => x.startsWith(`${k}.`))
    if (!hitEs) faltan.push(`es: ${k} (${f.replace(APP, 'app')})`)
    if (!hitEn) faltan.push(`en: ${k} (${f.replace(APP, 'app')})`)
  }
  assert.deepEqual(faltan, [], `claves usadas y no declaradas:\n    ${faltan.join('\n    ')}`)
})

/* ------------------------------------------------------------------ */
/* 3. Los dos locales, misma forma                                     */
/* ------------------------------------------------------------------ */

console.log('\n=== los dos locales ===')

check('declaran el mismo conjunto de claves', () => {
  const soloEs = Object.keys(fes).filter(k => !(k in fen))
  const soloEn = Object.keys(fen).filter(k => !(k in fes))
  assert.deepEqual(soloEs, [], `sólo en es: ${soloEs.join(', ')}`)
  assert.deepEqual(soloEn, [], `sólo en en: ${soloEn.join(', ')}`)
})

check('no hay valores vacíos', () => {
  // Un <th> con la cadena vacía no se anuncia en un lector de pantalla, así que un valor vacío es
  // un defecto de accesibilidad y no un espacio en blanco decorativo.
  for (const [loc, f] of [['es', fes], ['en', fen]] as const) {
    const vacias = Object.entries(f).filter(([, v]) => typeof v === 'string' && !v.trim()).map(([k]) => k)
    assert.deepEqual(vacias, [], `valores vacíos en ${loc}: ${vacias.join(', ')}`)
  }
})

console.log(`\n${checks} comprobaciones · ${Object.keys(fes).length} claves por idioma · ${leaves.length} hojas de menú. Todo en orden.`)
