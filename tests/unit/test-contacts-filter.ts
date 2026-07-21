// tests/unit/test-contacts-filter.ts
// Run: npx tsx tests/unit/test-contacts-filter.ts
import assert from 'node:assert/strict'
import { buildContactFilter } from '../../app/server/utils/contacts'

async function main(): Promise<void> {
  const onlyDirect = await buildContactFilter(
    { onlyDirect: '1' },
    { resolveOnlyDirectSupplierIds: async () => ['R/1', 'R/2'] },
  )
  assert.ok('filter' in onlyDirect)
  assert.deepEqual(onlyDirect.filter.supplierId, { $in: ['R/1', 'R/2'] })

  const intersected = await buildContactFilter(
    { dei: '1', onlyDirect: 'true' },
    {
      resolveDeiSupplierIds: async () => ['R/1', 'R/2', 'R/3'],
      resolveOnlyDirectSupplierIds: async () => ['R/2', 'R/4'],
    },
  )
  assert.ok('filter' in intersected)
  assert.deepEqual(intersected.filter.supplierId, { $in: ['R/2'] })

  const empty = await buildContactFilter(
    { dei: 'true', onlyDirect: '1' },
    {
      resolveDeiSupplierIds: async () => ['R/1'],
      resolveOnlyDirectSupplierIds: async () => ['R/2'],
    },
  )
  assert.deepEqual(empty, { empty: true })

  console.log('ok: contacts filter')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
