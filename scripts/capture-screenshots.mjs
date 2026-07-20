#!/usr/bin/env node
/**
 * Refresh the README / docs screenshots from the LIVE site.
 *
 *   node scripts/capture-screenshots.mjs                 # -> docs/screenshots
 *   node scripts/capture-screenshots.mjs --base https://localhost:3600 --out /tmp/shots
 *
 * Playwright is deliberately NOT a dependency of this repo (it would pull ~300MB of browsers into
 * every install and every CI job for a docs-only task). Install it ad hoc before running:
 *
 *   npm i -D playwright && npx playwright install chromium
 *
 * Deterministic-ish by construction: fixed viewport, animations disabled, consent/overlay chrome
 * dismissed, and a settle delay after networkidle so charts and maps have finished their first paint.
 */
import { chromium, devices } from 'playwright'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const argv = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  return i === -1 ? fallback : argv[i + 1]
}

const BASE = (arg('base', 'https://conlatuya.checkleaked.cc')).replace(/\/$/, '')
const OUT = arg('out', join(process.cwd(), 'docs', 'screenshots'))
const SETTLE = Number(arg('settle', '1800'))

mkdirSync(OUT, { recursive: true })

// Detail-page targets pin real ids. If the feed rotates one out, the page still renders (the app
// 404s gracefully), but the shot loses its point — re-pick an id from /api/<collection>?limit=1.
const DESKTOP = [
  ['home', '/'],
  ['contratos', '/contracts'],
  ['contrato-detalle', '/contracts/adjudicacion-53193'],
  ['llamados', '/llamados'],
  ['llamado-detalle', '/llamados/1353929'],
  ['proveedores', '/suppliers'],
  ['proveedor-detalle', '/suppliers/R%2F213815180017'],
  ['organismos-compradores', '/buyers'],
  ['productos', '/products'],
  ['producto-detalle', '/products/7843'],
  ['anomalias', '/analytics/anomalies'],
  ['errores-carga', '/analytics/errores-carga'],
  ['partidos', '/analytics/partidos'],
  ['organismos', '/analytics/organismos'],
  ['mapa', '/analytics/mapa'],
  ['analytics-hub', '/analytics'],
  ['investigaciones', '/investigaciones'],
  ['investigacion-tv-ciudad', '/investigaciones/tv-ciudad'],
  ['curros', '/curros'],
  ['curro-detalle', '/curros/buena-estrella-asse-limpieza'],
  ['developers', '/developers'],
  ['estadisticas', '/estadisticas'],
  ['gastos', '/gastos'],
  ['login', '/login'],
]

const MOBILE = [
  ['mobile-home', '/'],
  ['mobile-llamados', '/llamados'],
  ['mobile-anomalias', '/analytics/anomalies'],
]

async function dismissChrome(page) {
  for (const re of [/aceptar/i, /entendido/i, /acepto/i, /cerrar/i]) {
    try {
      const btn = page.getByRole('button', { name: re }).first()
      if (await btn.isVisible({ timeout: 400 })) {
        await btn.click({ timeout: 800 })
        await page.waitForTimeout(250)
      }
    } catch { /* not present on this page */ }
  }
  await page
    .evaluate(() => {
      for (const el of document.querySelectorAll('.v-overlay--active, .v-snackbar, [class*="consent" i]')) {
        el.style.display = 'none'
      }
    })
    .catch(() => {})
}

async function shoot(ctx, name, path, opts = {}) {
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)))
  try {
    const res = await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 45_000 })
    await page.waitForLoadState('networkidle', { timeout: 25_000 }).catch(() => {})
    await dismissChrome(page)
    await page.waitForTimeout(opts.settle ?? SETTLE)
    await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: !!opts.fullPage, animations: 'disabled' })
    console.log(JSON.stringify({ name, path, status: res?.status(), errors: errors.slice(0, 2) }))
    return res?.status() === 200 && errors.length === 0
  } catch (err) {
    console.log(JSON.stringify({ name, path, error: String(err).slice(0, 200) }))
    return false
  } finally {
    await page.close()
  }
}

const browser = await chromium.launch()
let ok = true

const desktop = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  locale: 'es-UY',
  colorScheme: 'dark',
})
for (const [name, path] of DESKTOP) ok = (await shoot(desktop, name, path)) && ok
ok = (await shoot(desktop, 'home-full', '/', { fullPage: true, settle: 2500 })) && ok
await desktop.close()

const mobile = await browser.newContext({ ...devices['Pixel 7'], locale: 'es-UY', colorScheme: 'dark' })
for (const [name, path] of MOBILE) ok = (await shoot(mobile, name, path)) && ok
await mobile.close()

await browser.close()
console.log(ok ? 'DONE (all pages 200, no page errors)' : 'DONE with failures — see log above')
process.exit(ok ? 0 : 1)
