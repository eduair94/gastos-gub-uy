#!/usr/bin/env node
/**
 * check-layout-guards — three mechanical layout rules the site cannot see
 * itself breaking, because each one fails *silently*: the page still renders,
 * it just renders wrong, and only on a phone.
 *
 * Run: `node scripts/check-layout-guards.mjs` (exits non-zero on a finding).
 *
 * 1. GUTTER — a `padding` shorthand on an element that also carries
 *    `.u-container`. `.u-container` sets `padding-inline`; a page's scoped
 *    rule for the same element is more specific, so the shorthand's inline
 *    slot wins. `padding: var(--s-7) 0 var(--s-9)` therefore sets the site
 *    gutter to ZERO and the whole page sits flush against the phone's edge.
 *    Use `padding-block` (this is what shipped broken on /analytics/genero).
 *
 * 2. UNDEFINED SPACING TOKEN — `--s-1..--s-9` is the whole scale. Naming
 *    `var(--s-12)` makes the ENTIRE declaration invalid, so CSS drops it and
 *    the element silently loses that padding/margin/gap altogether. This is
 *    how /analytics/senales and /analytics/omisos ended up opening welded to
 *    the bottom of their hero.
 *
 * 3. WELDED SIBLINGS — two element siblings inside a `#cell:` slot with no
 *    gap-bearing wrapper. Vue compiles the newline between two tags away, so
 *    `<span>{{ name }}</span><MandateChip/>` renders as one run of glued
 *    text with no whitespace node left to space later. Wrap in `.chip-row`.
 *
 * 4. NUMBERED PAGER — `<v-pagination>` renders one 48px button per visible
 *    page, so seven pages plus prev/next need 432px and push the document
 *    37px sideways on a 390px phone. `<DataPager>` is the house pager: it is
 *    prev / "page X of Y" / next, fits any width, and scrolls the reader back
 *    to the top of the list.
 *
 * Every check is a text scan, so it costs nothing and runs without a browser.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const roots = ['app/pages', 'app/components', 'app/layouts'].map((r) => path.join(repoRoot, r))

/** Tokens the scale actually defines, read from the one file that defines them. */
function definedSpacingTokens() {
  const src = fs.readFileSync(path.join(repoRoot, 'app/assets/scss/_tokens.scss'), 'utf8')
  return new Set([...src.matchAll(/--s-(\d+)\s*:/g)].map((m) => `--s-${m[1]}`))
}

function vueFiles() {
  const out = []
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(p)
      else if (p.endsWith('.vue')) out.push(p)
    }
  }
  roots.filter(fs.existsSync).forEach(walk)
  return out
}

const rel = (p) => path.relative(repoRoot, p).replace(/\\/g, '/')
const findings = []
const add = (file, rule, detail, fix) => findings.push({ file, rule, detail, fix })

const SPACING = definedSpacingTokens()
const files = vueFiles()

for (const file of files) {
  const src = fs.readFileSync(file, 'utf8')
  const styleAt = src.indexOf('<style')
  const style = styleAt < 0 ? '' : src.slice(styleAt)
  // Comments explain these very rules, so scanning them re-reports the fix as
  // the bug. Strip HTML comments from the markup before matching against it.
  const markup = (styleAt < 0 ? src : src.slice(0, styleAt)).replace(/<!--[\s\S]*?-->/g, '')

  // ---- 1. gutter ------------------------------------------------------
  const containerCompanions = new Set()
  for (const m of markup.matchAll(/class="([^"]*\bu-container\b[^"]*)"/g)) {
    for (const cls of m[1].split(/\s+/)) if (cls && cls !== 'u-container') containerCompanions.add(cls)
  }
  for (const cls of containerCompanions) {
    const safe = cls.replace(/[^A-Za-z0-9_-]/g, '')
    if (!safe) continue
    for (const m of style.matchAll(new RegExp('\\.' + safe + '\\b[^{}]*\\{[^{}]*\\}', 'g'))) {
      const rule = m[0].replace(/\s+/g, ' ')
      const pad = rule.match(/[{;]\s*padding\s*:\s*([^;}]+)/)
      if (!pad) continue
      // Only a ZERO inline slot is the bug. A shorthand that names a real
      // inline value (`padding: var(--s-8) var(--s-4)`) is a page choosing its
      // own gutter on purpose, which is allowed.
      const slots = pad[1].trim().split(/\s+(?![^(]*\))/)
      const inline = slots.length === 1 ? slots[0] : slots.length === 4 ? `${slots[1]} ${slots[3]}` : slots[1]
      if (!/(^|\s)0(px|rem|em|%)?(\s|$)/.test(inline)) continue
      add(
        rel(file),
        'gutter',
        `.${cls} is also a .u-container, and "padding: ${pad[1].trim()}" zeroes its padding-inline`,
        'use padding-block for vertical rhythm; the gutter belongs to .u-container',
      )
    }
  }

  // ---- 2. undefined spacing token -------------------------------------
  for (const m of style.matchAll(/var\(\s*(--s-\d+)\s*\)/g)) {
    if (SPACING.has(m[1])) continue
    const line = style.slice(0, m.index).split('\n').length
    add(
      rel(file),
      'undefined-token',
      `${m[1]} is not on the scale (${[...SPACING].join(', ')}) — the whole declaration is invalid and gets dropped`,
      'use a token that exists',
    )
    void line
  }

  // ---- 3. welded siblings in a table cell slot -------------------------
  for (const m of markup.matchAll(/<template\s+#cell:[^>]*>([\s\S]*?)<\/template>/g)) {
    const body = m[1]
    // The wrapper may be any single root element that carries a gap.
    if (/class="[^"]*\bchip-row\b/.test(body)) continue
    // Count top-level element siblings by stripping nested content.
    const roots = [...body.matchAll(/^\s{0,14}<([A-Za-z][\w-]*)/gm)].map((x) => x[1])
    const opens = roots.filter((t) => t !== 'template')
    const hasChip = /<(MandateChip|StatusChip|v-chip|VChip)\b/.test(body)
    if (hasChip && opens.length > 1) {
      add(
        rel(file),
        'welded-siblings',
        `a #cell: slot renders a chip next to another element with no gap-bearing wrapper (${opens.slice(0, 4).join(', ')})`,
        'wrap both in <span class="chip-row chip-row--baseline">',
      )
    }
  }

  // ---- 4. numbered pager ----------------------------------------------
  if (/<v-pagination\b|<VPagination\b/.test(markup)) {
    add(
      rel(file),
      'numbered-pager',
      '<v-pagination> is one 48px button per page — it overflows a 390px viewport',
      'use <DataPager v-model:page="page" :total-pages="n" scroll-target-id="…" />',
    )
  }
}

if (!findings.length) {
  console.log(`check-layout-guards: OK (${files.length} components)`)
  process.exit(0)
}

for (const f of findings) {
  console.error(`${f.file}\n  [${f.rule}] ${f.detail}\n  fix: ${f.fix}\n`)
}
console.error(`check-layout-guards: ${findings.length} finding(s)`)
process.exit(1)
