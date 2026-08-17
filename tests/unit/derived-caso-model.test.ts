/**
 * El modelo de `derived_casos` y el tema que aloja las fichas armadas.
 *
 *   npx tsx tests/unit/derived-caso-model.test.ts
 */
import { CASO_THEMES } from '../../app/server/utils/casos/types'
import { DerivedCasoModel } from '../../shared/models/derived_caso'

const failures: string[] = []
function check(cond: boolean, msg: string) {
  if (!cond) failures.push(msg)
}

const paths = Object.keys(DerivedCasoModel.schema.paths)
for (const p of ['slug', 'origin', 'generation', 'builtAt', 'rank', 'def']) {
  check(paths.includes(p), `falta el campo "${p}" en el Schema`)
}
check(
  DerivedCasoModel.collection.name === 'derived_casos',
  `la colección es "${DerivedCasoModel.collection.name}"`,
)

// Los temas ARMADOS van al final, después de los catorce curados. El orden es editorial:
// primero lo que escribió una persona, después lo que armó un trabajo por lotes. Meter uno en
// el medio correría el orden de todo el sitio.
const DERIVED = ['gasto-observado', 'tribunal-de-cuentas']
const cola = CASO_THEMES.slice(-DERIVED.length).map(t => t.key)
check(
  DERIVED.every(k => cola.includes(k)),
  `los temas armados tienen que ir últimos; la cola es ${JSON.stringify(cola)}`,
)
for (const key of DERIVED) {
  const th = CASO_THEMES.find(t => t.key === key)
  check(Boolean(th), `falta el tema "${key}"`)
  check(Boolean(th?.en.label), `el tema "${key}" necesita sus dos idiomas`)
  check(Boolean(th?.emoji), `el tema "${key}" necesita emoji`)
}

// Las claves de tema no se repiten: el índice agrupa por ellas.
const keys = CASO_THEMES.map(t => t.key)
check(new Set(keys).size === keys.length, 'hay una clave de tema repetida')

if (failures.length) {
  console.error(`✗ ${failures.length} fallo(s):`)
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}
console.log('✓ derived-caso-model: todo pasa')
