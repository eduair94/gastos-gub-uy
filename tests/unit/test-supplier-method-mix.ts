// tests/unit/test-supplier-method-mix.ts
// Run: npx tsx tests/unit/test-supplier-method-mix.ts
import assert from 'node:assert/strict'
import { reduceSupplierMethodMix } from '../../src/jobs/refresh-analytics'

const mix = reduceSupplierMethodMix([
  { _id: { supplier: 'direct-only', method: 'Compra Directa' }, count: 3 },
  { _id: { supplier: 'direct-only', method: 'Convenio Marco' }, count: 2 },
  { _id: { supplier: 'direct-only', method: null }, count: 7 },
  { _id: { supplier: 'mixed', method: 'Compra por Excepción' }, count: 4 },
  { _id: { supplier: 'mixed', method: 'Licitación Pública' }, count: 1 },
  { _id: { supplier: 'tender-only', method: 'Concurso de Precios' }, count: 5 },
  { _id: { supplier: 'unknown-only', method: null }, count: 9 },
])

assert.deepEqual(mix.get('direct-only'), {
  directAwardCount: 3,
  tenderAwardCount: 0,
  onlyDirectAward: true,
})
assert.deepEqual(mix.get('mixed'), {
  directAwardCount: 4,
  tenderAwardCount: 1,
  onlyDirectAward: false,
})
assert.deepEqual(mix.get('tender-only'), {
  directAwardCount: 0,
  tenderAwardCount: 5,
  onlyDirectAward: false,
})
assert.deepEqual(mix.get('unknown-only'), {
  directAwardCount: 0,
  tenderAwardCount: 0,
  onlyDirectAward: false,
})

console.log('ok: supplier method mix')
