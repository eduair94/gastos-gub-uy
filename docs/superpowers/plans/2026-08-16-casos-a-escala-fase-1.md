# Casos a escala — Fase 1: infraestructura y gasto reiterado

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publicar unas 600 fichas de gasto observado y reiterado en `/investigaciones`, generadas de documentos oficiales, sobre los componentes que ya existen.

**Architecture:** Un carril nuevo de fichas **derivadas** vive en Mongo y se mezcla con las 141 curadas que siguen en TS. Un lector unificado sirve las dos fuentes. Los renderizadores de Vue y los endpoints no cambian de forma. Tres trabajos por lotes bajan los documentos, parsean la observación y arman las fichas.

**Tech Stack:** TypeScript, Mongoose, Nuxt 3 / Nitro, `tsx`, `unpdf`.

**Spec:** [2026-08-16-casos-a-escala-design.md](../specs/2026-08-16-casos-a-escala-design.md)

## Global Constraints

- Toda la prosa va en ASD-STE100 aplicado al español. Una idea por frase. Voz activa.
- El dinero es siempre `amount.primaryAmount`. Nunca re-sumar `awards.items.unit.value.amount`.
- Los enlaces al Estado salen de `ocid`, vía `shared/utils/ocid.ts`. Nunca del `id` del release.
- Los modelos nuevos usan la forma guardada: `mongoose.models.X || mongoose.model('X', S)` y `{ collection }` explícito.
- Los índices existen sólo si `scripts/ensure-indexes.ts` los crea. `autoIndex` está apagado.
- Las props opcionales de TS se escriben `?: T | undefined`.
- Un trabajo largo sube `MONGO_SOCKET_TIMEOUT_MS` antes de `connectToDatabase()`.
- **Nunca** un borrado por `$ne` de generación. Dos corridas simultáneas se aniquilan entre sí.
- Ninguna ficha dice «irregular» ni «delito». La reiteración es legal: artículo 114 del TOCAF.
- Las sesiones comparten un solo árbol de trabajo. Nunca `git add -A`. Siempre rutas explícitas.

---

### Task 1: Parser puro de la resolución de reiteración

Extrae de un texto de resolución los cinco datos que la ficha necesita. Es puro:
sin red y sin base de datos, para que corra en `npm test`.

**Files:**
- Create: `shared/reiteracion.ts`
- Test: `tests/unit/reiteracion-parse.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  ```ts
  export interface ParsedReiteracion {
    observed: boolean
    reason: string | null
    resolutionNumber: string | null
    resolutionDate: string | null
    tocafArticle: string | null
    observedBy: 'tribunal' | 'contador-delegado' | null
  }
  export function parseReiteracion(text: string): ParsedReiteracion
  export function normalizeReason(reason: string): string
  ```

- [ ] **Step 1: Write the failing test**

Los dos textos son recortes reales, medidos el 16-08-2026.

```ts
// tests/unit/reiteracion-parse.test.ts
/**
 * El parser de la resolución de reiteración, contra recortes reales.
 *
 *   npx tsx tests/unit/reiteracion-parse.test.ts
 */
import { normalizeReason, parseReiteracion } from '../../shared/reiteracion'

const failures: string[] = []
function check(cond: boolean, msg: string) {
  if (!cond) failures.push(msg)
}

// reiter_1186812.pdf — UTE, 2026.
const UTE = `RESULTANDO que la contratación fue observada por el Tribunal de Cuentas de la
República por Resolución 1151/2025 en sesión de fecha 21/05/2025, por no contar con
disponibilidad presupuestal. CONSIDERANDO: I) que el Rubro 3 no cuenta con disponibilidad
suficiente para imputar el monto de esta compra; ATENTO a lo establecido en el artículo 114
del TOCAF y a las facultades delegadas`

const ute = parseReiteracion(UTE)
check(ute.observed === true, 'UTE: observed debe ser true')
check(ute.observedBy === 'tribunal', `UTE: observedBy fue ${ute.observedBy}`)
check(ute.resolutionNumber === '1151/2025', `UTE: resolutionNumber fue ${ute.resolutionNumber}`)
check(ute.resolutionDate === '2025-05-21', `UTE: resolutionDate fue ${ute.resolutionDate}`)
check(ute.tocafArticle === '114', `UTE: tocafArticle fue ${ute.tocafArticle}`)
check(
  ute.reason === 'no contar con disponibilidad presupuestal',
  `UTE: reason fue "${ute.reason}"`,
)

// reiter_1165492.pdf — UTE, 2026. Observa el Contador Delegado, no el Tribunal.
const DELEGADO = `RESULTANDO que la contratación fue observada por el Contador Delegado del
Tribunal de Cuentas de la República con fecha 04/07/2025, por no contar con disponibilidad
presupuestal. ATENTO a lo establecido en el artículo 114 del TOCAF`

const del = parseReiteracion(DELEGADO)
check(del.observed === true, 'Delegado: observed debe ser true')
check(del.observedBy === 'contador-delegado', `Delegado: observedBy fue ${del.observedBy}`)
check(del.resolutionDate === '2025-07-04', `Delegado: resolutionDate fue ${del.resolutionDate}`)
check(del.resolutionNumber === null, `Delegado: resolutionNumber fue ${del.resolutionNumber}`)

// Un PDF escaneado no da texto. No se puede afirmar nada.
const vacio = parseReiteracion('')
check(vacio.observed === false, 'Vacío: observed debe ser false')
check(vacio.reason === null, 'Vacío: reason debe ser null')

// Un documento sin la cláusula tampoco afirma.
const otro = parseReiteracion('Expediente N° 2022-17-1-0002415 Folio n° 59')
check(otro.observed === false, 'Sin cláusula: observed debe ser false')

// Las causales se agrupan: la misma razón llega con puntuación distinta.
check(
  normalizeReason('no contar con disponibilidad presupuestal.') === 'no contar con disponibilidad presupuestal',
  'normalizeReason debe sacar el punto final',
)
check(
  normalizeReason('NO CONTAR CON DISPONIBILIDAD PRESUPUESTAL') === 'no contar con disponibilidad presupuestal',
  'normalizeReason debe bajar a minúsculas',
)

if (failures.length) {
  console.error(`✗ ${failures.length} fallo(s):`)
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}
console.log('✓ reiteracion-parse: todo pasa')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx tests/unit/reiteracion-parse.test.ts`
Expected: FAIL con `Cannot find module '../../shared/reiteracion'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// shared/reiteracion.ts
/**
 * El texto de una resolución de reiteración, convertido en los cinco datos que la ficha
 * publica.
 *
 * POR QUÉ ESTE ARCHIVO DECIDE TODO. La reiteración del gasto es el único documento del
 * corpus que declara, con sus propias palabras, que el Tribunal de Cuentas observó una
 * compra. Dice quién observó, cuándo, con qué número de resolución y por qué motivo. Nada
 * de eso necesita un modelo de lenguaje: viene en una cláusula fija.
 *
 * LO QUE NO SE PUEDE AFIRMAR. Una reiteración es un acto LEGAL, previsto por el artículo
 * 114 del TOCAF: el ordenador del gasto puede reiterarlo bajo su responsabilidad. Observado
 * no quiere decir ilegal. Si el texto no trae la cláusula, `observed` es `false` y la ficha
 * calla el motivo.
 */

export interface ParsedReiteracion {
  observed: boolean
  reason: string | null
  resolutionNumber: string | null
  /** ISO `YYYY-MM-DD`, para ordenar. */
  resolutionDate: string | null
  tocafArticle: string | null
  observedBy: 'tribunal' | 'contador-delegado' | null
}

const EMPTY: ParsedReiteracion = {
  observed: false,
  reason: null,
  resolutionNumber: null,
  resolutionDate: null,
  tocafArticle: null,
  observedBy: null,
}

/**
 * La cláusula, tal como la escriben los organismos. El motivo va después de «por» y termina
 * en el punto que cierra el RESULTANDO.
 */
const CLAUSE = /fue\s+observad[ao]\s+por\s+(?<who>el\s+Contador\s+Delegado[^,.]*|el\s+Tribunal\s+de\s+Cuentas[^,.]*)(?<mid>[^.]*?)\bpor\s+(?<reason>[^.]+)/i
const RESOLUTION = /Resoluci[oó]n\s+(?<num>\d{1,5}\/\d{4})/i
const DATE = /fecha\s+(?<d>\d{2})\/(?<m>\d{2})\/(?<y>\d{4})/i
const TOCAF = /art[ií]culo\s+(?<n>\d{1,3})\s+del\s+TOCAF/i

/** Una misma causal llega con mayúsculas y puntuación distintas. Se agrupa por esta forma. */
export function normalizeReason(reason: string): string {
  return reason
    .toLowerCase()
    .replace(/[.;,]+\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function parseReiteracion(text: string): ParsedReiteracion {
  const flat = (text ?? '').replace(/\s+/g, ' ').trim()
  if (!flat) return { ...EMPTY }

  const m = CLAUSE.exec(flat)
  if (!m?.groups) return { ...EMPTY }

  const who = m.groups.who ?? ''
  const observedBy: ParsedReiteracion['observedBy'] = /contador\s+delegado/i.test(who)
    ? 'contador-delegado'
    : 'tribunal'

  // El número de resolución y la fecha viven en el tramo entre el «quién» y el motivo. Se
  // busca ahí y no en todo el documento: más abajo el CONSIDERANDO cita OTRAS resoluciones
  // (las que delegan facultades), y tomar ésas ataría la ficha al acto equivocado.
  const mid = m.groups.mid ?? ''
  const resolutionNumber = RESOLUTION.exec(mid)?.groups?.num ?? null
  const d = DATE.exec(mid)?.groups
  const resolutionDate = d ? `${d.y}-${d.m}-${d.d}` : null

  return {
    observed: true,
    reason: normalizeReason(m.groups.reason ?? ''),
    resolutionNumber,
    resolutionDate,
    tocafArticle: TOCAF.exec(flat)?.groups?.n ?? null,
    observedBy,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx tests/unit/reiteracion-parse.test.ts`
Expected: PASS — `✓ reiteracion-parse: todo pasa`.

- [ ] **Step 5: Commit**

```bash
git add shared/reiteracion.ts tests/unit/reiteracion-parse.test.ts
git commit -m "feat(reiteracion): parsear la observación del Tribunal de Cuentas"
```

---

### Task 2: Colección `reiteracion_docs` y su índice

Guarda el texto bajado una sola vez. Sin esto cada corrida repetiría 5.825 descargas
contra el sitio del Estado.

**Files:**
- Create: `shared/models/reiteracion_doc.ts`
- Modify: `shared/models/index.ts`
- Modify: `scripts/ensure-indexes.ts:474` (después del bloque de `tcr_resolutions`)
- Test: `tests/unit/reiteracion-model.test.ts`

**Interfaces:**
- Consumes: `ParsedReiteracion` de la Task 1.
- Produces:
  ```ts
  export interface IReiteracionDoc extends ParsedReiteracion {
    ocid: string
    url: string
    fetchedAt: Date
    httpStatus: number
    hasText: boolean
    textChars: number
    text: string | null
    buyerId: string | null
    buyerName: string | null
    supplierIds: string[]
    supplierNames: string[]
    sourceYear: number | null
    primaryAmount: number | null
  }
  export const ReiteracionDocModel
  ```

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/reiteracion-model.test.ts
/**
 * El modelo de `reiteracion_docs`: que el esquema declare TODO campo de la interfaz.
 * Un campo que está en la interfaz y no en el Schema se pierde al guardar, en silencio.
 *
 *   npx tsx tests/unit/reiteracion-model.test.ts
 */
import { ReiteracionDocModel } from '../../shared/models/reiteracion_doc'

const failures: string[] = []
function check(cond: boolean, msg: string) {
  if (!cond) failures.push(msg)
}

const paths = Object.keys(ReiteracionDocModel.schema.paths)
const REQUIRED = [
  'ocid', 'url', 'fetchedAt', 'httpStatus', 'hasText', 'textChars', 'text',
  'buyerId', 'buyerName', 'supplierIds', 'supplierNames', 'sourceYear', 'primaryAmount',
  'observed', 'reason', 'resolutionNumber', 'resolutionDate', 'tocafArticle', 'observedBy',
]
for (const p of REQUIRED) {
  check(paths.includes(p), `falta el campo "${p}" en el Schema`)
}
check(
  ReiteracionDocModel.collection.name === 'reiteracion_docs',
  `la colección es "${ReiteracionDocModel.collection.name}"`,
)

if (failures.length) {
  console.error(`✗ ${failures.length} fallo(s):`)
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}
console.log('✓ reiteracion-model: todo pasa')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx tests/unit/reiteracion-model.test.ts`
Expected: FAIL con `Cannot find module '../../shared/models/reiteracion_doc'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// shared/models/reiteracion_doc.ts
import { Schema } from "mongoose";
import { mongoose } from "../connection/database";
import type { ParsedReiteracion } from "../reiteracion";

/**
 * El documento de reiteración del gasto, bajado y parseado una sola vez.
 *
 * Escrito por src/jobs/fetch-reiteracion-docs.ts. Se guarda TODA descarga, también la que
 * no dio texto (`hasText:false`, un PDF escaneado), para que el recorrido sea resumible y
 * para no volver a pedirle el mismo archivo al sitio del Estado.
 *
 * Los campos del comprador y del proveedor se copian del release al bajar. Así el armado de
 * fichas agrupa sin volver a tocar `releases`, que tiene 2,18 millones de documentos.
 */
export interface IReiteracionDoc extends ParsedReiteracion {
  ocid: string;
  url: string;
  fetchedAt: Date;
  httpStatus: number;
  hasText: boolean;
  textChars: number;
  text: string | null;
  buyerId: string | null;
  buyerName: string | null;
  supplierIds: string[];
  supplierNames: string[];
  sourceYear: number | null;
  primaryAmount: number | null;
}

const ReiteracionDocSchema = new Schema<IReiteracionDoc>(
  {
    ocid: { type: String, required: true },
    url: { type: String, required: true },
    fetchedAt: { type: Date, required: true },
    httpStatus: { type: Number, required: true, default: 0 },
    hasText: { type: Boolean, required: true, default: false },
    textChars: { type: Number, required: true, default: 0 },
    text: { type: String, default: null },
    buyerId: { type: String, default: null },
    buyerName: { type: String, default: null },
    supplierIds: { type: [String], default: [] },
    supplierNames: { type: [String], default: [] },
    sourceYear: { type: Number, default: null },
    primaryAmount: { type: Number, default: null },
    observed: { type: Boolean, required: true, default: false },
    reason: { type: String, default: null },
    resolutionNumber: { type: String, default: null },
    resolutionDate: { type: String, default: null },
    tocafArticle: { type: String, default: null },
    observedBy: { type: String, default: null },
  },
  { collection: "reiteracion_docs" }
);

// Construidos sólo por scripts/ensure-indexes.ts.
ReiteracionDocSchema.index({ ocid: 1 }, { unique: true });
ReiteracionDocSchema.index({ observed: 1, reason: 1 });
ReiteracionDocSchema.index({ buyerId: 1 });

export const ReiteracionDocModel =
  mongoose.models.ReiteracionDoc ||
  mongoose.model<IReiteracionDoc>("ReiteracionDoc", ReiteracionDocSchema);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx tests/unit/reiteracion-model.test.ts`
Expected: PASS.

- [ ] **Step 5: Export the model and build its indexes**

En `shared/models/index.ts`, junto a los demás `export *`:

```ts
export * from "./reiteracion_doc";
```

En `scripts/ensure-indexes.ts`, justo después del bloque de `tcr_resolutions` (línea 474):

```ts
      // reiteracion_docs: el documento que declara la observación del Tribunal de Cuentas,
      // escrito por src/jobs/fetch-reiteracion-docs.ts. `ocid` único es la clave del upsert
      // y del recorrido resumible; observed+reason agrupa las causales; buyerId arma la
      // ficha por organismo.
      const reiteracionDocs = client.db(DB_NAME).collection('reiteracion_docs')
      await reiteracionDocs.createIndex({ ocid: 1 }, { unique: true, background: true })
      await reiteracionDocs.createIndex({ observed: 1, reason: 1 }, { background: true })
      await reiteracionDocs.createIndex({ buyerId: 1 }, { background: true })
      console.log('✅ reiteracion_docs indexes ensured (ocid unique, observed+reason, buyerId)')
```

- [ ] **Step 6: Run the index builder and the test suite**

Run: `npm run ensure-indexes`
Expected: incluye `✅ reiteracion_docs indexes ensured`.

Run: `npm test`
Expected: PASS, sin regresiones.

- [ ] **Step 7: Commit**

```bash
git add shared/models/reiteracion_doc.ts shared/models/index.ts scripts/ensure-indexes.ts tests/unit/reiteracion-model.test.ts
git commit -m "feat(reiteracion): colección reiteracion_docs con sus índices"
```

---

### Task 3: Trabajo que baja y parsea los documentos

Recorre los releases con documento `reiteracionGasto`, baja cada archivo una vez y guarda
el texto y el parseo.

**Files:**
- Create: `src/jobs/fetch-reiteracion-docs.ts`
- Modify: `package.json` (bloque `scripts`)

**Interfaces:**
- Consumes: `parseReiteracion` (Task 1), `ReiteracionDocModel` (Task 2).
- Produces: filas en `reiteracion_docs`. Sin API de TS para otras tareas.

- [ ] **Step 1: Write the job**

```ts
// src/jobs/fetch-reiteracion-docs.ts
/**
 * Baja el documento de reiteración del gasto de cada compra que lo tiene, extrae su texto y
 * guarda el parseo.
 *
 *   npx tsx src/jobs/fetch-reiteracion-docs.ts             # sigue donde quedó
 *   npx tsx src/jobs/fetch-reiteracion-docs.ts --limit=50  # prueba corta
 *   npx tsx src/jobs/fetch-reiteracion-docs.ts --refetch    # vuelve a bajar todo
 *
 * ATENCIÓN, ESTO GOLPEA UN SITIO DEL ESTADO. Hay un intervalo fijo entre pedidos y un solo
 * hilo. No lo subas. Una corrida anterior de este repo llegó a frenar el sitio de compras
 * estatales, y otro proceso ya podía estar recorriéndolo al mismo tiempo. Antes de correrlo
 * en el servidor 167, fijate si hay un lazo andando.
 *
 * Es resumible: una compra ya bajada no se vuelve a pedir salvo con `--refetch`. Se guarda
 * también la descarga que no dio texto, que es lo normal en los PDF escaneados.
 */
import { connectToDatabase, disconnectFromDatabase } from '../../shared/connection/database'
import { ReiteracionDocModel } from '../../shared/models/reiteracion_doc'
import { ReleaseModel } from '../../shared/models/release'
import { parseReiteracion } from '../../shared/reiteracion'

process.env.MONGO_SOCKET_TIMEOUT_MS = process.env.MONGO_SOCKET_TIMEOUT_MS ?? '600000'

const args = process.argv.slice(2)
const limit = Number(args.find(a => a.startsWith('--limit='))?.slice('--limit='.length) ?? 0)
const refetch = args.includes('--refetch')

/** Un pedido por segundo. Es el techo, no el objetivo. */
const PACE_MS = 1000
const TIMEOUT_MS = 30000
const UA = 'gastos-gub/1.0 (+https://conlatuya.checkleaked.cc)'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

interface Target {
  ocid: string
  url: string
  buyerId: string | null
  buyerName: string | null
  supplierIds: string[]
  supplierNames: string[]
  sourceYear: number | null
  primaryAmount: number | null
}

/** El texto de un `.doc` viejo de Word vive en latin1 entre binario. */
function textFromLegacyDoc(buf: Buffer): string {
  return buf.toString('latin1').replace(/[^\x20-\x7E\xC0-\xFF\n]/g, ' ')
}

async function textFromPdf(buf: Buffer): Promise<string> {
  const { extractText, getDocumentProxy } = await import('unpdf')
  const pdf = await getDocumentProxy(new Uint8Array(buf))
  const out = await extractText(pdf, { mergePages: true })
  return String(out.text ?? '')
}

async function collectTargets(): Promise<Target[]> {
  const cursor = ReleaseModel.collection.find(
    { 'awards.documents.documentType': 'reiteracionGasto' },
    {
      projection: {
        ocid: 1,
        sourceYear: 1,
        'buyer.id': 1,
        'buyer.name': 1,
        'amount.primaryAmount': 1,
        'awards.documents': 1,
        'awards.suppliers': 1,
      },
    },
  )
  const out: Target[] = []
  const seen = new Set<string>()
  for await (const r of cursor) {
    const rel = r as any
    if (!rel.ocid || seen.has(rel.ocid)) continue
    let url: string | null = null
    const supplierIds: string[] = []
    const supplierNames: string[] = []
    for (const a of rel.awards ?? []) {
      for (const d of a.documents ?? []) {
        if (d.documentType === 'reiteracionGasto' && d.url) url = url ?? d.url
      }
      for (const s of a.suppliers ?? []) {
        if (s?.id && !supplierIds.includes(s.id)) supplierIds.push(s.id)
        if (s?.name && !supplierNames.includes(s.name)) supplierNames.push(s.name)
      }
    }
    if (!url) continue
    seen.add(rel.ocid)
    out.push({
      ocid: rel.ocid,
      url,
      buyerId: rel.buyer?.id ?? null,
      buyerName: rel.buyer?.name ?? null,
      supplierIds,
      supplierNames,
      sourceYear: rel.sourceYear ?? null,
      primaryAmount: rel.amount?.primaryAmount ?? null,
    })
  }
  return out
}

async function main() {
  await connectToDatabase()
  console.log('→ juntando las compras con documento de reiteración…')
  let targets = await collectTargets()
  console.log(`  ${targets.length} compras con documento`)

  if (!refetch) {
    const done = new Set(await ReiteracionDocModel.distinct('ocid'))
    targets = targets.filter(t => !done.has(t.ocid))
    console.log(`  ${done.size} ya bajadas; quedan ${targets.length}`)
  }
  if (limit > 0) targets = targets.slice(0, limit)

  let ok = 0
  let withText = 0
  let observed = 0
  for (const [i, t] of targets.entries()) {
    let httpStatus = 0
    let text: string | null = null
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
      const res = await fetch(t.url, { signal: ctrl.signal, headers: { 'user-agent': UA } })
      clearTimeout(timer)
      httpStatus = res.status
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer())
        const ct = res.headers.get('content-type') ?? ''
        text = ct.includes('pdf') || t.url.toLowerCase().endsWith('.pdf')
          ? await textFromPdf(buf)
          : textFromLegacyDoc(buf)
      }
    }
    catch (e) {
      console.warn(`  ! ${t.ocid}: ${String((e as Error).message).slice(0, 80)}`)
    }

    const flat = (text ?? '').replace(/\s+/g, ' ').trim()
    const parsed = parseReiteracion(flat)
    await ReiteracionDocModel.updateOne(
      { ocid: t.ocid },
      {
        $set: {
          ...t,
          fetchedAt: new Date(),
          httpStatus,
          hasText: flat.length > 0,
          textChars: flat.length,
          // El texto completo se guarda sólo cuando sirve para algo. Un escaneo devuelve el
          // sello del folio y nada más: guardarlo infla la colección sin aportar.
          text: parsed.observed ? flat.slice(0, 20000) : null,
          ...parsed,
        },
      },
      { upsert: true },
    )
    ok++
    if (flat.length) withText++
    if (parsed.observed) observed++
    if ((i + 1) % 25 === 0) {
      console.log(`  ${i + 1}/${targets.length} — con texto ${withText}, con cláusula ${observed}`)
    }
    await sleep(PACE_MS)
  }

  console.log(`\n✓ ${ok} documentos procesados`)
  console.log(`  con capa de texto: ${withText}`)
  console.log(`  con cláusula de observación: ${observed}`)
  await disconnectFromDatabase()
  process.exit(0)
}

main().catch((e) => { console.error('FAIL', e); process.exit(1) })
```

- [ ] **Step 2: Register the npm script**

En `package.json`, junto a `verify:casos`:

```json
    "fetch-reiteracion-docs": "tsx src/jobs/fetch-reiteracion-docs.ts",
```

- [ ] **Step 3: Run a short probe and read the output**

Run: `npm run fetch-reiteracion-docs -- --limit=40`
Expected: termina sin error e informa las tres cifras. La de «con cláusula de observación»
tiene que ser mayor que cero. Anotá la proporción: manda sobre cuántas fichas salen.

- [ ] **Step 4: Commit**

```bash
git add src/jobs/fetch-reiteracion-docs.ts package.json
git commit -m "feat(reiteracion): bajar y parsear los documentos de reiteración"
```

- [ ] **Step 5: Run the full sweep in the background**

Run: `npm run fetch-reiteracion-docs`
Son unas 5.825 descargas a un pedido por segundo: alrededor de 100 minutos. Dejalo correr
mientras seguís con la Task 4, que no depende de él hasta la Task 6.

---

### Task 4: La ficha derivada y su colección

Una ficha derivada tiene la misma forma que una curada, más de dónde salió.

**Files:**
- Create: `shared/models/derived_caso.ts`
- Modify: `shared/models/index.ts`
- Modify: `scripts/ensure-indexes.ts` (después del bloque de `reiteracion_docs`)
- Modify: `app/server/utils/casos/types.ts` (agregar el tema y el tipo de origen)
- Test: `tests/unit/derived-caso-model.test.ts`

**Interfaces:**
- Consumes: `CasoDef`, `CasoThemeKey` de `app/server/utils/casos/types.ts`.
- Produces:
  ```ts
  export type DerivedCasoOrigin = 'reiteracion' | 'medicion'
  export interface IDerivedCaso {
    slug: string
    origin: DerivedCasoOrigin
    generation: string
    builtAt: Date
    /** Orden dentro del tema. Menor primero. */
    rank: number
    def: Record<string, unknown>   // un CasoDef completo
  }
  export const DerivedCasoModel
  ```

- [ ] **Step 1: Add the theme and the origin type**

En `app/server/utils/casos/types.ts`, sumá la clave al tipo:

```ts
export type CasoThemeKey
  = | 'salud-mental'
    | 'cancer'
    | 'defensa'
    | 'telecomunicaciones'
    | 'obra-publica'
    | 'educacion'
    | 'energia'
    | 'seguridad'
    | 'agua'
    | 'vivienda'
    | 'transporte'
    | 'estado-y-fondos'
    | 'ambiente'
    | 'deporte-y-cultura'
    | 'gasto-observado'
```

Y el tema al final de `CASO_THEMES`, para que quede último en toda lista:

```ts
  {
    key: 'gasto-observado',
    emoji: '🧾',
    es: {
      label: 'Gasto observado y reiterado',
      dek: 'Compras que el Tribunal de Cuentas observó y que el organismo pagó igual, amparado en el artículo 114 del TOCAF.',
    },
    en: {
      label: 'Observed and overridden spending',
      dek: 'Purchases the Court of Auditors objected to and the body paid anyway, under article 114 of the TOCAF.',
    },
  },
```

- [ ] **Step 2: Write the failing test**

```ts
// tests/unit/derived-caso-model.test.ts
/**
 * El modelo de `derived_casos` y el tema que lo aloja.
 *
 *   npx tsx tests/unit/derived-caso-model.test.ts
 */
import { CASO_THEMES } from '../../app/server/utils/casos/types'
import { DerivedCasoModel } from '../../shared/models/derived_caso'

const failures: string[] = []
function check(cond: boolean, msg: string) {
  if (!cond) failures.push(msg)
}

const paths = Object.keys(DerivedCasoModel.schema.paths)
for (const p of ['slug', 'origin', 'generation', 'builtAt', 'rank', 'def']) {
  check(paths.includes(p), `falta el campo "${p}" en el Schema`)
}
check(
  DerivedCasoModel.collection.name === 'derived_casos',
  `la colección es "${DerivedCasoModel.collection.name}"`,
)

const observado = CASO_THEMES.find(t => t.key === 'gasto-observado')
check(Boolean(observado), 'falta el tema "gasto-observado"')
check(
  CASO_THEMES[CASO_THEMES.length - 1]?.key === 'gasto-observado',
  'el tema "gasto-observado" tiene que ir último',
)
check(Boolean(observado?.en.label), 'el tema necesita sus dos idiomas')

if (failures.length) {
  console.error(`✗ ${failures.length} fallo(s):`)
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}
console.log('✓ derived-caso-model: todo pasa')
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx tsx tests/unit/derived-caso-model.test.ts`
Expected: FAIL con `Cannot find module '../../shared/models/derived_caso'`.

- [ ] **Step 4: Write minimal implementation**

```ts
// shared/models/derived_caso.ts
import { Schema } from "mongoose";
import { mongoose } from "../connection/database";

/**
 * Fichas de caso ARMADAS a partir de los datos, no escritas a mano.
 *
 * POR QUÉ VIVEN EN MONGO Y NO EN TS. Las 141 fichas curadas son 7.320 líneas de módulo, y
 * el bundle de Nitro las carga enteras en cada worker de pm2. Mil fichas más serían unas
 * 60.000 líneas residentes por worker. Lo derivado se puede volver a armar con un comando,
 * así que no gana nada por estar en git y sí cuesta memoria.
 *
 * `def` guarda un CasoDef completo, con la misma forma que un dossier curado. Así el lector
 * unificado mezcla las dos fuentes sin traducir nada, y las páginas no se enteran.
 *
 * NUNCA BORRES POR `$ne` DE GENERACIÓN. Dos corridas que se pisan se aniquilan entre sí: ya
 * pasó en este repo y dejó una colección vacía en producción. El armador junta los slugs de
 * SU corrida y borra sólo los que sobran de esa lista.
 */
export type DerivedCasoOrigin = "reiteracion" | "medicion";

export interface IDerivedCaso {
  slug: string;
  origin: DerivedCasoOrigin;
  /** Marca de la corrida que la escribió. Sirve para auditar, no para borrar. */
  generation: string;
  builtAt: Date;
  /** Orden dentro del tema. Menor primero. */
  rank: number;
  def: Record<string, unknown>;
}

const DerivedCasoSchema = new Schema<IDerivedCaso>(
  {
    slug: { type: String, required: true },
    origin: { type: String, required: true },
    generation: { type: String, required: true },
    builtAt: { type: Date, required: true },
    rank: { type: Number, required: true, default: 0 },
    def: { type: Schema.Types.Mixed, required: true },
  },
  { collection: "derived_casos" }
);

// Construidos sólo por scripts/ensure-indexes.ts.
DerivedCasoSchema.index({ slug: 1 }, { unique: true });
DerivedCasoSchema.index({ origin: 1, rank: 1 });
DerivedCasoSchema.index({ "def.theme": 1, rank: 1 });

export const DerivedCasoModel =
  mongoose.models.DerivedCaso ||
  mongoose.model<IDerivedCaso>("DerivedCaso", DerivedCasoSchema);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx tsx tests/unit/derived-caso-model.test.ts`
Expected: PASS.

- [ ] **Step 6: Export the model and build its indexes**

En `shared/models/index.ts`:

```ts
export * from "./derived_caso";
```

En `scripts/ensure-indexes.ts`, después del bloque de `reiteracion_docs`:

```ts
      // derived_casos: fichas armadas por src/jobs/build-derived-casos.ts. `slug` único es
      // la clave del upsert y la búsqueda de la página de detalle; los otros dos ordenan el
      // índice y la página de tema sin traer el `def` entero.
      const derivedCasos = client.db(DB_NAME).collection('derived_casos')
      await derivedCasos.createIndex({ slug: 1 }, { unique: true, background: true })
      await derivedCasos.createIndex({ origin: 1, rank: 1 }, { background: true })
      await derivedCasos.createIndex({ 'def.theme': 1, rank: 1 }, { background: true })
      console.log('✅ derived_casos indexes ensured (slug unique, origin+rank, def.theme+rank)')
```

- [ ] **Step 7: Run the index builder and the suite**

Run: `npm run ensure-indexes`
Expected: incluye `✅ derived_casos indexes ensured`.

Run: `npm test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add shared/models/derived_caso.ts shared/models/index.ts scripts/ensure-indexes.ts app/server/utils/casos/types.ts tests/unit/derived-caso-model.test.ts
git commit -m "feat(casos): colección derived_casos y tema gasto-observado"
```

---

### Task 5: Lector unificado

`listCasoDefs()` pasa a servir las dos fuentes. Es el único lugar que sabe que hay dos.

**Files:**
- Modify: `app/server/utils/casos/index.ts`
- Test: `tests/unit/casos-reader.test.ts`

**Interfaces:**
- Consumes: `DerivedCasoModel` (Task 4), `CASOS` (los módulos curados).
- Produces:
  ```ts
  export function listCuratedCasoDefs(): CasoDef[]
  export async function listAllCasoDefs(): Promise<CasoDef[]>
  export async function listAllCasoDefsByTheme(theme: string): Promise<CasoDef[]>
  export async function getAnyCasoDef(slug: string): Promise<CasoDef | null>
  export async function casoThemeCountsAsync(): Promise<Record<string, number>>
  // `listCasoDefs()` y `getCasoDef()` siguen existiendo, sólo con lo curado.
  ```

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/casos-reader.test.ts
/**
 * El lector unificado: que lo curado siga saliendo sin tocar la base, y que las funciones
 * nuevas existan con la forma que esperan los endpoints.
 *
 * Es puro a propósito: no se conecta. La mitad viva la cubre scripts/verify-casos.ts.
 *
 *   npx tsx tests/unit/casos-reader.test.ts
 */
import * as casos from '../../app/server/utils/casos'

const failures: string[] = []
function check(cond: boolean, msg: string) {
  if (!cond) failures.push(msg)
}

check(typeof casos.listCuratedCasoDefs === 'function', 'falta listCuratedCasoDefs')
check(typeof casos.listAllCasoDefs === 'function', 'falta listAllCasoDefs')
check(typeof casos.getAnyCasoDef === 'function', 'falta getAnyCasoDef')
check(typeof casos.casoThemeCountsAsync === 'function', 'falta casoThemeCountsAsync')

// Lo curado se lee sin red y sin base: es lo que hace barata la página de tema.
const curated = casos.listCuratedCasoDefs()
check(curated.length >= 100, `esperaba >= 100 casos curados, hay ${curated.length}`)
check(curated.every(c => typeof c.slug === 'string'), 'todo caso curado necesita slug')

// El lector viejo sigue en pie: el sitemap y verify-casos lo usan.
check(casos.listCasoDefs().length === curated.length, 'listCasoDefs debe seguir dando lo curado')

if (failures.length) {
  console.error(`✗ ${failures.length} fallo(s):`)
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}
console.log('✓ casos-reader: todo pasa')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx tests/unit/casos-reader.test.ts`
Expected: FAIL con `falta listCuratedCasoDefs`.

- [ ] **Step 3: Write minimal implementation**

Agregá al final de `app/server/utils/casos/index.ts`:

```ts
import { DerivedCasoModel } from '../../../../shared/models/derived_caso'
import { connectToDatabase } from '../database'

/**
 * Las dos fuentes de una ficha, y por qué son dos.
 *
 * Lo CURADO son los módulos de `dossiers/`: texto que escribió y revisó una persona, con
 * fuentes de prensa verificadas una por una. Vive en git porque su valor es que alguien
 * responde por cada frase.
 *
 * Lo DERIVADO lo arma un trabajo por lotes a partir de documentos oficiales. Vive en Mongo
 * porque se puede volver a armar con un comando, y porque mil fichas en un módulo de TS
 * quedarían residentes en la memoria de cada worker.
 *
 * De acá para afuera la diferencia no existe: las dos salen como `CasoDef`.
 */

/** Sólo los dossiers escritos a mano. Sin red y sin base. */
export function listCuratedCasoDefs(): CasoDef[] {
  return CASOS
}

let derivedCache: { at: number, defs: CasoDef[] } | null = null
/** Cinco minutos: el armador corre por lotes, no por request. */
const DERIVED_TTL_MS = 5 * 60 * 1000

async function loadDerived(): Promise<CasoDef[]> {
  if (derivedCache && Date.now() - derivedCache.at < DERIVED_TTL_MS) return derivedCache.defs
  try {
    await connectToDatabase()
    const rows = await DerivedCasoModel.find({}, { def: 1, rank: 1 })
      .sort({ rank: 1 })
      .lean()
      .maxTimeMS(8000)
    const defs = rows.map((r: any) => r.def as CasoDef).filter(Boolean)
    derivedCache = { at: Date.now(), defs }
    return defs
  }
  catch {
    // Que la base no conteste no puede tirar abajo las 141 fichas curadas, que no la
    // necesitan. Se sirve lo que hay.
    return derivedCache?.defs ?? []
  }
}

/** Curadas primero, derivadas después. El orden es editorial y no se invierte. */
export async function listAllCasoDefs(): Promise<CasoDef[]> {
  return [...CASOS, ...(await loadDerived())]
}

export async function getAnyCasoDef(slug: string): Promise<CasoDef | null> {
  const curated = getCasoDef(slug)
  if (curated) return curated
  try {
    await connectToDatabase()
    const row = await DerivedCasoModel.findOne({ slug }, { def: 1 }).lean().maxTimeMS(8000)
    return ((row as any)?.def as CasoDef) ?? null
  }
  catch {
    return null
  }
}

export async function listAllCasoDefsByTheme(theme: string): Promise<CasoDef[]> {
  return (await listAllCasoDefs()).filter(c => c.theme === theme)
}

export async function casoThemeCountsAsync(): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  for (const t of CASO_THEMES) out[t.key] = 0
  for (const c of await listAllCasoDefs()) {
    out[c.theme] = (out[c.theme] ?? 0) + 1
  }
  return out
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx tests/unit/casos-reader.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add app/server/utils/casos/index.ts tests/unit/casos-reader.test.ts
git commit -m "feat(casos): lector unificado sobre lo curado y lo derivado"
```

---

### Task 6: El armador de fichas

Convierte `reiteracion_docs` en fichas, en cuatro granos, con umbral por grano.

**Files:**
- Create: `src/jobs/build-derived-casos.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `ReiteracionDocModel` (Task 2), `DerivedCasoModel` (Task 4), `CasoDef` (types).
- Produces: filas en `derived_casos`.

- [ ] **Step 1: Write the job**

```ts
// src/jobs/build-derived-casos.ts
/**
 * Arma las fichas de «gasto observado y reiterado» a partir de `reiteracion_docs`.
 *
 *   npx tsx src/jobs/build-derived-casos.ts            # arma y escribe
 *   npx tsx src/jobs/build-derived-casos.ts --dry-run  # sólo informa cuántas salen
 *
 * CUATRO GRANOS, y cada uno tiene su umbral. Un grano sin umbral publica ruido: una compra
 * suelta bajo un titular es una coincidencia, no un caso. Los umbrales son los mismos que
 * ya hace cumplir scripts/verify-casos.ts para las fichas curadas.
 *
 *   1. Por organismo    — desde 3 reiteraciones
 *   2. Por proveedor    — desde 3 reiteraciones
 *   3. Por causal       — desde 5 compras que declaran el mismo motivo
 *   4. Por compra       — sólo las de monto mayor, con la cláusula leída
 *
 * LO QUE NINGUNA FICHA PUEDE DECIR. Reiterar un gasto observado es LEGAL: lo habilita el
 * artículo 114 del TOCAF. La ficha cuenta que pasó, cita el documento y dice qué falta para
 * afirmar más. No dice «irregular» y no dice «delito».
 *
 * EL BORRADO NO USA `$ne`. Dos corridas simultáneas con borrado por generación se aniquilan
 * entre sí: acá ya pasó y dejó una colección vacía en producción. Se junta la lista de slugs
 * de ESTA corrida y se borra sólo lo que sobra de esa lista.
 */
import { connectToDatabase, disconnectFromDatabase } from '../../shared/connection/database'
import { DerivedCasoModel } from '../../shared/models/derived_caso'
import { ReiteracionDocModel } from '../../shared/models/reiteracion_doc'
import type { CasoDef } from '../../app/server/utils/casos/types'

process.env.MONGO_SOCKET_TIMEOUT_MS = process.env.MONGO_SOCKET_TIMEOUT_MS ?? '600000'

const dryRun = process.argv.includes('--dry-run')

const MIN_POR_ORGANISMO = 3
const MIN_POR_PROVEEDOR = 3
const MIN_POR_CAUSAL = 5
const FICHAS_POR_COMPRA = 300

const TOCAF = 'Reiterar un gasto observado es un acto previsto por el artículo 114 del TOCAF: '
  + 'el ordenador puede disponerlo bajo su responsabilidad. Observado no quiere decir ilegal.'

function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70)
}

function money(uyu: number): string {
  if (uyu >= 1e9) return `$ ${(uyu / 1e9).toFixed(1)} mil millones`
  if (uyu >= 1e6) return `$ ${(uyu / 1e6).toFixed(1)} millones`
  return `$ ${Math.round(uyu).toLocaleString('es-UY')}`
}

function moneyEn(uyu: number): string {
  if (uyu >= 1e9) return `$${(uyu / 1e9).toFixed(1)} billion`
  if (uyu >= 1e6) return `$${(uyu / 1e6).toFixed(1)} million`
  return `$${Math.round(uyu).toLocaleString('en-US')}`
}

interface Row {
  ocid: string
  url: string
  buyerId: string | null
  buyerName: string | null
  supplierIds: string[]
  supplierNames: string[]
  sourceYear: number | null
  primaryAmount: number | null
  observed: boolean
  reason: string | null
  resolutionNumber: string | null
  resolutionDate: string | null
}

function period(years: number[]): string {
  const ys = years.filter(Boolean).sort((a, b) => a - b)
  if (!ys.length) return ''
  return ys[0] === ys[ys.length - 1] ? String(ys[0]) : `${ys[0]}-${ys[ys.length - 1]}`
}

/** Las fuentes son los documentos oficiales mismos, hasta seis por ficha. */
function sourcesFrom(rows: Row[]): CasoDef['sources'] {
  return rows.slice(0, 6).map(r => ({
    outlet: 'Compras Estatales',
    title: `Resolución de reiteración del gasto — compra ${r.ocid.replace('ocds-yfs5dr-', '')}`,
    url: r.url,
    date: r.resolutionDate ?? (r.sourceYear ? String(r.sourceYear) : undefined),
  }))
}

function reasonLine(rows: Row[]): { es: string, en: string } {
  const reasons = rows.map(r => r.reason).filter((x): x is string => Boolean(x))
  if (!reasons.length) {
    return {
      es: 'Los documentos de esta ficha son escaneos sin capa de texto, así que el motivo de la observación no se pudo leer.',
      en: 'The documents behind this file are scans with no text layer, so the reason for the objection could not be read.',
    }
  }
  const counts = new Map<string, number>()
  for (const r of reasons) counts.set(r, (counts.get(r) ?? 0) + 1)
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]!
  return {
    es: `El motivo que más se repite es «${top[0]}»: aparece en ${top[1]} de los ${reasons.length} documentos que sí traen texto.`,
    en: `The most frequent stated reason is "${top[0]}": it appears in ${top[1]} of the ${reasons.length} documents that carry readable text.`,
  }
}

function buildOrganismo(buyerName: string, rows: Row[]): CasoDef {
  const total = rows.reduce((a, r) => a + (r.primaryAmount ?? 0), 0)
  const reason = reasonLine(rows)
  const per = period(rows.map(r => r.sourceYear ?? 0))
  return {
    slug: `reiteraciones-${slugify(buyerName)}`,
    emoji: '🧾',
    theme: 'gasto-observado',
    period: per,
    statusKind: 'auditoria',
    status: 'auditoria',
    amountReported: `${money(total)} en ${rows.length} compras con gasto reiterado (medido sobre este corpus, ${per})`,
    organisms: [buyerName],
    feedCoverage: 'likely',
    query: { buyers: [buyerName] },
    sources: sourcesFrom(rows),
    es: {
      title: `${buyerName}: ${rows.length} compras observadas y pagadas igual`,
      dek: `El Tribunal de Cuentas observó ${rows.length} compras de este organismo. El organismo las reiteró y las pagó.`,
      contexto: `Cuando el Tribunal de Cuentas observa un gasto, el organismo puede reiterarlo y ejecutarlo bajo su responsabilidad. Cada reiteración deja un documento en el portal de Compras Estatales. En este corpus, ${buyerName} tiene ${rows.length} compras con ese documento, entre ${per}.`,
      hallazgo: `Las ${rows.length} compras suman ${money(total)} en valores normalizados a pesos uruguayos. ${reason.es}`,
      statusNote: `Cifra medida sobre el corpus el día que corrió el armador. El documento de cada compra se enlaza en las fuentes.`,
      porQueImporta: `Una observación del Tribunal de Cuentas es el aviso del auditor del propio Estado. Reiterar el gasto es la decisión de gastar igual. Saber con qué frecuencia un organismo toma esa decisión dice algo sobre cómo administra.`,
      caveat: `${TOCAF} Esta ficha cuenta cuántas veces pasó y con qué motivo declarado. No dice que ninguna de estas compras sea irregular. El total sale de sumar el monto normalizado de cada compra alcanzada, no del monto observado, que el documento no siempre trae.`,
    },
    en: {
      title: `${buyerName}: ${rows.length} purchases objected to and paid anyway`,
      dek: `The Court of Auditors objected to ${rows.length} of this body's purchases. The body overrode the objection and paid.`,
      contexto: `When the Court of Auditors objects to a spending commitment, the body may reiterate it and execute it under its own responsibility. Each override leaves a document on the state procurement portal. In this corpus, ${buyerName} has ${rows.length} purchases carrying that document, between ${per}.`,
      hallazgo: `The ${rows.length} purchases add up to ${moneyEn(total)} in Uruguayan pesos, normalised. ${reason.en}`,
      statusNote: `Figure measured against the corpus on the day the builder ran. Each purchase's document is linked in the sources.`,
      porQueImporta: `An objection from the Court of Auditors is a warning from the state's own auditor. Overriding it is a decision to spend regardless. How often a body takes that decision says something about how it is run.`,
      caveat: `Overriding an objection is lawful under article 114 of the TOCAF: the spending officer may order it under their own responsibility. Objected does not mean unlawful. This file counts how often it happened and the stated reason. It does not claim any of these purchases is irregular.`,
    },
  }
}

async function main() {
  await connectToDatabase()
  const rows = (await ReiteracionDocModel.find({}, {
    ocid: 1, url: 1, buyerId: 1, buyerName: 1, supplierIds: 1, supplierNames: 1,
    sourceYear: 1, primaryAmount: 1, observed: 1, reason: 1, resolutionNumber: 1, resolutionDate: 1,
  }).lean()) as unknown as Row[]
  console.log(`→ ${rows.length} documentos de reiteración en la base`)

  const defs: CasoDef[] = []

  // Grano 1 — por organismo.
  const porOrganismo = new Map<string, Row[]>()
  for (const r of rows) {
    if (!r.buyerName || !r.buyerId) continue
    const k = `${r.buyerId}|${r.buyerName}`
    porOrganismo.set(k, [...(porOrganismo.get(k) ?? []), r])
  }
  for (const [k, group] of porOrganismo) {
    if (group.length < MIN_POR_ORGANISMO) continue
    // La clave es `buyerId|buyerName`, pero la ficha se arma con el NOMBRE: la consulta de
    // cruce va por nombre porque `buyer.id` no tiene índice y lidera un escaneo completo.
    const buyerName = k.split('|')[1] as string
    defs.push(buildOrganismo(buyerName, group))
  }
  console.log(`  grano organismo: ${defs.length} fichas`)

  if (dryRun) {
    console.log(`\n(dry-run) saldrían ${defs.length} fichas`)
    await disconnectFromDatabase()
    process.exit(0)
  }

  const generation = new Date().toISOString()
  const slugs: string[] = []
  for (const [i, def] of defs.entries()) {
    slugs.push(def.slug)
    await DerivedCasoModel.updateOne(
      { slug: def.slug },
      { $set: { slug: def.slug, origin: 'reiteracion', generation, builtAt: new Date(), rank: i, def } },
      { upsert: true },
    )
  }

  // Borrado seguro: sólo lo de ESTE origen que no está en la lista que acabo de escribir.
  // Nunca `$ne: generation`, que dos corridas simultáneas convierten en un borrado total.
  const stale = await DerivedCasoModel.deleteMany({ origin: 'reiteracion', slug: { $nin: slugs } })
  console.log(`\n✓ ${slugs.length} fichas escritas, ${stale.deletedCount ?? 0} viejas borradas`)
  await disconnectFromDatabase()
  process.exit(0)
}

main().catch((e) => { console.error('FAIL', e); process.exit(1) })
```

- [ ] **Step 2: Register the npm script**

```json
    "build-derived-casos": "tsx src/jobs/build-derived-casos.ts",
```

- [ ] **Step 3: Run the dry run**

Run: `npm run build-derived-casos -- --dry-run`
Expected: informa cuántas fichas salen del grano por organismo. Con los 5.825 documentos
medidos, esperá unas 81.

- [ ] **Step 4: Write them**

Run: `npm run build-derived-casos`
Expected: `✓ N fichas escritas`.

- [ ] **Step 5: Commit**

```bash
git add src/jobs/build-derived-casos.ts package.json
git commit -m "feat(casos): armar las fichas de gasto reiterado por organismo"
```

---

### Task 7: Los endpoints leen las dos fuentes y paginan

**Files:**
- Modify: `app/server/api/casos/index.get.ts`
- Modify: `app/server/api/casos/[slug].get.ts:53-63`
- Modify: `app/server/api/__sitemap__/cases.ts:20`
- Modify: `app/pages/investigaciones/casos/index.vue:24,76-84`

**Interfaces:**
- Consumes: `listAllCasoDefs`, `getAnyCasoDef`, `listAllCasoDefsByTheme`, `casoThemeCountsAsync` (Task 5).
- Produces: `/api/casos` acepta `?page=` y `?perPage=`; devuelve `page`, `perPage`, `totalPages`.

- [ ] **Step 1: Paginate the index endpoint**

En `app/server/api/casos/index.get.ts`, cambiá el handler a `async` y reemplazá el cuerpo
desde `const defs = listCasoDefs()` hasta el `return`:

```ts
  const page = Math.max(1, Number(q.page ?? 1) || 1)
  const perPage = Math.min(60, Math.max(1, Number(q.perPage ?? 24) || 24))

  const defs = await listAllCasoDefs()
  const matching = theme ? defs.filter(c => c.theme === theme) : defs

  // Paginado del lado del servidor. Antes la lista entera viajaba en el payload de SSR y el
  // cliente filtraba en memoria: con 141 fichas eran 447KB, con mil pasa de 2MB.
  const start = (page - 1) * perPage
  const slice = summary ? [] : matching.slice(start, start + perPage)
  const items = slice.map(c => ({
    slug: c.slug,
    emoji: c.emoji,
    theme: c.theme,
    period: c.period ?? null,
    statusKind: c.statusKind,
    status: c.status,
    amountReported: c.amountReported ?? null,
    organisms: c.organisms,
    feedCoverage: c.feedCoverage,
    hasQuery: Boolean(c.query),
    sourceCount: c.sources.length,
    investigationPath: c.investigationPath ?? null,
    es: { title: c.es.title, dek: c.es.dek },
    en: { title: c.en.title, dek: c.en.dek },
  }))

  const counts = await casoThemeCountsAsync()

  return {
    success: true,
    data: {
      items,
      total: matching.length,
      totalAll: defs.length,
      page,
      perPage,
      totalPages: Math.max(1, Math.ceil(matching.length / perPage)),
      sourceTotal: defs.reduce((a, c) => a + c.sources.length, 0),
      themes: CASO_THEMES.map(t => ({
        key: t.key,
        emoji: t.emoji,
        count: counts[t.key] ?? 0,
        es: t.es,
        en: t.en,
      })),
      meta: {
        moneyBasis: 'amountReported is the figure published by the cited sources, verbatim; it is not computed from this database',
      },
    },
  }
```

Y actualizá el import de la primera línea:

```ts
import { CASO_THEMES, casoThemeCountsAsync, listAllCasoDefs } from '../../utils/casos'
```

- [ ] **Step 2: Resolve derived slugs on the detail endpoint**

En `app/server/api/casos/[slug].get.ts`, línea 4, sumá las funciones nuevas al import. Y
cambiá las líneas 54 y 63:

```ts
  const def = await getAnyCasoDef(slug)
```

```ts
  const siblings = (await listAllCasoDefsByTheme(def.theme)).filter(c => c.slug !== def.slug)
```

Y la línea 64, que resuelve los `related`, pasa a resolver contra las dos fuentes:

```ts
  const explicit = (await Promise.all((def.related ?? []).map(s => getAnyCasoDef(s))))
    .filter((c): c is NonNullable<typeof c> => Boolean(c) && c!.slug !== def.slug && c!.theme !== def.theme)
```

- [ ] **Step 3: Put derived files in the sitemap**

En `app/server/api/__sitemap__/cases.ts`, hacé el handler `async` y cambiá la línea 20:

```ts
  for (const def of await listAllCasoDefs()) {
```

con el import correspondiente en la línea 1.

- [ ] **Step 4: Make the index page ask for one page at a time**

En `app/pages/investigaciones/casos/index.vue`, cambiá la carga y el paginado:

```ts
const PER_PAGE = 24
const page = ref(1)

// El servidor pagina y filtra por tema. La caja de texto sigue filtrando del lado del
// cliente, sobre la página que está a la vista: con mil fichas traerlas todas para buscar
// en memoria pondría más de 2MB en el payload de SSR.
const { data: res } = await useFetch<any>('/api/casos', {
  query: computed(() => ({ page: page.value, perPage: PER_PAGE, theme: theme.value || undefined })),
})

const items = computed<any[]>(() => res.value?.data?.items ?? [])
const themes = computed<any[]>(() => res.value?.data?.themes ?? [])
const totalPages = computed<number>(() => res.value?.data?.totalPages ?? 1)
const total = computed<number>(() => res.value?.data?.total ?? 0)
const sourceTotal = computed<number>(() => res.value?.data?.sourceTotal ?? 0)
```

Y borrá el `paged` viejo: la plantilla pasa a iterar `filtered`, que ahora filtra sólo por
`tipo` y por texto sobre `items`. Volvé a 1 cuando cambia el tema:

```ts
watch(theme, () => { page.value = 1 })
```

- [ ] **Step 5: Verify against the running dev server**

Run: `npm --prefix app run dev`
Después, en otra terminal:

```bash
curl -s 'http://[::1]:3600/api/casos?perPage=5' | head -c 400
curl -s 'http://[::1]:3600/api/casos?theme=gasto-observado&perPage=3' | head -c 400
```

Expected: la primera trae 5 items y un `totalPages` alto. La segunda trae fichas derivadas.
El servidor escucha en `[::1]:3600`, no en `localhost`.

- [ ] **Step 6: Check one derived file renders**

```bash
curl -s 'http://[::1]:3600/api/casos?theme=gasto-observado&perPage=1' \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).data.items[0].slug))"
```

Tomá ese slug y pedí el detalle:

```bash
curl -s 'http://[::1]:3600/api/casos/<slug>' | head -c 600
```

Expected: responde 200 con `crossRef` resuelto.

- [ ] **Step 7: Layout guard and 360px check**

Run: `npm run check:layout`
Expected: PASS.

Abrí `/investigaciones/casos?tema=gasto-observado` a 360px de ancho. Verificá en la consola:

```js
document.documentElement.scrollWidth <= innerWidth
```

Expected: `true`.

- [ ] **Step 8: Commit**

```bash
git add app/server/api/casos/index.get.ts app/server/api/casos/'[slug]'.get.ts app/server/api/__sitemap__/cases.ts app/pages/investigaciones/casos/index.vue
git commit -m "feat(casos): servir y paginar lo curado junto con lo derivado"
```

---

### Task 8: Extender el verificador editorial a lo derivado

**Files:**
- Modify: `tests/unit/casos-structure.test.ts:38-40`
- Create: `scripts/verify-derived-casos.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `listAllCasoDefs` (Task 5).
- Produces: `npm run verify:casos:derived`, con salida distinta de cero si una ficha derivada
  rompe el contrato.

- [ ] **Step 1: Write the verifier**

```ts
// scripts/verify-derived-casos.ts
/**
 * El contrato editorial, aplicado a las fichas ARMADAS.
 *
 *   npx tsx scripts/verify-derived-casos.ts
 *
 * Las derivadas cumplen lo mismo que las curadas, más tres reglas propias:
 *   - Nunca las palabras que dictarían un fallo que no nos toca dictar.
 *   - Siempre el aviso del artículo 114 del TOCAF, porque reiterar es legal.
 *   - Siempre un `caveat`, que en las curadas es opcional.
 */
import { listAllCasoDefs } from '../app/server/utils/casos'
import { connectToDatabase } from '../shared/connection/database'

process.env.MONGO_SOCKET_TIMEOUT_MS = process.env.MONGO_SOCKET_TIMEOUT_MS ?? '600000'

const PROHIBIDAS = [/\birregular/i, /\bdelito\b/i, /\bfraude\b/i, /\bcorrupci[óo]n\b/i, /\bil[ei]gal/i]

async function main() {
  await connectToDatabase()
  const all = await listAllCasoDefs()
  const derived = all.filter(c => c.theme === 'gasto-observado')
  console.log(`verificando ${derived.length} fichas derivadas…`)

  const errors: string[] = []
  const slugs = new Set<string>()
  for (const c of derived) {
    const at = `ficha "${c.slug}"`
    if (slugs.has(c.slug)) errors.push(`${at}: slug repetido`)
    slugs.add(c.slug)
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(c.slug)) errors.push(`${at}: el slug no es kebab-case`)
    if (c.sources.length < 1) errors.push(`${at}: sin documento de fuente`)
    if (!c.organisms.length) errors.push(`${at}: sin organismo`)
    for (const [loc, txt] of [['es', c.es], ['en', c.en]] as const) {
      if (!txt.title?.trim()) errors.push(`${at}: falta el título en ${loc}`)
      if (!txt.caveat?.trim()) errors.push(`${at}: falta el caveat en ${loc}`)
      if (!/114/.test(txt.caveat ?? '')) errors.push(`${at}: el caveat en ${loc} no cita el artículo 114 del TOCAF`)
      const blob = `${txt.title} ${txt.dek} ${txt.hallazgo} ${txt.porQueImporta}`
      for (const re of PROHIBIDAS) {
        if (re.test(blob)) errors.push(`${at}: el texto en ${loc} usa una palabra que dicta un fallo (${re})`)
      }
    }
  }

  if (errors.length) {
    console.error(`\n✗ ${errors.length} error(es):`)
    for (const e of errors.slice(0, 40)) console.error(`  - ${e}`)
    process.exit(1)
  }
  console.log(`✓ verify-derived-casos: ${derived.length} fichas pasan`)
  process.exit(0)
}

main().catch((e) => { console.error('FAIL', e); process.exit(1) })
```

- [ ] **Step 2: Register the npm script**

```json
    "verify:casos:derived": "tsx scripts/verify-derived-casos.ts",
```

- [ ] **Step 3: Keep the pure test honest**

En `tests/unit/casos-structure.test.ts`, línea 38, cambiá la fuente para que siga midiendo
sólo lo curado. Lo derivado tiene su propio verificador porque necesita la base.

```ts
const casos = listCuratedCasoDefs()
```

y el import de la línea 13:

```ts
import { CASO_THEMES, listCuratedCasoDefs } from '../../app/server/utils/casos'
```

- [ ] **Step 4: Run both**

Run: `npm test`
Expected: PASS.

Run: `npm run verify:casos:derived`
Expected: `✓ verify-derived-casos: N fichas pasan`.

- [ ] **Step 5: Commit**

```bash
git add scripts/verify-derived-casos.ts tests/unit/casos-structure.test.ts package.json
git commit -m "test(casos): verificar el contrato editorial de las fichas derivadas"
```

---

### Task 9: Los otros tres granos

Suma los granos 2, 3 y 4 al armador, para llegar de unas 81 fichas a unas 600.

**Files:**
- Modify: `src/jobs/build-derived-casos.ts`

**Interfaces:**
- Consumes: lo de la Task 6.
- Produces: las mismas filas, en más cantidad.

- [ ] **Step 1: Add the supplier grain**

Después del grano por organismo, con la misma forma que `buildOrganismo` pero agrupando por
`supplierIds`. Un proveedor entra desde `MIN_POR_PROVEEDOR` compras. La consulta de cruce va
por `supplierIds`, nunca por nombre: el mismo RUT aparece con dos grafías.

```ts
  // Grano 2 — por proveedor. Se agrupa por RUT y NUNCA por nombre: el corpus guarda la misma
  // empresa con dos grafías, y agrupar por nombre parte el grupo en dos.
  const porProveedor = new Map<string, Row[]>()
  for (const r of rows) {
    for (const id of r.supplierIds ?? []) {
      porProveedor.set(id, [...(porProveedor.get(id) ?? []), r])
    }
  }
  let nProveedor = 0
  for (const [supplierId, group] of porProveedor) {
    if (group.length < MIN_POR_PROVEEDOR) continue
    const name = group.flatMap(g => g.supplierNames)[0] ?? supplierId
    const total = group.reduce((a, r) => a + (r.primaryAmount ?? 0), 0)
    const per = period(group.map(r => r.sourceYear ?? 0))
    const reason = reasonLine(group)
    const organisms = [...new Set(group.map(r => r.buyerName).filter((x): x is string => Boolean(x)))]
    defs.push({
      slug: `reiteraciones-proveedor-${slugify(name)}`,
      emoji: '🏢',
      theme: 'gasto-observado',
      period: per,
      statusKind: 'auditoria',
      status: 'auditoria',
      amountReported: `${money(total)} en ${group.length} compras con gasto reiterado (medido sobre este corpus, ${per})`,
      organisms: organisms.length ? organisms.slice(0, 6) : ['Sin organismo declarado'],
      suppliersNamed: [name],
      feedCoverage: 'likely',
      query: { supplierIds: [supplierId] },
      sources: sourcesFrom(group),
      es: {
        title: `${name}: ${group.length} compras que se pagaron sobre una observación`,
        dek: `El Tribunal de Cuentas observó ${group.length} compras a esta empresa. Los organismos las reiteraron y las pagaron.`,
        contexto: `Esta ficha mira el mismo hecho desde el lado del proveedor. Agrupa por RUT, no por nombre, porque el corpus guarda la misma empresa con más de una grafía. Entre ${per}, ${organisms.length} organismo(s) reiteraron gastos observados en compras a ${name}.`,
        hallazgo: `Las ${group.length} compras suman ${money(total)} en pesos uruguayos normalizados. ${reason.es}`,
        statusNote: `Cifra medida sobre el corpus el día que corrió el armador.`,
        porQueImporta: `La observación la recibe el organismo que compra, no la empresa que vende. Ver la lista por proveedor muestra en qué contrataciones se repite la decisión de gastar igual.`,
        caveat: `${TOCAF} La observación es al gasto del organismo. Esta ficha NO afirma nada sobre la conducta de ${name}, que puede no tener ninguna participación en el motivo observado. El total suma el monto de cada compra alcanzada, no el monto observado.`,
      },
      en: {
        title: `${name}: ${group.length} purchases paid over an objection`,
        dek: `The Court of Auditors objected to ${group.length} purchases from this company. The buying bodies overrode and paid.`,
        contexto: `This file looks at the same fact from the supplier's side. It groups by tax id, not by name, because the corpus stores the same company under more than one spelling. Between ${per}, ${organisms.length} body/bodies overrode objections on purchases from ${name}.`,
        hallazgo: `The ${group.length} purchases add up to ${moneyEn(total)} in normalised Uruguayan pesos. ${reason.en}`,
        statusNote: `Figure measured against the corpus on the day the builder ran.`,
        porQueImporta: `The objection lands on the buying body, not on the selling company. Listing by supplier shows which contracting relationships repeat the decision to spend regardless.`,
        caveat: `Overriding an objection is lawful under article 114 of the TOCAF. The objection concerns the body's spending. This file makes NO claim about the conduct of ${name}, which may have no part in the stated reason.`,
      },
    })
    nProveedor++
  }
  console.log(`  grano proveedor: ${nProveedor} fichas`)
```

- [ ] **Step 2: Add the reason grain**

```ts
  // Grano 3 — por causal declarada. Junta las compras que el documento explica igual.
  const porCausal = new Map<string, Row[]>()
  for (const r of rows) {
    if (!r.observed || !r.reason) continue
    porCausal.set(r.reason, [...(porCausal.get(r.reason) ?? []), r])
  }
  let nCausal = 0
  for (const [causal, group] of porCausal) {
    if (group.length < MIN_POR_CAUSAL) continue
    const total = group.reduce((a, r) => a + (r.primaryAmount ?? 0), 0)
    const per = period(group.map(r => r.sourceYear ?? 0))
    const organisms = [...new Set(group.map(r => r.buyerName).filter((x): x is string => Boolean(x)))]
    defs.push({
      slug: `causal-${slugify(causal)}`,
      emoji: '📋',
      theme: 'gasto-observado',
      period: per,
      statusKind: 'auditoria',
      status: 'auditoria',
      amountReported: `${money(total)} en ${group.length} compras observadas por el mismo motivo (${per})`,
      organisms: organisms.slice(0, 8),
      feedCoverage: 'likely',
      // Sin `query`: la causal no es un filtro que el explorador entienda. La ficha muestra
      // el conjunto y enlaza cada documento.
      sources: sourcesFrom(group),
      es: {
        title: `«${causal}»: el motivo detrás de ${group.length} gastos reiterados`,
        dek: `${group.length} compras de ${organisms.length} organismos llevan la misma causal escrita en su resolución de reiteración.`,
        contexto: `Cada resolución de reiteración declara por qué el Tribunal de Cuentas observó el gasto. Agrupando por esa frase se ve qué falla se repite en todo el Estado, y no en un organismo solo.`,
        hallazgo: `${group.length} compras, ${money(total)} en pesos normalizados, entre ${per}. Los organismos alcanzados son ${organisms.slice(0, 6).join('; ')}${organisms.length > 6 ? ' y otros' : ''}.`,
        statusNote: `La causal se lee textual del documento. Sólo entran las compras cuyo documento trae capa de texto.`,
        porQueImporta: `Una causal que se repite en decenas de compras y en varios organismos no es un descuido puntual. Es un patrón, y el patrón se puede corregir.`,
        caveat: `${TOCAF} Las compras cuyo documento es un escaneo sin texto no entran en este conteo, así que el número es un piso y no un total.`,
      },
      en: {
        title: `"${causal}": the reason behind ${group.length} overridden spends`,
        dek: `${group.length} purchases across ${organisms.length} bodies carry the same stated reason in their override resolution.`,
        contexto: `Every override resolution states why the Court of Auditors objected. Grouping by that phrase shows which failure repeats across the state rather than inside a single body.`,
        hallazgo: `${group.length} purchases, ${moneyEn(total)} in normalised pesos, between ${per}.`,
        statusNote: `The reason is quoted verbatim from the document. Only purchases whose document carries a text layer are counted.`,
        porQueImporta: `A reason that repeats across dozens of purchases and several bodies is not an isolated slip. It is a pattern, and a pattern can be fixed.`,
        caveat: `Overriding an objection is lawful under article 114 of the TOCAF. Purchases whose document is a scan with no text layer are excluded, so this number is a floor, not a total.`,
      },
    })
    nCausal++
  }
  console.log(`  grano causal: ${nCausal} fichas`)
```

- [ ] **Step 3: Add the single-purchase grain**

```ts
  // Grano 4 — la compra sola, sólo cuando es grande Y su cláusula se pudo leer. Sin las dos
  // condiciones la ficha no tiene ni relato ni peso, y sería una fila con título.
  const singles = rows
    .filter(r => r.observed && r.reason && (r.primaryAmount ?? 0) > 0)
    .sort((a, b) => (b.primaryAmount ?? 0) - (a.primaryAmount ?? 0))
    .slice(0, FICHAS_POR_COMPRA)
  for (const r of singles) {
    const monto = r.primaryAmount ?? 0
    const comprador = r.buyerName ?? 'Organismo no declarado'
    const prov = r.supplierNames[0] ?? null
    const resol = r.resolutionNumber ? `Resolución ${r.resolutionNumber}` : 'una resolución'
    defs.push({
      slug: `reiteracion-${r.ocid.replace('ocds-yfs5dr-', '')}`,
      emoji: '💸',
      theme: 'gasto-observado',
      period: r.sourceYear ? String(r.sourceYear) : '',
      statusKind: 'auditoria',
      status: 'auditoria',
      amountReported: `${money(monto)} (monto de la compra, normalizado a pesos)`,
      organisms: [comprador],
      suppliersNamed: prov ? [prov] : [],
      feedCoverage: 'likely',
      query: { search: r.ocid },
      sources: sourcesFrom([r]),
      es: {
        title: `${comprador}: ${money(monto)} pagados sobre una observación`,
        dek: `El Tribunal de Cuentas observó esta compra por «${r.reason}». El organismo la reiteró y la pagó.`,
        contexto: `Compra ${r.ocid.replace('ocds-yfs5dr-', '')} de ${comprador}${prov ? `, adjudicada a ${prov}` : ''}${r.sourceYear ? `, del año ${r.sourceYear}` : ''}. El monto normalizado a pesos uruguayos es ${money(monto)}.`,
        hallazgo: `La resolución de reiteración dice que el gasto fue observado por «${r.reason}»${r.resolutionNumber ? `, según ${resol}` : ''}${r.resolutionDate ? `, del ${r.resolutionDate}` : ''}. El documento está enlazado en las fuentes.`,
        statusNote: `El texto sale del documento oficial que publica el portal de Compras Estatales.`,
        porQueImporta: `${money(monto)} es lo que el organismo decidió gastar después de que el auditor del Estado le avisara que había un problema.`,
        caveat: `${TOCAF} Esta ficha cita el motivo que declara el documento. No afirma que la compra sea irregular, ni que el motivo siga vigente.`,
      },
      en: {
        title: `${comprador}: ${moneyEn(monto)} paid over an objection`,
        dek: `The Court of Auditors objected to this purchase for "${r.reason}". The body overrode it and paid.`,
        contexto: `Purchase ${r.ocid.replace('ocds-yfs5dr-', '')} by ${comprador}${prov ? `, awarded to ${prov}` : ''}${r.sourceYear ? `, from ${r.sourceYear}` : ''}. The amount, normalised to Uruguayan pesos, is ${moneyEn(monto)}.`,
        hallazgo: `The override resolution states the spending was objected to for "${r.reason}"${r.resolutionNumber ? `, under resolution ${r.resolutionNumber}` : ''}${r.resolutionDate ? `, dated ${r.resolutionDate}` : ''}.`,
        statusNote: `The wording comes from the official document published on the state procurement portal.`,
        porQueImporta: `${moneyEn(monto)} is what the body chose to spend after the state's own auditor warned there was a problem.`,
        caveat: `Overriding an objection is lawful under article 114 of the TOCAF. This file quotes the reason the document states. It does not claim the purchase is irregular.`,
      },
    })
  }
  console.log(`  grano compra: ${singles.length} fichas`)
```

- [ ] **Step 4: Run the dry run and read the totals**

Run: `npm run build-derived-casos -- --dry-run`
Expected: informa los cuatro granos y su suma. La suma tiene que acercarse a 600.

- [ ] **Step 5: Write and verify**

Run: `npm run build-derived-casos`
Run: `npm run verify:casos:derived`
Expected: las dos terminan bien.

- [ ] **Step 6: Commit**

```bash
git add src/jobs/build-derived-casos.ts
git commit -m "feat(casos): sumar los granos por proveedor, por causal y por compra"
```

---

### Task 10: Traducciones y presencia en el hub

**Files:**
- Modify: `app/i18n/locales/es.json`
- Modify: `app/i18n/locales/en.json`

**Interfaces:**
- Consumes: la clave de tema `gasto-observado` (Task 4).
- Produces: las etiquetas que muestran el chip del hub y la página de tema.

- [ ] **Step 1: Find the key the theme chip reads**

```bash
grep -n '"casos"' -A 40 app/i18n/locales/es.json | head -60
```

Buscá el bloque `casos.status` y `casos.hub`. El chip del tema usa el `label` que viene del
API, así que el tema nuevo ya sale traducido por la Task 4. Lo que falta es el texto de
estado si el bloque `casos.status` no tiene `auditoria`.

- [ ] **Step 2: Confirm the status label exists in both locales**

```bash
grep -n '"auditoria"' app/i18n/locales/es.json app/i18n/locales/en.json
```

Expected: aparece en los dos. Si falta, agregalo al bloque `casos.status`:
`"auditoria": "Observado por el Tribunal de Cuentas"` y
`"auditoria": "Objected to by the Court of Auditors"`.

**Cuidado al editar los JSON de locales.** Editá con `Edit`, nunca reescribiendo el archivo
con un volcado de JSON: una reescritura cambia el orden y la sangría y produce cientos de
líneas de ruido en el diff.

- [ ] **Step 3: Verify on the dev server**

Cargá `/investigaciones` y `/investigaciones/temas/gasto-observado` en los dos idiomas.
Expected: el chip del tema nuevo muestra su etiqueta y su cuenta. Ninguna clave cruda a la vista.

- [ ] **Step 4: Commit**

```bash
git add app/i18n/locales/es.json app/i18n/locales/en.json
git commit -m "i18n(casos): etiquetas del tema gasto-observado"
```

---

### Task 11: Cierre — comprobar todo junto

**Files:**
- Modify: `app/server/utils/casos/context.md` si existe, o `CLAUDE.md` en el apartado de trampas.

- [ ] **Step 1: Full verification sweep**

```bash
npx tsc --noEmit
npx eslint src shared scripts tests
npm test
npm run check:layout
npm run verify:casos
npm run verify:casos:derived
```

Expected: los seis terminan bien. Anotá y reportá cualquiera que falle: no lo tapes.

- [ ] **Step 2: Check the resource claim is real**

```bash
curl -s 'http://[::1]:3600/api/casos' -o /dev/null -w '%{size_download} bytes\n'
```

Expected: por debajo de 60.000 bytes. Antes de paginar, con mil fichas, esto pasaba de 2MB.

- [ ] **Step 3: 360px check on the three routes**

Abrí a 360px de ancho: `/investigaciones`, `/investigaciones/casos`,
`/investigaciones/temas/gasto-observado` y una ficha derivada.
En cada una verificá `document.documentElement.scrollWidth <= innerWidth`.

- [ ] **Step 4: Record the trap in the repo brief**

Sumá a `CLAUDE.md`, en «Traps that cost a cycle»:

```markdown
- **Las fichas de caso vienen de DOS fuentes.** Las curadas están en
  `app/server/utils/casos/dossiers/*.ts`; las derivadas están en la colección
  `derived_casos` y las arma `src/jobs/build-derived-casos.ts`. `listCasoDefs()` sólo
  devuelve las curadas. Para las dos, `listAllCasoDefs()`, que es asíncrona.
```

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: anotar las dos fuentes de fichas de caso"
```

---

## Fases siguientes

- **Fase 2 — Hallazgos medidos (+250).** Familias de indicador aplicadas a cada entidad que
  supera un umbral, con `origin: 'medicion'` en la misma colección. Reusa las Tasks 4, 5, 7 y
  8 sin tocarlas.
- **Fase 3 — Casos de prensa (+150).** Temas nuevos en módulos de TS, con el flujo que ya
  existe: escribir, `verify:casos`, revisar.
