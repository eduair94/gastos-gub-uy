import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { aliases, mdi } from 'vuetify/iconsets/mdi'

// Palette mirrors assets/scss/_tokens.scss. Vuetify needs literal hex
// values, so these two files must move together — tokens is the source
// of truth for anything CSS can reach.
const light = {
  'primary': '#3c6d9c', // celeste-deep — clears AA on paper
  'secondary': '#64757f', // grafito
  'accent': '#8a6318', // sol-deep. Reserved for money.
  'error': '#b2423b', // alerta
  'info': '#5e93c4', // celeste
  'success': '#3f7d62', // verde
  'warning': '#8a6318',
  'background': '#eef1f2', // paper
  'surface': '#ffffff',
  'surface-variant': '#e2e7e9',
  'on-primary': '#ffffff',
  'on-secondary': '#ffffff',
  'on-accent': '#ffffff',
  'on-background': '#0f2233', // ink
  'on-surface': '#0f2233',
  'on-surface-variant': '#0f2233',
  'on-error': '#ffffff',
  'on-success': '#ffffff',
  'on-info': '#0f2233',
  'on-warning': '#ffffff',
}

const dark = {
  'primary': '#7fb3dd',
  'secondary': '#93a7b4',
  'accent': '#e8bc63',
  'error': '#e0736a',
  'info': '#7fb3dd',
  'success': '#5fa584',
  'warning': '#e8bc63',
  'background': '#0b1a27',
  'surface': '#12283a',
  'surface-variant': '#0e2131',
  'on-primary': '#08161f',
  'on-secondary': '#08161f',
  'on-accent': '#08161f',
  'on-background': '#e6edf2',
  'on-surface': '#e6edf2',
  'on-surface-variant': '#e6edf2',
  'on-error': '#08161f',
  'on-success': '#08161f',
  'on-info': '#08161f',
  'on-warning': '#08161f',
}

export default defineNuxtPlugin((nuxtApp) => {
  const vuetify = createVuetify({
    ssr: true,
    components,
    directives,
    theme: {
      defaultTheme: 'contribuyente',
      themes: {
        contribuyente: { dark: false, colors: light },
        contribuyenteDark: { dark: true, colors: dark },
      },
      variations: {
        colors: ['primary', 'secondary'],
        lighten: 2,
        darken: 2,
      },
    },
    icons: { defaultSet: 'mdi', aliases, sets: { mdi } },
    // Vuetify 4 shrank the default breakpoint thresholds (md 960→840,
    // lg 1280→1145, xl 1920→1545). Restore the v3 values so the two
    // dialogs that use `cols/md/lg` and ContractRawDataDialog's
    // `useDisplay().mobile` switch at exactly the same widths as before.
    display: {
      mobileBreakpoint: 'lg',
      thresholds: { xs: 0, sm: 600, md: 960, lg: 1280, xl: 1920, xxl: 2560 },
    },
    defaults: {
      VCard: { elevation: 0, rounded: 'lg' },
      VBtn: { elevation: 0, rounded: 'md', variant: 'flat' },
      VTextField: { variant: 'outlined', density: 'comfortable', hideDetails: 'auto' },
      VSelect: { variant: 'outlined', density: 'comfortable', hideDetails: 'auto' },
      VAutocomplete: { variant: 'outlined', density: 'comfortable', hideDetails: 'auto' },
      VCombobox: { variant: 'outlined', density: 'comfortable', hideDetails: 'auto' },
      VDataTable: { density: 'comfortable' },
      VChip: { rounded: 'sm', variant: 'tonal' },
      VTooltip: { location: 'top' },
    },
  })

  nuxtApp.vueApp.use(vuetify)
})
