import assert from 'node:assert/strict'
import { generateApiKey, hashToken, parsePrefix, verifyToken } from '../app/server/utils/api-key'

const { token, prefix, hash } = generateApiKey()
assert.match(token, /^gk_live_[0-9A-Za-z]{8}_[0-9A-Za-z]{32}$/, 'token format')
assert.equal(parsePrefix(token), prefix, 'prefix parses from token')
assert.ok(token.startsWith(prefix), 'prefix is a token prefix')
assert.equal(hashToken(token), hash, 'hash is deterministic')
assert.equal(verifyToken(token, hash), true, 'verify accepts correct token')
assert.equal(verifyToken(token + 'x', hash), false, 'verify rejects wrong token')
assert.equal(parsePrefix('nope'), null, 'malformed → null')
assert.equal(parsePrefix('gk_live_short'), null, 'wrong length → null')

const a = generateApiKey()
const b = generateApiKey()
assert.notEqual(a.token, b.token, 'tokens unique')

console.log('api-key.test OK')
