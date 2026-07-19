# DEI Industrial Registry Cross-Reference — Design

**Date:** 2026-07-19
**Status:** Approved (design), pending implementation plan
**Author:** brainstorming session

## Goal

Cross-reference gastos-gub suppliers with Uruguay's **Directorio de Empresas
Industriales (DEI)** — MIEM's open-data registry of certified industrial
companies — and surface the matched data across the app: enriched supplier
profiles, a verified badge, directory filters + a map, and transparency
signals.

Source dataset: <https://catalogodatos.gub.uy/dataset/miem-dei>
CSV resource (stable URL):
`https://catalogodatos.gub.uy/dataset/575ccb87-ae74-4dcd-ba4b-cf050bd8e08a/resource/e56d1949-3e94-42a9-801f-c6d2523b185d/download/empresasdei_20230330.csv`

## Measured feasibility (live DB, 2026-07-19)

Matching DEI `RUT` against `supplier_patterns.supplierId` (both normalized to
digits only):

| Metric | Value |
|---|---|
| DEI distinct RUTs parsed | 5,249 |
| `supplier_patterns` docs | 42,510 |
| Suppliers matched to DEI | **2,466 (5.8%)** |
| DEI firms that are govt suppliers | **1,898 (36%)** |
| Govt spend to matched suppliers | **$368B / $1,959B (18.8%)** |
| `supplierId` non-numeric (unmatchable) | 8 |

Interpretation: DEI covers a **small share of supplier records but a large
share of spend** — matched suppliers skew large (5.8% of records ≈ 19% of
spend). Match is **exact-RUT, zero false positives**.

## Key facts about the data

- The join key is RUT. Every `supplier_patterns` doc is keyed by a RUT-based
  `supplierId` (`R/210002980010` or re-synced `R213382910014`). Normalize by
  stripping all non-digits → 12-digit RUT. DEI `RUT` is already 12 digits.
- DEI CSV is a periodic snapshot (filename says 2023-03-30 but current rows
  carry 2024–2025 registro/vencimiento dates — the resource is refreshed).
  ~6,008 rows.
- DEI is **industrial companies only** (certified industrial activity). This is
  why non-industrial suppliers (services, commerce, persons, public bodies)
  don't match — expected, not a bug.
- Lat/lng exist but many rows are `S/D` (sin dato) and coords are prefixed with
  a literal `'` (spreadsheet text guard) that must be stripped.
- 31 columns. Fields we keep (exact CSV header → model field):
  - `Estado de la empresa` → `estado` (Aprobado/Vencido)
  - `RUT` → `rut` (normalized, the key)
  - `Denominacion Social` → `denominacionSocial`
  - `Nombre comercial` → `nombreComercial`
  - `Tamaño de la empresa` → `tamano` (Micro/Pequeña/Mediana/Gran Empresa)
  - `Tipos de actividad de la empresa` → `tiposActividad` (split `;`)
  - `Descripcion de la Actividad` → `descripcionActividad`
  - `Codigo CIIU principal` → `ciiuPrincipal`
  - `Descripcion Codigo CIIU principal` → `ciiuPrincipalDesc`
  - `Codigos CIIU secundarios` → `ciiuSecundarios` (split `;`)
  - `Departamento (EP)` → `departamento`
  - `Localidad (EP)` → `localidad`
  - street fields (`Calle`,`Numero`,`Ruta`,`Kilometro`, etc.) → `direccion` (composed)
  - `Longitud (EP)` / `Latitud (EP)` → `lng` / `lat` (strip `'`, null on `S/D`)
  - `Email publico` → `email` (null on `S/D`)
  - `Sitio web` → `sitioWeb` (null on `S/D`)
  - `Numero de telefono` → `telefono` (null on `S/D`)
  - `Fecha de Registro` → `fechaRegistro`
  - `Fecha de vencimiento` → `fechaVencimiento`

## Architecture

Chosen approach: **separate `dei_companies` collection, joined at read time by
normalized RUT** (mirrors the existing `supplier_enrichment` pattern in
`app/server/utils/enrichment.ts`). Rationale: decoupled lifecycles — a
`supplier_patterns` re-sync never wipes DEI, and DEI can refresh independently.
Rejected: denormalizing onto `supplier_patterns` (a re-sync erases it) and a
precomputed merged view (overkill for 2.4k matches).

### 1. Data model — `shared/models/dei_company.ts`

New Mongoose model + `IDeiCompany` interface (in `shared/types/database.ts`).
Collection `dei_companies`. Keyed by `rut` (String, unique index). Fields per
the table above, plus `loadedAt` (Date) and timestamps. Extra indexes:
`departamento`, `tamano`, `ciiuPrincipal` (for directory filters). Register in
the `shared/models/index.ts` barrel following the existing convention.

### 2. Ingestion — `src/jobs/load-dei.ts`

- Downloads the CSV to a temp path (or reads a local `--file=` override).
- Parses with a real CSV parser (handle quoted fields, `;` sub-lists, `'`
  coord guard, `S/D` → null).
- Normalizes RUT to digits; skips rows with no valid RUT.
- `bulkWrite` upserts `dei_companies` by `rut`, sets `loadedAt`.
- Flags: `--file=`, `--dry-run`. Sets `MONGO_SOCKET_TIMEOUT_MS` like other jobs.
- Re-runnable (idempotent upsert). Cron wiring is **deferred** (loader now,
  monthly cron later).

### 3. Join util — `app/server/utils/dei.ts`

`fetchDei(ruts: string[]): Promise<Map<rut, IDeiCompany>>` and
`attachDei(items, getSupplierId)` — batch-fetch by normalized RUT, attach a
`dei` sub-object to each item. Same ergonomics as `enrichment.ts` so list/
profile/map endpoints share one path. No gating (DEI is authoritative
government data, unlike the AI enrichment which is confidence-gated).

### 4. Server API

- `app/server/api/suppliers/[id].get.ts` — attach `dei` to the single profile
  response.
- `app/server/api/suppliers/index.get.ts` — accept filter params
  `dei=1`, `tamano=`, `departamento=`, `ciiu=`; when present, constrain the
  supplier list to matched RUTs (lookup `dei_companies` first, intersect).
  Attach `dei` to each row for the badge.
- `app/server/api/suppliers/dei-map.get.ts` (new) — matched suppliers that have
  lat/lng, returning `{ rut, name, lat, lng, tamano, departamento, totalValue }`
  for the map. Guard out `S/D` coords.
- `app/server/api/analytics/dei-signals.get.ts` (new) — transparency signals:
  micro/pequeña-sized firms ranked among the largest govt suppliers (size vs
  spend mismatch). 30-min in-memory cache like `supplier-types.get.ts`.
  CIIU-vs-actually-sold cross-analysis is **deferred**.

### 5. UI

- **Profile panel** — `app/pages/suppliers/[...id].vue`: conditional "Registro
  Industrial (DEI)" card, rendered only when `supplier.dei` present. Shows
  tamaño, actividad (CIIU principal + desc), ubicación (departamento/localidad +
  a small Leaflet map when lat/lng), contacto (web/email/tel), estado
  vigente/vencido + fechas. Follows DESIGN.md (gold = money; peso magnitude
  rules; no new palette).
- **Badge** — new `app/components/DeiChip.vue` (sibling to `SupplierChip.vue`),
  a "Empresa industrial registrada (DEI)" verified chip shown on the directory
  list and profile head. Renders nothing when no DEI match.
- **Directory filter + map** — `app/pages/suppliers/index.vue`: filter controls
  (solo DEI, tamaño, departamento, CIIU) wired to the index endpoint; a map
  **section** inside the directory page (not a standalone route) driven by
  `dei-map.get.ts`, using the app's existing Leaflet setup.
- **Signals** — a "Empresas industriales proveedoras" section (on estadísticas
  or a DEI sub-view) surfacing the size-vs-spend flag from `dei-signals`.

### 6. i18n

New `sup.dei.*` keys in `app/i18n/locales/es.json` (source of truth) mirrored in
`en.json`: chip label, panel title + field labels, estado values, tamaño
labels, filter labels, signals copy, and a source/disclaimer line ("Datos:
Directorio de Empresas Industriales, MIEM — actualizado <fecha>"). Beware the
vue-i18n `$` trap noted in project memory.

## Normalization / matching rules

- RUT match only, exact, on `digits(supplierId) === digits(rut)`. No name
  fallback (avoids false positives; the 8 non-numeric ids stay unmatched).
- Coords: strip leading `'`, parse float, null when `S/D` or unparseable.
- `S/D` → null for email/web/tel/address fields.
- `;`-delimited fields (tiposActividad, ciiuSecundarios, departamentos) → arrays.

## Edge cases

- Supplier matched but DEI estado = Vencido → still show, labelled "vencido".
- DEI row present but no lat/lng → profile map hidden, still in list/filters.
- Multiple DEI rows per RUT (shouldn't happen — RUT is unique in source; upsert
  by RUT collapses any dup, last-write-wins).
- DEI refresh removing a company → stale docs remain until a full reload; a
  `--prune` pass (delete docs not in the latest CSV) is optional, deferred.

## Verification (this repo has no unit-test runner)

Per project convention (developer-platform memory): a `tsx` assertion script
under `tests/` or `scripts/` that (a) runs the CSV parser over a fixture and
asserts field extraction + coord/`S/D` handling, (b) asserts `digits()`
normalization on both supplierId shapes, (c) after a `--dry-run` load, asserts
match count is in the expected band. Plus targeted `tsc` on touched files and
driving the profile/list pages in the running app (the `verify`/`run` skills).

## Out of scope / deferred

- Monthly refresh cron (loader is runnable now).
- CIIU-vs-actually-sold cross-analysis signal.
- DEI `--prune` of removed companies.
- Name-based fuzzy matching (RUT-only by design).
- Standalone `/suppliers/mapa` route (map is a section in the directory).
