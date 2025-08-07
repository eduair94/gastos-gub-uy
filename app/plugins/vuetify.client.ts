import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { aliases, mdi } from 'vuetify/iconsets/mdi'

export default defineNuxtPlugin((nuxtApp) => {
  const vuetify = createVuetify({
    components,
    directives,
    theme: {
      defaultTheme: 'light',
      themes: {
        light: {
          dark: false,
          colors: {
            primary: '#1976D2',
            secondary: '#424242',
            accent: '#82B1FF',
            error: '#FF5252',
            info: '#2196F3',
            success: '#4CAF50',
            warning: '#FFC107',
            background: '#FAFAFA',
            surface: '#FFFFFF',
            'on-primary': '#FFFFFF',
            'on-secondary': '#FFFFFF',
            'on-surface': '#000000',
            'on-background': '#000000',
            'on-error': '#FFFFFF'
          }
        },
        dark: {
          dark: true,
          colors: {
            primary: '#2196F3',
            secondary: '#424242',
            accent: '#FF4081',
            error: '#FF5252',
            info: '#2196F3',
            success: '#4CAF50',
            warning: '#FB8C00',
            background: '#121212',
            surface: '#1E1E1E',
            'on-primary': '#FFFFFF',
            'on-secondary': '#FFFFFF',
            'on-surface': '#FFFFFF',
            'on-background': '#FFFFFF',
            'on-error': '#000000'
          }
        }
      }
    },
    icons: {
      defaultSet: 'mdi',
      aliases,
      sets: {
        mdi
      }
    },
    defaults: {
      VCard: {
        elevation: 2,
        rounded: 'lg'
      },
      VBtn: {
        elevation: 2,
        rounded: 'lg'
      },
      VTextField: {
        variant: 'outlined',
        density: 'comfortable'
      },
      VSelect: {
        variant: 'outlined',
        density: 'comfortable'
      },
      VDataTable: {
        density: 'comfortable'
      }
    }
  })

  nuxtApp.vueApp.use(vuetify)
})
