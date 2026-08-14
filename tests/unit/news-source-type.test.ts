#!/usr/bin/env tsx
/**
 * El clasificador de tipo de fuente, con los casos REALES del corpus.
 *
 *   npx tsx tests/unit/news-source-type.test.ts
 *
 * Los 29 medios de acá no son inventados: son los que devolvió la medición del 14/08/2026 sobre
 * `organism_news`. El caso que justifica todo el archivo es `frenteamplio.uy`: una sola nota de un
 * partido, que dentro de un panel de ocho ítems pasa desapercibida y en una lista ordenada por
 * fecha aparecería arriba junto a periodismo, sin ninguna marca.
 */
import { strict as assert } from 'node:assert'
import { classifyNewsSource } from '../../shared/news-source-type'

let n = 0
function eq(source: string, expected: string): void {
  const got = classifyNewsSource(source)
  assert.equal(got, expected, `${JSON.stringify(source)} → ${got}, se esperaba ${expected}`)
  n++
  console.log(`  ok · ${String(source || '(vacío)').padEnd(24)} → ${expected}`)
}

console.log('=== prensa (los medios con más notas en el corpus) ===')
for (const s of ['ladiaria.com.uy', 'El Observador', 'Montevideo Portal', 'EL PAÍS Uruguay', 'LaRed21', 'subrayado.com.uy', 'Caras y Caretas', 'El Telégrafo', 'diarionorte.com.uy', 'BÚSQUEDA']) {
  eq(s, 'prensa')
}

console.log('\n=== comunicación oficial: el Estado hablando de sí mismo ===')
eq('GUB.UY', 'oficial')
eq('gub.uy', 'oficial')
eq('rionegro.gub.uy', 'oficial')
eq('salto.gub.uy', 'oficial')
eq('www.presidencia.gub.uy', 'oficial')
eq('asse.com.uy', 'oficial')

console.log('\n=== partidaria ===')
eq('frenteamplio.uy', 'partidaria')
eq('www.frenteamplio.uy', 'partidaria')

console.log('\n=== bordes ===')
// Sin fuente no se puede afirmar que sea oficial ni partidaria: el default es el más conservador
// para la etiqueta, que es tratarla como prensa y no atribuirle al Estado algo que no dijo.
eq('', 'prensa')
eq('   ', 'prensa')
// @ts-expect-error — el campo viene de la base y puede llegar nulo
eq(null, 'prensa')

console.log(`\n${n} casos. El clasificador es un piso por dominio, no un censo: un portal`)
console.log('institucional cuyo nombre no delata el origen queda como prensa, y la página lo dice.')
