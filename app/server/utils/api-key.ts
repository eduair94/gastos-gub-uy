import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

// A user-issued API key looks like `gk_live_<8 base62>_<32 base62>`.
// The first two segments (`gk_live_<8>`) are the public `prefix` — stored in
// clear and used to look the key up; the last segment is the secret half. Only
// sha256(token) is persisted, so a leaked database never exposes usable keys.

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const PREFIX_LABEL = 'gk_live_'
const PREFIX_RAND = 8
const SECRET_RAND = 32
const TOKEN_RE = /^gk_live_[0-9A-Za-z]{8}_[0-9A-Za-z]{32}$/

// Rejection-sampled base62 so each character is uniformly distributed (a plain
// `byte % 62` would over-represent the first 8 code points).
function base62(n: number): string {
  let out = ''
  while (out.length < n) {
    for (const byte of randomBytes(n * 2)) {
      if (byte < 248) { // 248 = floor(256 / 62) * 62 — drop the biased tail
        out += ALPHABET[byte % 62]
        if (out.length === n) break
      }
    }
  }
  return out
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function generateApiKey(): { token: string, prefix: string, hash: string } {
  const prefix = PREFIX_LABEL + base62(PREFIX_RAND)
  const token = prefix + '_' + base62(SECRET_RAND)
  return { token, prefix, hash: hashToken(token) }
}

export function parsePrefix(token: string): string | null {
  if (!TOKEN_RE.test(token)) return null
  return token.slice(0, PREFIX_LABEL.length + PREFIX_RAND)
}

export function verifyToken(token: string, hash: string): boolean {
  const a = Buffer.from(hashToken(token), 'hex')
  const b = Buffer.from(hash, 'hex')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
