// Cookie-consent state for Google Analytics.
//
// Three states, and the difference between two of them matters legally:
//
//   'unset'   — no decision yet. GA loads under Consent Mode with
//               analytics_storage denied, so it sends cookieless pings and
//               writes NOTHING to the device. The banner is shown.
//   'granted' — the reader accepted. Consent is updated to granted and GA
//               behaves normally (writes _ga cookies).
//   'denied'  — the reader refused. gtag.js is never loaded at all and the
//               `ga-disable-<id>` kill switch is set, so not a single request
//               leaves the browser.
//
// Persisted in localStorage under the site's existing `cltc-*` namespace
// (see cltc-theme, cltc-tour:v1). Bump VERSION to re-ask everyone after a
// material change to what we measure.

export type ConsentChoice = 'granted' | 'denied'
export type ConsentState = ConsentChoice | 'unset'

const STORAGE_KEY = 'cltc-consent'
const VERSION = 1

interface StoredConsent {
  v: number
  choice: ConsentChoice
  at: string
}

function read(): ConsentState {
  if (!import.meta.client) return 'unset'
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return 'unset'
    const parsed = JSON.parse(raw) as StoredConsent
    if (parsed.v !== VERSION) return 'unset'
    return parsed.choice === 'granted' || parsed.choice === 'denied' ? parsed.choice : 'unset'
  }
  catch {
    // Corrupt or unavailable storage (private mode) — treat as undecided.
    return 'unset'
  }
}

function write(choice: ConsentChoice) {
  if (!import.meta.client) return
  try {
    const payload: StoredConsent = { v: VERSION, choice, at: new Date().toISOString() }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  }
  catch {
    // Storage blocked — the decision still applies for this session.
  }
}

export function useConsent() {
  // Always starts 'unset' on the server so SSR markup never depends on a
  // client-only value (that would be a hydration mismatch); the plugin
  // hydrates the real state on mount.
  const state = useState<ConsentState>('consent:analytics', () => 'unset')
  const hydrated = useState<boolean>('consent:hydrated', () => false)

  /** The banner shows only once we know there is genuinely no decision yet. */
  const showBanner = computed(() => hydrated.value && state.value === 'unset')

  function hydrate() {
    state.value = read()
    hydrated.value = true
  }

  function accept() {
    write('granted')
    state.value = 'granted'
  }

  function reject() {
    write('denied')
    state.value = 'denied'
  }

  /** Used by /cookies to let a reader change their mind — brings the banner back. */
  function reopen() {
    if (import.meta.client) {
      try {
        window.localStorage.removeItem(STORAGE_KEY)
      }
      catch { /* ignore */ }
    }
    state.value = 'unset'
    hydrated.value = true
  }

  return { state, hydrated, showBanner, hydrate, accept, reject, reopen }
}
