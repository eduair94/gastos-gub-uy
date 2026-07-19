export type Audience = 'empresa' | 'ciudadano'

const STORAGE_KEY = 'gg.audience'

// Which audience the visitor identifies as, driving the segmented hook copy/CTAs.
// Shared across the /llamados band and the call-detail slot (and persisted) so the
// choice made in one place carries to the other. Default 'empresa' — someone looking
// at an open tender is most often a bidder.
export function useAudience() {
  const audience = useState<Audience>('audience', () => 'empresa')
  // Restore from storage in onMounted (not setup): SSR renders the 'empresa' default,
  // so the client's first paint must match it too — swapping during setup would trip a
  // hydration mismatch. `hydrated` guards against re-reading storage on every remount,
  // which would clobber an in-session toggle before the user navigates.
  const hydrated = useState<boolean>('audience-hydrated', () => false)

  onMounted(() => {
    if (hydrated.value) return
    hydrated.value = true
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === 'empresa' || stored === 'ciudadano') {
      audience.value = stored
    }
  })

  function setAudience(next: Audience) {
    audience.value = next
    if (import.meta.client) {
      window.localStorage.setItem(STORAGE_KEY, next)
    }
  }

  return { audience, setAudience }
}
