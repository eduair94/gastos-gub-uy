import assert from 'node:assert/strict'
import { rollupVariants } from '../../src/jobs/variants/rollup'

const out = rollupVariants([
  { features: [{ name: 'Marca', value: 'FARMACO URUGUAYO' }, { name: 'Presentación', value: 'CAJA' }], variation: '72 ENVASES' },
  { features: [{ name: 'Marca', value: 'FARMACO URUGUAYO' }, { name: 'Presentación', value: 'CAJA' }], variation: '72 ENVASES' },
  { features: [{ name: 'Marca', value: 'OTRA MARCA' }, { name: 'Presentación', value: 'FRASCO' }] },
])
const marca = out.attributes.find(a => a.name === 'Marca')!
assert.equal(marca.distinct, 2, 'two brands')
assert.equal(marca.values[0]!.value, 'FARMACO URUGUAYO', 'most common brand first')
assert.equal(marca.values[0]!.count, 2, 'count')
assert.equal(out.varies, true, 'varies when >1 brand')
assert.equal(out.sampledContracts, 3, 'sample size')

// Accent/case-insensitive name matching: "Concentracion" (no accent) still buckets.
const acc = rollupVariants([{ features: [{ name: 'Concentracion', value: '8.4 %' }] }])
assert.ok(acc.attributes.find(a => a.name === 'Concentración'), 'concentración matched without accent')

const same = rollupVariants([
  { features: [{ name: 'Marca', value: 'X' }] },
  { features: [{ name: 'Marca', value: 'X' }] },
])
assert.equal(same.varies, false, 'single brand → does not vary')
console.log('variants-rollup.test OK')
