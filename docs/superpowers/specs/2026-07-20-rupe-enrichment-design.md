# RUPE registry enrichment — design

**Date:** 2026-07-20
**Branch:** `feat/llamado-contact-info`
**Status:** design, approved (user said "go" after design walkthrough)

## Problem

`supplier_patterns` holds 42,530 state suppliers. Structured contact/location data exists
for only a fraction: DEI covers 2,458, and `supplier_contacts` today has a `place` block for
~2,904. The other ~90% have no address, no coordinates, no verified legal name/status.

ARCE now publishes the **Registro Único de Proveedores del Estado (RUPE)** as Uruguay open
data (`catalogodatos.gub.uy/dataset/arce-registro-unico-de-proveedores-del-estado-rupe-2026`),
updated **monthly**. Previously login-gated (a verified dead end in the 2026-07-19 Places
spec) — now free. Each row carries: `pais_prov`, `identificacion_prov` (RUT),
`denominacion_social_prov`, `domicilio_fiscal`, `localidad_prov`, `departamento_prov`,
`estado_prov`.

**Measured, against the live DB (2026-07-20):** `digits(supplierId)` RUT-matches a RUPE
record for **39,020 / 42,530 suppliers = 91.7%**. RUPE is the single biggest structured-data
win available — it takes place-coverage from ~2,904 → ~39,020 (13×), all official, freely
displayable open data (unlike ToS-restricted Google Places fields).

RUPE gives a verified street address but **no coordinates**. The user's Google Maps proxy
exposes a `/geocode?address=…` endpoint (verified live: returns `geometry.location.{lat,lng}`,
`location_type` confidence, `place_id`, normalized `address_components`). So the plan is:
load RUPE → geocode the addresses → merge into the existing enrichment.

## Chosen shape (from the design Q&A)

- **Priority:** coverage expansion (fill the ~40k gap), not correcting existing rows.
- **Join:** RUT-first (`digits(supplierId) == digits(identificacion_prov)`), then a
  normalized-name fallback for the ~8% RUT misses.
- **Geocoding scope:** the full registry (~117k unique RUTs), not only matched suppliers —
  so future matches and any discoverability surface are already geocoded.
- **Cadence:** recurring monthly (RUPE releases monthly).
- **Storage:** direct merge into `supplier_contacts` for matched suppliers, backed by a new
  `rupe_registry` collection that holds the full registry + geocode cache. `supplier_contacts`
  is keyed by the 42.5k `supplierId`s and structurally cannot hold the ~77k unmatched RUPE
  records, so the registry is where "full RUPE" lives; the resolver merges the matched subset.

This mirrors the existing **DEI pattern exactly**: `dei_companies` registry (`load-dei`) +
`dei` resolver returning a `place` block. RUPE = `rupe_registry` (`load-rupe` + `geocode-rupe`)
+ `rupe` resolver.

## Architecture

```
catalogodatos RUPE CSVs (6 monthly, UTF-8, ';'-delimited)
        │  load-rupe.ts   (download or --dir local; dedup latest-month per RUT; upsert)
        ▼
   rupe_registry  (unique rut; name, address, locality, department, estado, pais)
        │  geocode-rupe.ts  (proxy /geocode; UY-bbox bound; resumable; caches lat/lng/placeId)
        ▼
   rupe_registry  (+ lat, lng, placeId, geocodeConfidence, geocodeStatus, geocodedAt)
        │  createRupeResolver(db)  — RUT-first, name-fallback → place{ source:"rupe" }
        ▼
   enrich-supplier-contacts.ts pipeline:  dei → RUPE → webSearch → website → impo → googleMaps
        ▼
   supplier_contacts.place block  (placeSource:"rupe", freely displayable open data)
```

### New / changed modules

- **`shared/models/rupe_registry.ts`** — new model, guarded registration, `{ collection:
  'rupe_registry' }`. Fields (interface **and** Schema): `rut` (unique), `pais`,
  `denominacionSocial`, `normalizedName` (for the fallback join), `domicilioFiscal`,
  `localidad`, `departamento`, `estado`, `sourceMonth` (which snapshot this record came from);
  geocode block `lat`, `lng`, `placeId`, `geocodeConfidence`, `geocodeStatus`
  (`pending|ok|zero_results|error|out_of_country`), `geocodedAddress`, `geocodedAt`;
  `loadedAt`.
- **`src/jobs/load-rupe.ts`** — mirror of `load-dei.ts`. Reuses the same RFC4180-ish parser
  adapted for `;` delimiter. Downloads the 6 monthly resource URLs (dataset id
  `cbe2defd-d214-4e5b-9b52-424f3688b2cf`), or reads a local `--dir=rupe` of already-downloaded
  files. Dedup by `digits(identificacion_prov)`, keeping the **latest** month's row (freshest
  `estado`/address). `--dry-run`, `--file`, `--dir`, `--url` flags.
- **`src/jobs/geocode-rupe.ts`** — reads registry docs with `geocodeStatus:"pending"` (or a
  changed address), calls the proxy, bounds coords to the Uruguay bbox (reuse load-dei's
  `coord()` idea), rate-limited (sleep between calls), **resumable** (each doc updated as it
  resolves, so a kill/restart just continues), `--limit`, `--dry-run`. Only geocodes
  `pais == URUGUAY` rows with a usable `domicilioFiscal`.
- **`src/jobs/enrich/resolvers/rupe.ts`** — `createRupeResolver(db)`. RUT lookup first; on
  miss, one `normalizedName` lookup (exact normalized equality only — no fuzzy, to stay
  false-positive-free like the RUT join). Returns `place{ address, locality (localidad +
  departamento), lat, lng, placeId, source:"rupe" }`. Emits no emails.
- **`shared/models/supplier_contacts.ts`** — widen `FieldSource` to `"dei" | "googleMaps" |
  "rupe"`. No other schema change (the `place` fields already exist).
- **`src/jobs/enrich-supplier-contacts.ts`** — register `rupe` right after `dei`; add `"rupe"`
  to the default `--sources`. No throttle needed (in-Mongo lookup, like dei).
- **`scripts/ensure-indexes.ts`** — add `rupe_registry.{rut unique, normalizedName,
  geocodeStatus, departamento}`.
- **`src/cronserver.ts`** — monthly `load-rupe` then `geocode-rupe` (1st of month, staggered
  away from existing 03:00/05:00 monthly jobs).

## Merge-safety (explicit user constraint: don't override / conflict with existing data)

1. **`rupe_registry` is a brand-new collection** — cannot collide with anything.
2. **`load-rupe` re-runs must not wipe geocodes.** The upsert `$set`s only the RUPE **source**
   fields (name/address/estado/…); the geocode block is written by `geocode-rupe` and set via
   `$setOnInsert` on first load. If the incoming `domicilioFiscal` differs from the stored
   `geocodedAddress`, reset `geocodeStatus:"pending"` (re-geocode the moved address) — otherwise
   leave `lat/lng/placeId/geocodedAt` untouched.
3. **The `rupe` resolver only contributes a `place` block, and only when DEI didn't.** The
   orchestrator's first-non-null accumulator keeps DEI's official place ahead of RUPE; RUPE
   fills the gap for the ~90% DEI never covered. Emails and website are never touched by RUPE
   (it emits neither), so no email/website data is lost.
4. **Provenance stays honest.** `placeSource:"rupe"` is official open data → freely
   displayable and persistable (same class as `dei`, unlike ToS-restricted `googleMaps`).

## ToS / legal

- RUPE is public open data (CC-style gov catalog) — persistable and displayable.
- Geocode output: we store `placeId` (cacheable indefinitely per Google ToS) + `lat/lng`
  derived from geocoding an **open-data address**. This is the same posture as DEI's stored
  coords. We do **not** pull Places knowledge-panel fields here (no phone/hours scraping);
  geocoding a public address is a narrower, safer use than `findPlaceFromText`.
- Ley 18.331: enrichment output is personal data; the cold-email campaign (Phase B) already
  carries opt-out. RUPE adds no new obligation.

## Testing / validation

- **Unit (node:assert, tsx):** `load-rupe` CSV parse (`;` delimiter, UTF-8, `Sin dato`
  sentinel, RUT digit-normalization, latest-month dedup); `rupe` resolver against a fake `Db`
  (RUT hit, name-fallback hit, miss, place-block shape); `geocode-rupe` bbox bound + status
  transitions against a fake proxy.
- **Live verify (test-less repo convention):** run `load-rupe --dir=rupe --dry-run`, then a
  small `geocode-rupe --limit=20 --dry-run`, then confirm the resolver returns a place for a
  known matched RUT. Full runs happen on the **167 box** (dev has no reliable external DNS;
  the Mongo connection to 167 works from dev as measured today).

## Out of scope (YAGNI)

- No public "RUPE directory" page in this pass — the win is filling `supplier_contacts` for
  the existing supplier surfaces. A standalone browsable RUPE registry can be a later feature.
- No fuzzy name matching — exact normalized-name fallback only (RUT is 91.7% already).
- No RUPE-sourced phone/email (the open dataset carries none).
- No re-geocoding churn: addresses are re-geocoded only when they actually change.
