// https://nuxt.com/docs/api/configuration/nuxt-config

// The public origin. Needed by sitemap/robots and to emit absolute
// canonical + og:url tags, which must never be relative.
const siteUrl = process.env.NUXT_PUBLIC_SITE_URL || 'https://gastos.gub.uy'

export default defineNuxtConfig({
  devtools: { enabled: true },

  typescript: {
    strict: true,
    typeCheck: false, // vue-tsc chokes on the shared/ models outside app/
  },

  css: [
    'vuetify/styles',
    '@mdi/font/css/materialdesignicons.css',
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
    compressPublicAssets: true,
  },

  compatibilityDate: '2025-08-06',

  runtimeConfig: {
    mongoUri: process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017',
    mongoDatabase: process.env.MONGODB_DB || process.env.MONGO_DATABASE || 'gastos_gub',

    public: {
      apiBase: '/api',
      siteUrl,
      // Every contract links back to its official record here. If the
      // source ever moves, this is the only place to change.
      sourceBase: 'https://www.comprasestatales.gub.uy/ocds/release',
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
