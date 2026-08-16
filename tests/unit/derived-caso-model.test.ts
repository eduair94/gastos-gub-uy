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

const observado = CASO_THEMES.find(t => t.key === 'gasto-observado')
check(Boolean(observado), 'falta el tema "gasto-observado"')
// Va último a propósito: las catorce temáticas curadas abren la lista, y el carril armado la
// cierra. Meterlo en el medio correría el orden editorial de todo el sitio.
check(
  CASO_THEMES[CASO_THEMES.length - 1]?.key === 'gasto-observado',
  'el tema "gasto-observado" tiene que ir último',
)
check(Boolean(observado?.en.label), 'el tema necesita sus dos idiomas')
check(Boolean(observado?.emoji), 'el tema necesita emoji')

// Las claves de tema no se repiten: el índice agrupa por ellas.
const keys = CASO_THEMES.map(t => t.key)
check(new Set(keys).size === keys.length, 'hay una clave de tema repetida')

if (failures.length) {
  console.error(`✗ ${failures.length} fallo(s):`)
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}
console.log('✓ derived-caso-model: todo pasa')
