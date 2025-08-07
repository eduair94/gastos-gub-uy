// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  // Your custom configs here
  {
    rules: {
      // Fix for Vuetify data table slots
      'vue/valid-v-slot': ['error', {
        allowModifiers: true,
      }],
      // Allow any types for rapid prototyping
      '@typescript-eslint/no-explicit-any': 'off',
      // Allow unused variables that start with underscore
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
    },
  },
)
