/**
 * El lector unificado: que lo curado siga saliendo sin tocar la base, y que las funciones
 * nuevas existan con la forma que esperan los endpoints.
 *
 * Es puro a propósito: NO se conecta. La mitad viva la cubren scripts/verify-casos.ts y
 * scripts/verify-derived-casos.ts. Un test que necesita la base no corre en `npm test`, y
 * este contrato tiene que romperse en el commit, no en el deploy.
 *
 *   npx tsx tests/unit/casos-reader.test.ts
 */
import * as casos from '../../app/server/utils/casos'

const failures: string[] = []
function check(cond: boolean, msg: string) {
  if (!cond) failures.push(msg)
}

check(typeof casos.listCuratedCasoDefs === 'function', 'falta listCuratedCasoDefs')
check(typeof casos.listAllCasoDefs === 'function', 'falta listAllCasoDefs')
check(typeof casos.listAllCasoDefsByTheme === 'function', 'falta listAllCasoDefsByTheme')
check(typeof casos.getAnyCasoDef === 'function', 'falta getAnyCasoDef')
check(typeof casos.casoThemeCountsAsync === 'function', 'falta casoThemeCountsAsync')

// Lo curado se lee sin red y sin base: es lo que hace barata la página de tema.
const curated = casos.listCuratedCasoDefs()
check(curated.length >= 100, `esperaba >= 100 casos curados, hay ${curated.length}`)
check(curated.every(c => typeof c.slug === 'string' && c.slug.length > 0), 'todo caso curado necesita slug')

// El lector viejo sigue en pie: el sitemap y verify-casos lo usan.
check(casos.listCasoDefs().length === curated.length, 'listCasoDefs debe seguir dando lo curado')

// Ningún caso curado puede vivir en el tema armado: ése lo llena un trabajo por lotes, y una
// ficha escrita a mano ahí quedaría fuera de verify-casos y se borraría en la próxima corrida.
check(
  curated.every(c => c.theme !== 'gasto-observado'),
  'ningún caso curado puede declarar el tema "gasto-observado"',
)

if (failures.length) {
  console.error(`✗ ${failures.length} fallo(s):`)
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}
console.log('✓ casos-reader: todo pasa')
