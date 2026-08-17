// Run: npx tsx tests/unit/supplier-path.test.ts
//
// Guards the bug that disavowed the whole supplier sitemap: the slash inside a
// supplier id is a PATH SEPARATOR. Encoding it to %2F yields a second URL for
// the same supplier, and the page's own canonical then points away from every
// row the sitemap submitted.
import assert from 'node:assert/strict'
import { supplierPath } from '../../shared/utils/supplier-path'

// The four id shapes the corpus actually carries.
assert.equal(supplierPath('R/210002980010'), '/suppliers/R/210002980010')
assert.equal(supplierPath('C/1.018.225-6'), '/suppliers/C/1.018.225-6')
assert.equal(supplierPath('X/CHECHE-103.194.266'), '/suppliers/X/CHECHE-103.194.266')
assert.equal(supplierPath('T/05013'), '/suppliers/T/05013')

// An id with no slash at all still works.
assert.equal(supplierPath('214172500012'), '/suppliers/214172500012')

// More than one slash keeps every separator.
assert.equal(supplierPath('A/B/C'), '/suppliers/A/B/C')

// The separator must NEVER be escaped.
for (const id of ['R/210002980010', 'C/1.018.225-6', 'A/B/C']) {
  assert.ok(!supplierPath(id).includes('%2F'), `escaped separator in ${id}`)
}

// Characters that are genuinely unsafe in a path segment still get encoded.
assert.equal(supplierPath('R/A B'), '/suppliers/R/A%20B')
assert.equal(supplierPath('R/A?B'), '/suppliers/R/A%3FB')
assert.equal(supplierPath('R/A#B'), '/suppliers/R/A%23B')

// The helper must agree with the expression the page canonicalises with,
// otherwise the sitemap and the canonical drift apart again.
const pageExpression = (id: string) =>
  `/suppliers/${id.split('/').map(encodeURIComponent).join('/')}`
for (const id of ['R/210002980010', 'C/1.018.225-6', 'X/CHECHE-103.194.266', 'A/B/C', 'plain']) {
  assert.equal(supplierPath(id), pageExpression(id), `drift on ${id}`)
}

console.log('supplier path encoding: OK')
