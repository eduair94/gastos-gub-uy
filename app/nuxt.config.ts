// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  devtools: { enabled: true },

  // TypeScript configuration
  typescript: {
    strict: true,
    typeCheck: false, // Disable type checking to avoid vue-tsc issues
  },

  // CSS framework
  css: [
    'vuetify/styles',
    '@mdi/font/css/materialdesignicons.css',
    '~/assets/scss/main.scss',
  ],

  // Build configuration
  build: {
    transpile: ['vuetify'],
  },

  // Vite configuration for Vuetify
  vite: {
    define: {
      'process.env.DEBUG': false,
    },
    ssr: {
      noExternal: ['vuetify'],
    },
  },

  // Modules
  modules: [
    '@pinia/nuxt',
    '@vueuse/nuxt',
    '@nuxt/eslint',
  ],

  // Nitro configuration
  nitro: {
    experimental: {
      wasm: true,
    },
  },

  // Compatibility date
  compatibilityDate: '2025-08-06',

  // Runtime config
  runtimeConfig: {
    // Private keys (only available on server-side)
    mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017',
    mongoDatabase: process.env.MONGO_DATABASE || 'gastos_gub',

    // Public keys (exposed to client-side)
    public: {
      apiBase: '/api', // Use integrated API endpoints
      appName: 'Con la tuya contribuyente - Transparency Dashboard',
      appDescription: 'Uruguay Government Contracts Analytics Platform',
    },
  },

  // App configuration
  app: {
    head: {
      title: 'Con la tuya contribuyente - Government Transparency Dashboard',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        {
          name: 'description',
          content: 'Interactive dashboard for exploring Uruguay government contract data, promoting transparency and accountability in public spending.',
        },
        { name: 'keywords', content: 'uruguay, government, contracts, transparency, public spending, analytics' },
        { name: 'author', content: 'Government Transparency Initiative' },
      ],
      link: [
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
      ],
    },
  },

  // Server-side rendering
  ssr: true,

  // ESLint configuration
  eslint: {
    config: {
      stylistic: true,
    },
  },

  // Development configuration
  devServer: {
    port: 3600,
  },
})
