// https://nuxt.com/docs/api/configuration/nuxt-config
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// The public origin. Needed by sitemap/robots and to emit absolute
// canonical + og:url tags, which must never be relative.
const siteUrl = process.env.NUXT_PUBLIC_SITE_URL || 'https://gastos.gub.uy'

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
    'vuetify/styles',
    '@mdi/font/css/materialdesignicons.css',
    'driver.js/dist/driver.css',
    '~/assets/scss/main.scss',
  ],

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
  },

  modules: [
    '@pinia/nuxt',
    '@vueuse/nuxt',
    '@nuxt/eslint',
    '@nuxt/fonts',
    '@nuxtjs/i18n',
    '@nuxtjs/sitemap',
    '@nuxtjs/robots',
  ],

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
    mongoUri: process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017',
    mongoDatabase: process.env.MONGODB_DB || process.env.MONGO_DATABASE || 'gastos_gub',

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
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      ],
    },
  },

  ssr: true,

  eslint: {
    config: {
      stylistic: true,
    },
  },

  devServer: {
    port: 3600,
  },
})
