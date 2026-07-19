/**
 * Cold-email CTA landing support: `/registro?rubro=<sice code>` pre-creates a
 * tender-alert watch right after signup, so the promise in the email ("te
 * avisamos cuando abra un llamado en tu rubro") is already true when the user
 * lands in the app.
 *
 * Pure on purpose — the page just posts the result to /api/watches, whose
 * `parseWatchPayload` requires a non-empty `name` plus at least one of
 * categories/keywords/buyers. `categories` holds SICE tokens, and the campaign's
 * rubro code IS a SICE article code (== OCDS classification.id), so it drops
 * straight in.
 *
 * Returns null for anything that isn't a plausible code, so a tampered or
 * malformed query string never becomes a POST.
 */

/** Server-side cap in app/server/utils/watch-input.ts. */
const NAME_MAX = 120

/** SICE codes are numeric-ish tokens (article codes / rubro nodes). */
const CODE_RE = /^[A-Za-z0-9.\-_]{1,64}$/

export interface RubroWatchPayload {
  name: string
  categories: string[]
  active: boolean
}

export function buildRubroWatchPayload(rubroCode: string, rubroLabel?: string): RubroWatchPayload | null {
  const code = (rubroCode ?? '').trim()
  if (!code || !CODE_RE.test(code)) return null
  const label = (rubroLabel ?? '').trim() || code
  return {
    name: `Llamados en ${label}`.slice(0, NAME_MAX),
    categories: [code],
    active: true,
  }
}
