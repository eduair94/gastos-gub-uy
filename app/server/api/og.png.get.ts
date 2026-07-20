import type { SatoriOptions } from 'satori'
import { Resvg } from '@resvg/resvg-js'
import { defineEventHandler, getQuery, setHeader } from 'h3'
import satori from 'satori'

/**
 * Dynamic OG/Twitter card image, on-brand with DESIGN.md: ink background, the
 * three-growing-gold-bars mark (the same peso-magnitude motif as the
 * favicon/BrandMark), Archivo for the headline. Every page gets a real,
 * purpose-built preview instead of one generic default image — the URL is
 * fully determined by its query params, so it's cheap to cache forever.
 *
 * satori lays out a React-like element tree (flexbox only — every node with
 * children needs an explicit `display`) and rasterizes it to SVG; resvg turns
 * that SVG into a PNG. Both are pure-JS/native-binding, no headless browser.
 */

const INK = '#0f2233'
const PAPER = '#eef1f2'
const CELESTE = '#5e93c4'
const SOL = '#d9a441'
const GRAFITO = '#93a2ac'

const WIDTH = 1200
const HEIGHT = 630

let fontsPromise: Promise<SatoriOptions['fonts']> | null = null

function loadFonts() {
  if (!fontsPromise) {
    const storage = useStorage('assets:server')
    fontsPromise = Promise.all([
      storage.getItemRaw('fonts/Archivo-700.woff'),
      storage.getItemRaw('fonts/PublicSans-400.woff'),
      storage.getItemRaw('fonts/PublicSans-600.woff'),
    ]).then(([archivo, psRegular, psSemibold]) => [
      { name: 'Archivo', data: archivo as Buffer, weight: 700 as const, style: 'normal' as const },
      { name: 'Public Sans', data: psRegular as Buffer, weight: 400 as const, style: 'normal' as const },
      { name: 'Public Sans', data: psSemibold as Buffer, weight: 600 as const, style: 'normal' as const },
    ])
  }
  return fontsPromise
}

// A plain-object element builder — no JSX transform is configured for
// server routes, and this is the documented non-JSX way to call satori.
function el(type: string, props: Record<string, unknown> = {}, children?: unknown) {
  return { type, props: children === undefined ? props : { ...props, children } }
}

function truncate(s: string, max: number) {
  const clean = s.replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean
}

// The three-growing-bars motif from BrandMark/the favicon — a fixed, static
// progression (not derived from any value here), just the mark itself.
const BRAND_BAR_WIDTHS = [26, 44, 68]

function brandMark() {
  return el('div', { style: { display: 'flex', alignItems: 'flex-end', gap: '5px' } },
    BRAND_BAR_WIDTHS.map((w, i) =>
      el('div', { key: `b${i}`, style: { display: 'flex', width: `${w}px`, height: '7px', background: SOL, borderRadius: '2px' } }),
    ))
}

function titleFontSize(title: string) {
  if (title.length > 100) return 44
  if (title.length > 64) return 52
  return 64
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const rawTitle = typeof query.title === 'string' && query.title.trim() ? query.title : 'Con la tuya, contribuyente'
  const title = truncate(rawTitle, 160)
  const kicker = typeof query.kicker === 'string' ? truncate(query.kicker, 60) : ''
  const stat = typeof query.stat === 'string' ? truncate(query.stat, 40) : ''
  const isEn = query.locale === 'en'

  const fonts = await loadFonts()

  const tree = el('div', {
    style: {
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      width: `${WIDTH}px`,
      height: `${HEIGHT}px`,
      padding: '64px',
      background: INK,
      fontFamily: 'Public Sans',
    },
  }, [
    el('div', { key: 'top', style: { display: 'flex', alignItems: 'center', gap: '14px' } }, [
      brandMark(),
      el('span', { style: { color: PAPER, fontSize: '22px', fontFamily: 'Public Sans', fontWeight: 600 } }, 'Con la tuya, contribuyente'),
    ]),
    el('div', { key: 'mid', style: { display: 'flex', flexDirection: 'column', gap: '18px', maxWidth: '980px' } }, [
      kicker
        ? el('span', {
            key: 'kicker',
            style: {
              display: 'flex',
              color: CELESTE,
              fontSize: '26px',
              fontFamily: 'Public Sans',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '1px',
            },
          }, kicker)
        : el('span', { key: 'kicker-empty', style: { display: 'flex', height: '0px' } }),
      el('span', {
        key: 'title',
        style: {
          display: 'flex',
          color: PAPER,
          fontSize: `${titleFontSize(title)}px`,
          fontFamily: 'Archivo',
          fontWeight: 700,
          lineHeight: 1.15,
        },
      }, title),
      stat
        ? el('div', { key: 'stat', style: { display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' } }, [
            el('span', { key: 'stat-val', style: { display: 'flex', color: SOL, fontSize: '40px', fontFamily: 'Archivo', fontWeight: 700 } }, stat),
            el('div', { key: 'stat-bar', style: { display: 'flex', width: '220px', height: '6px', background: SOL, borderRadius: '2px' } }),
          ])
        : el('span', { key: 'stat-empty', style: { display: 'flex', height: '0px' } }),
    ]),
    el('div', { key: 'bottom', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
      el('span', { key: 'domain', style: { display: 'flex', color: GRAFITO, fontSize: '22px', fontFamily: 'Public Sans', fontWeight: 400 } }, 'gastos.gub.uy'),
      el('span', { key: 'lang', style: { display: 'flex', color: GRAFITO, fontSize: '20px', fontFamily: 'Public Sans', fontWeight: 400 } }, isEn ? 'Uruguay public procurement' : 'Compras públicas del Uruguay'),
    ]),
  ])

  const svg = await satori(tree as never, { width: WIDTH, height: HEIGHT, fonts: fonts! })
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: WIDTH } }).render().asPng()

  setHeader(event, 'content-type', 'image/png')
  // Fully determined by the query string, so it's safe to cache hard.
  setHeader(event, 'cache-control', 'public, max-age=31536000, immutable')
  return png
})
