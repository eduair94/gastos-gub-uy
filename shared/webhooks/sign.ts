import { createHmac, randomBytes } from 'node:crypto'

// Pure helpers shared by the webhook API endpoints (app/) and the cron-server
// dispatcher (src/): HMAC signing, secret generation and SSRF-safe URL checks.
// No mongoose / no runtime deps beyond node:crypto so both sides can import it.

/** `X-GastosGub-Signature` value: `sha256=<hex hmac(secret, rawBody)>`. */
export function signPayload(secret: string, rawBody: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex')
}

export function generateWebhookSecret(): string {
  return 'whsec_' + randomBytes(24).toString('base64url')
}

// Reject anything that isn't a plain public HTTPS host: no other scheme, no
// localhost, no private/link-local/CGNAT IPv4, no IPv6 literals. This blocks the
// obvious SSRF via a webhook target pointed at internal infrastructure. (Full
// DNS-rebinding defence would require resolving at delivery time — out of scope;
// documented.)
export function assertSafeWebhookUrl(raw: string): void {
  let url: URL
  try {
    url = new URL(raw)
  }
  catch {
    throw new Error('URL inválida')
  }
  if (url.protocol !== 'https:') {
    throw new Error('La URL debe ser https://')
  }
  const host = url.hostname.toLowerCase()

  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.localhost')) {
    throw new Error('Host no permitido')
  }
  // IPv6 literals arrive bracketed → URL strips the brackets, leaving colons.
  if (host.includes(':')) {
    throw new Error('Direcciones IPv6 no permitidas')
  }
  // IPv4 literal → block private / loopback / link-local / CGNAT ranges.
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])]
    const isPrivate
      = a === 0 || a === 10 || a === 127
        || (a === 169 && b === 254) // link-local
        || (a === 172 && b >= 16 && b <= 31) // private
        || (a === 192 && b === 168) // private
        || (a === 100 && b >= 64 && b <= 127) // CGNAT
        || a >= 224 // multicast / reserved
    if (isPrivate) throw new Error('Rango de IP no permitido')
  }
}
