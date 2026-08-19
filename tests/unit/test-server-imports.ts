/**
 * Los imports relativos de `app/server/**` apuntan a un archivo que existe.
 *
 * POR QUÉ EXISTE ESTE TEST. Mover `api/canales-youtube.get.ts` a
 * `api/canales-youtube/index.get.ts` dejó su `../../data/canales-youtube`
 * apuntando a `app/server/data`, que no existe. Nada lo agarró:
 *
 *   - `tsc --noEmit` de la raíz compila `src/` y `shared/`, no `app/server/`;
 *   - el dev server resolvió igual y sirvió la página;
 *   - el error apareció recién en el build de producción, que abortó el deploy.
 *
 * Un `git mv` de un archivo del servidor es exactamente el movimiento que rompe
 * esto, y el costo de detectarlo tarde es un deploy fallido. Acá cuesta un
 * segundo.
 *
 * Sólo mira imports RELATIVOS: los alias (`#shared`, `~`) los resuelve Nuxt y no
 * se pueden verificar sin su configuración.
 */
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname ?? __dirname, '../..')
const SERVER = join(ROOT, 'app/server')

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (full.endsWith('.ts')) out.push(full)
  }
  return out
}

/** Un import sin extensión puede ser el archivo, o el `index` de una carpeta. */
function resolves(fromFile: string, spec: string): boolean {
  const base = resolve(dirname(fromFile), spec)
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.mjs`,
    `${base}.js`,
    `${base}.json`,
    join(base, 'index.ts'),
    join(base, 'index.mjs'),
    join(base, 'index.js'),
  ]
  return candidates.some(c => existsSync(c) && (!statSync(c).isDirectory() || false))
}

const files = walk(SERVER)
assert.ok(files.length > 50, `se esperaban muchos archivos en app/server, hay ${files.length}`)

const broken: string[] = []
let checked = 0

for (const file of files) {
  const source = readFileSync(file, 'utf8')
  const specs = [
    ...source.matchAll(/(?:^|\n)\s*import\s[^'"]*['"](\.[^'"]+)['"]/g),
    ...source.matchAll(/(?:^|\n)\s*export\s[^'"]*from\s*['"](\.[^'"]+)['"]/g),
    ...source.matchAll(/\bimport\(\s*['"](\.[^'"]+)['"]\s*\)/g),
  ].map(m => m[1]!)

  for (const spec of specs) {
    checked++
    if (!resolves(file, spec)) broken.push(`${file.slice(ROOT.length + 1)} → ${spec}`)
  }
}

assert.deepEqual(broken, [], `imports relativos que no resuelven:\n  ${broken.join('\n  ')}`)
assert.ok(checked > 100, `se esperaban muchos imports relativos, se revisaron ${checked}`)

console.log(`✓ server-imports: ${checked} imports relativos de ${files.length} archivos, todos resuelven`)
