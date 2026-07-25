/**
 * Run: npx tsx tests/unit/test-contact-map-window.ts
 */
import assert from 'node:assert/strict'
import { parseContactMapWindow } from '../../app/server/utils/contact-map'

const window = parseContactMapWindow({
  lat: '-32.8',
  lng: '-56',
  south: '-35.5',
  west: '-59',
  north: '-29.5',
  east: '-52.5',
  limit: '900',
})
assert.ok(window)
assert.deepEqual(window.center, { lat: -32.8, lng: -56 })
assert.deepEqual(window.bounds, { south: -35.5, west: -59, north: -29.5, east: -52.5 })
assert.equal(window.limit, 900)
assert.ok(window.radiusMeters > 300_000)
assert.ok(window.radiusMeters < 500_000)

assert.equal(parseContactMapWindow({}), null)
assert.equal(parseContactMapWindow({
  lat: 91,
  lng: 0,
  south: -10,
  west: -10,
  north: 10,
  east: 10,
}), null)
assert.equal(parseContactMapWindow({
  lat: 0,
  lng: 179,
  south: -10,
  west: 170,
  north: 10,
  east: -170,
  limit: 9_999,
})?.limit, 1_500)

console.log('ok: contact map viewport parsing')
