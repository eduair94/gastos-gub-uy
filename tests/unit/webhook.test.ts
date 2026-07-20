import assert from 'node:assert/strict'
import { assertSafeWebhookUrl, generateWebhookSecret, signPayload } from '../../shared/webhooks/sign'

// signPayload: stable + prefixed
const sig = signPayload('s3cr3t', '{"a":1}')
assert.match(sig, /^sha256=[0-9a-f]{64}$/, 'signature shape')
assert.equal(sig, signPayload('s3cr3t', '{"a":1}'), 'signature deterministic')
assert.notEqual(sig, signPayload('other', '{"a":1}'), 'signature depends on secret')

// secret
assert.match(generateWebhookSecret(), /^whsec_[0-9A-Za-z_-]+$/, 'secret shape')
assert.notEqual(generateWebhookSecret(), generateWebhookSecret(), 'secrets unique')

// URL: allowed
assert.doesNotThrow(() => assertSafeWebhookUrl('https://hooks.zapier.com/hooks/catch/1/abc'), 'public https ok')
assert.doesNotThrow(() => assertSafeWebhookUrl('https://webhook.site/uuid'), 'public https ok 2')

// URL: rejected
for (const bad of [
  'http://example.com', // not https
  'ftp://example.com', // not https
  'https://localhost', // localhost
  'https://foo.local', // .local
  'https://127.0.0.1', // loopback
  'https://10.1.2.3', // private
  'https://192.168.0.1', // private
  'https://172.16.0.1', // private
  'https://169.254.0.1', // link-local
  'https://100.64.0.1', // CGNAT
  'https://[::1]', // IPv6 loopback
  'not a url', // garbage
]) {
  assert.throws(() => assertSafeWebhookUrl(bad), new RegExp('.'), `rejects ${bad}`)
}

console.log('webhook.test OK')
