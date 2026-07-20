#!/usr/bin/env node
// Builds a Material Design Icons subset containing ONLY the glyphs this app
// renders.
//
// Why: `@mdi/font` ships 7,400+ icons — a 403 KB woff2 and a 346 KB stylesheet.
// Nuxt inlines app CSS into every SSR response, so that stylesheet was being
// re-sent on every single page view, and the webfont was a third of a megabyte
// downloaded to draw ~150 glyphs. Subsetting cuts both by ~97% and is the single
// largest Lighthouse performance win available here.
//
// The icon set is discovered, not hand-listed:
//   1. every `mdi-*` literal anywhere in app/ source (pages, components,
//      composables, locales, data), plus
//   2. every alias Vuetify's own components resolve internally
//      (`$expand` -> mdi-chevron-down and friends) — miss these and checkboxes,
//      sort arrows and pagination lose their glyphs.
//
// Run `npm run build:mdi-subset` after adding an icon. build-mdi-subset.check
// (see below) fails loudly if the committed subset is missing an icon the
// source now uses, so a stale subset cannot ship silently.
//
// Outputs (both committed):
//   app/assets/fonts/mdi-subset.woff2
//   app/assets/scss/mdi-subset.scss

import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs'
import { join, dirname, resolve, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import subsetFont from 'subset-font'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(__dirname, '..')
const APP = join(REPO, 'app')
const MDI = join(APP, 'node_modules', '@mdi', 'font')
const VUETIFY_MDI = join(APP, 'node_modules', 'vuetify', 'lib', 'iconsets', 'mdi.js')

const OUT_FONT = join(APP, 'assets', 'fonts', 'mdi-subset.woff2')
const OUT_CSS = join(APP, 'assets', 'scss', 'mdi-subset.scss')

const SCAN_DIRS = ['pages', 'components', 'layouts', 'composables', 'plugins', 'utils', 'stores', 'i18n', 'data', 'server', 'middleware', 'types']
const SCAN_EXT = new Set(['.vue', '.ts', '.js', '.mjs', '.json', '.scss', '.css'])

const CHECK = process.argv.includes('--check')

// ---------------------------------------------------------------- discovery
function* walk(dir) {
  let entries
  try { entries = readdirSync(dir) }
  catch { return }
  for (const name of entries) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) yield * walk(p)
    else if (SCAN_EXT.has(extname(name))) yield p
  }
}

function usedIconNames() {
  const names = new Set()
  const add = (text) => {
    for (const m of text.matchAll(/\bmdi-[a-z0-9]+(?:-[a-z0-9]+)*/g)) names.add(m[0])
  }
  for (const d of SCAN_DIRS) for (const f of walk(join(APP, d))) add(readFileSync(f, 'utf8'))
  // Vuetify's internal aliases ($expand, $sort, $checkboxOn, …).
  add(readFileSync(VUETIFY_MDI, 'utf8'))
  // Class-name helpers in the base stylesheet are not icons.
  for (const helper of ['mdi-set', 'mdi-spin', 'mdi-flip-h', 'mdi-flip-v', 'mdi-light', 'mdi-dark', 'mdi-inactive']) names.delete(helper)
  for (const n of [...names]) if (/^mdi-(?:\d+px|rotate-\d+)$/.test(n)) names.delete(n)
  return names
}

// -------------------------------------------------------------- css parsing
const cssSrc = readFileSync(join(MDI, 'css', 'materialdesignicons.min.css'), 'utf8')

/** name -> codepoint rule, e.g. `.mdi-account::before{content:"\F0004"}` */
function iconRules() {
  const map = new Map()
  for (const m of cssSrc.matchAll(/\.(mdi-[a-z0-9-]+)::before\{content:"\\([0-9A-Fa-f]+)"\}/g)) {
    map.set(m[1], m[2])
  }
  return map
}

const rules = iconRules()
const wanted = [...usedIconNames()].sort()
const missing = wanted.filter(n => !rules.has(n))
const known = wanted.filter(n => rules.has(n))

if (missing.length) {
  // A literal that looks like an icon but is not one (a CSS class of our own,
  // a truncated name) is a warning, not a failure — it just cannot be subset.
  console.warn(`[mdi-subset] ${missing.length} mdi-* token(s) are not icons in @mdi/font: ${missing.slice(0, 12).join(', ')}${missing.length > 12 ? '…' : ''}`)
}

// ------------------------------------------------------------------- check
if (CHECK) {
  let css
  try { css = readFileSync(OUT_CSS, 'utf8') }
  catch {
    console.error('[mdi-subset] no committed subset — run `npm run build:mdi-subset`')
    process.exit(1)
  }
  const have = new Set([...css.matchAll(/\.(mdi-[a-z0-9-]+)::before/g)].map(m => m[1]))
  const absent = known.filter(n => !have.has(n))
  if (absent.length) {
    console.error(`[mdi-subset] STALE: ${absent.length} icon(s) used in source are absent from the subset:`)
    console.error('  ' + absent.join(', '))
    console.error('  run `npm run build:mdi-subset` and commit the result.')
    process.exit(1)
  }
  console.log(`[mdi-subset] ok — ${known.length} icons, subset is current`)
  process.exit(0)
}

// ------------------------------------------------------------------- build
const codepoints = known.map(n => String.fromCodePoint(parseInt(rules.get(n), 16)))
const ttf = readFileSync(join(MDI, 'fonts', 'materialdesignicons-webfont.ttf'))
const woff2 = await subsetFont(ttf, codepoints.join(''), { targetFormat: 'woff2' })

mkdirSync(dirname(OUT_FONT), { recursive: true })
writeFileSync(OUT_FONT, woff2)

const pkg = JSON.parse(readFileSync(join(MDI, 'package.json'), 'utf8'))
const header = `// GENERATED by scripts/build-mdi-subset.mjs — do not edit.
// @mdi/font ${pkg.version} subset to the ${known.length} icons this app renders
// (${(woff2.length / 1024).toFixed(1)} KB woff2 vs 403 KB for the full face).
// Add an icon in source, then run \`npm run build:mdi-subset\`.
`

const face = `@font-face {
  font-family: "Material Design Icons";
  src: url("../fonts/mdi-subset.woff2") format("woff2");
  font-weight: normal;
  font-style: normal;
  // The glyphs are pure decoration next to a text label; showing the label
  // immediately beats holding the whole line for an icon.
  font-display: swap;
}

.mdi::before,
.mdi-set {
  display: inline-block;
  font: normal normal normal 24px/1 "Material Design Icons";
  font-size: inherit;
  text-rendering: auto;
  line-height: inherit;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
`

// The size / rotate / flip / spin helpers from the upstream stylesheet, kept
// verbatim because Vuetify and our own markup reference them.
const helpers = `
.mdi-18px { font-size: 18px; }
.mdi-24px { font-size: 24px; }
.mdi-36px { font-size: 36px; }
.mdi-48px { font-size: 48px; }
.mdi-rotate-45::before { transform: rotate(45deg); }
.mdi-rotate-90::before { transform: rotate(90deg); }
.mdi-rotate-135::before { transform: rotate(135deg); }
.mdi-rotate-180::before { transform: rotate(180deg); }
.mdi-rotate-225::before { transform: rotate(225deg); }
.mdi-rotate-270::before { transform: rotate(270deg); }
.mdi-rotate-315::before { transform: rotate(315deg); }
.mdi-flip-h::before { transform: scaleX(-1); filter: FlipH; -ms-filter: "FlipH"; }
.mdi-flip-v::before { transform: scaleY(-1); filter: FlipV; -ms-filter: "FlipV"; }
.mdi-spin::before { animation: mdi-spin 2s infinite linear; }

@keyframes mdi-spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(359deg); }
}
`

const glyphs = known.map(n => `.${n}::before { content: "\\${rules.get(n)}"; }`).join('\n')

mkdirSync(dirname(OUT_CSS), { recursive: true })
writeFileSync(OUT_CSS, `${header}\n${face}${helpers}\n${glyphs}\n`)

console.log(`[mdi-subset] ${known.length} icons -> ${(woff2.length / 1024).toFixed(1)} KB woff2, ${(readFileSync(OUT_CSS).length / 1024).toFixed(1)} KB css`)
