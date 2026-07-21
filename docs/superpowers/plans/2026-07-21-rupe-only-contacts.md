# RUPE-Only ("Never Awarded") Companies in the Supplier Contact Directory — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** List RUPE-registered companies that never won an award in `/proveedores/contactos`, address-only, with a "Sin adjudicaciones" chip and a filter to isolate/exclude them.

**Architecture:** Reuse the existing `supplier_contacts` collection (single filter/serialize/export choke point in `app/server/utils/contacts.ts`). Add a `neverAwarded` boolean + `rupeEstado` string to the model. A new anti-join seeding job (`src/jobs/seed-rupe-only-contacts.ts`) upserts one address-only row per RUPE RUT that has no `supplier_patterns` award. The read layer gains an `origen` filter dimension (`todas` default = contactable ∪ registry-only) orthogonal to every existing filter. Tier-2 email enrichment of these rows is explicitly out of scope — a follow-on plan.

**Tech Stack:** TypeScript, Mongoose (shared models) + native `mongodb` driver (job scripts), Nitro (Nuxt server API), Vue 3 `<script setup>` + Vuetify chip, `tsx` for jobs/tests, `node-cron` (cronserver).

**Spec:** [docs/superpowers/specs/2026-07-21-rupe-only-companies-contact-directory-design.md](../specs/2026-07-21-rupe-only-companies-contact-directory-design.md)

## Global Constraints

- New/changed Mongoose schema fields go in **both** the TS interface and the Schema (repo convention).
- **Indexes exist only if `scripts/ensure-indexes.ts` builds them** — `autoIndex` is off; a bare `Schema.index()` call does nothing on its own.
- **Long-running jobs must raise `MONGO_SOCKET_TIMEOUT_MS` before the first `connectToDatabase()`** — pattern: `if (!process.env.MONGO_SOCKET_TIMEOUT_MS) process.env.MONGO_SOCKET_TIMEOUT_MS = String(N * 60 * 1000)`.
- **No test framework** — every test is a standalone `tsx` script under `tests/unit/` that asserts and exits non-zero on failure; `npm test` runs `scripts/run-tests.mjs unit`, which auto-discovers every `*.ts` file in that directory (skipping `NEEDS_CREDENTIALS`-listed and `*.verify.ts` files) — no registration step needed.
- **Concurrent sessions share one working tree.** Stage explicit paths at commit time, never `git add -A`.
- UI copy is es/en via `app/i18n/locales/{es,en}.json`; `app/DESIGN.md` is the binding UI contract.
- The dev box currently cannot reach the DB (IP not in the 27017 allowlist) — DB-touching verification steps (index dry-run, seed job dry-run/live-run) run on the 167 server.

---

### Task 1: Model fields — `neverAwarded`, `rupeEstado`, `"registry"` status

**Files:**
- Modify: `shared/models/supplier_contacts.ts`
- Test: `tests/unit/test-supplier-contacts-model.ts` (extend existing file)

**Interfaces:**
- Produces: `ISupplierContact.neverAwarded: boolean`, `ISupplierContact.rupeEstado: string | null`, `ContactStatus` gains `"registry"`. Every later task that reads/writes a `supplier_contacts` document relies on these two field names.

- [ ] **Step 1: Write the failing test**

Append to the end of `tests/unit/test-supplier-contacts-model.ts` (before nothing needs removing — just add after the existing `console.log`):

```ts
// A RUPE-only ("registered, never awarded") seed row must also validate.
const registryDoc = new SupplierContactModel({
  supplierId: "R/210002980010",
  rut: "210002980010",
  name: "ACME S.A.",
  address: "Av. Italia 1234",
  locality: "Maldonado, Maldonado",
  placeSource: "rupe",
  rupeEstado: "ACTIVO",
  neverAwarded: true,
  status: "registry",
  priorityScore: 0,
});
const registryErr = registryDoc.validateSync();
assert.equal(registryErr, undefined, `unexpected validation error: ${registryErr?.message}`);
assert.equal(registryDoc.neverAwarded, true);
assert.equal(registryDoc.rupeEstado, "ACTIVO");
assert.equal(registryDoc.status, "registry");
console.log("ok: supplier_contacts model (registry row)");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx tests/unit/test-supplier-contacts-model.ts`
Expected: FAIL — Mongoose schema validation error, or a TS error, because `neverAwarded`/`rupeEstado`/`status: "registry"` don't exist on the schema yet (mongoose silently drops unknown paths by default rather than erroring on `validateSync`, so the failure you'll actually see is the `assert.equal(registryDoc.neverAwarded, true)` line throwing `AssertionError [ERR_ASSERTION]: true == undefined` — confirm that specific failure, not a stale pass).

- [ ] **Step 3: Add the fields to the interface and schema**

In `shared/models/supplier_contacts.ts`, change:

```ts
export type ContactStatus = "pending" | "enriched" | "no_contact" | "error";
```

to:

```ts
export type ContactStatus = "pending" | "enriched" | "no_contact" | "error" | "registry";
```

In `ISupplierContact`, after the `placeSource` field, add:

```ts
  rubros: IRubro[];
  status: ContactStatus;
  priorityScore: number;
  enrichedAt: Date | null;
  /** True when this row was seeded from RUPE because the company never won an award — see seed-rupe-only-contacts.ts. Orthogonal to `status`. */
  neverAwarded: boolean;
  /** RUPE registry state verbatim (ACTIVO / EN INGRESO / …) when this row is RUPE-sourced; null otherwise. */
  rupeEstado: string | null;
}
```

(i.e. append the two new fields right before the closing `}` of the interface — the existing fields above are unchanged, shown here only for anchoring.)

In the `SupplierContactSchema` definition, after the `placeSource` line, add:

```ts
  rubros: { type: [RubroSchema], default: [] },
  status: { type: String, default: "pending" },
  priorityScore: { type: Number, default: 0 },
  enrichedAt: { type: Date, default: null },
  neverAwarded: { type: Boolean, default: false },
  rupeEstado: { type: String, default: null },
}, { timestamps: true, collection: "supplier_contacts" });
```

(append the two new lines right before the closing `}, { timestamps... }` — the existing lines above are unchanged, shown only for anchoring.)

After the existing `SupplierContactSchema.index({ locality: 1 });` line, add:

```ts
SupplierContactSchema.index({ neverAwarded: 1, priorityScore: -1 });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx tests/unit/test-supplier-contacts-model.ts`
Expected: PASS — both `console.log` lines print (`ok: supplier_contacts model` then `ok: supplier_contacts model (registry row)`), exit code 0.

- [ ] **Step 5: Commit**

```bash
git add shared/models/supplier_contacts.ts tests/unit/test-supplier-contacts-model.ts
git commit -m "feat(contacts): add neverAwarded + rupeEstado to supplier_contacts model"
```

---

### Task 2: Index parity in `scripts/ensure-indexes.ts`

**Files:**
- Modify: `scripts/ensure-indexes.ts:557-566` (the `supplier_contacts` block) and `:643` (the dry-run print line)

**Interfaces:**
- Consumes: nothing new (raw `db.collection('supplier_contacts')`, no model import).
- Produces: the live `{ neverAwarded: 1, priorityScore: -1 }` index Task 5's `origen=sin-adjudicaciones` filter and the default `todas` `$or` branch rely on for query performance.

- [ ] **Step 1: Add the index to the live block**

In `scripts/ensure-indexes.ts`, change:

```ts
      const sc = db.collection('supplier_contacts')
      await sc.createIndex({ supplierId: 1 }, { unique: true, background: true, name: 'supplierId_1' })
      await sc.createIndex({ rut: 1 }, { background: true, name: 'rut_1' })
      await sc.createIndex({ status: 1, priorityScore: -1 }, { background: true, name: 'status_1_priorityScore_-1' })
      await sc.createIndex({ name: 1 }, { background: true, name: 'name_1' })
      await sc.createIndex({ 'rubros.classificationId': 1 }, { background: true, name: 'rubros.classificationId_1' })
      await sc.createIndex({ placeSource: 1 }, { background: true, name: 'placeSource_1' })
      await sc.createIndex({ locality: 1 }, { background: true, name: 'locality_1' })
      console.log('✅ supplier_contacts indexes ensured')
```

to:

```ts
      const sc = db.collection('supplier_contacts')
      await sc.createIndex({ supplierId: 1 }, { unique: true, background: true, name: 'supplierId_1' })
      await sc.createIndex({ rut: 1 }, { background: true, name: 'rut_1' })
      await sc.createIndex({ status: 1, priorityScore: -1 }, { background: true, name: 'status_1_priorityScore_-1' })
      await sc.createIndex({ name: 1 }, { background: true, name: 'name_1' })
      await sc.createIndex({ 'rubros.classificationId': 1 }, { background: true, name: 'rubros.classificationId_1' })
      await sc.createIndex({ placeSource: 1 }, { background: true, name: 'placeSource_1' })
      await sc.createIndex({ locality: 1 }, { background: true, name: 'locality_1' })
      await sc.createIndex({ neverAwarded: 1, priorityScore: -1 }, { background: true, name: 'neverAwarded_1_priorityScore_-1' })
      console.log('✅ supplier_contacts indexes ensured')
```

- [ ] **Step 2: Update the dry-run plan print line**

Change:

```ts
      console.log('   plan: supplier_contacts.{supplierId unique, rut, status+priorityScore, rubros.classificationId, placeSource, locality}')
```

to:

```ts
      console.log('   plan: supplier_contacts.{supplierId unique, rut, status+priorityScore, rubros.classificationId, placeSource, locality, neverAwarded+priorityScore}')
```

- [ ] **Step 3: Verify with a dry run**

This script needs a live `MONGODB_URI`, unreachable from the dev box right now. Run on 167 (or wherever the DB is reachable):

Run: `npx tsx scripts/ensure-indexes.ts --dry-run`
Expected: under the `supplier_contacts` section, a line `➕ would create   {"neverAwarded":1,"priorityScore":-1}` (the other six already exist and print `⏭️ skip (exists)`). If this step can't run yet (still on the dev box), leave this checkbox unchecked and complete it during Task 11 (live verification).

- [ ] **Step 4: Commit**

```bash
git add scripts/ensure-indexes.ts
git commit -m "feat(contacts): index supplier_contacts.neverAwarded+priorityScore"
```

---

### Task 3: Pure seed-row builder

**Files:**
- Create: `src/jobs/seed-rupe-only/build-row.ts`
- Test: `tests/unit/test-seed-rupe-only-build-row.ts`

**Interfaces:**
- Consumes: `FieldSource` type from `shared/models/supplier_contacts.ts` (Task 1).
- Produces: `synthesizeSupplierId(rut: string): string`, `buildRegistryRow(input: RupeSeedInput): RegistryRowSet`, and the `RupeSeedInput` type — Task 4's orchestrator imports all three by these exact names.

This mirrors the existing job convention (`src/jobs/enrich/hygiene.ts`, `src/jobs/enrich/rubros.ts`, `src/jobs/enrich/resolvers/*.ts`): pure logic lives in a module with no top-level `main()` call, so it can be `import`ed by a unit test without executing a job. The orchestrator (Task 4) is the only file that calls `main()` at module scope.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/test-seed-rupe-only-build-row.ts`:

```ts
// tests/unit/test-seed-rupe-only-build-row.ts
import assert from "node:assert";
import { buildRegistryRow, synthesizeSupplierId } from "../../src/jobs/seed-rupe-only/build-row";

assert.equal(synthesizeSupplierId("210002980010"), "R/210002980010");

// Geocoded row: address/locality/lat/lng/placeId all copied.
const geocoded = buildRegistryRow({
  rut: "210002980010",
  denominacionSocial: "ACME S.A.",
  domicilioFiscal: "Av. Italia 1234",
  localidad: "Maldonado",
  departamento: "Maldonado",
  estado: "ACTIVO",
  lat: -34.9, lng: -54.9, placeId: "ChIJ123",
  geocodeStatus: "ok",
});
assert.equal(geocoded.supplierId, "R/210002980010");
assert.equal(geocoded.address, "Av. Italia 1234");
assert.equal(geocoded.locality, "Maldonado, Maldonado");
assert.equal(geocoded.lat, -34.9);
assert.equal(geocoded.lng, -54.9);
assert.equal(geocoded.placeId, "ChIJ123");
assert.equal(geocoded.placeSource, "rupe");
assert.equal(geocoded.rupeEstado, "ACTIVO");
assert.equal(geocoded.neverAwarded, true);

// Not-yet-geocoded row: lat/lng/placeId held back (no wrong pin); address/locality still set.
const pending = buildRegistryRow({
  rut: "210002980020",
  denominacionSocial: "BETA S.A.",
  domicilioFiscal: "Ruta 1",
  localidad: null,
  departamento: "Colonia",
  estado: "EN INGRESO",
  lat: null, lng: null, placeId: null,
  geocodeStatus: "pending",
});
assert.equal(pending.locality, "Colonia", "null localidad is dropped; departamento alone still joins");
assert.equal(pending.lat, null);
assert.equal(pending.lng, null);
assert.equal(pending.rupeEstado, "EN INGRESO");

// Missing address entirely.
const noAddr = buildRegistryRow({
  rut: "210002980030", denominacionSocial: "GAMMA", domicilioFiscal: null,
  localidad: null, departamento: null, estado: "ACTIVO",
});
assert.equal(noAddr.address, null);
assert.equal(noAddr.locality, null);

console.log("ok: seed-rupe-only build-row");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx tests/unit/test-seed-rupe-only-build-row.ts`
Expected: FAIL with `Cannot find module '../../src/jobs/seed-rupe-only/build-row'`.

- [ ] **Step 3: Write the implementation**

Create `src/jobs/seed-rupe-only/build-row.ts`:

```ts
// src/jobs/seed-rupe-only/build-row.ts
//
// Pure transform: one rupe_registry row → the supplier_contacts $set fields for
// a "registered, never awarded" seed row. No I/O — testable without a DB.
import type { ISupplierContact, FieldSource } from "../../../shared/models/supplier_contacts";

export interface RupeSeedInput {
  rut: string;
  denominacionSocial: string;
  domicilioFiscal?: string | null;
  localidad?: string | null;
  departamento?: string | null;
  estado: string;
  lat?: number | null;
  lng?: number | null;
  placeId?: string | null;
  geocodeStatus?: string;
}

/** `R/<rut>` — matches the `candidateIds()` shape supplier_patterns ids use. */
export function synthesizeSupplierId(rut: string): string {
  return `R/${rut}`;
}

export type RegistryRowSet = Pick<
  ISupplierContact,
  "supplierId" | "rut" | "name" | "address" | "locality" | "placeSource"
  | "lat" | "lng" | "placeId" | "rupeEstado" | "neverAwarded"
>;

/**
 * Builds the $set fields for a RUPE-only seed row. Geocode fields are only
 * copied when geocode-rupe.ts marked the row "ok" — a pending/error/zero_results
 * status means lat/lng are stale or absent, so they are left null rather than
 * plotting a wrong pin.
 */
export function buildRegistryRow(input: RupeSeedInput): RegistryRowSet {
  const locality = [input.localidad, input.departamento]
    .map(v => (v ? String(v).trim() : ""))
    .filter(Boolean)
    .join(", ") || null;
  const geocoded = input.geocodeStatus === "ok";
  const placeSource: FieldSource = "rupe";

  return {
    supplierId: synthesizeSupplierId(input.rut),
    rut: input.rut,
    name: input.denominacionSocial,
    address: input.domicilioFiscal ?? null,
    locality,
    placeSource,
    lat: geocoded ? (input.lat ?? null) : null,
    lng: geocoded ? (input.lng ?? null) : null,
    placeId: geocoded ? (input.placeId ?? null) : null,
    rupeEstado: input.estado,
    neverAwarded: true,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx tests/unit/test-seed-rupe-only-build-row.ts`
Expected: PASS — `ok: seed-rupe-only build-row`, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add src/jobs/seed-rupe-only/build-row.ts tests/unit/test-seed-rupe-only-build-row.ts
git commit -m "feat(contacts): pure RUPE-only seed-row builder"
```

---

### Task 4: Seeding job orchestrator + npm script + cron

**Files:**
- Create: `src/jobs/seed-rupe-only-contacts.ts`
- Modify: `package.json:35` (add npm script after `geocode-rupe`)
- Modify: `src/cronserver.ts:952-967` (extend the existing RUPE cron callback)

**Interfaces:**
- Consumes: `buildRegistryRow`, `synthesizeSupplierId`, `RupeSeedInput` from Task 3 (`src/jobs/seed-rupe-only/build-row.ts`); `SupplierContactModel` from `shared/models/supplier_contacts.ts` (Task 1); `connectToDatabase`/`disconnectFromDatabase`/`mongoose` from `shared/connection/database.ts`.
- Produces: the `supplier_contacts` rows Task 5/6/9 read; the `npm run seed-rupe-only-contacts` command; the monthly cron entry.

No unit test for this file — it's a thin DB-orchestration layer with a top-level `main()` call (same convention as `src/jobs/enrich-supplier-contacts.ts`, which also has no direct unit test; its logic is tested via the pure modules it imports, which is what Task 3 already covers). Verified instead via `--dry-run` in Task 11 (needs a live DB).

- [ ] **Step 1: Write the orchestrator**

Create `src/jobs/seed-rupe-only-contacts.ts`:

```ts
#!/usr/bin/env tsx
// src/jobs/seed-rupe-only-contacts.ts
//
// Seeds supplier_contacts with RUPE-registered companies that never won an
// award — the "Sin adjudicaciones" tier of the public contact directory (see
// docs/superpowers/specs/2026-07-21-rupe-only-companies-contact-directory-design.md).
// RUPE carries name + fiscal address + estado only (no email/phone/website); the
// seeded row is address-only until a future Tier-2 enrichment pass (not built
// here) finds contact details.
//
// Anti-joins rupe_registry against the awarded-supplier RUT set
// (supplier_patterns), upserts a registry row for every RUT that never won, and
// reconciles the reverse case (a registry row whose company has since won an
// award) by flipping neverAwarded back to false.
if (!process.env.MONGO_SOCKET_TIMEOUT_MS) {
  process.env.MONGO_SOCKET_TIMEOUT_MS = String(10 * 60 * 1000);
}
import { connectToDatabase, disconnectFromDatabase, mongoose } from "../../shared/connection/database";
import { SupplierContactModel } from "../../shared/models/supplier_contacts";
import { buildRegistryRow, type RupeSeedInput } from "./seed-rupe-only/build-row";

function arg(name: string): string | undefined {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);
const digits = (s: string) => (s || "").replace(/\D/g, "");

/** Chunk an array for a bounded `$in` (avoids one huge round-trip). */
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  const dryRun = flag("dry-run");
  const onlyActive = flag("only-active");
  const limit = arg("limit") ? Number(arg("limit")) : Infinity;

  await connectToDatabase();
  const db = mongoose.connection.db!;

  console.log("📥 loading awarded-supplier RUT set from supplier_patterns...");
  const awardedRuts = new Set<string>();
  const patternsCursor = db.collection("supplier_patterns").find({}, { projection: { supplierId: 1 } });
  for await (const doc of patternsCursor as AsyncIterable<{ supplierId?: string }>) {
    const rut = digits(doc.supplierId ?? "");
    if (rut) awardedRuts.add(rut);
  }
  console.log(`   ${awardedRuts.size} awarded RUTs`);

  const rupeFilter: Record<string, unknown> = onlyActive ? { estado: "ACTIVO" } : {};
  const rupeCursor = db.collection("rupe_registry").find(rupeFilter, {
    projection: {
      rut: 1, denominacionSocial: 1, domicilioFiscal: 1, localidad: 1,
      departamento: 1, estado: 1, lat: 1, lng: 1, placeId: 1, geocodeStatus: 1,
    },
  });

  let seen = 0, seeded = 0, skippedAwarded = 0, errors = 0;
  for await (const doc of rupeCursor as AsyncIterable<RupeSeedInput>) {
    if (seeded >= limit) break;
    seen++;
    const rut = digits(doc.rut);
    if (!rut || awardedRuts.has(rut)) { skippedAwarded++; continue; }

    try {
      const row = buildRegistryRow({ ...doc, rut });
      seeded++;
      if (dryRun) {
        if (seeded <= 10) console.log(`   would seed: ${row.name} (${row.supplierId}) — ${row.address ?? "(sin dirección)"}`);
        continue;
      }
      await SupplierContactModel.updateOne(
        { supplierId: row.supplierId },
        {
          $set: row,
          $setOnInsert: {
            status: "registry",
            priorityScore: 0,
            emails: [],
            primaryEmail: null,
            website: null,
            websiteSource: null,
            phone: null,
            phoneSource: null,
            hours: null,
            mapsUrl: null,
            rubros: [],
            enrichedAt: null,
          },
        },
        { upsert: true },
      );
      if (seeded % 5000 === 0) console.log(`   …${seeded} seeded (${seen} scanned)`);
    } catch (e) {
      errors++;
      console.error(`   ⚠️ rut ${doc.rut} failed, skipping:`, e instanceof Error ? e.message : e);
    }
  }
  console.log(`✅ scan complete: ${seen} RUPE rows scanned, ${seeded} seeded, ${skippedAwarded} already-awarded (skipped), ${errors} error(s)`);

  // Reconcile the reverse case: a row seeded as neverAwarded whose company has
  // since won an award (a later supplier_patterns refresh added it).
  if (!dryRun && awardedRuts.size) {
    console.log("🔄 reconciling neverAwarded → false for RUTs that now have an award...");
    let flipped = 0;
    for (const batch of chunk([...awardedRuts], 5000)) {
      const res = await SupplierContactModel.updateMany(
        { neverAwarded: true, rut: { $in: batch } },
        { $set: { neverAwarded: false } },
      );
      flipped += res.modifiedCount;
    }
    console.log(`   ${flipped} row(s) flipped back to awarded`);
  }

  const registryTotal = await SupplierContactModel.countDocuments({ neverAwarded: true });
  console.log(`📊 supplier_contacts rows currently marked neverAwarded: ${registryTotal}`);
  await disconnectFromDatabase();
}

main().catch(e => { console.error("❌ seed-rupe-only-contacts failed:", e); process.exit(1); });
```

- [ ] **Step 2: Add the npm script**

In `package.json`, change:

```json
    "load-rupe": "tsx src/jobs/load-rupe.ts",
    "geocode-rupe": "tsx src/jobs/geocode-rupe.ts",
```

to:

```json
    "load-rupe": "tsx src/jobs/load-rupe.ts",
    "geocode-rupe": "tsx src/jobs/geocode-rupe.ts",
    "seed-rupe-only-contacts": "tsx src/jobs/seed-rupe-only-contacts.ts",
```

- [ ] **Step 3: Wire the monthly cron**

In `src/cronserver.ts`, change the existing RUPE cron callback:

```ts
    const rupeExpression = "0 6 1 * *";
    cron.schedule(
      rupeExpression,
      async () => {
        try {
          this.logger.info("Starting RUPE registry refresh (load)...");
          await this.runJobProcess("jobs/load-rupe");
          this.logger.info("RUPE load complete; geocoding new/changed addresses...");
          await this.runJobProcess("jobs/geocode-rupe", ["--limit=5000"]);
          this.logger.info("RUPE registry refresh completed successfully");
        } catch (error) {
          this.logger.error("RUPE registry refresh failed:", error instanceof Error ? error : String(error));
        }
      },
      { scheduled: true, timezone: "America/Montevideo" }
    );
```

to:

```ts
    const rupeExpression = "0 6 1 * *";
    cron.schedule(
      rupeExpression,
      async () => {
        try {
          this.logger.info("Starting RUPE registry refresh (load)...");
          await this.runJobProcess("jobs/load-rupe");
          this.logger.info("RUPE load complete; geocoding new/changed addresses...");
          await this.runJobProcess("jobs/geocode-rupe", ["--limit=5000"]);
          this.logger.info("RUPE registry refresh completed successfully");
          this.logger.info("Seeding registered-never-awarded companies into supplier_contacts...");
          await this.runJobProcess("jobs/seed-rupe-only-contacts");
          this.logger.info("RUPE-only contact seeding completed successfully");
        } catch (error) {
          this.logger.error("RUPE registry refresh failed:", error instanceof Error ? error : String(error));
        }
      },
      { scheduled: true, timezone: "America/Montevideo" }
    );
```

- [ ] **Step 4: Verify (dry run, needs a live DB)**

Deferred to Task 11 if the dev box still can't reach the DB. On a host that can:

Run: `npx tsx src/jobs/seed-rupe-only-contacts.ts --dry-run --limit=20`
Expected: prints the awarded-RUT count, then up to 10 `would seed: <name> (<supplierId>) — <address>` lines, then `✅ scan complete: ... 20 seeded, ...`, exit code 0. No writes (dry-run skips the reconcile block too).

- [ ] **Step 5: Commit**

```bash
git add src/jobs/seed-rupe-only-contacts.ts package.json src/cronserver.ts
git commit -m "feat(contacts): seed RUPE-only companies into supplier_contacts, monthly cron"
```

---

### Task 5: `origen` filter dimension in `buildContactFilter`

**Files:**
- Modify: `app/server/utils/contacts.ts` (the `buildContactFilter` function, lines ~72-136)
- Test: `tests/unit/test-contacts-origen-filter.ts` (new)

**Interfaces:**
- Consumes: `ISupplierContact.neverAwarded` (Task 1).
- Produces: `buildContactFilter` now honours `query.origen: 'todas' | 'con-email' | 'sin-adjudicaciones'` (default `'todas'`). Task 9's UI sends this param unchanged through the existing `filterQuery` → `/api/contacts` / `/api/contacts/export` plumbing (those endpoints already forward the whole raw query object — no endpoint file changes needed).

- [ ] **Step 1: Write the failing test**

Create `tests/unit/test-contacts-origen-filter.ts`:

```ts
// tests/unit/test-contacts-origen-filter.ts
// buildContactFilter's `origen` dimension: which population of the directory a
// query includes. No DB needed — these branches never touch DEI/categoria joins.
import assert from "node:assert";
import { buildContactFilter } from "../../app/server/utils/contacts";

(async () => {
  // Default (todas): contactable OR registry — a single condition, assigned
  // directly (no $and wrapper needed when there's only one).
  const todas = await buildContactFilter({});
  assert.ok(!("empty" in todas));
  const f = (todas as { filter: Record<string, unknown> }).filter;
  assert.deepEqual(f.$or, [
    { emails: { $elemMatch: { mxValid: true, status: "valid" } } },
    { neverAwarded: true },
  ]);
  assert.equal(f.status, undefined, "the old status:'enriched' gate is dropped — email/neverAwarded conditions govern instead");
  assert.equal(f.$and, undefined);

  // con-email: contactable only.
  const conEmail = await buildContactFilter({ origen: "con-email" });
  const f2 = (conEmail as { filter: Record<string, unknown> }).filter;
  assert.deepEqual(f2, { emails: { $elemMatch: { mxValid: true, status: "valid" } } });

  // sin-adjudicaciones: registry rows only.
  const sinAdj = await buildContactFilter({ origen: "sin-adjudicaciones" });
  const f3 = (sinAdj as { filter: Record<string, unknown> }).filter;
  assert.deepEqual(f3, { neverAwarded: true });

  // verified=0 still widens the contactable side (both con-email and the
  // todas $or's first branch use the same hasUsableEmail clause).
  const widened = await buildContactFilter({ origen: "con-email", verified: "0" });
  assert.deepEqual(
    (widened as { filter: Record<string, unknown> }).filter,
    { emails: { $elemMatch: { status: { $nin: ["suppressed", "invalid"] } } } },
  );

  // origen composes with search via $and — two conditions, neither clobbers the other.
  const withSearch = await buildContactFilter({ origen: "sin-adjudicaciones", search: "acme" });
  const f4 = (withSearch as { filter: Record<string, unknown> }).filter;
  assert.ok(Array.isArray(f4.$and) && f4.$and.length === 2, "origin + search both present");
  const and4 = f4.$and as Record<string, unknown>[];
  assert.ok(and4.some(c => c.neverAwarded === true));
  assert.ok(and4.some(c => !!(c.name as { $regex?: string } | undefined)?.$regex));

  console.log("ok: contacts origen filter");
})();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx tests/unit/test-contacts-origen-filter.ts`
Expected: FAIL — current `buildContactFilter` always sets `filter.status = 'enriched'` and never sets `filter.$or`/`filter.neverAwarded`, so the first `assert.deepEqual(f.$or, [...])` throws (`f.$or` is `undefined`).

- [ ] **Step 3: Rewrite `buildContactFilter`**

In `app/server/utils/contacts.ts`, replace the whole function body from `export async function buildContactFilter` through its closing `return { filter }\n}` with:

```ts
/**
 * The one Mongo filter for the contact directory. Async because the DEI
 * cross-reference (dei / tamano / departamento) resolves RUTs from
 * `dei_companies` first, exactly like /api/suppliers.
 */
export async function buildContactFilter(query: ContactQuery): Promise<FilterResult> {
  const filter: Record<string, unknown> = {}

  // AND-composed conditions: the origin dimension + search/categoria (both
  // constrain `name`). Collected into one array so none of them can clobber
  // another via a shared top-level key.
  const andConditions: Record<string, unknown>[] = []

  // Origin dimension — which population of the directory to include:
  //  - todas (default): contactable (valid email) OR registered-never-awarded
  //  - con-email: contactable only (the pre-existing default behaviour)
  //  - sin-adjudicaciones: registered-never-awarded only
  // `verified=0` widens "contactable" to any non-suppressed/invalid email,
  // exactly as before — it composes with any of the three origen values.
  const hasUsableEmail = String(query.verified ?? '1') === '0'
    ? { emails: { $elemMatch: { status: { $nin: ['suppressed', 'invalid'] } } } }
    : { emails: { $elemMatch: { mxValid: true, status: 'valid' } } }
  const origen = String(query.origen ?? 'todas')
  if (origen === 'con-email') andConditions.push(hasUsableEmail)
  else if (origen === 'sin-adjudicaciones') andConditions.push({ neverAwarded: true })
  else andConditions.push({ $or: [hasUsableEmail, { neverAwarded: true }] })

  // `search` and `categoria` both constrain `name`; each becomes its own $and
  // entry so one can't clobber the other (mirrors /api/suppliers).
  // User input → escaped literal + length cap before it reaches the regex engine
  // (ReDoS guard; the repo-wide rule, see app/server/context.md).
  const search = sanitizeSearch(query.search)
  if (search) andConditions.push({ name: { $regex: escapeRegex(search), $options: 'i' } })

  // Company TYPE (AI-classified enrichment category) → resolve matching names,
  // gated the same way the chip is (confidence >= 0.5). No names → no rows.
  const categoria = query.categoria ? String(query.categoria) : ''
  if (categoria && CATEGORIES.has(categoria)) {
    const names = await fetchNamesByCategory(categoria)
    if (!names.length) return { empty: true }
    andConditions.push({ name: { $in: names } })
  }

  if (andConditions.length === 1) Object.assign(filter, andConditions[0])
  else filter.$and = andConditions

  if (query.rubro) filter['rubros.classificationId'] = String(query.rubro)

  // "has phone" means a DISPLAYABLE phone: googleMaps-sourced phones are stripped
  // on read (ToS), so counting them here would inflate the total with blank cells.
  if (String(query.hasPhone ?? '') === '1') {
    filter.phone = { $nin: [null, ''] }
    filter.phoneSource = { $ne: 'googleMaps' }
  }
  if (String(query.hasWebsite ?? '') === '1') {
    filter.website = { $nin: [null, ''] }
    filter.websiteSource = { $ne: 'googleMaps' }
  }

  const tamano = query.tamano ? String(query.tamano) : ''
  const departamento = query.departamento ? String(query.departamento) : ''
  const deiOnly = query.dei === '1' || query.dei === 'true'
  const deiFilterActive = deiOnly || !!tamano || !!departamento
  if (deiFilterActive) {
    const deiQuery: Record<string, unknown> = {}
    const rx = tamano ? TAMANO_RX[tamano] : undefined
    if (rx) deiQuery.tamano = { $regex: rx }
    if (departamento) deiQuery.departamento = { $regex: `^${departamento}$`, $options: 'i' }

    const deiRows = await DeiCompanyModel.find(deiQuery, { rut: 1, _id: 0 }).lean()
    const ruts = deiRows.map(r => (r as { rut: string }).rut)
    if (!ruts.length) return { empty: true }
    filter.supplierId = { $in: candidateIds(ruts) }
  }

  return { filter }
}
```

(This drops the old hardcoded `filter.status = 'enriched'` seed and the old separate `nameConditions` array, replacing both with the unified `andConditions` array described above. Everything from `if (query.rubro) ...` onward is unchanged from the current file — reproduced here only so the diff is unambiguous.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx tests/unit/test-contacts-origen-filter.ts`
Expected: PASS — `ok: contacts origen filter`, exit code 0.

- [ ] **Step 5: Run the existing export test to confirm no regression**

Run: `npx tsx tests/unit/test-contacts-export.ts`
Expected: PASS (this task doesn't touch `sanitizeContact`/`toCsv`, which that file covers — Task 6 does).

- [ ] **Step 6: Commit**

```bash
git add app/server/utils/contacts.ts tests/unit/test-contacts-origen-filter.ts
git commit -m "feat(contacts): add origen filter dimension (todas/con-email/sin-adjudicaciones)"
```

---

### Task 6: Serializer — `neverAwarded`/`rupeEstado` passthrough + "Adjudicó" export column

**Files:**
- Modify: `app/server/utils/contacts.ts` (`PublicContact`, `sanitizeContact`, `TABLE_COLUMNS`, `cellValue`)
- Test: `tests/unit/test-contacts-export.ts` (extend existing file)

**Interfaces:**
- Consumes: `ISupplierContact.neverAwarded`/`rupeEstado` (Task 1).
- Produces: `PublicContact.neverAwarded: boolean`, `PublicContact.rupeEstado: string | null` — Task 9's UI (`ContactRow` interface + template) relies on both field names.

- [ ] **Step 1: Write the failing test**

In `tests/unit/test-contacts-export.ts`, after the existing block:

```ts
assert.equal(webDoc.address, "Av. Siempreviva 742");
assert.equal(webDoc.email, "info@acme.uy");
```

add:

```ts
assert.equal(webDoc.neverAwarded, false, "default false when the doc doesn't set it");
assert.equal(webDoc.rupeEstado, null);
```

Then, right before the final `console.log("ok: contacts export");` line, add:

```ts
// --- RUPE-only "never awarded" row: address-only, chip data present, not ToS-stripped ---
const registryDoc = sanitizeContact({
  supplierId: "R300", rut: "300", name: "GAMMA SA",
  emails: [], website: null, websiteSource: null, phone: null, phoneSource: null,
  address: "Ruta 5 km 30", locality: "Canelones, Canelones", placeSource: "rupe",
  neverAwarded: true, rupeEstado: "ACTIVO",
} as never);
assert.equal(registryDoc.neverAwarded, true);
assert.equal(registryDoc.rupeEstado, "ACTIVO");
assert.equal(registryDoc.address, "Ruta 5 km 30", "rupe placeSource is not ToS-stripped");
assert.equal(registryDoc.email, null);

// --- CSV: "Adjudicó" column reflects neverAwarded (Sí = won an award, No = registry-only) ---
const csv2 = toCsv([webDoc, registryDoc]);
const [header2, row1, row2] = csv2.split("\r\n");
assert.ok(header2.includes("Adjudicó"), "CSV must carry the Adjudicó column");
assert.ok(row1.includes(",Sí,"), "an awarded row shows Adjudicó=Sí");
assert.ok(row2.includes(",No,"), "a never-awarded row shows Adjudicó=No");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx tests/unit/test-contacts-export.ts`
Expected: FAIL — `webDoc.neverAwarded` is `undefined` (assert.equal against `false` fails on strict... actually `assert.equal` is loose so `undefined == false` is false too, still fails), and later `header2.includes("Adjudicó")` is `false`.

- [ ] **Step 3: Add the fields to `PublicContact` and `sanitizeContact`**

In `app/server/utils/contacts.ts`, in the `PublicContact` interface, change:

```ts
  /** Enrichment methods that produced this record (badges only — not exported). */
  methods: ContactMethod[]
  priorityScore: number
  dei?: { estado: string | null } | null
}
```

to:

```ts
  /** Enrichment methods that produced this record (badges only — not exported). */
  methods: ContactMethod[]
  priorityScore: number
  /** True when this row is a RUPE registry seed that never won an award (address-only, no email/phone/website). */
  neverAwarded: boolean
  /** RUPE registry state (ACTIVO/EN INGRESO/…) when `neverAwarded`; null otherwise. */
  rupeEstado: string | null
  dei?: { estado: string | null } | null
}
```

In `sanitizeContact`'s returned object, change:

```ts
    rubro: rubros[0]?.label || null,
    rubros,
    methods: contactMethods(doc),
    priorityScore: doc.priorityScore ?? 0,
    ...(doc.dei !== undefined ? { dei: doc.dei ? { estado: doc.dei.estado ?? null } : null } : {}),
  }
}
```

to:

```ts
    rubro: rubros[0]?.label || null,
    rubros,
    methods: contactMethods(doc),
    priorityScore: doc.priorityScore ?? 0,
    neverAwarded: !!doc.neverAwarded,
    rupeEstado: doc.rupeEstado ?? null,
    ...(doc.dei !== undefined ? { dei: doc.dei ? { estado: doc.dei.estado ?? null } : null } : {}),
  }
}
```

- [ ] **Step 4: Add the "Adjudicó" export column**

Change the `TABLE_COLUMNS` type + array:

```ts
const TABLE_COLUMNS: { key: keyof PublicContact | 'emailsJoined', header: string, width: number }[] = [
  { key: 'name', header: 'Nombre', width: 42 },
  { key: 'rut', header: 'RUT', width: 14 },
  { key: 'email', header: 'Email', width: 30 },
```

to:

```ts
const TABLE_COLUMNS: { key: keyof PublicContact | 'emailsJoined' | 'awarded', header: string, width: number }[] = [
  { key: 'name', header: 'Nombre', width: 42 },
  { key: 'rut', header: 'RUT', width: 14 },
  { key: 'awarded', header: 'Adjudicó', width: 10 },
  { key: 'email', header: 'Email', width: 30 },
```

and `cellValue`:

```ts
function cellValue(c: PublicContact, key: string): string {
  if (key === 'emailsJoined') return c.emails.map(e => e.email).join('; ')
  const v = (c as Record<string, unknown>)[key]
  return v == null ? '' : String(v)
}
```

to:

```ts
function cellValue(c: PublicContact, key: string): string {
  if (key === 'emailsJoined') return c.emails.map(e => e.email).join('; ')
  if (key === 'awarded') return c.neverAwarded ? 'No' : 'Sí'
  const v = (c as Record<string, unknown>)[key]
  return v == null ? '' : String(v)
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx tsx tests/unit/test-contacts-export.ts`
Expected: PASS — `ok: contacts export`, exit code 0.

- [ ] **Step 6: Commit**

```bash
git add app/server/utils/contacts.ts tests/unit/test-contacts-export.ts
git commit -m "feat(contacts): surface neverAwarded/rupeEstado + Adjudicó export column"
```

---

### Task 7: i18n copy

**Files:**
- Modify: `app/i18n/locales/es.json:783-795` (the `contacts.filter` block)
- Modify: `app/i18n/locales/en.json:783-795` (same block)
- Modify: `app/i18n/locales/es.json` and `en.json` — add `contacts.chip` and `contacts.noPublicEmail`

**Interfaces:**
- Produces: the i18n keys Task 8 (`NeverAwardedChip.vue`) and Task 9 (`contactos.vue`) call via `t(...)`.

- [ ] **Step 1: Add the origin-filter + chip + empty-email keys (es.json)**

In `app/i18n/locales/es.json`, change:

```json
    "filter": {
      "rubro": "Rubro",
      "rubroAny": "Todos los rubros",
      "dept": "Departamento",
      "deptAny": "Todo el país",
      "size": "Tamaño",
      "sizeAny": "Cualquier tamaño",
      "deiOnly": "Solo registradas (DEI)",
      "verifiedOnly": "Solo emails verificados",
      "hasPhone": "Con teléfono",
      "hasWebsite": "Con sitio web",
      "clear": "Limpiar filtros"
    },
```

to:

```json
    "filter": {
      "origin": "Población",
      "originTodas": "Todas",
      "originConEmail": "Con email",
      "originSinAdjudicaciones": "Sin adjudicaciones",
      "rubro": "Rubro",
      "rubroAny": "Todos los rubros",
      "dept": "Departamento",
      "deptAny": "Todo el país",
      "size": "Tamaño",
      "sizeAny": "Cualquier tamaño",
      "deiOnly": "Solo registradas (DEI)",
      "verifiedOnly": "Solo emails verificados",
      "hasPhone": "Con teléfono",
      "hasWebsite": "Con sitio web",
      "clear": "Limpiar filtros"
    },
    "chip": {
      "neverAwarded": "Sin adjudicaciones",
      "neverAwardedTitle": "Registrada en RUPE; nunca resultó adjudicataria en el período"
    },
    "noPublicEmail": "Sin email público (registro RUPE)",
```

- [ ] **Step 2: Same keys, English (en.json)**

In `app/i18n/locales/en.json`, change:

```json
    "filter": {
      "rubro": "Category",
      "rubroAny": "All categories",
      "dept": "Department",
      "deptAny": "Whole country",
      "size": "Size",
      "sizeAny": "Any size",
      "deiOnly": "Registered only (DEI)",
      "verifiedOnly": "Verified emails only",
      "hasPhone": "Has phone",
      "hasWebsite": "Has website",
      "clear": "Clear filters"
    },
```

to:

```json
    "filter": {
      "origin": "Population",
      "originTodas": "All",
      "originConEmail": "With email",
      "originSinAdjudicaciones": "Never awarded",
      "rubro": "Category",
      "rubroAny": "All categories",
      "dept": "Department",
      "deptAny": "Whole country",
      "size": "Size",
      "sizeAny": "Any size",
      "deiOnly": "Registered only (DEI)",
      "verifiedOnly": "Verified emails only",
      "hasPhone": "Has phone",
      "hasWebsite": "Has website",
      "clear": "Clear filters"
    },
    "chip": {
      "neverAwarded": "Never awarded",
      "neverAwardedTitle": "Registered in RUPE; never won an award in this period"
    },
    "noPublicEmail": "No public email (RUPE registry)",
```

- [ ] **Step 3: Verify both files are valid JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('app/i18n/locales/es.json','utf8')); JSON.parse(require('fs').readFileSync('app/i18n/locales/en.json','utf8')); console.log('ok: locale JSON valid')"`
Expected: `ok: locale JSON valid`, exit code 0. (A dangling/missing comma is the most common way this breaks — the parser will point at the exact byte offset if so.)

- [ ] **Step 4: Commit**

```bash
git add app/i18n/locales/es.json app/i18n/locales/en.json
git commit -m "feat(contacts): i18n copy for origin filter + never-awarded chip"
```

---

### Task 8: `NeverAwardedChip.vue` component

**Files:**
- Create: `app/components/NeverAwardedChip.vue`

**Interfaces:**
- Consumes: `contacts.chip.neverAwarded` / `contacts.chip.neverAwardedTitle` i18n keys (Task 7).
- Produces: `<NeverAwardedChip />` — Task 9 drops it into the name cell, auto-imported by Nuxt from `app/components/` (same convention as the existing `DeiChip.vue`, used with no import statement).

No dedicated unit test — this mirrors `DeiChip.vue`, which also has none; `.vue` correctness is checked by the compile step in Task 10.

- [ ] **Step 1: Create the component**

Create `app/components/NeverAwardedChip.vue`:

```vue
<script setup lang="ts">
/**
 * "Registered in RUPE, never won an award" badge — the chip that distinguishes
 * an address-only registry row (no email/phone/website, name+address from RUPE
 * only) from a contactable supplier in the same directory. The parent guards
 * rendering with `v-if` on the row's `neverAwarded`.
 *
 * Built on v-chip (not a hand-rolled span), same reasoning as DeiChip: it
 * inherits Vuetify's inline-flex sizing/vertical-centring wherever it's dropped.
 */
const { t } = useI18n()
</script>

<template>
  <v-chip
    size="x-small"
    rounded="pill"
    prepend-icon="mdi-file-question-outline"
    class="neverawardedchip"
    :title="t('contacts.chip.neverAwardedTitle')"
  >
    {{ t('contacts.chip.neverAwarded') }}
  </v-chip>
</template>

<style scoped>
.neverawardedchip {
  font-weight: 600;
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add app/components/NeverAwardedChip.vue
git commit -m "feat(contacts): NeverAwardedChip component"
```

---

### Task 9: Wire the UI — `/proveedores/contactos`

**Files:**
- Modify: `app/pages/proveedores/contactos.vue`

**Interfaces:**
- Consumes: `PublicContact.neverAwarded`/`rupeEstado` (Task 6, via `/api/contacts`), `NeverAwardedChip` (Task 8), i18n keys (Task 7).

- [ ] **Step 1: Extend the `ContactRow` interface**

Change:

```ts
interface ContactRow {
  supplierId: string
  rut: string
  name: string
  email: string | null
  emails: EmailEntry[]
  website: string | null
  websiteSource: string | null
  phone: string | null
  phoneSource: string | null
  locality: string | null
  address: string | null
  rubro: string | null
  methods: string[]
  dei?: { estado?: string | null } | null
}
```

to:

```ts
interface ContactRow {
  supplierId: string
  rut: string
  name: string
  email: string | null
  emails: EmailEntry[]
  website: string | null
  websiteSource: string | null
  phone: string | null
  phoneSource: string | null
  locality: string | null
  address: string | null
  rubro: string | null
  methods: string[]
  neverAwarded: boolean
  rupeEstado: string | null
  dei?: { estado?: string | null } | null
}
```

- [ ] **Step 2: Add the `origen` filter state**

Change:

```ts
const deiOnly = ref(route.query.dei === '1')
// Verified-only is the default; the URL only records the widening (verified=0).
const verifiedOnly = ref(route.query.verified !== '0')
```

to:

```ts
const deiOnly = ref(route.query.dei === '1')
// Which population to include: todas (default) | con-email | sin-adjudicaciones.
const origen = ref((route.query.origen as string) ?? 'todas')
// Verified-only is the default; the URL only records the widening (verified=0).
const verifiedOnly = ref(route.query.verified !== '0')
```

- [ ] **Step 3: Include `origen` in `hasFilters` and `clearFilters`**

Change:

```ts
const hasFilters = computed(() =>
  !!rubro.value || !!departamento.value || !!tamano.value || !!categoria.value || deiOnly.value
  || !verifiedOnly.value || hasPhone.value || hasWebsite.value)

function clearFilters() {
  track('filter_clear', { surface: 'contacts' })
  rubro.value = ''
  departamento.value = ''
  tamano.value = ''
  categoria.value = ''
  deiOnly.value = false
  verifiedOnly.value = true
  hasPhone.value = false
  hasWebsite.value = false
  page.value = 1
}
```

to:

```ts
const hasFilters = computed(() =>
  !!rubro.value || !!departamento.value || !!tamano.value || !!categoria.value || deiOnly.value
  || !verifiedOnly.value || hasPhone.value || hasWebsite.value || origen.value !== 'todas')

function clearFilters() {
  track('filter_clear', { surface: 'contacts' })
  rubro.value = ''
  departamento.value = ''
  tamano.value = ''
  categoria.value = ''
  deiOnly.value = false
  origen.value = 'todas'
  verifiedOnly.value = true
  hasPhone.value = false
  hasWebsite.value = false
  page.value = 1
}
```

- [ ] **Step 4: Include `origen` in `filterQuery`**

Change:

```ts
const filterQuery = computed(() => ({
  ...(searchTerm.value ? { search: searchTerm.value } : {}),
  ...(rubro.value ? { rubro: rubro.value } : {}),
  ...(deiOnly.value ? { dei: '1' } : {}),
  ...(tamano.value ? { tamano: tamano.value } : {}),
  ...(categoria.value ? { categoria: categoria.value } : {}),
  ...(departamento.value ? { departamento: departamento.value } : {}),
  ...(verifiedOnly.value ? {} : { verified: '0' }),
  ...(hasPhone.value ? { hasPhone: '1' } : {}),
  ...(hasWebsite.value ? { hasWebsite: '1' } : {}),
  ...(SORTS[sort.value] ?? SORTS.priorityDesc),
}))
```

to:

```ts
const filterQuery = computed(() => ({
  ...(searchTerm.value ? { search: searchTerm.value } : {}),
  ...(rubro.value ? { rubro: rubro.value } : {}),
  ...(deiOnly.value ? { dei: '1' } : {}),
  ...(tamano.value ? { tamano: tamano.value } : {}),
  ...(categoria.value ? { categoria: categoria.value } : {}),
  ...(departamento.value ? { departamento: departamento.value } : {}),
  ...(origen.value !== 'todas' ? { origen: origen.value } : {}),
  ...(verifiedOnly.value ? {} : { verified: '0' }),
  ...(hasPhone.value ? { hasPhone: '1' } : {}),
  ...(hasWebsite.value ? { hasWebsite: '1' } : {}),
  ...(SORTS[sort.value] ?? SORTS.priorityDesc),
}))
```

- [ ] **Step 5: Add `origen` to both `watch` dependency lists**

Change:

```ts
watch([searchTerm, rubro, departamento, tamano, categoria, deiOnly, verifiedOnly, hasPhone, hasWebsite, sort], () => {
  page.value = 1
})

watch([searchTerm, page, rubro, departamento, tamano, categoria, deiOnly, verifiedOnly, hasPhone, hasWebsite, sort], () => {
  const q: Record<string, string> = {}
  if (searchTerm.value) q.search = searchTerm.value
  if (page.value > 1) q.page = String(page.value)
  if (rubro.value) q.rubro = rubro.value
  if (departamento.value) q.departamento = departamento.value
  if (tamano.value) q.tamano = tamano.value
  if (categoria.value) q.categoria = categoria.value
  if (deiOnly.value) q.dei = '1'
  if (!verifiedOnly.value) q.verified = '0'
  if (hasPhone.value) q.hasPhone = '1'
  if (hasWebsite.value) q.hasWebsite = '1'
  if (sort.value !== 'priorityDesc') q.sort = sort.value
  router.replace({ query: q })
})
```

to:

```ts
watch([searchTerm, rubro, departamento, tamano, categoria, deiOnly, origen, verifiedOnly, hasPhone, hasWebsite, sort], () => {
  page.value = 1
})

watch([searchTerm, page, rubro, departamento, tamano, categoria, deiOnly, origen, verifiedOnly, hasPhone, hasWebsite, sort], () => {
  const q: Record<string, string> = {}
  if (searchTerm.value) q.search = searchTerm.value
  if (page.value > 1) q.page = String(page.value)
  if (rubro.value) q.rubro = rubro.value
  if (departamento.value) q.departamento = departamento.value
  if (tamano.value) q.tamano = tamano.value
  if (categoria.value) q.categoria = categoria.value
  if (deiOnly.value) q.dei = '1'
  if (origen.value !== 'todas') q.origen = origen.value
  if (!verifiedOnly.value) q.verified = '0'
  if (hasPhone.value) q.hasPhone = '1'
  if (hasWebsite.value) q.hasWebsite = '1'
  if (sort.value !== 'priorityDesc') q.sort = sort.value
  router.replace({ query: q })
})
```

- [ ] **Step 6: Add the origin `<select>` to the template, first in the filters bar**

Change:

```html
    <!-- ===== Segment filters ===== -->
    <div class="filters">
      <label class="filters__sel">
        <span class="u-sr-only">{{ t('contacts.filter.rubro') }}</span>
```

to:

```html
    <!-- ===== Segment filters ===== -->
    <div class="filters">
      <label class="filters__sel">
        <span class="u-sr-only">{{ t('contacts.filter.origin') }}</span>
        <select
          v-model="origen"
          class="sel"
        >
          <option value="todas">
            {{ t('contacts.filter.originTodas') }}
          </option>
          <option value="con-email">
            {{ t('contacts.filter.originConEmail') }}
          </option>
          <option value="sin-adjudicaciones">
            {{ t('contacts.filter.originSinAdjudicaciones') }}
          </option>
        </select>
      </label>

      <label class="filters__sel">
        <span class="u-sr-only">{{ t('contacts.filter.rubro') }}</span>
```

- [ ] **Step 7: Render the chip in the name cell**

Change:

```html
        <template #cell:name="{ row }">
          <div class="namecell">
            <NuxtLink
              :to="supplierPath(row.supplierId)"
              class="namecell__link"
            >
              {{ row.name }}
            </NuxtLink>
            <DeiChip
              v-if="row.dei"
              :estado="row.dei.estado"
            />
          </div>
        </template>
```

to:

```html
        <template #cell:name="{ row }">
          <div class="namecell">
            <NuxtLink
              :to="supplierPath(row.supplierId)"
              class="namecell__link"
            >
              {{ row.name }}
            </NuxtLink>
            <DeiChip
              v-if="row.dei"
              :estado="row.dei.estado"
            />
            <NeverAwardedChip v-if="row.neverAwarded" />
          </div>
        </template>
```

- [ ] **Step 8: Distinct empty-email state for a registry-only row**

Change:

```html
        <template #cell:email="{ row }">
          <div
            v-if="row.emails.length"
            style="display:flex;flex-direction:column;gap:2px"
          >
            <a
              v-for="e in row.emails"
              :key="e.email"
              :href="`mailto:${e.email}`"
              class="link"
            >{{ e.email }}</a>
          </div>
          <span v-else>—</span>
        </template>
```

to:

```html
        <template #cell:email="{ row }">
          <div
            v-if="row.emails.length"
            style="display:flex;flex-direction:column;gap:2px"
          >
            <a
              v-for="e in row.emails"
              :key="e.email"
              :href="`mailto:${e.email}`"
              class="link"
            >{{ e.email }}</a>
          </div>
          <span
            v-else-if="row.neverAwarded"
            style="opacity:0.7"
          >{{ t('contacts.noPublicEmail') }}</span>
          <span v-else>—</span>
        </template>
```

- [ ] **Step 9: Compile-check the changed `.vue` files**

Run:

```bash
npx tsx -e "
const { compileTemplate } = require('@vue/compiler-sfc');
const fs = require('fs');
for (const f of ['app/pages/proveedores/contactos.vue', 'app/components/NeverAwardedChip.vue']) {
  const src = fs.readFileSync(f, 'utf8');
  const templateMatch = src.match(/<template>([\s\S]*)<\/template>/);
  const { errors } = compileTemplate({ id: f, filename: f, source: templateMatch[1], compilerOptions: {} });
  if (errors.length) { console.error(f, errors); process.exitCode = 1; }
  else console.log('ok:', f);
}
"
```

Expected: `ok: app/pages/proveedores/contactos.vue` and `ok: app/components/NeverAwardedChip.vue`, no errors, exit code 0.

- [ ] **Step 10: Commit**

```bash
git add app/pages/proveedores/contactos.vue
git commit -m "feat(contacts): origin filter + never-awarded chip in the UI"
```

---

### Task 10: Local verification (no DB required)

**Files:** none (verification only)

- [ ] **Step 1: Root typecheck**

Run: `npx tsc --noEmit`
Expected: no errors touching `shared/models/supplier_contacts.ts`, `src/jobs/seed-rupe-only/build-row.ts`, or `src/jobs/seed-rupe-only-contacts.ts`. (Pre-existing unrelated errors elsewhere in the repo, if any, are not this task's concern — only confirm nothing NEW appears in the files this plan touched.)

- [ ] **Step 2: Lint the non-Nuxt half**

Run: `npx eslint src shared scripts tests`
Expected: no new errors in the files this plan touched.

- [ ] **Step 3: Run the full pure unit suite**

Run: `npm test`
Expected: `OK: N/N passed` — includes `test-supplier-contacts-model.ts`, `test-seed-rupe-only-build-row.ts`, `test-contacts-origen-filter.ts`, `test-contacts-export.ts`, plus every pre-existing pure test, all passing.

- [ ] **Step 4: If any step fails**

Fix inline and re-run only the failing command — do not proceed to Task 11 with a red local check.

---

### Task 11: Live verification (on 167, or wherever `MONGODB_URI` is reachable)

**Files:** none (verification + first real run)

The dev box's IP is not currently in the 27017 allowlist, so every step here runs on 167 (or after the allowlist is fixed). This task is where the sizing estimates in the spec (≈77,672 RUPE-only rows) get confirmed against reality.

- [ ] **Step 1: Build the new index**

Run: `npx tsx scripts/ensure-indexes.ts --dry-run`, confirm the `neverAwarded_1_priorityScore_-1` line shows `➕ would create`, then run without `--dry-run`:
Run: `npx tsx scripts/ensure-indexes.ts`
Expected: `✅ created {"neverAwarded":1,"priorityScore":-1} in <N>ms`.

- [ ] **Step 2: Dry-run the seed job at small scale**

Run: `npx tsx src/jobs/seed-rupe-only-contacts.ts --dry-run --limit=20`
Expected: awarded-RUT count printed (should be in the neighborhood of 39,020 per the spec's sizing table — if wildly different, stop and investigate before proceeding, the anti-join logic assumes this set is materially complete), then 10 `would seed:` lines, `20 seeded`.

- [ ] **Step 3: Full dry run for the real scan/seed counts**

Run: `npx tsx src/jobs/seed-rupe-only-contacts.ts --dry-run`
Expected: `✅ scan complete: <rupeTotal> RUPE rows scanned, <seeded> seeded, <skippedAwarded> already-awarded (skipped), 0 error(s)`. Compare `<seeded>` against the spec's ≈77,672 estimate — record the real number (update the spec's sizing table with it if it's meaningfully different, since that table is explicitly marked "RE-CONFIRM on 167 at implementation").

- [ ] **Step 4: Commit-run**

Run: `npx tsx src/jobs/seed-rupe-only-contacts.ts`
Expected: same counts as Step 3 minus the dry-run label, plus the reconcile line (`🔄 reconciling...` / `N row(s) flipped back to awarded` — should be `0` on a first run since nothing was seeded as `neverAwarded` before) and the final `📊 supplier_contacts rows currently marked neverAwarded: <seeded>`.

- [ ] **Step 5: Spot-check via the live API**

Run: `curl -s 'http://localhost:3600/api/contacts?origen=sin-adjudicaciones&limit=3' | head -c 2000` (adjust host/port to wherever the dashboard is running on 167)
Expected: `success: true`, 3 contacts each with `neverAwarded: true`, `email: null`, an `address`, and no `emails` entries.

Run: `curl -s 'http://localhost:3600/api/contacts?limit=1' | head -c 500` (default `todas`)
Expected: a non-empty result; the `pagination.total` should now be noticeably larger than the pre-feature ~2,200 (contactable) baseline.

- [ ] **Step 6: Visual check**

Load `/proveedores/contactos` in a browser (or via the `run` skill if available), confirm: the origin `<select>` appears first in the filter bar, switching it to "Sin adjudicaciones" shows rows with the "Sin adjudicaciones" chip and "Sin email público (registro RUPE)" in the email column, and switching to "Con email" hides them again.

- [ ] **Step 7: If everything checks out, this plan is complete.**

No further commit needed for this task (verification only). Report the real seeded-row count back so the spec's sizing table can be corrected if needed, and confirm with the user whether to proceed to deploy (push to master → CI) per repo convention — deploy is a separate, explicit action, not implied by plan completion.
