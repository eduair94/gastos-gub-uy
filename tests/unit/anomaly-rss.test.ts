import assert from 'node:assert/strict'
import { buildAnomalyRssXml, escapeXml, parseAnomalyRssScope } from '../../app/server/utils/anomaly-rss'

const scope = parseAnomalyRssScope({
  severity: 'critical',
  ai: 'unexplained',
  category: ['sin-explicacion', 'not-a-category'],
  minZ: '25',
  rubroName: ['SALUD & BIENESTAR', 'OBRAS'],
  buyer: 'Intendencia <Test>',
  supplier: ['Proveedor Uno', 'Proveedor Dos'],
  currency: 'uyu',
  year: '2026',
  lang: 'es',
})

assert.deepEqual(scope.filter.severity, 'critical')
assert.deepEqual(scope.filter['aiVerdict.explainable'], 'no')
assert.deepEqual(scope.filter['aiVerdict.category'], 'sin-explicacion')
assert.deepEqual(scope.filter['metadata.zScore'], { $gte: 25 })
assert.deepEqual(scope.filter['metadata.itemClassification.rubro'], { $in: ['SALUD & BIENESTAR', 'OBRAS'] })
assert.deepEqual(scope.filter['metadata.buyerName'], 'Intendencia <Test>')
assert.deepEqual(scope.filter['metadata.supplierName'], { $in: ['Proveedor Uno', 'Proveedor Dos'] })
assert.equal(scope.filter.currency, 'UYU')
assert.equal(scope.filter.sourceYear, 2026)

const invalid = parseAnomalyRssScope({
  severity: 'urgent',
  ai: 'magic',
  minZ: '-10',
  currency: 'pesos',
  year: '9999',
  supplier: ['1', '2', '3', '4', '5', '6'],
  lang: 'fr',
})
assert.equal(invalid.severity, undefined)
assert.equal(invalid.ai, undefined)
assert.equal(invalid.minZ, undefined)
assert.equal(invalid.currency, undefined)
assert.equal(invalid.year, undefined)
assert.equal(invalid.supplier.length, 5)
assert.equal(invalid.lang, 'es')

assert.equal(escapeXml(`A&B <tag> "quoted" 'single'`), 'A&amp;B &lt;tag&gt; &quot;quoted&quot; &apos;single&apos;')

const xml = buildAnomalyRssXml({
  scope,
  siteUrl: 'https://conlatuya.checkleaked.cc/',
  selfUrl: 'https://conlatuya.checkleaked.cc/rss/anomalies.xml?severity=critical&rubroName=SALUD%20%26%20BIENESTAR',
  rows: [{
    _id: 'abc123',
    releaseId: 'adjudicacion-42',
    severity: 'critical',
    detectedValue: 1250,
    currency: 'UYU',
    expectedRange: { min: 100, max: 250 },
    firstDetectedAt: '2026-07-24T13:05:11.584Z',
    sourceDate: '2026-07-22T00:00:00.000Z',
    metadata: {
      supplierName: 'Proveedor & Hijos',
      buyerName: 'Hospital <Central>',
      zScore: 27.5,
      itemClassification: {
        description: 'Guantes & apósitos',
        rubro: 'SALUD & BIENESTAR',
      },
    },
    aiVerdict: {
      explainable: 'no',
      category: 'sin-explicacion',
    },
  }],
})

assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/)
assert.match(xml, /<rss version="2\.0"/)
assert.match(xml, /application\/rss\+xml/)
assert.match(xml, /SALUD &amp; BIENESTAR/)
assert.match(xml, /Hospital &lt;Central&gt;/)
assert.match(xml, /Proveedor &amp; Hijos/)
assert.match(xml, /urn:conlatuya:anomaly:abc123/)
assert.match(xml, /Wed, 22 Jul 2026 00:00:00 GMT/)
assert.match(xml, /\/contracts\/adjudicacion-42/)
assert.match(xml, /sort=recent/)
assert.doesNotMatch(xml, /<script/i)

console.log('anomaly RSS: OK')
