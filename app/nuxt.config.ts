// https://nuxt.com/docs/api/configuration/nuxt-config
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import vuetify, { transformAssetUrls } from 'vite-plugin-vuetify'

// The public origin. Needed by sitemap/robots and to emit absolute
// canonical + og:url tags, which must never be relative.
// gastos.gub.uy does not resolve (no DNS) — the real, live domain is
// conlatuya.checkleaked.cc. Emitting canonical/OG/sitemap/JSON-LD URLs
// against a dead domain meant none of it was actually crawlable.
const siteUrl = process.env.NUXT_PUBLIC_SITE_URL || 'https://conlatuya.checkleaked.cc'

// Firebase Web SDK config (public, safe to expose). Prefers NUXT_PUBLIC_FIREBASE_*
// env vars; otherwise reads app/firebase.json (present at build time, gitignored).
const firebaseWeb = (() => {
  const env = {
    apiKey: process.env.NUXT_PUBLIC_FIREBASE_API_KEY || '',
    authDomain: process.env.NUXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
    projectId: process.env.NUXT_PUBLIC_FIREBASE_PROJECT_ID || '',
    appId: process.env.NUXT_PUBLIC_FIREBASE_APP_ID || '',
  }
  if (env.apiKey) return env
  try {
    const p = resolve(process.cwd(), 'firebase.json')
    if (existsSync(p)) {
      const j = JSON.parse(readFileSync(p, 'utf8'))
      if (j.apiKey) return { apiKey: j.apiKey, authDomain: j.authDomain || '', projectId: j.projectId || '', appId: j.appId || '' }
    }
  }
  catch {
    // fall through to env (possibly empty → auth surface stays hidden)
  }
  return env
})()

export default defineNuxtConfig({
  devtools: { enabled: true },

  // Server source maps are disabled: on Windows a cold production build races the
  // `nuxt:sourcemap-import` plugin against the freshly-written server chunks
  // (`ENOENT … .nuxt/dist/server/_nuxt/<Component>-<hash>.js`), which fails the
  // build nondeterministically. Server maps only aid server-stack debugging, so
  // dropping them makes `nuxt build` reliable at no prod cost. Client maps stay on.
  sourcemap: { server: false, client: true },

  // Mirror tsconfig's `#shared/*` -> ../shared/* into the Vite/Nitro build. Nuxt's built-in
  // `#shared` resolves to <rootDir>/shared (app/shared, which does not exist here — the shared code
  // lives one level up at the repo root). Without this, any PAGE that imports `#shared/...`
  // (e.g. contracts/[id].vue -> #shared/utils/units) fails the production build with an ENOENT,
  // even though tsconfig and the dev server resolve it fine.
  alias: {
    '#shared': resolve(process.cwd(), '../shared'),
  },

  typescript: {
    strict: true,
    typeCheck: false, // vue-tsc chokes on the shared/ models outside app/
  },

  css: [
    // NOT 'vuetify/styles' (294 KB): that file is reset + elements + a 235 KB
    // utility layer, and it is render-blocking on every page. These two are
    // generated from it by `npm run build:vuetify-utilities` — the same base
    // minus the utility layer (20 KB), plus verbatim copies of the ~40 utility
    // classes this app's templates actually use (5 KB).
    '~/assets/scss/vuetify-base.css',
    '~/assets/scss/vuetify-utilities-subset.css',
    // NOT '@mdi/font/css/materialdesignicons.css': that is 346 KB of CSS and a
    // 403 KB webfont for 7,400 icons, of which this app draws ~160. The subset
    // below is generated from the source by scripts/build-mdi-subset.mjs
    // (`npm run build:mdi-subset`) and is ~9 KB of each.
    '~/assets/scss/mdi-subset.scss',
    // NOT driver.js's stylesheet: composables/useTour.ts imports it alongside
    // the library the first time a guided tour actually runs.
    '~/assets/scss/main.scss',
  ],

  features: {
    // Nuxt's default is to inline the page's CSS into every SSR response. With
    // Vuetify's full stylesheet in the graph that made each HTML document ~970 KB
    // of mostly-identical CSS — re-parsed and re-downloaded on every entry, never
    // cached, and render-blocking by construction (FCP was 13 s on mobile).
    // Serving CSS as a normal hashed stylesheet lets it be cached once and shared
    // across every page.
    inlineStyles: false,
  },

  build: {
    transpile: ['vuetify'],
  },

  vite: {
    define: {
      'process.env.DEBUG': false,
    },
    ssr: {
      noExternal: ['vuetify'],
    },
    vue: {
      template: { transformAssetUrls },
    },
  },

  hooks: {
    // Tree-shake Vuetify. plugins/vuetify.ts used to do `import * as components
    // from 'vuetify/components'`, which registered all ~180 components and
    // dragged every one of their stylesheets into the entry bundle: ~1 MB of JS
    // and ~250 KB of component CSS on the critical path of a page that renders a
    // dozen of them. vite-plugin-vuetify resolves each component from the
    // template that actually uses it, so a page pays only for what it renders.
    'vite:extendConfig': (config) => {
      // `styles` is left at its default (each component imports its own
      // PRECOMPILED css). The `styles.configFile` route would let Vuetify's
      // SASS be reconfigured, but it recompiles the framework per component and
      // roughly doubled the production build; the utility layer is trimmed from
      // the plain CSS instead — see the css[] block above.
      config.plugins!.push(vuetify({ autoImport: true }))
    },
  },

  modules: [
    '@pinia/nuxt',
    '@vueuse/nuxt',
    '@nuxt/eslint',
    '@nuxt/fonts',
    '@nuxtjs/i18n',
    '@nuxtjs/sitemap',
    '@nuxtjs/robots',
    '@vite-pwa/nuxt',
    'nuxt-gtag',
  ],

  // Google Analytics 4. The module only *declares* the tag here — loading it is
  // plugins/analytics.client.ts's job, because whether we may measure at all
  // depends on the reader's consent (see composables/useConsent.ts).
  //
  // `initMode: 'manual'` keeps gtag.js off the wire until that decision is
  // known, while nuxt-gtag still queues initCommands into dataLayer first, so
  // the Consent Mode v2 defaults below are always the first thing GA sees.
  // `send_page_view: false` because SSR + i18n prefix routes + pageTransition
  // make gtag's automatic History tracking double-count; the plugin sends
  // page_view by hand instead.
  gtag: {
    id: process.env.NUXT_PUBLIC_GTAG_ID || 'G-E3V3E1LLC0',
    initMode: 'manual',
    loadingStrategy: 'defer',
    config: {
      send_page_view: false,
      anonymize_ip: true,
    },
    initCommands: [
      ['consent', 'default', {
        analytics_storage: 'denied',
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
        // Give the banner a moment to grant consent before the first hit is
        // modelled as cookieless — avoids losing the entry page of a reader
        // who accepts immediately.
        wait_for_update: 500,
      }],
    ],
  },

  // Installable PWA + the service worker that receives Web Push. injectManifest
  // (not generateSW) because we ship a custom SW with push/notificationclick
  // handlers. Runtime caching is deliberately NOT configured: only the hashed
  // build assets are precached, so SSR pages and /api responses always hit the
  // network and are never served stale.
  pwa: {
    strategies: 'injectManifest',
    srcDir: 'service-worker',
    filename: 'sw.ts',
    registerType: 'autoUpdate',
    injectRegister: 'auto',
    manifest: {
      name: 'Con la tuya, contribuyente',
      short_name: 'Con la tuya',
      description: 'Monitor de compras del Estado uruguayo: seguí llamados, gastos y anomalías.',
      lang: 'es-UY',
      theme_color: '#0f2233',
      background_color: '#0f2233',
      display: 'standalone',
      orientation: 'portrait',
      start_url: '/app',
      scope: '/',
      icons: [
        { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
        { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
        { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    injectManifest: {
      globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
      // The Nuxt client entry chunk can exceed the 2 MiB default.
      maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
    },
    // The SW is off in `nuxt dev` — a caching SW over the HMR dev server is the
    // classic stale-asset trap. Test installability against a production preview.
    devOptions: {
      enabled: false,
      type: 'module',
      suppressWarnings: true,
    },
  },

  // Archivo carries the display voice, Public Sans the body, IBM Plex
  // Mono every peso figure and identifier. Self-hosted so there is no
  // third-party request on a public-interest site.
  fonts: {
    families: [
      { name: 'Archivo', provider: 'google', weights: [600, 700, 800], styles: ['normal'] },
      { name: 'Public Sans', provider: 'google', weights: [400, 500, 600, 700], styles: ['normal'] },
      { name: 'IBM Plex Mono', provider: 'google', weights: [400, 500, 600], styles: ['normal'] },
    ],
    defaults: {
      preload: true,
    },
  },

  i18n: {
    strategy: 'prefix_except_default',
    defaultLocale: 'es',
    locales: [
      { code: 'es', language: 'es-UY', name: 'Español', file: 'es.json', dir: 'ltr' },
      { code: 'en', language: 'en', name: 'English', file: 'en.json', dir: 'ltr' },
    ],
    lazy: true,
    // The audience is Uruguayan and the data is Spanish. Never let a
    // browser Accept-Language header bounce a visitor to /en.
    detectBrowserLanguage: false,
    bundle: { optimizeTranslationDirective: false },
    baseUrl: siteUrl,
  },

  site: {
    url: siteUrl,
    name: 'Con la tuya, contribuyente',
    defaultLocale: 'es',
  },

  sitemap: {
    autoLastmod: true,
    // The static page scanner (nuxt:pages, the implicit `pages` sitemap below)
    // only ever sees the ~50 static routes — every entity detail page
    // ([id]/[slug]/[code]/[compraId]) has to be listed explicitly. Each is its
    // own NAMED sitemap (not one combined `sources` array) so @nuxtjs/sitemap
    // actually auto-chunks past `defaultSitemapsChunkSize` — a single giant
    // source rendered as one ~45MB, 40s file mixing every entity type, nowhere
    // near Google's 50k-URLs-per-file limit. See server/api/__sitemap__/*.ts.
    defaultSitemapsChunkSize: 5000,
    sitemaps: {
      pages: {},
      buyers: { sources: ['/api/__sitemap__/buyers'] },
      suppliers: { sources: ['/api/__sitemap__/suppliers'] },
      products: { sources: ['/api/__sitemap__/products'] },
      contracts: { sources: ['/api/__sitemap__/contracts'] },
      llamados: { sources: ['/api/__sitemap__/llamados'] },
      cases: { sources: ['/api/__sitemap__/cases'] },
    },
  },

  robots: {
    // `/api/` is deliberately NOT disallowed: pages hydrate from it, and
    // blocking it would let a crawler render a page with its data
    // missing. It is uninteresting to index but harmless to fetch.
    // Filtered explorer permutations are handled by a per-page noindex
    // rather than a path rule, since they differ only by query string.
    disallow: [],
  },

  nitro: {
    experimental: {
      wasm: true,
    },
    // Pre-compression is intentionally OFF. Nitro only writes a `.br`/`.gz` for
    // chunks above its size threshold (here 53 of 60 .js had a `.br`), yet its
    // asset manifest lists every chunk — so a request for a small, uncompressed
    // chunk sent with `Accept-Encoding: br` tries to open the missing `<chunk>.br`
    // and throws ENOENT → an unhandled 500 (a genuinely absent chunk 404s fine).
    // After every redeploy, browsers holding old HTML request now-gone chunks and
    // hit that 500 instead of a clean 404, which also defeats Nuxt's
    // reload-on-stale-chunk recovery. The reverse proxy compresses on the wire, so
    // dropping build-time compression costs nothing and removes the 500 class.
    compressPublicAssets: false,
    // The deploy script builds to a staging dir (.output-next) via this env so a
    // failed build never clobbers the live .output. Unset → default .output.
    ...(process.env.NITRO_OUTPUT_DIR ? { output: { dir: process.env.NITRO_OUTPUT_DIR } } : {}),
  },

  compatibilityDate: '2025-08-06',

  runtimeConfig: {
    // NOTE: the Mongo connection string is deliberately NOT declared here.
    // A `runtimeConfig` default is evaluated at BUILD time and baked into
    // `.output/server/chunks/nitro/nitro.mjs`, which wrote the production DB
    // password into a build artifact on every deploy. Nothing read these keys —
    // the server connects through shared/config.ts, which reads
    // process.env.MONGODB_URI at RUNTIME (dotenv, override:true). Keep it that way.
    //
    // Firebase Admin credentials are read directly from process.env by
    // server/utils/firebase-admin.ts (FIREBASE_PROJECT_ID / _CLIENT_EMAIL /
    // _PRIVATE_KEY) — kept out of runtimeConfig so the private key never risks
    // leaking into the public bundle.

    public: {
      apiBase: '/api',
      siteUrl,
      // Every contract links back to its official record here. If the
      // source ever moves, this is the only place to change.
      sourceBase: 'https://www.comprasestatales.gub.uy/ocds/release',
      // Firebase Web SDK config — safe to expose (client auth needs it).
      // Loaded from env or app/firebase.json (see firebaseWeb above).
      firebase: firebaseWeb,
      // Public VAPID key — the browser needs it to subscribe to Web Push.
      // Empty → the push UI stays hidden. (The API also exposes it at
      // /api/push/vapid-key for a runtime check.)
      vapidPublicKey: process.env.NUXT_PUBLIC_VAPID_PUBLIC_KEY || '',
      // Telegram bot username, for building the t.me/<bot> link client-side.
      telegramBotUsername: process.env.TELEGRAM_BOT_USERNAME || '',
    },
  },

  app: {
    // One short cross-fade on navigation. Enough to make the app feel
    // continuous rather than stuttering between full page swaps; short
    // enough that it never delays a reader. `prefers-reduced-motion` is
    // honoured globally in main.scss.
    pageTransition: { name: 'page', mode: 'out-in' },
    layoutTransition: { name: 'page', mode: 'out-in' },

    head: {
      htmlAttrs: { lang: 'es-UY' },
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'theme-color', content: '#0f2233' },
        { name: 'format-detection', content: 'telephone=no' },
        // PWA / iOS installability hints.
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
        { name: 'apple-mobile-web-app-title', content: 'Con la tuya' },
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
        // 180x180 asset generated by @vite-pwa/assets-generator (was a 404 before).
        { rel: 'apple-touch-icon', href: '/apple-touch-icon-180x180.png' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon-180x180.png' },
        // The PWA manifest. @vite-pwa/nuxt serves /manifest.webmanifest but does
        // not always inject the <link>; declare it explicitly so the app is
        // installable regardless of the module's head handling.
        { rel: 'manifest', href: '/manifest.webmanifest' },
      ],
    },
  },

  ssr: true,

  experimental: {
    defaults: {
      nuxtLink: {
        // Prefetch route chunks on hover/focus, NOT when a link scrolls into
        // view (Nuxt's default). This is a link-dense dashboard — the nav alone
        // is a dozen links, plus every table row and card — so visibility
        // prefetch downloaded dozens of route chunks during the idle window
        // right after load. That was the dominant contributor to bootup-time,
        // mainthread-work and unused-javascript failing on all 47 routes.
        // Interaction prefetch keeps navigation instant (the chunk is fetched
        // the instant a pointer touches the link) while paying for only the
        // links a reader actually reaches for.
        prefetchOn: { visibility: false, interaction: true },
      },
    },
  },

  eslint: {
    config: {
      stylistic: true,
    },
  },

  devServer: {
    port: 3600,
  },
})
