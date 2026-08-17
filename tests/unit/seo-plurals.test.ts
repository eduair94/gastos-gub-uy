// Run: npx tsx tests/unit/seo-plurals.test.ts
//
// Guards the grammar of the three meta descriptions that cover ~89k pages.
// They used to interpolate a raw count next to a HARDCODED plural noun, so every
// entity with exactly one of something shipped "1 contratos y 1 organismos
// compradores" straight into the Google result.
//
// The rule: the noun is pluralised by its own `seo.units.*` key. A count and its
// noun may never sit next to each other as literal text in a description.
import assert from 'node:assert/strict'
import es from '../../app/i18n/locales/es.json'
import en from '../../app/i18n/locales/en.json'

const UNIT_KEYS = ['contrato', 'organismo', 'organismoComprador', 'proveedor'] as const
const DESCRIPTIONS = ['productDetail', 'supplierDetail', 'buyerDetail'] as const

for (const [label, loc] of [['es', es], ['en', en]] as const) {
  const units = (loc as any).seo?.units
  assert.ok(units, `${label}: seo.units missing`)

  for (const k of UNIT_KEYS) {
    const raw = units[k]
    assert.equal(typeof raw, 'string', `${label}: seo.units.${k} missing`)
    const branches = raw.split('|').map((s: string) => s.trim())
    assert.equal(branches.length, 2, `${label}: seo.units.${k} needs exactly 2 plural branches`)
    for (const b of branches) assert.ok(b.length > 0, `${label}: empty branch in seo.units.${k}`)
    assert.notEqual(branches[0], branches[1], `${label}: seo.units.${k} branches are identical`)
  }

  // No description may place a count placeholder immediately before a literal noun.
  // The noun must arrive through its own {...Word} placeholder.
  for (const key of DESCRIPTIONS) {
    const d: string = (loc as any).seo[key].description
    assert.ok(d, `${label}: seo.${key}.description missing`)
    const hardcoded = /\{(contracts|buyers|suppliers)\}\s+[A-Za-zÁÉÍÓÚáéíóúñ]+/.exec(d)
    assert.equal(
      hardcoded,
      null,
      `${label}: seo.${key}.description hardcodes a noun after a count: "${hardcoded?.[0]}"`,
    )
  }
}

// The two locales must expose the same unit keys in the same order.
assert.deepEqual(
  Object.keys((es as any).seo.units),
  Object.keys((en as any).seo.units),
  'seo.units key order differs between locales',
)

// Render the 2-branch rule the way vue-i18n does and prove n=1 never says "contratos".
const choose = (raw: string, n: number) => raw.split('|').map(s => s.trim())[n === 1 ? 0 : 1]!
for (const [label, loc] of [['es', es], ['en', en]] as const) {
  const units = (loc as any).seo.units
  for (const k of UNIT_KEYS) {
    assert.equal(choose(units[k], 1), units[k].split('|')[0]!.trim(), `${label}: ${k} n=1 branch`)
    // 0 and 2 both take the plural branch — "0 contratos" is correct Spanish.
    for (const n of [0, 2, 74]) {
      assert.equal(choose(units[k], n), units[k].split('|')[1]!.trim(), `${label}: ${k} n=${n} branch`)
    }
  }
}

console.log('seo description plurals: OK')
