# Supplier Contact Enrichment (Phase A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Populate a new `supplier_contacts` collection with a usable contact email (+ website/phone/rubros) per state supplier, sourced from DEI + website/web-search/impo resolvers with MX hygiene, so Phase B (cold-email campaign) has a recipient list.

**Architecture:** A set of pure, independently-testable **resolver** modules (one per source) each return email candidates for a supplier; a pure **hygiene** module validates/dedupes/merges them and picks a primary; a **rubro** module derives each supplier's top SICE rubros from their award items; an **orchestrator** tsx job walks suppliers by spend-priority, runs resolvers + hygiene + rubro, and upserts `supplier_contacts`. Follows the repo's existing tsx-job + Mongoose-model + tsx-assertion-test patterns.

**Tech Stack:** TypeScript (tsx runner), Mongoose, MongoDB, axios (existing `AxiosHttpClient`), cheerio (existing `CheerioParser`), Node `dns/promises` for MX. Tests are `node:assert` scripts run with `npx tsx` (this repo has no jest/vitest runner — mirror `tests/unit/*.ts`).

## Global Constraints

- Node/tsx job entrypoints live under `src/jobs/`; shared Mongoose models under `shared/models/`; tests under `tests/unit/`. Copy these exact locations.
- **autoIndex is OFF globally.** Declare indexes in the model file for documentation, but they are only *built* by `scripts/ensure-indexes.ts`. Never rely on model-declared indexes existing at runtime.
- Supplier key format is `supplierId` like `R/214843360014`; `rut = digits(supplierId)` (strip non-digits). A RUT is usable only when `rut.length >= 8` (matches `load-dei.ts`).
- Mongoose model registration MUST be HMR-safe: `(mongoose.models.X as Model<I>) || mongoose.model<I>(...)` (the Nuxt dev server re-imports models on hot reload).
- DB connection helpers: `connectToDatabase` / `disconnectFromDatabase` from `shared/connection/database`.
- `awards.suppliers.id` IS indexed; `buyer.id` is NOT — always lead aggregations with `awards.suppliers.id`.
- SICE join: `awards.items.classification.id` (string) === `sice_catalog.code` (string). Rubro label = `sice_catalog.canonicalName`, fallback to `classification.description`.
- Every external HTTP call: timeout ≤ 15s, ≤ 2 retries, a descriptive User-Agent, and per-host throttling. Never hammer a host.
- No scraping of anything behind a login/paywall. RUPE is a **viability spike only** in this plan (Task 9) — if access needs auth, document and defer; do not implement a login scraper.
- Commit after every task. Conventional Commits. Branch: `feat/supplier-cold-email-campaign` (already created).

---

## File Structure

- `shared/models/supplier_contacts.ts` — the collection model + `ISupplierContact` interface. (create)
- `scripts/ensure-indexes.ts` — add `supplier_contacts` index build. (modify)
- `src/jobs/enrich/types.ts` — shared resolver/hygiene interfaces. (create)
- `src/jobs/enrich/hygiene.ts` — email validation, role detection, MX, merge, primary pick. (create)
- `src/jobs/enrich/rubros.ts` — derive top SICE rubros for a supplier. (create)
- `src/jobs/enrich/resolvers/dei.ts` — DEI (in-DB) resolver. (create)
- `src/jobs/enrich/resolvers/website.ts` — company-website scrape resolver. (create)
- `src/jobs/enrich/resolvers/web-search.ts` — web-search resolver. (create)
- `src/jobs/enrich/resolvers/impo.ts` — impo Diario Oficial resolver. (create)
- `src/jobs/enrich-supplier-contacts.ts` — orchestrator entrypoint. (create)
- `tests/unit/test-contact-hygiene.ts`, `test-contact-rubros.ts`, `test-contact-resolvers.ts` — tsx assertion tests. (create)
- `docs/superpowers/notes/rupe-viability.md` — RUPE spike findings. (create, Task 9)

---

### Task 1: `supplier_contacts` model + index build

**Files:**
- Create: `shared/models/supplier_contacts.ts`
- Modify: `scripts/ensure-indexes.ts`
- Test: `tests/unit/test-supplier-contacts-model.ts`

**Interfaces:**
- Produces:
  - `EmailSource = "dei" | "website" | "webSearch" | "impo" | "rupe" | "manual"`
  - `EmailStatus = "candidate" | "valid" | "invalid" | "suppressed"`
  - `IEmailEntry = { email: string; source: EmailSource; confidence: number; isRoleAccount: boolean; mxValid: boolean; status: EmailStatus }`
  - `IRubro = { classificationId: string; label: string; itemCount: number; share: number }`
  - `ISupplierContact` (see code) and `SupplierContactModel`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/test-supplier-contacts-model.ts
import assert from "node:assert";
import { SupplierContactModel } from "../../shared/models/supplier_contacts";

// Model registers and enforces the documented shape without a DB connection.
const doc = new SupplierContactModel({
  supplierId: "R/214843360014",
  rut: "214843360014",
  name: "MURRY S A",
  emails: [{ email: "a@b.uy", source: "dei", confidence: 0.9, isRoleAccount: false, mxValid: true, status: "valid" }],
  primaryEmail: "a@b.uy",
  rubros: [{ classificationId: "28267", label: "Alcohol", itemCount: 3, share: 0.5 }],
  status: "enriched",
  priorityScore: 123,
});
const err = doc.validateSync();
assert.equal(err, undefined, `unexpected validation error: ${err?.message}`);
assert.equal(doc.emails[0].source, "dei");
assert.equal(doc.collection.name, "supplier_contacts");
console.log("ok: supplier_contacts model");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx tests/unit/test-supplier-contacts-model.ts`
Expected: FAIL — `Cannot find module '../../shared/models/supplier_contacts'`.

- [ ] **Step 3: Write the model**

```ts
// shared/models/supplier_contacts.ts
import { Schema } from "mongoose";
import type { Model } from "mongoose";
import { mongoose } from "../connection/database";

export type EmailSource = "dei" | "website" | "webSearch" | "impo" | "rupe" | "manual";
export type EmailStatus = "candidate" | "valid" | "invalid" | "suppressed";
export type ContactStatus = "pending" | "enriched" | "no_contact" | "error";

export interface IEmailEntry {
  email: string;
  source: EmailSource;
  confidence: number;
  isRoleAccount: boolean;
  mxValid: boolean;
  status: EmailStatus;
}
export interface IRubro {
  classificationId: string;
  label: string;
  itemCount: number;
  share: number;
}
export interface ISupplierContact {
  supplierId: string;
  rut: string;
  name: string;
  emails: IEmailEntry[];
  primaryEmail: string | null;
  website: string | null;
  phone: string | null;
  rubros: IRubro[];
  status: ContactStatus;
  priorityScore: number;
  enrichedAt: Date | null;
}

const EmailEntrySchema = new Schema<IEmailEntry>({
  email: { type: String, required: true, lowercase: true, trim: true },
  source: { type: String, required: true },
  confidence: { type: Number, default: 0 },
  isRoleAccount: { type: Boolean, default: false },
  mxValid: { type: Boolean, default: false },
  status: { type: String, default: "candidate" },
}, { _id: false });

const RubroSchema = new Schema<IRubro>({
  classificationId: { type: String, required: true },
  label: { type: String, default: "" },
  itemCount: { type: Number, default: 0 },
  share: { type: Number, default: 0 },
}, { _id: false });

const SupplierContactSchema = new Schema<ISupplierContact>({
  supplierId: { type: String, required: true },
  rut: { type: String, default: "" },
  name: { type: String, default: "" },
  emails: { type: [EmailEntrySchema], default: [] },
  primaryEmail: { type: String, default: null },
  website: { type: String, default: null },
  phone: { type: String, default: null },
  rubros: { type: [RubroSchema], default: [] },
  status: { type: String, default: "pending" },
  priorityScore: { type: Number, default: 0 },
  enrichedAt: { type: Date, default: null },
}, { timestamps: true, collection: "supplier_contacts" });

// Declared for parity; BUILT by scripts/ensure-indexes.ts (autoIndex is off).
SupplierContactSchema.index({ supplierId: 1 }, { unique: true });
SupplierContactSchema.index({ rut: 1 });
SupplierContactSchema.index({ status: 1, priorityScore: -1 });
SupplierContactSchema.index({ "rubros.classificationId": 1 });

export const SupplierContactModel: Model<ISupplierContact> =
  (mongoose.models.SupplierContact as Model<ISupplierContact>) ||
  mongoose.model<ISupplierContact>("SupplierContact", SupplierContactSchema);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx tests/unit/test-supplier-contacts-model.ts`
Expected: PASS — prints `ok: supplier_contacts model`.

- [ ] **Step 5: Add the index build to `ensure-indexes.ts`**

`scripts/ensure-indexes.ts` is `releases`-scoped at the top (`const COLLECTION = 'releases'`). Add a small extra block near the end of `main()` (before disconnect) that builds the `supplier_contacts` indexes on its own collection. Locate the end of the build loop and insert:

```ts
// --- supplier_contacts (Phase A enrichment) ---
const sc = db.collection('supplier_contacts')
await sc.createIndex({ supplierId: 1 }, { unique: true, background: true, name: 'supplierId_1' })
await sc.createIndex({ rut: 1 }, { background: true, name: 'rut_1' })
await sc.createIndex({ status: 1, priorityScore: -1 }, { background: true, name: 'status_1_priorityScore_-1' })
await sc.createIndex({ 'rubros.classificationId': 1 }, { background: true, name: 'rubros.classificationId_1' })
console.log('✅ supplier_contacts indexes ensured')
```

(Use the `db: Db` handle already opened in the script. If the script currently scopes `db` inside a `releases`-only helper, hoist the `MongoClient` connect so this block can reuse it — keep the change minimal and mirror the existing `createIndex` calls.)

- [ ] **Step 6: Commit**

```bash
git add shared/models/supplier_contacts.ts scripts/ensure-indexes.ts tests/unit/test-supplier-contacts-model.ts
git commit -m "feat(contacts): supplier_contacts model + index build"
```

---

### Task 2: Email hygiene module

**Files:**
- Create: `src/jobs/enrich/types.ts`
- Create: `src/jobs/enrich/hygiene.ts`
- Test: `tests/unit/test-contact-hygiene.ts`

**Interfaces:**
- Consumes: `EmailSource`, `IEmailEntry` from `shared/models/supplier_contacts`.
- Produces (`src/jobs/enrich/types.ts`):
  - `ContactCandidate = { email: string; source: EmailSource; confidence: number }`
  - `ResolverResult = { emails: ContactCandidate[]; website?: string | null; phone?: string | null }`
  - `ResolverInput = { supplierId: string; rut: string; name: string; website?: string | null }`
  - `ContactResolver = { name: EmailSource; resolve(input: ResolverInput): Promise<ResolverResult> }`
- Produces (`src/jobs/enrich/hygiene.ts`):
  - `normalizeEmail(raw: string): string | null`
  - `isRoleAccount(email: string): boolean`
  - `isJunkEmail(email: string): boolean`
  - `mxValid(domain: string): Promise<boolean>` (cached per domain in-process)
  - `mergeCandidates(cands: ContactCandidate[], mx: (domain: string) => Promise<boolean>): Promise<IEmailEntry[]>`
  - `pickPrimary(entries: IEmailEntry[]): string | null`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/test-contact-hygiene.ts
import assert from "node:assert";
import {
  normalizeEmail, isRoleAccount, isJunkEmail, mergeCandidates, pickPrimary,
} from "../../src/jobs/enrich/hygiene";

// normalizeEmail lowercases, trims, strips mailto:, rejects garbage.
assert.equal(normalizeEmail("  Info@Empresa.COM.UY "), "info@empresa.com.uy");
assert.equal(normalizeEmail("mailto:ventas@x.uy"), "ventas@x.uy");
assert.equal(normalizeEmail("not-an-email"), null);
assert.equal(normalizeEmail("a@@b"), null);

// role + junk detection
assert.equal(isRoleAccount("info@x.uy"), true);
assert.equal(isRoleAccount("juan.perez@x.uy"), false);
assert.equal(isJunkEmail("test@example.com"), true);
assert.equal(isJunkEmail("real@empresa.uy"), false);

// merge: dedupe, keep best confidence, MX injected as a stub; primary prefers non-role MX-valid.
const stubMx = async (d: string) => d !== "dead.uy";
(async () => {
  const merged = await mergeCandidates([
    { email: "info@empresa.uy", source: "website", confidence: 0.7 },
    { email: "juan@empresa.uy", source: "dei", confidence: 0.9 },
    { email: "juan@empresa.uy", source: "website", confidence: 0.6 }, // dup, lower conf
    { email: "x@dead.uy", source: "webSearch", confidence: 0.8 },     // MX fails
    { email: "test@example.com", source: "impo", confidence: 0.3 },   // junk, dropped
  ], stubMx);

  const emails = merged.map(e => e.email).sort();
  assert.deepEqual(emails, ["info@empresa.uy", "juan@empresa.uy", "x@dead.uy"]);
  const juan = merged.find(e => e.email === "juan@empresa.uy")!;
  assert.equal(juan.confidence, 0.9);        // best of the two
  assert.equal(juan.isRoleAccount, false);
  assert.equal(juan.mxValid, true);
  const dead = merged.find(e => e.email === "x@dead.uy")!;
  assert.equal(dead.mxValid, false);

  // primary = non-role, mx-valid, highest confidence → juan
  assert.equal(pickPrimary(merged), "juan@empresa.uy");
  console.log("ok: contact hygiene");
})();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx tests/unit/test-contact-hygiene.ts`
Expected: FAIL — cannot find `../../src/jobs/enrich/hygiene`.

- [ ] **Step 3: Write `types.ts` then `hygiene.ts`**

```ts
// src/jobs/enrich/types.ts
import type { EmailSource } from "../../../shared/models/supplier_contacts";

export interface ContactCandidate { email: string; source: EmailSource; confidence: number }
export interface ResolverResult { emails: ContactCandidate[]; website?: string | null; phone?: string | null }
export interface ResolverInput { supplierId: string; rut: string; name: string; website?: string | null }
export interface ContactResolver { name: EmailSource; resolve(input: ResolverInput): Promise<ResolverResult> }
```

```ts
// src/jobs/enrich/hygiene.ts
import { promises as dns } from "node:dns";
import type { IEmailEntry } from "../../../shared/models/supplier_contacts";
import type { ContactCandidate } from "./types";

const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;

const ROLE_LOCALS = new Set([
  "info", "contacto", "contact", "ventas", "sales", "admin", "administracion",
  "administración", "compras", "hola", "consultas", "atencion", "atención",
  "soporte", "gerencia", "recepcion", "recepción", "secretaria", "secretaría",
]);

const JUNK_DOMAINS = new Set([
  "example.com", "example.org", "email.com", "test.com", "sentry.io",
  "domain.com", "yourdomain.com", "empresa.com",
]);

export function normalizeEmail(raw: string): string | null {
  if (!raw) return null;
  let e = raw.trim().toLowerCase().replace(/^mailto:/, "");
  e = e.replace(/[.,;:)>\]]+$/, "").replace(/^[(<\[]+/, "");
  if (!EMAIL_RE.test(e)) return null;
  return e;
}

export function domainOf(email: string): string {
  return email.slice(email.lastIndexOf("@") + 1);
}

export function isRoleAccount(email: string): boolean {
  const local = email.slice(0, email.indexOf("@"));
  return ROLE_LOCALS.has(local);
}

export function isJunkEmail(email: string): boolean {
  const d = domainOf(email);
  if (JUNK_DOMAINS.has(d)) return true;
  // obvious placeholders
  if (/^(no-?reply|noreply|donotreply)@/.test(email)) return true;
  if (/@(sentry|wixpress)\./.test(email)) return true;
  return false;
}

const mxCache = new Map<string, boolean>();
export async function mxValid(domain: string): Promise<boolean> {
  if (mxCache.has(domain)) return mxCache.get(domain)!;
  let ok = false;
  try {
    const mx = await dns.resolveMx(domain);
    ok = mx.length > 0;
  } catch {
    // No MX → try an A record as a weak fallback (some small UY hosts).
    try { ok = (await dns.resolve(domain)).length > 0; } catch { ok = false; }
  }
  mxCache.set(domain, ok);
  return ok;
}

export async function mergeCandidates(
  cands: ContactCandidate[],
  mx: (domain: string) => Promise<boolean> = mxValid,
): Promise<IEmailEntry[]> {
  // Normalize + drop junk, then dedupe keeping the highest-confidence source.
  const best = new Map<string, ContactCandidate>();
  for (const c of cands) {
    const email = normalizeEmail(c.email);
    if (!email || isJunkEmail(email)) continue;
    const prev = best.get(email);
    if (!prev || c.confidence > prev.confidence) best.set(email, { ...c, email });
  }
  const out: IEmailEntry[] = [];
  for (const c of best.values()) {
    const ok = await mx(domainOf(c.email));
    out.push({
      email: c.email,
      source: c.source,
      confidence: c.confidence,
      isRoleAccount: isRoleAccount(c.email),
      mxValid: ok,
      status: ok ? "valid" : "invalid",
    });
  }
  return out;
}

export function pickPrimary(entries: IEmailEntry[]): string | null {
  const valid = entries.filter(e => e.mxValid);
  if (!valid.length) return null;
  const rank = (e: IEmailEntry) => (e.isRoleAccount ? 0 : 1) * 10 + e.confidence;
  return valid.sort((a, b) => rank(b) - rank(a))[0].email;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx tests/unit/test-contact-hygiene.ts`
Expected: PASS — prints `ok: contact hygiene`.

- [ ] **Step 5: Commit**

```bash
git add src/jobs/enrich/types.ts src/jobs/enrich/hygiene.ts tests/unit/test-contact-hygiene.ts
git commit -m "feat(contacts): email hygiene (normalize, role/junk, MX, merge, primary)"
```

---

### Task 3: Rubro derivation module

**Files:**
- Create: `src/jobs/enrich/rubros.ts`
- Test: `tests/unit/test-contact-rubros.ts`

**Interfaces:**
- Consumes: `IRubro` from `shared/models/supplier_contacts`; the `releases` + `sice_catalog` collections.
- Produces:
  - `buildRubroPipeline(supplierId: string, topN?: number): object[]` — a pure Mongo aggregation pipeline array (leads with `awards.suppliers.id`).
  - `deriveRubros(db: Db, supplierId: string, topN?: number): Promise<IRubro[]>` — runs the pipeline + joins labels from `sice_catalog`.

- [ ] **Step 1: Write the failing test (pipeline shape is pure + assertable)**

```ts
// tests/unit/test-contact-rubros.ts
import assert from "node:assert";
import { buildRubroPipeline } from "../../src/jobs/enrich/rubros";

const p = buildRubroPipeline("R/214843360014", 5);
// Must lead with the indexed field to avoid a full scan.
assert.deepEqual(p[0], { $match: { "awards.suppliers.id": "R/214843360014" } });
// Must group by the classification id (== sice code) and cap at topN.
const group = p.find((s: any) => s.$group);
assert.ok(group, "has a $group stage");
assert.equal(group.$group._id, "$awards.items.classification.id");
const limit = p.find((s: any) => s.$limit);
assert.equal(limit.$limit, 5);
console.log("ok: rubro pipeline");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx tests/unit/test-contact-rubros.ts`
Expected: FAIL — cannot find `../../src/jobs/enrich/rubros`.

- [ ] **Step 3: Write `rubros.ts`**

```ts
// src/jobs/enrich/rubros.ts
import type { Db } from "mongodb";
import type { IRubro } from "../../../shared/models/supplier_contacts";

/**
 * Top SICE rubros for a supplier, by award-item count. Leads with the indexed
 * `awards.suppliers.id`; unwinds awards→items; a $group counts items per
 * classification.id (== sice_catalog.code). Labels are joined in deriveRubros.
 */
export function buildRubroPipeline(supplierId: string, topN = 5): object[] {
  return [
    { $match: { "awards.suppliers.id": supplierId } },
    { $unwind: "$awards" },
    { $match: { "awards.suppliers.id": supplierId } },
    { $unwind: "$awards.items" },
    { $group: {
      _id: "$awards.items.classification.id",
      itemCount: { $sum: 1 },
      anyDesc: { $first: "$awards.items.classification.description" },
    } },
    { $match: { _id: { $ne: null } } },
    { $sort: { itemCount: -1 } },
    { $limit: topN },
  ];
}

export async function deriveRubros(db: Db, supplierId: string, topN = 5): Promise<IRubro[]> {
  const rows = await db.collection("releases")
    .aggregate<{ _id: string; itemCount: number; anyDesc: string }>(
      buildRubroPipeline(supplierId, topN),
      { allowDiskUse: true },
    ).toArray();
  if (!rows.length) return [];

  const total = rows.reduce((s, r) => s + r.itemCount, 0) || 1;
  const codes = rows.map(r => r._id).filter(Boolean);
  const cat = await db.collection("sice_catalog")
    .find({ code: { $in: codes } }, { projection: { code: 1, canonicalName: 1 } })
    .toArray();
  const label = new Map(cat.map((c: any) => [c.code, c.canonicalName as string]));

  return rows.map(r => ({
    classificationId: r._id,
    label: label.get(r._id) || r.anyDesc || r._id,
    itemCount: r.itemCount,
    share: r.itemCount / total,
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx tests/unit/test-contact-rubros.ts`
Expected: PASS — prints `ok: rubro pipeline`.

- [ ] **Step 5: (Integration sanity — not committed as a test) run against live DB**

Run this one-off to confirm `deriveRubros` returns real labels for the top supplier:

```bash
npx tsx -e "import('./shared/connection/database').then(async m=>{await m.connectToDatabase();const {deriveRubros}=await import('./src/jobs/enrich/rubros');const r=await deriveRubros(m.mongoose.connection.db,'R/214843360014',5);console.log(r);await m.disconnectFromDatabase();})"
```

Expected: an array of `{classificationId,label,itemCount,share}` with non-empty labels.

- [ ] **Step 6: Commit**

```bash
git add src/jobs/enrich/rubros.ts tests/unit/test-contact-rubros.ts
git commit -m "feat(contacts): derive top SICE rubros per supplier from award items"
```

---

### Task 4: DEI resolver (in-DB, zero external)

**Files:**
- Create: `src/jobs/enrich/resolvers/dei.ts`
- Test: `tests/unit/test-contact-resolvers.ts` (DEI section)

**Interfaces:**
- Consumes: `ContactResolver`, `ResolverInput`, `ResolverResult` from `../types`; `dei_companies` collection.
- Produces: `createDeiResolver(db: Db): ContactResolver` with `name = "dei"`.

- [ ] **Step 1: Write the failing test (injected fake db, no network)**

```ts
// tests/unit/test-contact-resolvers.ts
import assert from "node:assert";
import { createDeiResolver } from "../../src/jobs/enrich/resolvers/dei";

// Minimal fake of the mongodb Db surface the resolver uses.
function fakeDb(rows: any[]) {
  return {
    collection: () => ({
      findOne: async (q: any) => rows.find(r => r.rut === q.rut) ?? null,
    }),
  } as any;
}

(async () => {
  const db = fakeDb([{ rut: "214843360014", email: "admin@murry.uy", sitioWeb: "https://murry.uy", telefono: "099..." }]);
  const r = createDeiResolver(db);
  assert.equal(r.name, "dei");
  const out = await r.resolve({ supplierId: "R/214843360014", rut: "214843360014", name: "MURRY S A" });
  assert.equal(out.emails.length, 1);
  assert.equal(out.emails[0].email, "admin@murry.uy");
  assert.equal(out.emails[0].source, "dei");
  assert.ok(out.emails[0].confidence >= 0.85);
  assert.equal(out.website, "https://murry.uy");

  // No DEI row → empty result, no throw.
  const empty = await createDeiResolver(fakeDb([])).resolve({ supplierId: "R/x", rut: "999", name: "x" });
  assert.deepEqual(empty.emails, []);
  console.log("ok: dei resolver");
})();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx tests/unit/test-contact-resolvers.ts`
Expected: FAIL — cannot find `../../src/jobs/enrich/resolvers/dei`.

- [ ] **Step 3: Write `resolvers/dei.ts`**

```ts
// src/jobs/enrich/resolvers/dei.ts
import type { Db } from "mongodb";
import type { ContactResolver, ResolverInput, ResolverResult } from "../types";

/** DEI is official open data → highest confidence, and it's already in Mongo. */
export function createDeiResolver(db: Db): ContactResolver {
  return {
    name: "dei",
    async resolve(input: ResolverInput): Promise<ResolverResult> {
      if (!input.rut || input.rut.length < 8) return { emails: [] };
      const row = await db.collection("dei_companies")
        .findOne({ rut: input.rut }, { projection: { email: 1, sitioWeb: 1, telefono: 1 } });
      if (!row) return { emails: [] };
      const emails = row.email ? [{ email: String(row.email), source: "dei" as const, confidence: 0.9 }] : [];
      return {
        emails,
        website: row.sitioWeb ? String(row.sitioWeb) : null,
        phone: row.telefono ? String(row.telefono) : null,
      };
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx tests/unit/test-contact-resolvers.ts`
Expected: PASS — prints `ok: dei resolver`.

- [ ] **Step 5: Commit**

```bash
git add src/jobs/enrich/resolvers/dei.ts tests/unit/test-contact-resolvers.ts
git commit -m "feat(contacts): DEI in-DB contact resolver"
```

---

### Task 5: Website-scrape resolver

**Files:**
- Create: `src/jobs/enrich/resolvers/website.ts`
- Test: extend `tests/unit/test-contact-resolvers.ts` (website section)

**Interfaces:**
- Consumes: `ContactResolver`, `ResolverInput`, `ResolverResult`.
- Produces:
  - `extractEmailsFromHtml(html: string, siteDomain: string): ContactCandidate[]` (pure, exported for test)
  - `createWebsiteResolver(fetchHtml: (url: string) => Promise<string | null>): ContactResolver` with `name = "website"` (fetcher injected so tests never hit the network)

- [ ] **Step 1: Write the failing test (pure extractor + injected fetcher)**

```ts
// append to tests/unit/test-contact-resolvers.ts
import { extractEmailsFromHtml, createWebsiteResolver } from "../../src/jobs/enrich/resolvers/website";

(async () => {
  const html = `
    <a href="mailto:Ventas@empresa.com.uy">escribinos</a>
    <p>Contacto: gerencia@empresa.com.uy y también juan@gmail.com</p>
    <img src="x@2x.png"> <span>soporte@otra-empresa.uy</span>`;
  const cands = extractEmailsFromHtml(html, "empresa.com.uy");
  const emails = cands.map(c => c.email).sort();
  // same-domain emails ranked/higher-confidence; @2x.png is NOT an email; gmail kept but lower.
  assert.ok(emails.includes("ventas@empresa.com.uy"));
  assert.ok(emails.includes("gerencia@empresa.com.uy"));
  assert.ok(!emails.some(e => e.includes("2x.png")));
  const sameDomain = cands.find(c => c.email === "ventas@empresa.com.uy")!;
  const offDomain = cands.find(c => c.email === "juan@gmail.com");
  if (offDomain) assert.ok(sameDomain.confidence > offDomain.confidence);

  // resolver walks home + /contacto via the injected fetcher, no network.
  const fetcher = async (url: string) =>
    url.includes("/contacto") ? `<a href="mailto:hola@empresa.com.uy">x</a>` : html;
  const r = createWebsiteResolver(fetcher);
  const out = await r.resolve({ supplierId: "R/1", rut: "1", name: "Empresa", website: "https://empresa.com.uy" });
  assert.ok(out.emails.some(e => e.email === "hola@empresa.com.uy"));
  assert.equal(r.name, "website");

  // No website → empty, no throw.
  const empty = await r.resolve({ supplierId: "R/1", rut: "1", name: "x", website: null });
  assert.deepEqual(empty.emails, []);
  console.log("ok: website resolver");
})();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx tests/unit/test-contact-resolvers.ts`
Expected: FAIL — cannot find `../../src/jobs/enrich/resolvers/website`.

- [ ] **Step 3: Write `resolvers/website.ts`**

```ts
// src/jobs/enrich/resolvers/website.ts
import type { ContactResolver, ResolverInput, ResolverResult, ContactCandidate } from "../types";

// Emails embedded in HTML text or mailto: hrefs. Excludes image-suffix false positives.
const RAW_EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const IMG_SUFFIX = /\.(png|jpe?g|gif|webp|svg)$/i;

export function registrableDomain(host: string): string {
  return host.replace(/^www\./, "").toLowerCase();
}

export function extractEmailsFromHtml(html: string, siteDomain: string): ContactCandidate[] {
  const found = new Map<string, number>();
  const site = registrableDomain(siteDomain);
  for (const m of html.matchAll(RAW_EMAIL_RE)) {
    const raw = m[0];
    if (IMG_SUFFIX.test(raw)) continue;
    const email = raw.toLowerCase();
    const dom = email.slice(email.lastIndexOf("@") + 1);
    // same-domain → 0.75, off-domain (gmail etc.) → 0.45
    const conf = registrableDomain(dom) === site ? 0.75 : 0.45;
    found.set(email, Math.max(found.get(email) ?? 0, conf));
  }
  return [...found].map(([email, confidence]) => ({ email, source: "website" as const, confidence }));
}

const CONTACT_PATHS = ["", "/contacto", "/contact", "/contactenos", "/contacto-2", "/nosotros"];

export function createWebsiteResolver(
  fetchHtml: (url: string) => Promise<string | null>,
): ContactResolver {
  return {
    name: "website",
    async resolve(input: ResolverInput): Promise<ResolverResult> {
      if (!input.website) return { emails: [] };
      let base: URL;
      try { base = new URL(input.website); } catch { return { emails: [] }; }
      const siteDomain = base.hostname;
      const seen = new Map<string, ContactCandidate>();
      for (let i = 0; i < CONTACT_PATHS.length; i++) {
        const url = new URL(CONTACT_PATHS[i], base.origin).toString();
        const html = await fetchHtml(url).catch(() => null);
        if (!html) continue;
        for (const c of extractEmailsFromHtml(html, siteDomain)) {
          const prev = seen.get(c.email);
          if (!prev || c.confidence > prev.confidence) seen.set(c.email, c);
        }
        // Always sample home ("") + first contact path before short-circuiting —
        // the home page alone often already carries a same-domain (0.75) match,
        // but the best address usually lives on /contacto.
        if (i >= 1 && [...seen.values()].some(c => c.confidence >= 0.75)) break; // enough signal
      }
      return { emails: [...seen.values()], website: input.website };
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx tests/unit/test-contact-resolvers.ts`
Expected: PASS — prints `ok: website resolver` (and the earlier `ok:` lines).

- [ ] **Step 5: Commit**

```bash
git add src/jobs/enrich/resolvers/website.ts tests/unit/test-contact-resolvers.ts
git commit -m "feat(contacts): website-scrape contact resolver (injected fetcher)"
```

---

### Task 6: Web-search resolver

**Files:**
- Create: `src/jobs/enrich/resolvers/web-search.ts`
- Test: extend `tests/unit/test-contact-resolvers.ts` (web-search section)

**Interfaces:**
- Consumes: `ContactResolver`, `extractEmailsFromHtml` (reused from website resolver), an injected `search(query) => Promise<{url,title,snippet}[]>` and `fetchHtml(url)`.
- Produces: `createWebSearchResolver(deps: { search; fetchHtml }): ContactResolver` with `name = "webSearch"`. Confidence capped at 0.5 (unverified origin).

Rationale for injection: the concrete search backend (a SERP API, DuckDuckGo HTML, etc.) is chosen at wiring time in Task 8; the resolver stays testable and backend-agnostic.

- [ ] **Step 1: Write the failing test**

```ts
// append to tests/unit/test-contact-resolvers.ts
import { createWebSearchResolver } from "../../src/jobs/enrich/resolvers/web-search";

(async () => {
  const search = async (_q: string) => [{ url: "https://empresa.uy/contacto", title: "Empresa", snippet: "escribinos a hola@empresa.uy" }];
  const fetchHtml = async (_u: string) => `<a href="mailto:hola@empresa.uy">x</a>`;
  const r = createWebSearchResolver({ search, fetchHtml });
  assert.equal(r.name, "webSearch");
  const out = await r.resolve({ supplierId: "R/1", rut: "217231960015", name: "ANFANG S R L" });
  assert.ok(out.emails.some(e => e.email === "hola@empresa.uy"));
  assert.ok(out.emails.every(e => e.confidence <= 0.5)); // capped
  console.log("ok: web-search resolver");
})();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx tests/unit/test-contact-resolvers.ts`
Expected: FAIL — cannot find `../../src/jobs/enrich/resolvers/web-search`.

- [ ] **Step 3: Write `resolvers/web-search.ts`**

```ts
// src/jobs/enrich/resolvers/web-search.ts
import type { ContactResolver, ResolverInput, ResolverResult, ContactCandidate } from "../types";
import { extractEmailsFromHtml } from "./website";

export interface SearchHit { url: string; title: string; snippet: string }
export interface WebSearchDeps {
  search: (query: string) => Promise<SearchHit[]>;
  fetchHtml: (url: string) => Promise<string | null>;
}

const CAP = 0.5;

export function createWebSearchResolver(deps: WebSearchDeps): ContactResolver {
  return {
    name: "webSearch",
    async resolve(input: ResolverInput): Promise<ResolverResult> {
      const query = `${input.name} ${input.rut} uruguay contacto email`;
      const hits = await deps.search(query).catch(() => []);
      const seen = new Map<string, ContactCandidate>();
      let website: string | null = null;
      for (const hit of hits.slice(0, 3)) {
        // emails may already be in the snippet
        for (const c of extractEmailsFromHtml(hit.snippet, hostOf(hit.url))) add(seen, c);
        const html = await deps.fetchHtml(hit.url).catch(() => null);
        if (html) {
          if (!website) website = hit.url;
          for (const c of extractEmailsFromHtml(html, hostOf(hit.url))) add(seen, c);
        }
      }
      // Rebrand every candidate as webSearch + cap confidence (unverified origin).
      const emails: ContactCandidate[] = [...seen.values()].map(c => ({
        email: c.email, source: "webSearch", confidence: Math.min(c.confidence, CAP),
      }));
      return { emails, website };
    },
  };
}

function hostOf(url: string): string {
  try { return new URL(url).hostname; } catch { return ""; }
}
function add(map: Map<string, ContactCandidate>, c: ContactCandidate) {
  const prev = map.get(c.email);
  if (!prev || c.confidence > prev.confidence) map.set(c.email, c);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx tests/unit/test-contact-resolvers.ts`
Expected: PASS — prints `ok: web-search resolver`.

- [ ] **Step 5: Commit**

```bash
git add src/jobs/enrich/resolvers/web-search.ts tests/unit/test-contact-resolvers.ts
git commit -m "feat(contacts): web-search contact resolver (backend-agnostic, capped confidence)"
```

---

### Task 7: impo Diario Oficial resolver

**Files:**
- Create: `src/jobs/enrich/resolvers/impo.ts`
- Test: extend `tests/unit/test-contact-resolvers.ts` (impo section)

**Interfaces:**
- Consumes: `ContactResolver`; injected `searchGazette(query) => Promise<string[]>` (returns edicto HTML/text blobs).
- Produces: `createImpoResolver(searchGazette): ContactResolver` with `name = "impo"`, confidence 0.3, emails extracted from gazette free-text via the shared raw-email regex. Documented as low-yield / best-effort.

- [ ] **Step 1: Write the failing test**

```ts
// append to tests/unit/test-contact-resolvers.ts
import { createImpoResolver } from "../../src/jobs/enrich/resolvers/impo";

(async () => {
  const searchGazette = async (_q: string) => [
    "EDICTO ... la sociedad ANFANG SRL, RUT 217231960015, correo admin@cultocafe.uy ...",
    "sin datos de contacto",
  ];
  const r = createImpoResolver(searchGazette);
  assert.equal(r.name, "impo");
  const out = await r.resolve({ supplierId: "R/1", rut: "217231960015", name: "ANFANG S R L" });
  assert.ok(out.emails.some(e => e.email === "admin@cultocafe.uy"));
  assert.ok(out.emails.every(e => e.source === "impo" && e.confidence <= 0.3));
  console.log("ok: impo resolver");
})();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx tests/unit/test-contact-resolvers.ts`
Expected: FAIL — cannot find `../../src/jobs/enrich/resolvers/impo`.

- [ ] **Step 3: Write `resolvers/impo.ts`**

```ts
// src/jobs/enrich/resolvers/impo.ts
import type { ContactResolver, ResolverInput, ResolverResult, ContactCandidate } from "../types";

const RAW_EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/**
 * impo.com.uy is the Diario Oficial: company legal notices occasionally embed a
 * contact email in free text. Low yield + noisy, so confidence is 0.3 and this
 * is never the backbone. searchGazette is injected (the concrete impo query is
 * wired in Task 8) so the parser stays unit-testable.
 */
export function createImpoResolver(
  searchGazette: (query: string) => Promise<string[]>,
): ContactResolver {
  return {
    name: "impo",
    async resolve(input: ResolverInput): Promise<ResolverResult> {
      const blobs = await searchGazette(`${input.rut} ${input.name}`).catch(() => []);
      const seen = new Set<string>();
      const emails: ContactCandidate[] = [];
      for (const blob of blobs) {
        for (const m of blob.matchAll(RAW_EMAIL_RE)) {
          const email = m[0].toLowerCase();
          if (seen.has(email)) continue;
          seen.add(email);
          emails.push({ email, source: "impo", confidence: 0.3 });
        }
      }
      return { emails };
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx tests/unit/test-contact-resolvers.ts`
Expected: PASS — prints `ok: impo resolver`.

- [ ] **Step 5: Commit**

```bash
git add src/jobs/enrich/resolvers/impo.ts tests/unit/test-contact-resolvers.ts
git commit -m "feat(contacts): impo Diario Oficial resolver (best-effort, low confidence)"
```

---

### Task 8: Orchestrator job

**Files:**
- Create: `src/jobs/enrich-supplier-contacts.ts`
- (No new unit test — this is I/O wiring; verified by the Task 10 dry-run. Keep logic thin; all testable logic already lives in Tasks 2–7.)

**Interfaces:**
- Consumes: every resolver factory, `mergeCandidates`, `pickPrimary`, `deriveRubros`, `SupplierContactModel`, `connectToDatabase`.
- Produces: a runnable job with flags `--limit`, `--minPriority`, `--sources=dei,website,webSearch,impo`, `--stale-days=<n>`, `--dry-run`.

- [ ] **Step 1: Wire the concrete fetch + search backends**

Create a tiny `src/jobs/enrich/backends.ts` with the real fetchers, reusing the existing HTTP stack:

```ts
// src/jobs/enrich/backends.ts
import axios from "axios";
import type { SearchHit } from "./resolvers/web-search";

const UA = "gastos-gub-enrichment/1.0 (+https://gastos-gub.uy)";

export async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await axios.get<string>(url, {
      timeout: 12000, maxRedirects: 3, responseType: "text",
      headers: { "User-Agent": UA, "Accept-Language": "es-UY,es;q=0.9" },
      validateStatus: s => s >= 200 && s < 400,
    });
    return typeof res.data === "string" ? res.data : String(res.data);
  } catch { return null; }
}

// DuckDuckGo HTML endpoint — no key, returns anchors + snippets. Swap for a SERP
// API later without touching the resolver (it only depends on the SearchHit shape).
export async function search(query: string): Promise<SearchHit[]> {
  const html = await fetchHtml(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`);
  if (!html) return [];
  const hits: SearchHit[] = [];
  const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/gis;
  for (const m of html.matchAll(re)) {
    hits.push({ url: decodeDdg(m[1]), title: strip(m[2]), snippet: strip(m[2]) });
    if (hits.length >= 5) break;
  }
  return hits;
}

// impo gazette search → return the result page HTML blob(s) for regex scanning.
export async function searchGazette(query: string): Promise<string[]> {
  const html = await fetchHtml(`https://www.impo.com.uy/diariooficial/?buscar=${encodeURIComponent(query)}`);
  return html ? [html] : [];
}

function strip(s: string): string { return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); }
function decodeDdg(href: string): string {
  const m = href.match(/uddg=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : href;
}
```

- [ ] **Step 2: Write the orchestrator**

```ts
// src/jobs/enrich-supplier-contacts.ts
#!/usr/bin/env tsx
import { connectToDatabase, disconnectFromDatabase, mongoose } from "../../shared/connection/database";
import { SupplierContactModel } from "../../shared/models/supplier_contacts";
import type { ContactResolver, ContactCandidate } from "./enrich/types";
import { mergeCandidates, pickPrimary } from "./enrich/hygiene";
import { deriveRubros } from "./enrich/rubros";
import { createDeiResolver } from "./enrich/resolvers/dei";
import { createWebsiteResolver } from "./enrich/resolvers/website";
import { createWebSearchResolver } from "./enrich/resolvers/web-search";
import { createImpoResolver } from "./enrich/resolvers/impo";
import { fetchHtml, search, searchGazette } from "./enrich/backends";

function arg(name: string): string | undefined {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);
const digits = (s: string) => (s || "").replace(/\D/g, "");
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function main() {
  const dryRun = flag("dry-run");
  const limit = Number(arg("limit") ?? "100");
  const minPriority = Number(arg("minPriority") ?? "0");
  const staleDays = Number(arg("stale-days") ?? "90");
  const wanted = new Set((arg("sources") ?? "dei,website,webSearch,impo").split(","));

  await connectToDatabase();
  const db = mongoose.connection.db!;

  const resolvers: ContactResolver[] = [];
  if (wanted.has("dei")) resolvers.push(createDeiResolver(db));
  if (wanted.has("website")) resolvers.push(createWebsiteResolver(fetchHtml));
  if (wanted.has("webSearch")) resolvers.push(createWebSearchResolver({ search, fetchHtml }));
  if (wanted.has("impo")) resolvers.push(createImpoResolver(searchGazette));

  // Candidate suppliers by spend priority, skipping fresh ones.
  const staleBefore = new Date(Date.now() - staleDays * 864e5);
  const suppliers = await db.collection("supplier_patterns")
    .find({}, { projection: { supplierId: 1, name: 1, totalValue: 1, totalContracts: 1 } })
    .sort({ totalValue: -1 })
    .limit(limit * 4) // over-fetch; we filter fresh ones below
    .toArray();

  let processed = 0;
  for (const s of suppliers) {
    if (processed >= limit) break;
    const supplierId = String(s.supplierId);
    const priorityScore = Number(s.totalValue ?? 0) / Math.max(1, Number(s.totalContracts ?? 1));
    if (priorityScore < minPriority) continue;

    const existing = await SupplierContactModel.findOne({ supplierId }, { enrichedAt: 1, status: 1 }).lean();
    if (existing && existing.status !== "pending" && existing.enrichedAt && existing.enrichedAt > staleBefore) continue;

    const rut = digits(supplierId);
    const name = String(s.name ?? "");
    const input = { supplierId, rut, name, website: null as string | null };

    // DEI first (may supply the website the later resolvers use).
    const all: ContactCandidate[] = [];
    let website: string | null = null;
    let phone: string | null = null;
    for (const r of resolvers) {
      const res = await r.resolve({ ...input, website }).catch(() => ({ emails: [] as ContactCandidate[] }));
      all.push(...res.emails);
      if (!website && res.website) website = res.website;
      if (!phone && res.phone) phone = res.phone;
      await sleep(r.name === "dei" ? 0 : 800); // throttle external calls
    }

    const emails = await mergeCandidates(all);
    const primaryEmail = pickPrimary(emails);
    const rubros = await deriveRubros(db, supplierId, 5).catch(() => []);
    const status = emails.length ? "enriched" : "no_contact";

    processed++;
    if (dryRun) {
      console.log(`${processed}. ${name} — ${primaryEmail ?? "(none)"} [${emails.length} email(s), ${rubros.length} rubro(s)]`);
      continue;
    }
    await SupplierContactModel.updateOne(
      { supplierId },
      { $set: { supplierId, rut, name, emails, primaryEmail, website, phone, rubros, status, priorityScore, enrichedAt: new Date() } },
      { upsert: true },
    );
    if (processed % 25 === 0) console.log(`   …${processed}/${limit}`);
  }

  const withEmail = await SupplierContactModel.countDocuments({ primaryEmail: { $ne: null } });
  console.log(`✅ processed ${processed}; supplier_contacts with a primary email: ${withEmail}`);
  await disconnectFromDatabase();
}

main().catch(e => { console.error("❌ enrich-supplier-contacts failed:", e); process.exit(1); });
```

- [ ] **Step 3: Typecheck the new job (repo uses targeted tsc, no test runner)**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "enrich" || echo "no enrich type errors"`
Expected: `no enrich type errors` (or fix any reported).

- [ ] **Step 4: Commit**

```bash
git add src/jobs/enrich/backends.ts src/jobs/enrich-supplier-contacts.ts
git commit -m "feat(contacts): orchestrator job wiring resolvers + hygiene + rubros"
```

---

### Task 9: RUPE viability spike (investigation — may defer)

**Files:**
- Create: `docs/superpowers/notes/rupe-viability.md`

**Interfaces:** none (research task). Produces a documented decision, not code.

- [ ] **Step 1: Investigate RUPE access**

Check whether the Registro Único de Proveedores del Estado exposes any supplier contact
email **without** authenticated/ToS-restricted access. Concretely:
- Look for an open-data dataset on `catalogodatos.gub.uy` for RUPE (as DEI has one).
- Check `gub.uy` for a public RUPE proveedor lookup by RUT that returns an email.
- Confirm the ToS: if it requires login or forbids automated access, RUPE is **out** for v1.

- [ ] **Step 2: Write the finding**

Record in `docs/superpowers/notes/rupe-viability.md`: what's accessible, the exact URL(s),
whether an email field is present, the ToS/auth verdict, and a recommendation
(implement a `resolvers/rupe.ts` in a follow-up, or defer). If viable and open, note the
resolver interface it would implement (`ContactResolver`, `name: "rupe"`, confidence ~0.95).

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/notes/rupe-viability.md
git commit -m "docs(contacts): RUPE access viability spike + decision"
```

---

### Task 10: Dry-run coverage report on top suppliers

**Files:** none (validation task).

- [ ] **Step 1: Ensure indexes exist**

Run: `npx tsx scripts/ensure-indexes.ts`
Expected: ends with `✅ supplier_contacts indexes ensured`.

- [ ] **Step 2: Dry-run the DEI-only pass (fast, no network) on the top 200 suppliers**

Run: `npx tsx src/jobs/enrich-supplier-contacts.ts --limit=200 --sources=dei --dry-run`
Expected: 200 lines; note how many show a real primary email (this is the DEI baseline).

- [ ] **Step 3: Dry-run the full multi-source pass on the top 50 (network + throttled)**

Run: `npx tsx src/jobs/enrich-supplier-contacts.ts --limit=50 --dry-run`
Expected: 50 lines; coverage should exceed the DEI-only baseline. Eyeball 10 emails for
plausibility (right domain, not junk). If a resolver throws or a host blocks us, note it.

- [ ] **Step 4: Real write for the top 500, then report**

Run: `npx tsx src/jobs/enrich-supplier-contacts.ts --limit=500`
Expected: ends with `✅ processed 500; supplier_contacts with a primary email: <N>`.

Record `<N>` and the DEI-only baseline in the spec's "Open items" as the measured
coverage — this number sizes the Phase B campaign and decides whether RUPE is worth
pursuing.

- [ ] **Step 5: Commit (report note only)**

```bash
git commit --allow-empty -m "chore(contacts): record Phase A coverage baseline (see run output)"
```

---

## Self-Review

**Spec coverage (Phase A section of the design doc):**
- `supplier_contacts` collection + shape → Task 1. ✓
- Rubro derivation folded into enrichment → Task 3 + wired in Task 8. ✓
- Resolvers DEI / website / web-search / impo → Tasks 4–7. ✓
- RUPE spike-first → Task 9. ✓
- Orchestration (priority, throttle, resumable, idempotent, flags) → Task 8. ✓
- Hygiene (format, MX, role-account, dedupe/merge, junk drop, primary pick) → Task 2. ✓
- Verify (tsx assertion tests + dry-run coverage) → Tasks 1–7 tests + Task 10. ✓
- Index build under ensure-indexes (autoIndex off) → Task 1 Step 5. ✓

**Placeholder scan:** No TBD/TODO. RUPE is an explicit investigation task with a concrete deliverable, not a placeholder. All code steps show full code.

**Type consistency:** `ContactCandidate`/`ResolverResult`/`ResolverInput`/`ContactResolver` defined in Task 2 (`types.ts`) and consumed unchanged in Tasks 4–8. `IEmailEntry`/`IRubro`/`EmailSource` defined in Task 1 and reused everywhere. `mergeCandidates`/`pickPrimary` signatures match between Task 2 definition and Task 8 use. `deriveRubros(db, supplierId, topN)` matches between Task 3 and Task 8. `extractEmailsFromHtml(html, siteDomain)` defined in Task 5, reused in Task 6.

**Note on Phase B:** This plan is Phase A only. Phase B (campaign send/track/comply) gets its own plan after Task 10's coverage number is known and the cold-email provider + subdomain are chosen — both are inputs Phase B needs and neither exists yet.
