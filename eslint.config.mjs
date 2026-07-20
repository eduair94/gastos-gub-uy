// Root ESLint config (flat, ESLint 9) for the NON-Nuxt half of the repo: src/, shared/, scripts/,
// tests/. The dashboard has its own config at app/eslint.config.mjs and is ignored here.
//
// Before this existed, `npm run lint` simply crashed ("ESLint couldn't find an eslint.config file"),
// so the script was dead weight. Rules stay close to plain `recommended`; the downgrades below are
// documented rather than silently disabled.
import tseslint from '@typescript-eslint/eslint-plugin'
import tsparser from '@typescript-eslint/parser'

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'app/**',
      'packages/*/dist/**',
      'database-export/**',
      'data/**',
      '.scratch/**',
    ],
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsparser,
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      ...tseslint.configs.recommended.rules,

      // This half of the repo compiles to CommonJS (tsconfig.json → "module": "CommonJS") and uses
      // lazy `require()` in a few hot paths on purpose. Warn so new ones stay visible, but do not
      // fail the run over an intentional pattern.
      '@typescript-eslint/no-require-imports': 'warn',
      '@typescript-eslint/no-unsafe-function-type': 'warn',

      // Mongo aggregation pipelines and OCDS payloads are genuinely dynamic; `any` there is honest.
      '@typescript-eslint/no-explicit-any': 'off',

      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
]
