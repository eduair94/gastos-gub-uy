/**
 * build-uruguay-geo.mjs — one-shot geometry baker for the department choropleth.
 *
 * Fetches the 19-department boundaries (geoBoundaries URY ADM1, CC-BY 4.0, pinned
 * commit), simplifies (Douglas-Peucker), projects to Web-Mercator SVG coords, and
 * emits app/assets/geo/uruguay-dept-paths.ts keyed by the gastos-gub buyer.id
 * (80-1 … 98-1). Runtime never fetches — the generated .ts is committed and offline.
 *
 * Run: node scripts/build-uruguay-geo.mjs   (needs network once)
 * Source: https://www.geoboundaries.org/  (Runfola et al., 2020) — attribute in UI.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(__dirname, '../app/assets/geo/uruguay-dept-paths.ts')
const SRC_URL = 'https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/URY/ADM1/geoBoundaries-URY-ADM1.geojson'
const SIMPLIFY_TOL = 0.006 // degrees (~600 m); tuned for a small, legible file
const VIEW_W = 800
const PAD = 8

// department name (normalized) -> gastos-gub Intendencia buyer.id
const NAME_TO_ID = {
  artigas: '80-1', canelones: '81-1', 'cerro largo': '82-1', colonia: '83-1',
  durazno: '84-1', flores: '85-1', florida: '86-1', lavalleja: '87-1',
  maldonado: '88-1', paysandu: '89-1', 'rio negro': '90-1', rivera: '91-1',
  rocha: '92-1', salto: '93-1', 'san jose': '94-1', soriano: '95-1',
  tacuarembo: '96-1', 'treinta y tres': '97-1', montevideo: '98-1',
}
const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()

// ---- Douglas-Peucker on [lng,lat] rings ----
function perpDist(p, a, b) {
  const [x, y] = p, [x1, y1] = a, [x2, y2] = b
  const dx = x2 - x1, dy = y2 - y1
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return Math.hypot(x - x1, y - y1)
  let t = ((x - x1) * dx + (y - y1) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy))
}
function dp(points, tol) {
  if (points.length < 3) return points
  let maxd = 0, idx = 0
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpDist(points[i], points[0], points[points.length - 1])
    if (d > maxd) { maxd = d; idx = i }
  }
  if (maxd > tol) {
    const left = dp(points.slice(0, idx + 1), tol)
    const right = dp(points.slice(idx), tol)
    return left.slice(0, -1).concat(right)
  }
  return [points[0], points[points.length - 1]]
}

const merc = (lng, lat) => [
  (lng * Math.PI) / 180,
  Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)),
]

function ringsOf(geom) {
  if (geom.type === 'Polygon') return geom.coordinates
  if (geom.type === 'MultiPolygon') return geom.coordinates.flat()
  return []
}

const main = async () => {
  console.log('Fetching', SRC_URL)
  const res = await fetch(SRC_URL)
  if (!res.ok) throw new Error(`fetch failed ${res.status}`)
  const gj = JSON.parse(await res.text())
  console.log('features:', gj.features.length)

  // Simplify rings (in lng/lat), drop slivers.
  const perFeature = []
  for (const f of gj.features) {
    const id = NAME_TO_ID[norm(f.properties.shapeName)]
    if (!id) { console.warn('UNMATCHED name:', f.properties.shapeName); continue }
    const rings = ringsOf(f.geometry)
      .map(r => dp(r.map(([lng, lat]) => [lng, lat]), SIMPLIFY_TOL))
      .filter(r => r.length >= 4)
    perFeature.push({ id, name: f.properties.shapeName, rings })
  }
  if (perFeature.length !== 19) throw new Error(`expected 19 depts, got ${perFeature.length}`)

  // Project all points to mercator; compute shared bbox.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const feat of perFeature)
    for (const ring of feat.rings)
      for (const [lng, lat] of ring) {
        const [x, y] = merc(lng, lat)
        if (x < minX) minX = x; if (x > maxX) maxX = x
        if (y < minY) minY = y; if (y > maxY) maxY = y
      }
  const spanX = maxX - minX, spanY = maxY - minY
  const scale = (VIEW_W - 2 * PAD) / spanX
  const viewH = Math.round(spanY * scale + 2 * PAD)
  const project = (lng, lat) => {
    const [x, y] = merc(lng, lat)
    return [
      +(PAD + (x - minX) * scale).toFixed(1),
      +(PAD + (maxY - y) * scale).toFixed(1), // flip y (north up)
    ]
  }

  const paths = {}
  const names = {}
  for (const feat of perFeature) {
    const d = feat.rings.map((ring) => {
      const pts = ring.map(([lng, lat]) => project(lng, lat))
      return 'M' + pts.map(p => p.join(',')).join('L') + 'Z'
    }).join('')
    paths[feat.id] = d
    names[feat.id] = feat.name
  }

  const viewBox = `0 0 ${VIEW_W} ${viewH}`
  const ordered = Object.keys(paths).sort((a, b) => Number(a.split('-')[0]) - Number(b.split('-')[0]))
  const body = ordered.map(id => `  '${id}': '${paths[id]}',`).join('\n')

  const out = `/**
 * Uruguay department outlines as SVG path strings, keyed by the gastos-gub
 * Intendencia buyer.id (80-1 Artigas … 98-1 Montevideo). GENERATED — do not edit.
 *
 * Source: geoBoundaries URY ADM1 (gbOpen, CC-BY 4.0; Runfola et al. 2020),
 * simplified (Douglas-Peucker ~600 m) and projected to Web-Mercator SVG coords by
 * scripts/build-uruguay-geo.mjs. Runtime is fully offline — no map tiles, no fetch.
 */
export const GEO_VIEWBOX = '${viewBox}'
export const GEO_SOURCE = 'geoBoundaries (gbOpen, CC-BY 4.0)'
export const GEO_SOURCE_URL = 'https://www.geoboundaries.org'

/** buyer.id -> SVG path \`d\`. */
export const DEPT_PATHS: Record<string, string> = {
${body}
}

/** buyer.id -> department display name (for labels/fallback). */
export const DEPT_GEO_NAMES: Record<string, string> = {
${ordered.map(id => `  '${id}': '${names[id]}',`).join('\n')}
}
`
  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, out, 'utf8')
  console.log('wrote', OUT, `(${(out.length / 1024).toFixed(1)} KB, viewBox ${viewBox})`)
}

main().catch((e) => { console.error(e); process.exit(1) })
