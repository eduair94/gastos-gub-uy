import assert from 'node:assert/strict'
import { decodeCursor, encodeCursor } from '../../app/server/utils/cursor'

const c = { t: 1721000000000, id: '6894de0cfbc85dc56b8ca856' }
const s = encodeCursor(c)
assert.deepEqual(decodeCursor(s), c, 'round-trips')
assert.equal(decodeCursor('!!not-base64!!'), null, 'malformed → null')
assert.equal(decodeCursor(Buffer.from('nope', 'utf8').toString('base64url')), null, 'no colon → null')
assert.equal(decodeCursor(Buffer.from('abc:', 'utf8').toString('base64url')), null, 'non-numeric t → null')

// An id that itself contains a colon must survive (split on the FIRST colon only).
const c2 = { t: 1, id: 'a:b:c' }
assert.deepEqual(decodeCursor(encodeCursor(c2)), c2, 'id with colons round-trips')

console.log('cursor.test OK')
