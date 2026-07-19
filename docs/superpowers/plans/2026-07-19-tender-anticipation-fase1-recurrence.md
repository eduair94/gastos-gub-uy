# Anticipación de llamados — Fase 1 (recurrencia, solo lectura) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Precompute recurring public-tender patterns (buyer × mid-level SICE rubro) from the historical `releases` and surface them as "próximos llamados probables" on a public page + reusable card — no alerts yet.

**Architecture:** A monthly `tsx` rollup job clones `refresh-dept-indicators.ts` (COLLSCAN + compute-then-swap-by-`dataVersion`), grouping tender-phase events by `buyer.id × rubroNode`, computing cadence + confidence with pure functions, and writing a new `tender_forecast` collection. A bare Nitro endpoint reads it by index; a Vuetify page + a reusable component render it with honest coverage caveats.

**Tech Stack:** TypeScript, Mongoose, MongoDB aggregation, Nuxt 3 / Nitro (`defineEventHandler`), Vue 3 + Vuetify 3, `tsx` (job + verification scripts). Spec: `docs/superpowers/specs/2026-07-19-tender-anticipation-design.md`.

## Global Constraints

- **No unit-test runner in this repo.** "Tests" = standalone `tsx` assertion scripts under `scripts/verify/` that `throw` (exit 1) on failure. Run with `npx tsx scripts/verify/<name>.ts`. This is the repo's real verification convention (pure fns + live-DB assertion + curl).
- **`app/.env` points at the LIVE remote DB.** Verification scripts read production data — read-only queries only; the job itself is idempotent (compute-then-swap) but run it deliberately.
- **Dev server runs on port 3600** (`npm run dev`). `tsc`/build are env-broken here; verify with targeted `tsx` scripts + `curl localhost:3600`.
- **`classification.id` == `sice_catalog.code`** (leaf article code) — verified end-to-end. Rubro node tokens live in `sice_catalog.rubroTokens = ["F2","SF2.6","C2.6.5","SC2.6.5.3"]` (familia/subfamilia/clase/subclase). Level-3 (clase) node = `rubroTokens[2]`, label = `clasName`.
- **`buyer.id` is NOT indexed on `releases`** (only `buyer.name`). All `buyer.id`-led aggregation is a COLLSCAN — use `.option({ allowDiskUse: true })`, monthly only, NEVER on a request path.
- **Money comes from `item_price_baselines`** (already reconciled for award amendments), NEVER from raw amounts or `open_call.estimatedValue`.
- **Autoindex is OFF.** New collection indexes are declared on the schema AND must be added to `scripts/ensure-indexes.ts` to be built in prod.
- **Model imports in `src/jobs/*` come from `../../shared/...`** (not the `app/server/utils` barrel). Endpoints import models from `../../utils/models` and `connectToDatabase` from `../../utils/database`.
- **Nav labels are i18n keys**, not literals: a nav child `{key:'anticipacion'}` renders `t('nav.anticipacion')` → add the key to `app/i18n/locales/es.json` + `en.json`.
- **Constants (locked):** `MIN_EVENTS=3`, `RUBRO_LEVEL=3` (clase, fallback subfamilia), `EVIDENCE_TOP=5`, `MIN_DISP_DAYS=15`, `MAX_DISP_DAYS=180`, `DISPLAY_THRESHOLD=0.35`, `ALERT_THRESHOLD=0.60` (used in Fase 2).

---

## File Structure

**Create:**
- `shared/forecast/constants.ts` — locked tuning constants (shared by job + Fase 2).
- `shared/forecast/recurrence.ts` — PURE cadence/window/confidence math.
- `shared/forecast/rubro-node.ts` — PURE leaf-catalog → rubro-node picker.
- `shared/models/tender_forecast.ts` — `ITenderForecast` + `TenderForecastModel`.
- `src/jobs/refresh-tender-forecast.ts` — the rollup job.
- `app/server/api/analytics/anticipacion.get.ts` — public read endpoint.
- `app/pages/analytics/anticipacion.vue` — public page.
- `app/components/AnticipatedTenderCard.vue` — reusable forecast card.
- `scripts/verify/verify-recurrence.ts`, `scripts/verify/verify-rubro-node.ts`, `scripts/verify/verify-tender-forecast.ts` — assertion scripts.

**Modify:**
- `shared/models/index.ts` — re-export `tender_forecast`.
- `scripts/ensure-indexes.ts` — register `tender_forecast` indexes.
- `package.json` — add `refresh-tender-forecast` script.
- `src/cronserver.ts` — monthly schedule + manual `/cron/tender-forecast` route + guard/status.
- `app/layouts/default.vue` — nav child under "Análisis".
- `app/i18n/locales/es.json` + `en.json` — `nav.anticipacion` + page strings.
- `app/pages/products/[code].vue` (and/or buyer profile) — mount `AnticipatedTenderCard`.

---

### Task 1: `tender_forecast` model + barrel + index registration

**Files:**
- Create: `shared/models/tender_forecast.ts`
- Modify: `shared/models/index.ts` (add re-export)
- Modify: `scripts/ensure-indexes.ts` (register indexes)
- Test: `scripts/verify/verify-tender-forecast-model.ts`

**Interfaces:**
- Produces: `ITenderForecast` (interface), `TenderForecastModel` (Mongoose model, collection `tender_forecast`).

- [ ] **Step 1: Write the failing assertion script**

Create `scripts/verify/verify-tender-forecast-model.ts`:

```ts
#!/usr/bin/env tsx
import { TenderForecastModel } from '../../shared/models'
import type { ITenderForecast } from '../../shared/models'

function assert(cond: unknown, msg: string): void { if (!cond) throw new Error(`FAIL: ${msg}`) }

assert(TenderForecastModel, 'TenderForecastModel exported from barrel')
assert(TenderForecastModel.collection.collectionName === 'tender_forecast', 'collection name is tender_forecast')
const idx = TenderForecastModel.schema.indexes()
const hasUnique = idx.some(([spec, opts]: any) => spec.buyerId === 1 && spec.rubroNodeId === 1 && opts?.unique)
assert(hasUnique, 'unique {buyerId,rubroNodeId} index declared')
const sample: ITenderForecast = {
  buyerId: '80-1', buyerName: 'X', rubroNodeId: 'C2.6.5', rubroLabel: 'Y', rubroLevel: 3,
  rubroAncestors: ['C2.6.5', '28267'], evidenceItems: [{ classificationId: '28267', label: 'Z', count: 4 }],
  cadence: { medianDays: 365, cvDays: 0.1, seasonalMonths: [3], eventCount: 5 },
  lastEventDate: new Date(), expectedWindow: { start: new Date(), end: new Date() },
  confidence: 0.8, basis: 'recurrence', dataVersion: 'v1', generatedAt: new Date(),
}
assert(sample.rubroNodeId === 'C2.6.5', 'ITenderForecast shape compiles')
console.log('OK verify-tender-forecast-model')
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx tsx scripts/verify/verify-tender-forecast-model.ts`
Expected: FAIL — `Cannot find module` / `TenderForecastModel` undefined.

- [ ] **Step 3: Create the model**

Create `shared/models/tender_forecast.ts` (mirrors `dept_indicators.ts` HMR-safe pattern):

```ts
import type { Model } from "mongoose";
import { Schema } from "mongoose";
import { mongoose } from "../connection/database";

/**
 * Precomputed recurrence forecast per (buyer.id × mid-level SICE rubro node).
 * "Este organismo suele licitar este rubro cada ~N meses; próximo esperado ~ventana."
 * Rebuilt monthly by src/jobs/refresh-tender-forecast.ts (compute-then-swap by
 * dataVersion). DESCRIPTIVE / derived — the OCDS feed carries no pre-publication
 * signal (0 planning, 91% status null); this is a pattern estimate, never a fact.
 * Read path only .find() by index (buyer.id is unindexed on releases).
 */
export interface ITenderForecast {
  buyerId: string;
  buyerName: string;
  rubroNodeId: string;        // SICE node token, e.g. "C2.6.5"
  rubroLabel: string;
  rubroLevel: number;         // 3 = clase (fallback 2 = subfamilia)
  rubroAncestors: string[];   // node token + ancestors + evidence leaf codes (watch-match key)
  evidenceItems: { classificationId: string; label: string; count: number }[];
  cadence: {
    medianDays: number;
    cvDays: number;           // coefficient of variation of inter-event intervals
    seasonalMonths: number[]; // 1..12 dominant
    eventCount: number;
  };
  lastEventDate: Date;
  expectedWindow: { start: Date; end: Date };
  confidence: number;         // 0..1
  incumbentSupplier?: { id?: string; name?: string };
  expectedAmount?: { currency: string; p25: number; p50: number };
  basis: "recurrence";        // extensible: "expiry" | "recurrence+expiry"
  dataVersion: string;
  generatedAt: Date;
}

const TenderForecastSchema = new Schema<ITenderForecast>(
  {
    buyerId: { type: String, required: true },
    buyerName: { type: String, required: true, default: "" },
    rubroNodeId: { type: String, required: true },
    rubroLabel: { type: String, required: true, default: "" },
    rubroLevel: { type: Number, required: true, default: 3 },
    rubroAncestors: { type: [String], default: [] },
    evidenceItems: {
      type: [{ classificationId: String, label: String, count: Number }],
      default: [],
    },
    cadence: {
      medianDays: { type: Number, required: true },
      cvDays: { type: Number, required: true, default: 0 },
      seasonalMonths: { type: [Number], default: [] },
      eventCount: { type: Number, required: true, default: 0 },
    },
    lastEventDate: { type: Date, required: true },
    expectedWindow: {
      start: { type: Date, required: true },
      end: { type: Date, required: true },
    },
    confidence: { type: Number, required: true, default: 0 },
    incumbentSupplier: { id: { type: String }, name: { type: String } },
    expectedAmount: { currency: { type: String }, p25: { type: Number }, p50: { type: Number } },
    basis: { type: String, required: true, default: "recurrence" },
    dataVersion: { type: String, required: true },
    generatedAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true, collection: "tender_forecast" }
);

TenderForecastSchema.index({ buyerId: 1, rubroNodeId: 1 }, { unique: true });
TenderForecastSchema.index({ dataVersion: 1 });
TenderForecastSchema.index({ "expectedWindow.start": 1 });
TenderForecastSchema.index({ rubroAncestors: 1 });
TenderForecastSchema.index({ confidence: -1 });

export const TenderForecastModel: Model<ITenderForecast> =
  (mongoose.models.TenderForecast as Model<ITenderForecast>)
  || mongoose.model<ITenderForecast>("TenderForecast", TenderForecastSchema);
```

- [ ] **Step 4: Re-export from the barrel**

In `shared/models/index.ts`, add next to the other exports:

```ts
export * from './tender_forecast';
```

- [ ] **Step 5: Register indexes in ensure-indexes**

In `scripts/ensure-indexes.ts`, find where models call `.createIndexes()` (or `syncIndexes()`) and add `TenderForecastModel` to the same list/loop (import it from `../shared/models`). Match the file's existing style exactly — if it iterates a `models` array, append `TenderForecastModel`; if it calls per-model, add `await TenderForecastModel.createIndexes()`.

- [ ] **Step 6: Run the assertion, verify it passes**

Run: `npx tsx scripts/verify/verify-tender-forecast-model.ts`
Expected: `OK verify-tender-forecast-model`

- [ ] **Step 7: Commit**

```bash
git add shared/models/tender_forecast.ts shared/models/index.ts scripts/ensure-indexes.ts scripts/verify/verify-tender-forecast-model.ts
git commit -m "feat(anticipacion): tender_forecast model + index registration"
```

---

### Task 2: Pure recurrence math (`shared/forecast/recurrence.ts`)

**Files:**
- Create: `shared/forecast/constants.ts`
- Create: `shared/forecast/recurrence.ts`
- Test: `scripts/verify/verify-recurrence.ts`

**Interfaces:**
- Produces:
  - `computeCadence(dates: Date[]): CadenceResult | null` where `CadenceResult = { medianDays: number; cvDays: number; seasonalMonths: number[]; eventCount: number }`
  - `expectedWindow(lastEventDate: Date, medianDays: number, cvDays: number): { start: Date; end: Date }`
  - `confidenceScore(input: { cvDays: number; eventCount: number; tenderShare: number }): number`
  - constants from `shared/forecast/constants.ts`

- [ ] **Step 1: Write the failing assertion script**

Create `scripts/verify/verify-recurrence.ts`:

```ts
#!/usr/bin/env tsx
import { computeCadence, expectedWindow, confidenceScore } from '../../shared/forecast/recurrence'

function assert(c: unknown, m: string) { if (!c) throw new Error(`FAIL: ${m}`) }
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol

// Annual cadence → medianDays≈365, low CV.
const annual = [2018, 2019, 2020, 2021, 2022].map(y => new Date(Date.UTC(y, 2, 15)))
const c1 = computeCadence(annual)!
assert(c1, 'annual returns a result')
assert(near(c1.medianDays, 365, 3), `annual median ~365 (got ${c1.medianDays})`)
assert(c1.cvDays < 0.05, `annual CV low (got ${c1.cvDays})`)
assert(c1.eventCount === 5, 'annual eventCount 5')
assert(c1.seasonalMonths.includes(3), 'annual seasonal month = March')

// Fewer than 2 events → null.
assert(computeCadence([new Date()]) === null, 'single event → null')
assert(computeCadence([]) === null, 'empty → null')

// Window centered a median after last event, dispersion clamped.
const w = expectedWindow(new Date(Date.UTC(2022, 2, 15)), 365, 0.1)
assert(w.start.getTime() < w.end.getTime(), 'window ordered')
assert(w.start > new Date(Date.UTC(2022, 2, 15)), 'window starts after last event')

// Confidence: tight cadence + many events + tender-heavy → high; erratic → low.
const hi = confidenceScore({ cvDays: 0.05, eventCount: 6, tenderShare: 1 })
const lo = confidenceScore({ cvDays: 2.0, eventCount: 3, tenderShare: 0 })
assert(hi > 0.7, `tight cadence high confidence (got ${hi})`)
assert(lo < 0.4, `erratic low confidence (got ${lo})`)
assert(hi >= 0 && hi <= 1 && lo >= 0 && lo <= 1, 'confidence in [0,1]')
console.log('OK verify-recurrence')
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx tsx scripts/verify/verify-recurrence.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the constants**

Create `shared/forecast/constants.ts`:

```ts
// Locked tuning constants for the tender-anticipation feature (Fase 1 + 2).
export const MIN_EVENTS = 3;            // fewer distinct events → not a recurrence
export const RUBRO_LEVEL = 3;           // clase; fallback subfamilia (2)
export const EVIDENCE_TOP = 5;          // leaf articles kept as evidence per group
export const MIN_DISP_DAYS = 15;        // expected-window half-width floor
export const MAX_DISP_DAYS = 180;       // …and ceiling
export const DISPLAY_THRESHOLD = 0.35;  // appears on the page
export const ALERT_THRESHOLD = 0.60;    // fires external channels (Fase 2)
```

- [ ] **Step 4: Create the recurrence math**

Create `shared/forecast/recurrence.ts`:

```ts
import { MIN_DISP_DAYS, MAX_DISP_DAYS } from "./constants";

const DAY_MS = 86_400_000;

export interface CadenceResult {
  medianDays: number;
  cvDays: number;
  seasonalMonths: number[];
  eventCount: number;
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}
function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Dominant month(s) of the year (1..12) — bins holding the max count. */
function dominantMonths(dates: Date[]): number[] {
  const bins = new Array(12).fill(0);
  for (const d of dates) bins[d.getUTCMonth()]++;
  const max = Math.max(...bins);
  if (max === 0) return [];
  const out: number[] = [];
  for (let i = 0; i < 12; i++) if (bins[i] === max) out.push(i + 1);
  return out;
}

/**
 * Cadence over a group's event dates. Dedupes identical timestamps, needs ≥2
 * distinct events to yield intervals. cvDays = stdev/mean of inter-event gaps
 * (0 = perfectly regular; large = erratic).
 */
export function computeCadence(dates: Date[]): CadenceResult | null {
  const ms = dates.map(d => d.getTime()).filter(n => Number.isFinite(n)).sort((a, b) => a - b);
  const uniq = ms.filter((v, i) => i === 0 || v !== ms[i - 1]);
  if (uniq.length < 2) return null;
  const intervals: number[] = [];
  for (let i = 1; i < uniq.length; i++) intervals.push((uniq[i]! - uniq[i - 1]!) / DAY_MS);
  const medianDays = median(intervals);
  const m = mean(intervals);
  const variance = mean(intervals.map(x => (x - m) ** 2));
  const cvDays = m > 0 ? Math.sqrt(variance) / m : 0;
  return {
    medianDays,
    cvDays,
    seasonalMonths: dominantMonths(dates),
    eventCount: uniq.length,
  };
}

/** Expected next window: centered a median after last event, ± clamped dispersion. */
export function expectedWindow(lastEventDate: Date, medianDays: number, cvDays: number): { start: Date; end: Date } {
  const disp = clamp(medianDays * cvDays, MIN_DISP_DAYS, MAX_DISP_DAYS);
  const center = lastEventDate.getTime() + medianDays * DAY_MS;
  return { start: new Date(center - disp * DAY_MS), end: new Date(center + disp * DAY_MS) };
}

/**
 * Confidence in [0,1]. Tight cadence (low CV) dominates; small bonuses for more
 * events and a tender-heavy (competitive, recurring) method mix.
 */
export function confidenceScore(input: { cvDays: number; eventCount: number; tenderShare: number }): number {
  const regularity = 1 / (1 + input.cvDays);            // 1 at CV=0, →0 as CV grows
  const evBonus = clamp((input.eventCount - 3) * 0.03, 0, 0.15);
  const methodBonus = clamp(input.tenderShare * 0.15, 0, 0.15);
  return clamp(regularity * 0.8 + evBonus + methodBonus, 0, 1);
}
```

- [ ] **Step 5: Run the assertion, verify it passes**

Run: `npx tsx scripts/verify/verify-recurrence.ts`
Expected: `OK verify-recurrence`

- [ ] **Step 6: Commit**

```bash
git add shared/forecast/constants.ts shared/forecast/recurrence.ts scripts/verify/verify-recurrence.ts
git commit -m "feat(anticipacion): pure recurrence cadence/window/confidence math"
```

---

### Task 3: Pure rubro-node picker (`shared/forecast/rubro-node.ts`)

**Files:**
- Create: `shared/forecast/rubro-node.ts`
- Test: `scripts/verify/verify-rubro-node.ts`

**Interfaces:**
- Consumes: `sice_catalog` field shape (`rubroTokens`, `subfName`, `clasName`).
- Produces:
  - `pickRubroNode(cat: CatalogNodeFields | undefined, level: 2 | 3): RubroNode | null` where `RubroNode = { nodeId: string; label: string; level: number }` and `CatalogNodeFields = { code: string; rubroTokens?: string[]; subfName?: string; clasName?: string }`
  - `ancestorsForLeaf(cat: CatalogNodeFields | undefined): string[]` — leaf code + all its rubro tokens.

- [ ] **Step 1: Write the failing assertion script**

Create `scripts/verify/verify-rubro-node.ts`:

```ts
#!/usr/bin/env tsx
import { pickRubroNode, ancestorsForLeaf } from '../../shared/forecast/rubro-node'

function assert(c: unknown, m: string) { if (!c) throw new Error(`FAIL: ${m}`) }
const cat = { code: '28267', rubroTokens: ['F2', 'SF2.6', 'C2.6.5', 'SC2.6.5.3'], subfName: 'Sub', clasName: 'Clase X' }

const l3 = pickRubroNode(cat, 3)!
assert(l3.nodeId === 'C2.6.5', 'level 3 nodeId = clase token')
assert(l3.label === 'Clase X', 'level 3 label = clasName')
assert(l3.level === 3, 'level 3 level field')

const l2 = pickRubroNode(cat, 2)!
assert(l2.nodeId === 'SF2.6' && l2.label === 'Sub', 'level 2 = subfamilia token+label')

// Missing clase token → falls back to subfamilia.
const short = { code: '9', rubroTokens: ['F9', 'SF9.1'], subfName: 'S9' }
const fb = pickRubroNode(short, 3)!
assert(fb.nodeId === 'SF9.1' && fb.level === 2, 'level 3 falls back to subfamilia when clase absent')

assert(pickRubroNode(undefined, 3) === null, 'undefined catalog → null')
assert(pickRubroNode({ code: 'x' }, 3) === null, 'no tokens → null')

const anc = ancestorsForLeaf(cat)
assert(anc.includes('28267') && anc.includes('C2.6.5') && anc.includes('F2'), 'ancestors include leaf + all tokens')
console.log('OK verify-rubro-node')
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx tsx scripts/verify/verify-rubro-node.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the picker**

Create `shared/forecast/rubro-node.ts`:

```ts
// Pure resolution of a leaf article's catalog fields → a mid-level rubro node.
// sice_catalog.rubroTokens is ordered [familia, subfamilia, clase, subclase]:
//   index 0 = "F2", 1 = "SF2.6", 2 = "C2.6.5", 3 = "SC2.6.5.3".
export interface CatalogNodeFields {
  code: string;
  rubroTokens?: string[] | undefined;
  subfName?: string | undefined;
  clasName?: string | undefined;
}

export interface RubroNode {
  nodeId: string;
  label: string;
  level: number; // 3 = clase, 2 = subfamilia, 1 = familia
}

/** Pick the node at `level` (3=clase preferred), falling back up when absent. */
export function pickRubroNode(cat: CatalogNodeFields | undefined, level: 2 | 3): RubroNode | null {
  const t = cat?.rubroTokens;
  if (!t?.length) return null;
  if (level === 3 && t[2]) return { nodeId: t[2], label: cat!.clasName || t[2], level: 3 };
  if (t[1]) return { nodeId: t[1], label: cat!.subfName || t[1], level: 2 };
  if (t[0]) return { nodeId: t[0], label: t[0], level: 1 };
  return null;
}

/** Leaf code + every rubro ancestor token — the watch-match key set for a leaf. */
export function ancestorsForLeaf(cat: CatalogNodeFields | undefined): string[] {
  if (!cat) return [];
  return [cat.code, ...(cat.rubroTokens ?? [])].filter(Boolean);
}
```

- [ ] **Step 4: Run the assertion, verify it passes**

Run: `npx tsx scripts/verify/verify-rubro-node.ts`
Expected: `OK verify-rubro-node`

- [ ] **Step 5: Commit**

```bash
git add shared/forecast/rubro-node.ts scripts/verify/verify-rubro-node.ts
git commit -m "feat(anticipacion): pure rubro-node picker + leaf ancestors"
```

---

### Task 4: The rollup job (`src/jobs/refresh-tender-forecast.ts`)

**Files:**
- Create: `src/jobs/refresh-tender-forecast.ts`
- Modify: `package.json` (scripts)
- Test: `scripts/verify/verify-tender-forecast.ts` (live-DB invariants)

**Interfaces:**
- Consumes: `computeCadence`, `expectedWindow`, `confidenceScore` (Task 2); `pickRubroNode`, `ancestorsForLeaf` (Task 3); `TenderForecastModel` (Task 1); `ReleaseModel`, `SiceCatalogModel`, `ItemPriceBaselineModel`, `OpenCallModel` from `../../shared/models`; `releaseKind` from `./open-calls/project`; constants from `../../shared/forecast/constants`.
- Produces: `run(): Promise<void>` (default job entry) + `export { run }`.

- [ ] **Step 1: Add the npm script**

In `package.json` `scripts`, next to `refresh-dept-indicators`:

```json
"refresh-tender-forecast": "tsx src/jobs/refresh-tender-forecast.ts",
```

- [ ] **Step 2: Write the failing live-DB assertion script**

Create `scripts/verify/verify-tender-forecast.ts`:

```ts
#!/usr/bin/env tsx
import { connectToDatabase } from '../../shared/connection/database'
import { TenderForecastModel } from '../../shared/models'
import { MIN_EVENTS } from '../../shared/forecast/constants'

function assert(c: unknown, m: string) { if (!c) throw new Error(`FAIL: ${m}`) }

async function main() {
  await connectToDatabase()
  const n = await TenderForecastModel.estimatedDocumentCount()
  assert(n > 0, `forecasts exist (got ${n}) — run: npm run refresh-tender-forecast first`)

  const bad = await TenderForecastModel.findOne({ 'cadence.eventCount': { $lt: MIN_EVENTS } }).lean()
  assert(!bad, `no forecast below MIN_EVENTS (found ${bad?._id})`)

  const oob = await TenderForecastModel.findOne({ $or: [{ confidence: { $lt: 0 } }, { confidence: { $gt: 1 } }] }).lean()
  assert(!oob, `confidence in [0,1] (violated by ${oob?._id})`)

  const sample = await TenderForecastModel.find().sort({ confidence: -1 }).limit(5).lean()
  for (const f of sample) {
    assert(f.expectedWindow.start.getTime() > f.lastEventDate.getTime(), `window after lastEvent (${f._id})`)
    assert(f.rubroAncestors.length > 0, `has rubroAncestors (${f._id})`)
  }
  const versions = await TenderForecastModel.distinct('dataVersion')
  assert(versions.length === 1, `exactly one dataVersion after swap (got ${versions.length})`)

  console.log(`OK verify-tender-forecast — ${n} forecasts, top confidence ${sample[0]?.confidence?.toFixed(2)}`)
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
```

- [ ] **Step 3: Run it, verify it fails**

Run: `npx tsx scripts/verify/verify-tender-forecast.ts`
Expected: FAIL — `forecasts exist (got 0)` (collection empty; job not written yet).

- [ ] **Step 4: Write the job**

Create `src/jobs/refresh-tender-forecast.ts`:

```ts
#!/usr/bin/env tsx
/**
 * Monthly precompute of recurring-tender forecasts per (buyer.id × mid-level SICE
 * rubro node), written to `tender_forecast` via compute-then-swap-by-dataVersion.
 *
 * Two COLLSCANs over `releases` (buyer.id unindexed, allowDiskUse, monthly only):
 *   E. events    — tender-phase releases → per (buyer, leaf) event {date, compraId, method}
 *   W. incumbents — award-phase releases → per (buyer, leaf) latest award supplier
 * Then in memory: leaf → rubro node (sice_catalog), regroup (buyer, node), dedupe
 * events by compraId, compute cadence/window/confidence, attach evidence + incumbent
 * + expected amount (item_price_baselines), suppress groups already open, write.
 *
 * DERIVED / DESCRIPTIVE — the feed has no pre-publication signal. Run manually with
 * `npm run refresh-tender-forecast`. Scheduled monthly by cronserver.ts.
 */
import { connectToDatabase } from "../../shared/connection/database";
import {
  ItemPriceBaselineModel, OpenCallModel, ReleaseModel, SiceCatalogModel, TenderForecastModel,
} from "../../shared/models";
import type { ITenderForecast } from "../../shared/models";
import { releaseKind } from "./open-calls/project";
import { computeCadence, expectedWindow, confidenceScore } from "../../shared/forecast/recurrence";
import { pickRubroNode, ancestorsForLeaf } from "../../shared/forecast/rubro-node";
import {
  MIN_EVENTS, RUBRO_LEVEL, EVIDENCE_TOP, DISPLAY_THRESHOLD,
} from "../../shared/forecast/constants";

// One event of a llamado for a (buyer, leaf) pair.
interface EventRow { _id: { b: string; leaf: string }; events: { d: Date; compra: string; m: string | null }[] }
interface AwardRow { _id: { b: string; leaf: string }; date: Date; supName: string | null; supId: string | null }

const RUBRO_LVL = RUBRO_LEVEL as 2 | 3;

async function run(): Promise<void> {
  const started = Date.now();
  if (!process.env.MONGO_SOCKET_TIMEOUT_MS) process.env.MONGO_SOCKET_TIMEOUT_MS = String(15 * 60 * 1000);
  const dataVersion = `v${Date.now()}`;
  console.log("[tender-forecast] connecting…");
  await connectToDatabase();

  // ---- E. events: tender-phase releases → per (buyer, leaf) event list ----
  // Tender phase = release.id starts with llamado-/aclar_llamado-/ajuste_llamado-.
  // Event date = tender.tenderPeriod.startDate, fallback release-level date.
  console.log("[tender-forecast] E: events…");
  const events: EventRow[] = await ReleaseModel.aggregate([
    { $match: { "buyer.id": { $type: "string", $ne: "" } } },
    {
      $project: {
        b: "$buyer.id",
        compra: "$ocid",
        m: "$tender.procurementMethodDetails",
        d: { $ifNull: ["$tender.tenderPeriod.startDate", "$date"] },
        leaves: "$tender.items.classification.id",
        isTender: {
          $regexMatch: { input: { $ifNull: ["$id", ""] }, regex: "^(llamado|aclar_llamado|ajuste_llamado)-" },
        },
      },
    },
    { $match: { isTender: true, d: { $type: "date" }, leaves: { $type: "array", $ne: [] } } },
    { $unwind: "$leaves" },
    { $match: { leaves: { $type: "string", $ne: "" } } },
    {
      $group: {
        _id: { b: "$b", leaf: "$leaves" },
        events: { $push: { d: "$d", compra: "$compra", m: "$m" } },
      },
    },
    { $match: { $expr: { $gte: [{ $size: "$events" }, MIN_EVENTS] } } },
  ]).option({ allowDiskUse: true });

  // ---- W. incumbents: award-phase releases → latest award supplier per (buyer, leaf) ----
  console.log("[tender-forecast] W: incumbents…");
  const awards: AwardRow[] = await ReleaseModel.aggregate([
    { $match: { "buyer.id": { $type: "string", $ne: "" }, awards: { $type: "array", $ne: [] } } },
    {
      $project: {
        b: "$buyer.id",
        d: { $ifNull: [{ $arrayElemAt: ["$awards.date", 0] }, "$date"] },
        sup: { $arrayElemAt: [{ $arrayElemAt: ["$awards.suppliers", 0] }, 0] },
        leaves: "$tender.items.classification.id",
        isAward: { $regexMatch: { input: { $ifNull: ["$id", ""] }, regex: "^(adjudicacion|ajuste_adjudicacion)-" } },
      },
    },
    { $match: { isAward: true, d: { $type: "date" }, leaves: { $type: "array", $ne: [] } } },
    { $unwind: "$leaves" },
    { $match: { leaves: { $type: "string", $ne: "" } } },
    { $sort: { d: 1 } },
    {
      $group: {
        _id: { b: "$b", leaf: "$leaves" },
        date: { $last: "$d" },
        supName: { $last: "$sup.name" },
        supId: { $last: "$sup.id" },
      },
    },
  ]).option({ allowDiskUse: true });

  // ---- Resolve every leaf → catalog fields (batch) ----
  const leafSet = new Set<string>();
  for (const e of events) leafSet.add(e._id.leaf);
  console.log(`[tender-forecast] resolving ${leafSet.size} leaf codes…`);
  const cats = await SiceCatalogModel.find({ code: { $in: [...leafSet] } })
    .select("code rubroTokens subfName clasName")
    .lean();
  const catByCode = new Map(cats.map(c => [c.code, c as any]));

  // ---- Fold (buyer × leaf) events into (buyer × rubroNode) groups ----
  interface Group {
    buyerId: string; rubroNodeId: string; rubroLabel: string; rubroLevel: number;
    dates: Date[]; compras: Set<string>;
    leafCounts: Map<string, number>; leafLabels: Map<string, string>;
    ancestors: Set<string>; methods: { tender: number; total: number };
  }
  const groups = new Map<string, Group>();
  const buyerNames = new Map<string, string>();

  for (const e of events) {
    const cat = catByCode.get(e._id.leaf);
    const node = pickRubroNode(cat, RUBRO_LVL);
    if (!node) continue; // leaf not in catalog → no rubro node → skip
    const key = `${e._id.b}|${node.nodeId}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        buyerId: e._id.b, rubroNodeId: node.nodeId, rubroLabel: node.label, rubroLevel: node.level,
        dates: [], compras: new Set(), leafCounts: new Map(), leafLabels: new Map(),
        ancestors: new Set(), methods: { tender: 0, total: 0 },
      };
      groups.set(key, g);
    }
    for (const anc of ancestorsForLeaf(cat)) g.ancestors.add(anc);
    const label = cat?.clasName || cat?.subfName || e._id.leaf;
    g.leafLabels.set(e._id.leaf, label);
    for (const ev of e.events) {
      if (g.compras.has(ev.compra)) continue; // one llamado counts once per group
      g.compras.add(ev.compra);
      g.dates.push(ev.d instanceof Date ? ev.d : new Date(ev.d));
      g.leafCounts.set(e._id.leaf, (g.leafCounts.get(e._id.leaf) ?? 0) + 1);
      g.methods.total++;
      if (typeof ev.m === "string" && /licitaci/i.test(ev.m)) g.methods.tender++;
    }
  }

  // Incumbent per (buyer, node): the latest award among the group's leaves.
  const incByGroup = new Map<string, { date: Date; name: string | null; id: string | null }>();
  for (const a of awards) {
    const cat = catByCode.get(a._id.leaf);
    const node = pickRubroNode(cat, RUBRO_LVL);
    if (!node) continue;
    const key = `${a._id.b}|${node.nodeId}`;
    const cur = incByGroup.get(key);
    if (!cur || a.date.getTime() > cur.date.getTime()) {
      incByGroup.set(key, { date: a.date, name: a.supName, id: a.supId });
    }
  }

  // Buyer names (one representative per id) — cheap distinct-ish lookup.
  const buyerIds = [...new Set([...groups.values()].map(g => g.buyerId))];
  const nameDocs = await ReleaseModel.aggregate([
    { $match: { "buyer.id": { $in: buyerIds } } },
    { $group: { _id: "$buyer.id", name: { $first: "$buyer.name" } } },
  ]).option({ allowDiskUse: true });
  for (const d of nameDocs) buyerNames.set(d._id, d.name ?? "");

  // Expected amount: item_price_baselines for the group's evidence leaves.
  const evidenceLeaves = new Set<string>();
  for (const g of groups.values()) {
    const top = [...g.leafCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, EVIDENCE_TOP);
    for (const [leaf] of top) evidenceLeaves.add(leaf);
  }
  const baselines = await ItemPriceBaselineModel.find({ classificationId: { $in: [...evidenceLeaves] } })
    .select("classificationId currency p25 p50 n")
    .sort({ n: -1 })
    .lean();
  const baselineByLeaf = new Map<string, { currency: string; p25: number; p50: number }>();
  for (const b of baselines) {
    if (!baselineByLeaf.has(b.classificationId)) {
      baselineByLeaf.set(b.classificationId, { currency: b.currency, p25: b.p25, p50: b.p50 });
    }
  }

  // ---- Build docs ----
  const docs: ITenderForecast[] = [];
  for (const g of groups.values()) {
    const cadence = computeCadence(g.dates);
    if (!cadence || cadence.eventCount < MIN_EVENTS) continue;
    const lastEventDate = new Date(Math.max(...g.dates.map(d => d.getTime())));
    const window = expectedWindow(lastEventDate, cadence.medianDays, cadence.cvDays);
    const tenderShare = g.methods.total ? g.methods.tender / g.methods.total : 0;
    const confidence = confidenceScore({ cvDays: cadence.cvDays, eventCount: cadence.eventCount, tenderShare });
    if (confidence < DISPLAY_THRESHOLD) continue;

    const top = [...g.leafCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, EVIDENCE_TOP);
    const evidenceItems = top.map(([leaf, count]) => ({ classificationId: leaf, label: g.leafLabels.get(leaf) ?? leaf, count }));
    const amount = top.map(([leaf]) => baselineByLeaf.get(leaf)).find(Boolean);
    const inc = incByGroup.get(`${g.buyerId}|${g.rubroNodeId}`);

    docs.push({
      buyerId: g.buyerId,
      buyerName: buyerNames.get(g.buyerId) ?? "",
      rubroNodeId: g.rubroNodeId,
      rubroLabel: g.rubroLabel,
      rubroLevel: g.rubroLevel,
      rubroAncestors: [...g.ancestors],
      evidenceItems,
      cadence,
      lastEventDate,
      expectedWindow: window,
      confidence,
      ...(inc?.name ? { incumbentSupplier: { id: inc.id ?? undefined, name: inc.name } } : {}),
      ...(amount ? { expectedAmount: { currency: amount.currency, p25: amount.p25, p50: amount.p50 } } : {}),
      basis: "recurrence",
      dataVersion,
      generatedAt: new Date(),
    });
  }

  // ---- Suppress groups that already have a live open_call in-window ----
  // (avoid duplicating the reactive surface). Cheap: pull open buyers+classes once.
  const liveOpen = await OpenCallModel.find({ status: { $in: ["open", "clarification", "amended"] } })
    .select("buyer.id classificationSet tenderPeriod.startDate")
    .lean();
  const openKeys = new Set<string>();
  for (const c of liveOpen) {
    const bid = (c.buyer as any)?.id;
    if (!bid) continue;
    for (const code of (c.classificationSet ?? [])) openKeys.add(`${bid}|${code}`);
  }
  const kept = docs.filter(d => {
    // If any ancestor/leaf of this group is already live for this buyer, suppress.
    return !d.rubroAncestors.some(a => openKeys.has(`${d.buyerId}|${a}`));
  });

  console.log(`[tender-forecast] writing ${kept.length} forecasts (suppressed ${docs.length - kept.length} already-open)…`);
  for (const doc of kept) {
    await TenderForecastModel.replaceOne({ buyerId: doc.buyerId, rubroNodeId: doc.rubroNodeId }, doc, { upsert: true });
  }
  const swept = await TenderForecastModel.deleteMany({ dataVersion: { $ne: dataVersion } });

  console.log(`[tender-forecast] done in ${((Date.now() - started) / 1000).toFixed(1)}s — ${kept.length} forecasts, ${new Set(kept.map(d => d.buyerId)).size} buyers (swept ${swept.deletedCount} stale).`);
}

if (require.main === module) {
  run().then(() => process.exit(0)).catch((err) => { console.error("[tender-forecast] failed:", err); process.exit(1); });
}

export { run };
```

- [ ] **Step 5: Run the job against the live DB**

Run: `npm run refresh-tender-forecast`
Expected: logs `E: events…`, `W: incumbents…`, then `done in Xs — N forecasts, M buyers`. N should be in the hundreds-to-thousands range. If N is 0, inspect: the most likely cause is the `isTender` regex or the `tender.items.classification.id` projection path — spot-check one release doc's shape with a throwaway `tsx` query before adjusting.

- [ ] **Step 6: Run the invariant assertion, verify it passes**

Run: `npx tsx scripts/verify/verify-tender-forecast.ts`
Expected: `OK verify-tender-forecast — N forecasts, top confidence 0.XX`

- [ ] **Step 7: Manual spot-check (evidence sanity)**

Run a throwaway query to eyeball 3 high-confidence forecasts for a known Intendencia (e.g. `80-1`): confirm the rubro label reads sensibly, the cadence months look plausible (e.g. fuel/food annual), and `lastEventDate` predates the window. Document one example in the commit body.

- [ ] **Step 8: Commit**

```bash
git add src/jobs/refresh-tender-forecast.ts package.json scripts/verify/verify-tender-forecast.ts
git commit -m "feat(anticipacion): recurrence rollup job → tender_forecast

Spot-check: buyer 80-1 rubro <X> recurs ~<N>mo, next window <Q>, incumbent <Y>."
```

---

### Task 5: Cron wiring + manual trigger route

**Files:**
- Modify: `src/cronserver.ts`

**Interfaces:**
- Consumes: `runJobProcess("jobs/refresh-tender-forecast")` (existing method).

- [ ] **Step 1: Add the monthly schedule**

In `src/cronserver.ts`, immediately after the `deptIndicatorsExpression` block (around line 791), add — offset one hour after dept-indicators:

```ts
// Tender-forecast recurrence rollup, monthly on the 1st at 05:00 — an hour after
// dept-indicators. Full-collection scan; writes its own tender_forecast collection,
// independent of busyWith. Derived, descriptive (no pre-publication signal in feed).
const tenderForecastExpression = "0 5 1 * *";
cron.schedule(
  tenderForecastExpression,
  async () => {
    try {
      this.logger.info("Starting tender-forecast refresh...");
      await this.runJobProcess("jobs/refresh-tender-forecast");
      this.logger.info("Tender-forecast refresh completed successfully");
    } catch (error) {
      this.logger.error("Tender-forecast refresh failed:", error);
    }
  },
  { scheduled: true, timezone: "America/Montevideo" }
);
this.logger.info(`Tender-forecast refresh scheduled with expression: ${tenderForecastExpression} (Uruguay timezone)`);
```

- [ ] **Step 2: Add a manual HTTP trigger**

Find the manual cron routes block (e.g. `/cron/dept-indicators` or `/cron/product-variants`, around lines 415–458). Add a mirror route that calls `runJobProcess("jobs/refresh-tender-forecast")` — match the exact handler style used by the neighboring route (GET/POST, response JSON). Example, matching the dept/product-variants pattern:

```ts
// Manual trigger: GET/POST /cron/tender-forecast
if (pathname === "/cron/tender-forecast" && (method === "GET" || method === "POST")) {
  this.runJobProcess("jobs/refresh-tender-forecast").catch(err =>
    this.logger.error("Manual tender-forecast run failed:", err));
  res.writeHead(202, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ started: true, job: "refresh-tender-forecast" }));
  return;
}
```

(If the neighboring routes use a different dispatch mechanism — a route map or `switch` — insert an entry in that same structure instead. Follow the file's local convention exactly.)

- [ ] **Step 3: Verify the route responds**

Start the cron server as the repo normally does (check how `dept-indicators` manual route is invoked; typically the cron HTTP server runs on its own port). Then `curl -X POST localhost:<cronPort>/cron/tender-forecast` → expect `{"started":true,...}` and a log line `Starting tender-forecast refresh...`.

- [ ] **Step 4: Commit**

```bash
git add src/cronserver.ts
git commit -m "feat(anticipacion): schedule tender-forecast monthly + manual route"
```

---

### Task 6: Public read endpoint (`/api/analytics/anticipacion`)

**Files:**
- Create: `app/server/api/analytics/anticipacion.get.ts`

**Interfaces:**
- Consumes: `TenderForecastModel` via `../../utils/models`; `connectToDatabase` via `../../utils/database`.
- Produces: `GET /api/analytics/anticipacion?rubro=&buyer=&minConfidence=&before=&limit=&skip=` → `{ success: true, data: { rows, total, calculatedAt } }`.

- [ ] **Step 1: Write the endpoint**

Create `app/server/api/analytics/anticipacion.get.ts` (mirrors `top-buyers.get.ts` param parsing + `organism-groups.get.ts` error shape):

```ts
import { createError, defineEventHandler, getQuery } from 'h3'
import { connectToDatabase } from '../../utils/database'
import { TenderForecastModel } from '../../utils/models'
import { DISPLAY_THRESHOLD } from '../../../../shared/forecast/constants'

export default defineEventHandler(async (event) => {
  try {
    await connectToDatabase()
    const q = getQuery(event)
    const limit = Math.min(Number(q.limit) || 50, 200)
    const skip = Number(q.skip) || 0
    const minConfidence = q.minConfidence != null ? Number(q.minConfidence) : DISPLAY_THRESHOLD

    const filter: Record<string, unknown> = { confidence: { $gte: minConfidence } }
    if (q.buyer) filter.buyerId = String(q.buyer)
    if (q.rubro) filter.rubroAncestors = String(q.rubro)
    if (q.before) filter['expectedWindow.start'] = { $lte: new Date(String(q.before)) }

    const total = await TenderForecastModel.countDocuments(filter)
    if (total === 0 && (await TenderForecastModel.estimatedDocumentCount()) === 0) {
      throw createError({ statusCode: 503, statusMessage: 'Forecast not ready. Run the refresh-tender-forecast job.' })
    }
    const rows = await TenderForecastModel.find(filter)
      .sort({ 'expectedWindow.start': 1 })
      .skip(skip)
      .limit(limit)
      .lean()
    const calculatedAt = rows[0]?.generatedAt ?? null
    return { success: true, data: { rows, total, calculatedAt } }
  } catch (error: any) {
    if (error?.statusCode) throw error
    console.error('Error reading tender forecasts:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to read tender forecasts' })
  }
})
```

(Confirm the relative depth of the `shared/forecast/constants` import from `app/server/api/analytics/` — it is four `../` up to repo root then `shared/...`. Adjust if the repo uses a path alias like `~~/shared` in server code; grep a neighboring analytics endpoint for how it imports from `shared`.)

- [ ] **Step 2: Verify with curl**

With the dev server running (`npm run dev`, port 3600):

Run: `curl -s "localhost:3600/api/analytics/anticipacion?limit=3" | head -c 800`
Expected: JSON `{"success":true,"data":{"rows":[...3 forecasts...],"total":N,...}}`. Then test a filter: `curl -s "localhost:3600/api/analytics/anticipacion?buyer=80-1&limit=2"` returns only buyer `80-1` rows.

- [ ] **Step 3: Commit**

```bash
git add app/server/api/analytics/anticipacion.get.ts
git commit -m "feat(anticipacion): public read endpoint /api/analytics/anticipacion"
```

---

### Task 7: Public page + nav + i18n (`/analytics/anticipacion`)

**Files:**
- Create: `app/pages/analytics/anticipacion.vue`
- Modify: `app/layouts/default.vue` (nav child)
- Modify: `app/i18n/locales/es.json`, `app/i18n/locales/en.json`

**Interfaces:**
- Consumes: `GET /api/analytics/anticipacion`.

- [ ] **Step 1: Add the nav child**

In `app/layouts/default.vue`, inside the "Análisis" `children` array (around line 36–45), add:

```ts
{ key: 'anticipacion', to: localePath('/analytics/anticipacion'), icon: 'mdi-crystal-ball' },
```

- [ ] **Step 2: Add i18n keys**

In `app/i18n/locales/es.json` add `"anticipacion": "Anticipación"` under the `nav` object, and a `anticipacion` page block:

```json
"anticipacion": {
  "title": "Anticipación de llamados",
  "subtitle": "Próximos llamados probables, estimados por el patrón histórico de compras de cada organismo. Es una estimación, no un hecho: el sistema del Estado no publica los llamados antes de tiempo.",
  "colOrganismo": "Organismo",
  "colRubro": "Rubro",
  "colVentana": "Ventana esperada",
  "colCadencia": "Cadencia",
  "colConfianza": "Confianza",
  "colIncumbente": "Último ganador",
  "everyMonths": "cada ~{n} meses",
  "evidence": "Últimos llamados",
  "notReady": "El cálculo de anticipación todavía no está disponible.",
  "coverage": "Cobertura: solo rubros con ≥3 llamados históricos. No cubre compras centralizadas, convenios marco ni prórrogas."
}
```

In `app/i18n/locales/en.json` add the parallel English strings (`nav.anticipacion = "Anticipation"`, same keys translated).

- [ ] **Step 3: Write the page**

Create `app/pages/analytics/anticipacion.vue` (mirrors `partidos.vue`: SSR `useFetch`, `useSeo`, hero + `.u-container`, Vuetify filters, hand-rolled table, loading/error/empty triad):

```vue
<template>
  <div>
    <v-sheet class="hero" tag="header">
      <div class="u-container">
        <h1 class="hero__title">{{ t('anticipacion.title') }}</h1>
        <p class="hero__sub">{{ t('anticipacion.subtitle') }}</p>
      </div>
    </v-sheet>

    <div class="u-container page">
      <div class="filters">
        <v-text-field v-model="buyer" :label="t('anticipacion.colOrganismo')" density="comfortable"
          variant="outlined" hide-details clearable style="max-width: 240px" />
        <v-text-field v-model="rubro" :label="t('anticipacion.colRubro')" density="comfortable"
          variant="outlined" hide-details clearable style="max-width: 240px" />
      </div>

      <div v-if="error" class="empty">{{ t('anticipacion.notReady') }}</div>
      <v-skeleton-loader v-else-if="pending && !rows.length" type="table" />
      <template v-else-if="rows.length">
        <v-card border>
          <table class="dt">
            <thead>
              <tr>
                <th>{{ t('anticipacion.colOrganismo') }}</th>
                <th>{{ t('anticipacion.colRubro') }}</th>
                <th>{{ t('anticipacion.colVentana') }}</th>
                <th>{{ t('anticipacion.colCadencia') }}</th>
                <th>{{ t('anticipacion.colConfianza') }}</th>
                <th>{{ t('anticipacion.colIncumbente') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in rows" :key="r._id">
                <td>{{ r.buyerName || r.buyerId }}</td>
                <td>{{ r.rubroLabel }}</td>
                <td>{{ windowLabel(r) }}</td>
                <td>{{ t('anticipacion.everyMonths', { n: Math.round(r.cadence.medianDays / 30) }) }}</td>
                <td><v-chip size="small" :color="confColor(r.confidence)">{{ Math.round(r.confidence * 100) }}%</v-chip></td>
                <td>{{ r.incumbentSupplier?.name || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </v-card>
        <p class="coverage">{{ t('anticipacion.coverage') }}</p>
      </template>
      <div v-else class="empty">{{ t('anticipacion.notReady') }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
const { t } = useI18n()
const buyer = ref('')
const rubro = ref('')

const query = computed(() => {
  const q: Record<string, string> = { limit: '100' }
  if (buyer.value) q.buyer = buyer.value
  if (rubro.value) q.rubro = rubro.value
  return q
})
const { data: res, pending, error } = await useFetch<any>('/api/analytics/anticipacion', { query })
const rows = computed<any[]>(() => res.value?.data?.rows ?? [])

function windowLabel(r: any): string {
  const s = new Date(r.expectedWindow.start)
  const e = new Date(r.expectedWindow.end)
  const fmt = (d: Date) => d.toLocaleDateString('es-UY', { month: 'short', year: 'numeric' })
  return fmt(s) === fmt(e) ? fmt(s) : `${fmt(s)} – ${fmt(e)}`
}
function confColor(c: number): string {
  return c >= 0.6 ? 'success' : c >= 0.45 ? 'warning' : 'grey'
}

useSeo(() => ({
  title: t('anticipacion.title'),
  description: t('anticipacion.subtitle'),
  path: '/analytics/anticipacion',
}))
</script>

<style scoped>
.page { padding-block: 24px 64px; }
.filters { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
.dt { width: 100%; border-collapse: collapse; }
.dt th, .dt td { text-align: left; padding: 8px 12px; border-bottom: 1px solid rgba(0,0,0,.08); font-size: 14px; }
.coverage { margin-top: 12px; font-size: 12px; opacity: .7; }
.empty { padding: 48px 0; text-align: center; opacity: .6; }
</style>
```

(Match the actual hero/`.u-container` class names used by `partidos.vue` — copy them verbatim from that file if they differ. Confirm `useI18n`, `useSeo`, `useFetch` are auto-imported as in `partidos.vue`.)

- [ ] **Step 2b: Verify the page renders**

With `npm run dev` up: open `localhost:3600/analytics/anticipacion` (or `curl -s localhost:3600/analytics/anticipacion | grep -i anticipa`). Expect the table populated, the nav "Análisis" dropdown showing an "Anticipación" entry (not the raw key `nav.anticipacion`), and the coverage caveat visible.

- [ ] **Step 3: Commit**

```bash
git add app/pages/analytics/anticipacion.vue app/layouts/default.vue app/i18n/locales/es.json app/i18n/locales/en.json
git commit -m "feat(anticipacion): public /analytics/anticipacion page + nav + i18n"
```

---

### Task 8: Reusable `AnticipatedTenderCard` on product + buyer pages

**Files:**
- Create: `app/components/AnticipatedTenderCard.vue`
- Modify: `app/pages/products/[code].vue` (mount the card)

**Interfaces:**
- Consumes: `GET /api/analytics/anticipacion?rubro=<code>` (rubro filter matches `rubroAncestors`, so a leaf article code returns any forecast whose group contains it).

- [ ] **Step 1: Write the component**

Create `app/components/AnticipatedTenderCard.vue`:

```vue
<template>
  <v-card v-if="forecast" border class="atc">
    <v-card-title class="atc__title">
      <v-icon icon="mdi-crystal-ball" size="small" class="mr-1" />
      {{ t('anticipacion.title') }}
    </v-card-title>
    <v-card-text>
      <p class="atc__line">
        <strong>{{ forecast.buyerName || forecast.buyerId }}</strong>
        {{ t('anticipacion.everyMonths', { n: Math.round(forecast.cadence.medianDays / 30) }) }} ·
        {{ forecast.rubroLabel }}
      </p>
      <p class="atc__window">
        {{ t('anticipacion.colVentana') }}: <strong>{{ windowLabel }}</strong>
        · {{ Math.round(forecast.confidence * 100) }}%
      </p>
      <p v-if="forecast.incumbentSupplier?.name" class="atc__inc">
        {{ t('anticipacion.colIncumbente') }}: {{ forecast.incumbentSupplier.name }}
      </p>
      <p class="atc__note">{{ t('anticipacion.subtitle') }}</p>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
const props = defineProps<{ rubro?: string; buyer?: string }>()
const { t } = useI18n()

const query = computed(() => {
  const q: Record<string, string> = { limit: '1' }
  if (props.rubro) q.rubro = props.rubro
  if (props.buyer) q.buyer = props.buyer
  return q
})
const { data: res } = await useFetch<any>('/api/analytics/anticipacion', { query, server: false })
const forecast = computed<any | null>(() => res.value?.data?.rows?.[0] ?? null)

const windowLabel = computed(() => {
  const f = forecast.value
  if (!f) return ''
  const fmt = (d: string) => new Date(d).toLocaleDateString('es-UY', { month: 'short', year: 'numeric' })
  return fmt(f.expectedWindow.start) === fmt(f.expectedWindow.end)
    ? fmt(f.expectedWindow.start)
    : `${fmt(f.expectedWindow.start)} – ${fmt(f.expectedWindow.end)}`
})
</script>

<style scoped>
.atc__title { font-size: 15px; }
.atc__line, .atc__window, .atc__inc { margin: 4px 0; font-size: 14px; }
.atc__note { margin-top: 8px; font-size: 12px; opacity: .65; }
</style>
```

- [ ] **Step 2: Mount it on the product page**

In `app/pages/products/[code].vue`, find where the route `code` param is available and place the card in a sensible spot (e.g. below the header/summary). Add:

```vue
<AnticipatedTenderCard :rubro="String(route.params.code)" class="mb-4" />
```

(Use the existing `route`/`code` variable in that page — grep the file for `route.params` to reuse the local name. The card self-hides when there is no forecast, so it is safe to always mount.)

- [ ] **Step 3: Verify**

With `npm run dev`: open a product page whose code participates in a recurring rubro (pick one `classificationId` from a high-confidence forecast's `evidenceItems`, e.g. from the Task 4 spot-check). Confirm the card appears with the buyer, cadence, window, and the honest note. Open a product with no recurrence → card is absent (no empty box).

- [ ] **Step 4: Commit**

```bash
git add app/components/AnticipatedTenderCard.vue app/pages/products/[code].vue
git commit -m "feat(anticipacion): reusable AnticipatedTenderCard on product page"
```

---

## Self-Review checklist (run before handoff)

- **Spec coverage:** §U1 job (T4), `tender_forecast` collection (T1), scoring/anti-FP (T2 + T4 suppression), §U2 public endpoint (T6), §U4 public page + card (T7, T8), cron (T5). Fase-2-only items (alerts, watch flag, calendario) are deliberately in the Fase 2 plan.
- **Placeholder scan:** none — every step ships real code/commands.
- **Type consistency:** `ITenderForecast` (T1) fields match what the job writes (T4) and what the endpoint/page read (T6/T7). `computeCadence`/`expectedWindow`/`confidenceScore` signatures (T2) match their call sites in T4. `pickRubroNode`/`ancestorsForLeaf` (T3) match T4.
- **Known soft spots flagged for the implementer:** the `isTender` regex + `tender.items.classification.id` projection path (T4 Step 5) and the `shared/forecast/constants` import depth from server code (T6 Step 1) are the two most likely to need a one-line adjustment against the live schema.
