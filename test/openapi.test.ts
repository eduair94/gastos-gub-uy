import assert from 'node:assert/strict'
import { openApiDocument as doc } from '../app/server/utils/openapi'

// 1. Version + security schemes exist.
assert.equal(doc.openapi, '3.1.0', 'openapi version')
const schemes = (doc.components as any).securitySchemes
assert.ok(schemes?.apiKeyHeader && schemes?.bearerAuth, 'both security schemes defined')

// 2. Every path item has at least one operation, and every operation has responses.
const METHODS = ['get', 'post', 'put', 'delete', 'patch']
let opCount = 0
for (const [path, item] of Object.entries<any>(doc.paths)) {
  const ops = METHODS.filter(m => item[m])
  assert.ok(ops.length > 0, `path ${path} has an operation`)
  for (const m of ops) {
    opCount++
    assert.ok(item[m].responses, `${m.toUpperCase()} ${path} has responses`)
  }
}

// 3. Every $ref anywhere in the document resolves to a defined component.
function collectRefs(node: any, out: string[]): void {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) { for (const v of node) collectRefs(v, out); return }
  for (const [k, v] of Object.entries(node)) {
    if (k === '$ref' && typeof v === 'string') out.push(v)
    else collectRefs(v, out)
  }
}
function resolveRef(ref: string): boolean {
  // '#/components/schemas/Foo' -> walk doc by path segments.
  const segs = ref.replace(/^#\//, '').split('/')
  let cur: any = doc
  for (const s of segs) {
    cur = cur?.[s]
    if (cur === undefined) return false
  }
  return true
}
const refs: string[] = []
collectRefs(doc, refs)
const broken = [...new Set(refs)].filter(r => !resolveRef(r))
assert.deepEqual(broken, [], `all $refs resolve (broken: ${broken.join(', ')})`)

console.log(`openapi.test OK — ${Object.keys(doc.paths).length} paths, ${opCount} operations, ${new Set(refs).size} unique refs`)
