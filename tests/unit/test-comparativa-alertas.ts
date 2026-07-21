import assert from 'node:assert/strict'
import { ESTABLISHED, PROVIDERS } from '../../app/data/comparativa-alertas'

const ids = PROVIDERS.map(provider => provider.id)
assert.equal(new Set(ids).size, ids.length, 'provider ids must be unique')

for (const provider of PROVIDERS) {
  assert.ok(ESTABLISHED[provider.id], `missing domain-age evidence for ${provider.id}`)
}

const tenderis = PROVIDERS.find(provider => provider.id === 'tenderis')
assert.ok(tenderis, 'Tenderis must be included')
assert.equal(tenderis.group, 'core')
assert.equal(tenderis.entryPaid?.amount, 69)
assert.equal(tenderis.entryPaid?.currency, 'USD')
assert.equal(tenderis.features.aiPliego, 'si')
assert.equal(tenderis.features.emailAlerts, 'si')
assert.equal(tenderis.features.api, 'si')
assert.equal(ESTABLISHED.tenderis?.year, 2026)

assert.equal(ESTABLISHED.gubly?.year, 2026)
assert.equal(ESTABLISHED.dsoluciones?.year, 2024)
assert.equal(ESTABLISHED.licitaia?.year, 2026)

console.log('test-comparativa-alertas: OK')
