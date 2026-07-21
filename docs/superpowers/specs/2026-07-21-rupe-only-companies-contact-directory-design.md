# RUPE-only companies in the supplier contact directory

**Date:** 2026-07-21
**Status:** Design approved, spec under review
**Area:** `app/server` (contact directory API + UI), `src/jobs` (seeding + enrichment), `shared/models`

## Problem

`/proveedores/contactos` (backed by `supplier_contacts`) only lists companies that
**won at least one award** — the enrichment orchestrator (`src/jobs/enrich-supplier-contacts.ts`,
line ~107) walks `supplier_patterns`, which is the awarded-supplier universe. But RUPE
(Registro Único de Proveedores del Estado) registers far more companies as eligible state
suppliers than actually win. Those registered-but-never-awarded companies are real, verifiable
entities the directory ignores.

Goal: **also list companies that are in RUPE but never won a licitación**, mark them with a
chip, and let users filter by that mark.

## Key constraint (the crux)

RUPE open data (`rupe_registry`) carries **name + fiscal address + department + `estado` +
geocode only — NO email, phone, or website**. The `rupe` resolver comment and the
`gastos-gub-rupe-enrichment` note both confirm RUPE "emits no emails/website". So a
RUPE-only company is **not contactable by email** from open data alone. This is why the
feature is tiered:

- **Tier 1 (ships in v1):** list RUPE-only companies address-only, chipped + filterable.
- **Tier 2 (follow-on):** run the existing web/website/crawl4ai/impo resolvers over a
  prioritized subset to *discover* emails, upgrading those rows to contactable.

## Sizing (live-verified 2026-07-21)

The Task 11 live seed run confirmed these counts against the production database:

| Quantity | Value |
|---|---|
| `rupe_registry` unique RUTs | 116,692 |
| RUPE ⋂ awarded suppliers (`digits(supplierId)===rut`) | 33,325 |
| **RUPE-only (never won)** | **83,367** |
| Currently contactable directory rows | ~2,200 |

The awarded-supplier set contained 36,775 unique RUTs. The initial seed and a full idempotence
rerun both produced 83,367 RUPE-only rows with zero errors and zero reconciliation flips.

## Decisions (from brainstorming)

1. **Tiered** — list all RUPE-only address-only now; enrich a subset for emails later.
2. **Mixed by default** — the default directory view shows contactable suppliers **and**
   RUPE-only rows together (≈79k), with the chip distinguishing them and a filter to narrow.
   Because RUPE-only rows carry `priorityScore = 0` and the default sort is `priorityScore desc`,
   high-value contactable firms surface first and registry rows sink — mixed but not swamped.
3. **Chip + filter are mandatory.**

## Architecture

Reuse the `supplier_contacts` collection so the single filter → `sanitizeContact` → serialize
choke point in `app/server/utils/contacts.ts` still governs every read/export path. RUPE-only
rows are ordinary `supplier_contacts` documents with a new origin flag.

### 1. Data model — `shared/models/supplier_contacts.ts`

Add two fields to **both** the `ISupplierContact` interface and the schema
(`exactOptionalPropertyTypes` → optional props written `?: T | undefined`):

| Field | Type | Meaning |
|---|---|---|
| `neverAwarded` | `boolean` (default `false`) | True for RUPE-seeded rows (registered, no award). The chip + filter dimension. Orthogonal to `status`. |
| `rupeEstado` | `string \| null` (default `null`) | RUPE registry state verbatim (`ACTIVO`, `EN INGRESO`, …); surfaced as sub-info, reserved for a future filter. |

Add a `ContactStatus` value **`"registry"`** = "known company, registry-sourced, no contact
enrichment run yet." Distinct from `no_contact` (= enrichment ran, found nothing).

RUPE-only row shape when seeded:

```
supplierId:  "R/<rut>"        // synthesized; matches candidateIds() shapes
rut:         <rut>
name:        denominacionSocial
address:     domicilioFiscal
locality:    localidad
placeSource: "rupe"           // official open data → passes sanitizeContact (not stripped)
lat/lng/placeId: from rupe_registry geocode block if geocodeStatus === "ok"
rupeEstado:  estado
neverAwarded: true
status:      "registry"
priorityScore: 0
emails: []                    // none from RUPE
```

**Index:** add `{ neverAwarded: 1, priorityScore: -1 }` to the schema (parity) **and** to
`scripts/ensure-indexes.ts` (the only thing that builds indexes; `autoIndex` off).

### 2. Read layer — `app/server/utils/contacts.ts`

**New filter control** replacing the current implicit "must have email" default. A single
`origen` (or `awarded`) query param, three states:

| Param | Meaning | Mongo clause |
|---|---|---|
| unset / `todas` (**default**) | contactable OR registry | `{ $or: [ { emails: { $elemMatch: { mxValid: true, status: 'valid' } } }, { neverAwarded: true } ] }` |
| `con-email` | has a valid, deliverable email (incl. tier-2-enriched RUPE-only) | `{ emails: { $elemMatch: { mxValid: true, status: 'valid' } } }` |
| `sin-adjudicaciones` | registered, never won | `{ neverAwarded: true }` |

Notes / invariants:
- The current default gate is `status: 'enriched'` + valid email. That `status: 'enriched'`
  condition is **dropped from the default**; a registry row has `status: 'registry'`, and a
  contactable row is now identified by having a valid email, not by status. (Re-verify no other
  caller relies on the `status: 'enriched'` default.)
- The existing `verified=0` "widen to any surfaceable email" behaviour is folded into the
  `con-email` vs `todas` distinction; keep `verified` working for backward compat or migrate the
  UI to `origen`. Prefer: introduce `origen`, keep `verified` honored if present, document that
  `origen` wins when both are sent.
- The `$or` composes with the other filters (search, rubro, categoria, DEI joins) by AND — put
  the origin `$or` under the existing `$and` machinery so a second `$or`/name condition can't
  clobber it (mirror the `nameConditions` `$and` pattern already in the file).

**Serializer.** Add `neverAwarded: boolean` and `rupeEstado: string | null` to `PublicContact`;
set them in `sanitizeContact`. Add an **"Adjudicó" (Sí/No)** column to `TABLE_COLUMNS`
(derived from `!neverAwarded`) so CSV/XLSX exports distinguish the two tiers. `contactMethods`
already emits a `rupe` badge from `placeSource='rupe'` — no change needed there.

**Compliance:** RUPE address/name are official open data; `placeSource='rupe'` already passes
`sanitizeContact` unstripped (only `googleMaps` is stripped). No new compliance surface.

### 3. Seeding job (Tier 1) — `src/jobs/seed-rupe-only-contacts.ts`

New job, registered in root `package.json` scripts (e.g. `seed-rupe-contacts`). Steps:

1. Raise `MONGO_SOCKET_TIMEOUT_MS` before `connectToDatabase()` (long scan — repo trap).
2. Load the awarded RUT set: `supplier_patterns.find({}, { supplierId: 1 })` →
   `Set(digits(supplierId))`.
3. Stream `rupe_registry`; for each `rut` **not** in the awarded set, build the registry-row
   shape above and **upsert keyed on `supplierId`** (`R/<rut>`):
   - `$set`: name, address, locality, rupeEstado, placeSource, lat/lng/placeId, neverAwarded=true,
     rut. (Refreshes registry facts on re-run / new monthly snapshot.)
   - `$setOnInsert`: `status: 'registry'`, `priorityScore: 0`, `emails: []`, `enrichedAt: null`.
   - **Guard — never downgrade an enriched row:** the `$set` must NOT touch `status`, `emails`,
     `primaryEmail`, or `enrichedAt`. A RUPE-only row that Tier 2 later enriches keeps its
     `status: 'enriched'` + emails; a re-seed only refreshes registry facts and leaves
     `neverAwarded: true`.
4. **Reconcile the transition to awarded:** after seeding,
   `updateMany({ neverAwarded: true, rut: { $in: [...awardedRuts] } }, { $set: { neverAwarded: false } })`
   — keyed on the stored digits-only `rut` field (the same set built in step 2), so the job needs
   no `candidateIds` reconstruction. A company that started registry-only and later won an award
   loses the chip. (Batch the `$in` if the awarded set is large.)
5. Flags: `--limit`, `--dry-run`, `--only-active` (seed only `estado === 'ACTIVO'` — optional
   scope reducer). Print inserted / updated / skipped / reconciled counts.

**Cron:** monthly, 1st of month, after `load-rupe` + `geocode-rupe` (so geocode is present when
seeding copies lat/lng). Add to the cron server alongside the existing RUPE cron.

### 4. Tier 2 enrichment (follow-on, NOT in v1) — `enrich-supplier-contacts.ts`

Add `--include-registry`: after the normal `supplier_patterns` walk, also iterate
`supplier_contacts` rows with `neverAwarded: true` (order by `rupeEstado === 'ACTIVO'` first),
running the existing resolver chain (web-search → website → crawl4ai → impo; **skip DEI/RUPE
place resolvers** — place already present) + hygiene + DNS canary. A found email flips the row to
`status: 'enriched'`; `neverAwarded` stays true. Own plan, run on 167 (dev box has no DNS/DB).

### 5. UI — `/proveedores/contactos`

- **Segmented filter control** "Todas · Con email · Sin adjudicaciones" bound to `origen`.
  Follows `app/DESIGN.md` (read before the UI change).
- **Chip** on each `neverAwarded` row: label "Sin adjudicaciones", tooltip
  "Registrada en RUPE; nunca resultó adjudicataria en el período". es/en i18n keys.
- **Address-only rendering:** name + address + `rupeEstado` + RUPE badge; the email cell reads
  "Sin email público" / "—" rather than blank.
- Result count reflects the mixed total. Download buttons unchanged (export gains the "Adjudicó"
  column from §2).

## Testing (test-less repo — see CLAUDE.md "Verifying work")

App TS is not in root `tsc`. Verify via:
- `tsx` unit tests under `tests/unit/` importing the pure pieces: the new `origen` branch of
  `buildContactFilter` (assert the three Mongo clauses), `sanitizeContact` carrying
  `neverAwarded`/`rupeEstado`, the "Adjudicó" export column in `toCsv`.
- A seeding-job unit test on a fixture set: anti-join correctness, upsert guard (enriched row not
  downgraded), reconcile flip.
- `@vue/compiler-sfc` compileTemplate on the changed `.vue`; `JSON.parse` the locale files.
- Post-deploy: `curl` the live `/api/contacts?origen=sin-adjudicaciones` on :3600 / prod and
  eyeball counts + chip.
- Root `npx tsc --noEmit` for the model/`shared` change; `npx eslint src shared scripts tests`.

## Rollout

1. Model fields + `ensure-indexes` entry → run `ensure-indexes` on 167.
2. Seeding job → dry-run on 167, confirm counts vs the sizing table, then commit-run.
3. Read layer + serializer + UI → deploy via push-to-master CI (auto-rollback).
4. Tier 2 enrichment → separate plan, later.

## Out of scope for v1

- **Dept filter over RUPE-only rows.** The `departamento` filter resolves RUTs via the DEI join,
  so it does not narrow RUPE-only rows (they carry RUPE `localidad`/`departamento` but are not
  DEI-matched). Extending the dept filter to also read `rupe_registry` is a follow-on.
- Tier 2 email discovery (its own plan).
- Any RUPE `estado` filter UI (field stored now; filter later).

## Files touched (v1)

- `shared/models/supplier_contacts.ts` — `neverAwarded`, `rupeEstado`, `"registry"` status, index parity.
- `scripts/ensure-indexes.ts` — `{ neverAwarded: 1, priorityScore: -1 }`.
- `app/server/utils/contacts.ts` — `origen` filter branch; `PublicContact` + `sanitizeContact`
  fields; "Adjudicó" export column.
- `app/server/api/contacts/index.get.ts`, `export.get.ts` — pass `origen` through (thin).
- `src/jobs/seed-rupe-only-contacts.ts` — new seeding job.
- `package.json` (root) — `seed-rupe-contacts` script; cron server registration.
- `app/pages/proveedores/contactos.vue` (+ i18n locale files) — segmented filter, chip, address-only render.
- `tests/unit/` — filter/serializer/seeding assertions.
