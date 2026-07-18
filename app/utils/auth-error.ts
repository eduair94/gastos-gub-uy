// Maps a Firebase auth error (or an h3 error from the session endpoint) to a
// user-facing message. Most Firebase codes collapse to a single generic line —
// we never leak which of email/password was wrong. Returns '' for the benign
// popup-closed case so the UI shows nothing.
export function authError(e: unknown, t: (key: string) => string): string {
  const code = (e as { code?: string })?.code || ''
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return ''

  const server = e as { data?: { statusMessage?: string }, statusMessage?: string }
  if (server?.data?.statusMessage) return server.data.statusMessage

  return t('auth.genericError')
}
