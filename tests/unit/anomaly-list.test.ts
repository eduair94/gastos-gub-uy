// Run: npx tsx tests/unit/anomaly-list.test.ts
import assert from 'node:assert/strict'
import {
  ANOMALY_DEFAULT_SORT,
  ANOMALY_RECENT_SORT_FIELD,
  formatAnomalySourceDate,
} from '../../app/utils/anomaly-list'

assert.equal(ANOMALY_DEFAULT_SORT, 'recent')
assert.equal(ANOMALY_RECENT_SORT_FIELD, 'sourceDate')
assert.equal(formatAnomalySourceDate('2026-07-24T00:00:00.000Z'), '24/07/2026')
assert.equal(formatAnomalySourceDate('not-a-date'), null)
assert.equal(formatAnomalySourceDate(null), null)

console.log('anomaly list ordering and dates: OK')
