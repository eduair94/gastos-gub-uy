// Wires Google Analytics 4 to the app. Owns four things nothing else should:
//
//  1. Consent. gtag.js is only *loaded* once we know we may measure at all;
//     until a reader decides, Consent Mode v2 keeps analytics_storage denied
//     so no cookie is written. A refusal sets Google's own kill switch.
//  2. page_view. Sent by hand (`send_page_view: false` in nuxt.config) because
//     this is an SSR app with `pageTransition` and i18n prefix routes — gtag's
//     automatic History listener double-counts and misses the locale.
//  3. Outbound links. One delegated listener covers ~45 external-link sites
//     (gov records, pliego PDFs, GitHub, donation links) instead of 45 edits.
//  4. user_id. A SHA-256 of the Firebase uid, never the uid itself, and only
//     while consent is granted.

import { registerGtag, trackEvent } from '~/composables/useAnalytics'

/** Hosts where measurement stays off unless explicitly asked for with ?ga_debug=1. */
const DEV_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]'])

/** Extensions that mean "the reader opened a source document", not just a link. */
const DOC_EXT = /\.(pdf|docx?|xlsx?|csv|zip|odt|ods)(\?|#|$)/i

async function hashUid(uid: string): Promise<string | null> {
  try {
    const bytes = new TextEncoder().encode(`cltc:${uid}`)
    const digest = await crypto.subtle.digest('SHA-256', bytes)
    return Array.from(new Uint8Array(digest))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 32)
  }
  catch {
    // No SubtleCrypto (insecure origin) — better no user_id than a raw one.
    return null
  }
}

export default defineNuxtPlugin({
  name: 'analytics',
  parallel: true,
  setup(nuxtApp) {
    const gtagOptions = useRuntimeConfig().public.gtag as { id?: string } | undefined
    const tagId = gtagOptions?.id
    if (!tagId) return

    const debug = new URLSearchParams(window.location.search).has('ga_debug')
    const devHost = DEV_HOSTS.has(window.location.hostname)
    // On a dev host we still run the whole pipeline (so instrumentation can be
    // verified) but log instead of sending, keeping the prod property clean.
    const dryRun = devHost && !debug

    const { gtag, initialize, disableAnalytics, enableAnalytics } = useGtag()
    const consent = useConsent()
    const { user } = useAuth()

    let loaded = false
    let lastPath = ''

    function send(...args: unknown[]) {
      if (dryRun) {
        console.debug('[analytics:dry-run]', ...args)
        return
      }
      gtag(...(args as Parameters<typeof gtag>))
    }

    function load() {
      if (loaded || dryRun) return
      loaded = true
      // initialize() calls useHead internally, which needs the Nuxt instance —
      // we are past setup by the time consent resolves.
      nuxtApp.runWithContext(() => initialize())
    }

    function applyConsent(state: typeof consent.state.value) {
      if (state === 'denied') {
        // Google's documented per-property opt-out: no request is ever made.
        disableAnalytics()
        registerGtag(() => {}, dryRun || debug)
        return
      }

      enableAnalytics()
      registerGtag(send, dryRun || debug)

      if (state === 'granted') {
        send('consent', 'update', {
          analytics_storage: 'granted',
          ad_storage: 'denied',
          ad_user_data: 'denied',
          ad_personalization: 'denied',
        })
      }
      load()
    }

    function pageView(path: string) {
      if (path === lastPath) return
      lastPath = path
      trackEvent('page_view', {
        page_path: path,
        page_title: document.title,
        page_location: window.location.href,
        locale: nuxtApp.$i18n ? (nuxtApp.$i18n as { locale: { value: string } }).locale.value : undefined,
        logged_in: !!user.value,
      })
    }

    // ── Consent bootstrap ────────────────────────────────────────────────
    consent.hydrate()
    applyConsent(consent.state.value)
    watch(consent.state, (state) => {
      applyConsent(state)
      if (state === 'granted') trackEvent('consent_granted')
      else if (state === 'denied') trackEvent('consent_denied')
    })

    // ── user_id, only while consent is granted ───────────────────────────
    watch(
      () => (consent.state.value === 'granted' ? user.value?.uid : undefined),
      async (uid) => {
        if (!uid) {
          send('set', { user_id: undefined })
          return
        }
        const hashed = await hashUid(uid)
        if (hashed) send('set', { user_id: hashed })
      },
      { immediate: true },
    )

    // ── page_view ────────────────────────────────────────────────────────
    const router = useRouter()
    router.afterEach((to) => {
      // Wait for the page's own useSeo()/useHead to settle the title.
      nextTick(() => setTimeout(() => pageView(to.fullPath), 0))
    })
    nuxtApp.hook('app:mounted', () => pageView(router.currentRoute.value.fullPath))

    // ── Outbound links & source documents ────────────────────────────────
    document.addEventListener(
      'click',
      (event) => {
        const target = event.target as HTMLElement | null
        const anchor = target?.closest?.('a[href]') as HTMLAnchorElement | null
        if (!anchor) return
        const href = anchor.getAttribute('href') || ''
        if (!href || href.startsWith('#')) return

        if (href.startsWith('mailto:') || href.startsWith('tel:')) {
          trackEvent('outbound_click', { kind: href.split(':')[0], link_domain: 'contact' })
          return
        }

        let url: URL
        try {
          url = new URL(anchor.href, window.location.origin)
        }
        catch {
          return
        }
        if (!url.protocol.startsWith('http')) return

        const external = url.host !== window.location.host
        const isDoc = DOC_EXT.test(url.pathname)

        if (isDoc) {
          trackEvent('document_open', {
            link_domain: url.host,
            link_url: url.href,
            kind: (url.pathname.match(DOC_EXT)?.[1] || 'file').toLowerCase(),
            external,
          })
          return
        }
        if (!external) return

        trackEvent('outbound_click', {
          link_domain: url.host,
          link_url: url.href,
          kind: url.host.includes('comprasestatales')
            ? 'gov'
            : url.host.includes('github')
              ? 'github'
              : url.host.includes('t.me')
                ? 'telegram'
                : 'other',
        })
      },
      { capture: true, passive: true },
    )
  },
})
