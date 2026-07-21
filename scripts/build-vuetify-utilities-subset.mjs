#!/usr/bin/env node
// Builds a Vuetify utility-class subset containing ONLY the classes this app's
// templates use.
//
// Why: `vuetify/styles` is 301 KB, and 240 KB of that is the utility layer —
// every spacing step, every breakpoint variant, every theme colour, ~30k rules.
// This app uses about forty of them. The stylesheet is render-blocking, so that
// dead weight lands directly on First Contentful Paint.
//
// The rules are COPIED, never re-derived: each one is lifted verbatim out of
// Vuetify's own compiled utilities.css (media queries and `!important` intact),
// so the subset cannot drift from what Vuetify would have rendered. Anything the
// scan cannot find is reported loudly rather than silently dropped.
//
// Run `npm run build:vuetify-utilities` after using a new utility class;
// `--check` fails if the committed subset is missing one the source now uses.

import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs'
import { join, dirname, resolve, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(__dirname, '..')
const APP = join(REPO, 'app')
const require = createRequire(join(APP, 'package.json'))
const postcss = require('postcss')

const UTILITIES = join(APP, 'node_modules', 'vuetify', 'lib', 'styles', 'utilities.css')
const MAIN = join(APP, 'node_modules', 'vuetify', 'lib', 'styles', 'main.css')
const OUT = join(APP, 'assets', 'scss', 'vuetify-utilities-subset.css')
const OUT_BASE = join(APP, 'assets', 'scss', 'vuetify-base.css')

const SCAN_DIRS = ['pages', 'components', 'layouts']
const SCAN_EXT = new Set(['.vue'])
const CHECK = process.argv.includes('--check')

// The prefixes Vuetify's utility layer owns. A class that starts with one of
// these and resolves to a rule in utilities.css is a utility; anything else is
// ours and lives in main.scss.
// A token must look like a bare class name; the `:class`/template-literal sweep
// below also sees CSS declarations ("align-items:") and interpolations
// ("d-${i}"), which are not classes and would only add noise to the report.
const UTILITY_PREFIX = /^(d|ma|mt|mb|ml|mr|mx|my|pa|pt|pb|pl|pr|px|py|text|align|justify|flex|w|h|order|rounded|elevation|position|overflow|gap|ga|gr|gc|fill|float|opacity|border|hidden)-[a-z0-9-]+$/

function* walk(dir) {
  let entries
  try { entries = readdirSync(dir) }
  catch { return }
  for (const name of entries) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) yield * walk(p)
    else if (SCAN_EXT.has(extname(name))) yield p
  }
}

/** Every class token that appears in a `class="..."` / `:class` string. */
function usedClasses() {
  const out = new Set()
  for (const d of SCAN_DIRS) {
    for (const f of walk(join(APP, d))) {
      const src = readFileSync(f, 'utf8')
      for (const m of src.matchAll(/class="([^"]*)"/g)) {
        for (const c of m[1].split(/\s+/)) if (UTILITY_PREFIX.test(c)) out.add(c)
      }
      // `:class` bindings and template literals: pick class-looking tokens out
      // of any quoted string in the file. Over-collecting is harmless (the class
      // simply exists in the subset); under-collecting is what breaks a layout.
      for (const m of src.matchAll(/'([^']*)'|`([^`]*)`/g)) {
        for (const c of (m[1] || m[2] || '').split(/\s+/)) if (UTILITY_PREFIX.test(c)) out.add(c)
      }
    }
  }
  return out
}

const wanted = usedClasses()
const root = postcss.parse(readFileSync(UTILITIES, 'utf8'))

// selector -> does it target exactly one of the classes we want?
const found = new Set()
const kept = []

root.walkRules((rule) => {
  const hits = rule.selectors.filter((sel) => {
    const m = sel.match(/^\.([A-Za-z0-9_-]+)$/)
    return m && wanted.has(m[1])
  })
  if (!hits.length) return
  for (const s of hits) found.add(s.slice(1))

  // Rebuild the rule with only the selectors we asked for, preserving whatever
  // at-rules (media queries, layers) it sits inside.
  const clone = rule.clone()
  clone.selectors = hits
  let node = clone
  let parent = rule.parent
  while (parent && parent.type === 'atrule') {
    const wrapper = parent.clone()
    wrapper.removeAll()
    wrapper.append(node)
    node = wrapper
    parent = parent.parent
  }
  kept.push(node)
})

const missing = [...wanted].filter(c => !found.has(c)).sort()

if (CHECK) {
  let css
  try { css = readFileSync(OUT, 'utf8') }
  catch {
    console.error('[vuetify-utilities] no committed subset — run `npm run build:vuetify-utilities`')
    process.exit(1)
  }
  const have = new Set([...css.matchAll(/\.([A-Za-z0-9_-]+)\s*[,{]/g)].map(m => m[1]))
  const absent = [...found].filter(c => !have.has(c))
  if (absent.length) {
    console.error(`[vuetify-utilities] STALE: ${absent.length} class(es) used in source are absent from the subset:`)
    console.error('  ' + absent.join(', '))
    console.error('  run `npm run build:vuetify-utilities` and commit the result.')
    process.exit(1)
  }
  console.log(`[vuetify-utilities] ok — ${found.size} classes, subset is current`)
  process.exit(0)
}

if (missing.length) {
  // These looked like utilities but Vuetify has no such rule — almost always a
  // class of our own (`.text-muted`, `.flex-fill-hero`). Harmless, but printed
  // so a genuine typo cannot hide among them.
  console.warn(`[vuetify-utilities] ${missing.length} class(es) matched the utility prefix but are not Vuetify utilities (assuming they are ours): ${missing.join(', ')}`)
}

const out = postcss.root()
out.append(postcss.comment({ text: ` GENERATED by scripts/build-vuetify-utilities-subset.mjs — do not edit.
   ${found.size} of Vuetify's utility classes, copied verbatim from
   vuetify/lib/styles/utilities.css (240 KB) because those are the ones this
   app's templates use. Regenerate with \`npm run build:vuetify-utilities\`. ` }))
for (const node of kept) out.append(node)

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, out.toString() + '\n')

// ---- the base layer, minus utilities --------------------------------------
// `vuetify/styles` (main.css) is reset + elements + utilities in one file. The
// utility layer is what we just replaced, so strip it and keep the rest.
//
// Done by editing the precompiled CSS rather than by recompiling Vuetify's SASS
// with `$utilities: false`: the SASS route (vite-plugin-vuetify's
// `styles.configFile`) recompiles Vuetify per component and roughly doubled the
// production build. The output here is byte-identical in effect and the build
// stays a plain CSS import.
//
// The utility RULES go; the layer DECLARATION stays. CSS orders cascade layers
// by first appearance, and main.css declares `vuetify-utilities` between
// `vuetify-overrides` and `vuetify-final`. Delete that declaration and the layer
// would instead be created by the subset file — which loads after — landing the
// utilities on the wrong side of `vuetify-final`'s transitions and trumps. So
// the empty `@layer vuetify-utilities { @layer …; }` shell is preserved in
// place, sub-layer order and all, and only the rules inside it are dropped.
const mainRoot = postcss.parse(readFileSync(MAIN, 'utf8'))
mainRoot.walkAtRules('layer', (rule) => {
  if (!/^vuetify-utilities\b/.test(rule.params)) return
  // `@layer vuetify-utilities.typography { … }` — a rule block, drop it whole.
  if (rule.params !== 'vuetify-utilities') { rule.remove(); return }
  // `@layer vuetify-utilities { … }` — keep the shell and any bare sub-layer
  // ordering statements inside it; drop everything that carries styles.
  for (const child of [...rule.nodes ?? []]) {
    const isOrderStatement = child.type === 'atrule' && child.name === 'layer' && child.nodes === undefined
    if (!isOrderStatement) child.remove()
  }
  // postcss omits the semicolon after a block's LAST child; for a block whose
  // children are all bare `@layer x;` statements that produces
  // `@layer a{@layer b}`, which esbuild warns about while parsing.
  rule.raws.semicolon = true
})
// Same for any block left holding only ordering statements.
mainRoot.walkAtRules('layer', (rule) => {
  if (rule.nodes?.length && rule.nodes.every(n => n.type === 'atrule' && n.nodes === undefined)) {
    rule.raws.semicolon = true
  }
})
const baseHeader = postcss.comment({ text: ` GENERATED by scripts/build-vuetify-utilities-subset.mjs — do not edit.
   vuetify/lib/styles/main.css with its @layer vuetify-utilities blocks removed;
   the ~40 utilities this app actually uses live in
   vuetify-utilities-subset.css next to this file. ` })
mainRoot.prepend(baseHeader)
writeFileSync(OUT_BASE, mainRoot.toString() + '\n')

const kb = p => (readFileSync(p).length / 1024).toFixed(1)
console.log(`[vuetify-utilities] ${found.size} classes -> ${kb(OUT)} KB (from ${kb(UTILITIES)} KB)`)
console.log(`[vuetify-utilities] base -> ${kb(OUT_BASE)} KB (from ${kb(MAIN)} KB)`)
