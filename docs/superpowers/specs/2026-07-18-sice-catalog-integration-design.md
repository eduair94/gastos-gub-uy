# SICE Catalog Integration — Design Spec

**Status:** APPROVED (design). Branch `feat/sice-catalog-integration`.
**Date:** 2026-07-18
**Scope:** Ingest Uruguay's official state-procurement article catalog (SICE / CUBS, published by ACCE-ARCE as open data) into a first-class collection, and use it as the single source of truth to (a) power an advanced hierarchical product picker for tender alerts, (b) enrich individual product pages, and (c) tighten the anomaly detector + AI triage. One catalog representation, four consumers.
**Author:** brainstorming session (research workflow → coverage validation → design).

---

## 0. Summary & the enabling facts

gastos-gub ingests Uruguay's OCDS procurement stream and, on branch `feat/auth-monitor-llamados`, added a tender-alert product ("Monitor de Llamados"): users create **watches** (saved searches) matched against newly-opened `open_calls`. Today a watch matches on `classification.id` codes (picked from a **flat** autocomplete over `product_analytics.description`) plus keywords.

Two facts, both **verified live** (2026-07-18), make this integration low-risk and high-value:

1. **The catalog is open data on the same channel as our contract data.** `imp_catalogo.tgz` (ACCE, CKAN dataset `acce-catalogo-acce`) is a ~7.4 MB ANSI-SQL dump, regenerated ~daily (`Last-Modified` was the same day; CKAN `metadata_modified` is frozen at 2020 and must be ignored). It contains the full catalog: **91,574 articles** in a 5-level tree (FAMILIA 9 › SUBFAMILIA 53 › CLASE 349 › SUBCLASE 1,759 › ART_SERV_OBRA), plus units of measure (725), synonyms (4,122), brands, ODG, taxes.
2. **The catalog's article code IS the code we already ingest.** OCDS `tender.items[].classification.id` / `awards.items[].classification.id` **==** `ART_SERV_OBRA.COD` (the article leaf; `scheme = x_catalogo_arce`, no UNSPSC). Verified end-to-end against 3 live codes (446, 3375, 28267). **Coverage measured against the live DB is effectively total:** `product_analytics` 46,401/46,406 codes (100.0%), 3.32M/3.32M award lines (100.0%), UYU 1.093T/1.093T spend (100.0%); `open_calls` 2,142/2,142 distinct codes, 667/667 live calls with ≥1 joinable code. The only non-joinable lines are those with `classification.id` empty/`0` (free obras/servicios, pre-catalogue) — by definition uncodeable, and already excluded from `product_analytics` at build time.

So the join key already lives in our data and is indexed. The work is: import the catalog once, then wire the four consumers to it.

### Decisions locked in brainstorming

| Decision | Choice |
|---|---|
| First deliverable scope | **All four workstreams** (import + alerts picker + product pages + anomaly AI) in one spec, implemented in phases. |
| Alert subscription model | **Rubro tree, any level.** A user selects nodes at any level (familia/subfamilia/clase/subclase/artículo); a node covers itself + all descendants. |
| Matcher | Stays a **pure set intersection.** Achieved by expanding each call article into ancestor rubro tokens at ingest, and storing subscribed nodes as tokens in the same namespace. No DB in the matcher; backward-compatible with existing article-code watches. |
| Anomaly representation | **Same catalog representation as the alerts.** One `sice_catalog` collection feeds both. Anomalies do not get a parallel taxonomy. (per user clarification, 2026-07-18) |
| Catalog refresh | Weekly cron + manual trigger. Freshness gated by the TGZ `ETag`/`Last-Modified`, never CKAN metadata. |
| Import breadth (v1) | Articles + 4 hierarchy tables + units + synonyms. Variants/brands/attributes deferred (MED_VARIANTES 216k + DET_VARIANTES 274k are large and not needed for v1). |

### Non-goals (v1)
- UNSPSC/CPV crosswalk (the catalog carries none; build later only if required).
- Importing variants/brands/attributes/colors (deferred; the article + hierarchy + unit + synonyms cover every v1 consumer).
- The incremental SOAP delta WS (`ActualizacionCatalogoWS`) — re-importing the TGZ weekly is simpler and sufficient.
- Raising the free-tier watch **count** cap or a separate "supplier offer profile" entity — the rubro tree makes "toda mi oferta" ergonomic within existing watches; only the per-watch node cap is raised.
- Billing, new auth surfaces, or touching the legacy Express API in `src/api/`.

### Success criteria
- `sice_catalog` (per-article) and `sice_rubro` (tree nodes) are populated from the live TGZ, idempotently, via a weekly job + manual trigger, with a coverage log.
- A supplier can browse/search the rubro tree in `/app/alertas`, select nodes at any level, and the resulting watch alerts on any open call whose items fall under a selected node — with existing article-code watches still matching unchanged.
- `products/[code]` shows the canonical article name, the rubro breadcrumb, and the official unit of measure.
- The anomaly detector groups baselines by a **canonical unit** (killing the `u`/`un`/`uni`/`unid` fragmentation), falls back to a rubro-level baseline for sparse codes, and the Gemini triage prompt carries the canonical name + official unit + rubro path.
- Nuxt build exit 0, typecheck clean, all unit tests pass, catalog imported to the live DB, cron + dashboard redeployed.

---

## 1. System context & conventions

Reuses the existing two-process architecture unchanged (see `2026-07-18-auth-monitor-llamados-design.md` §2): the **cron server** (`src/`, PM2 `gastos-gub-cronserver`) owns scheduled/background work; the **Nuxt app** (`app/`, PM2 `gastos-gub-dashboard`) owns request-scoped API + SSR UI; **`shared/`** holds Mongoose models/types used by both.

Model conventions (from `shared/models/*`): interface in `shared/types/database.ts`; `import { mongoose } from "../connection/database"`; explicit `collection` name; export a singleton `mongoose.model`; add to `shared/models/index.ts`; **`autoIndex` is off globally** — every index is declared on the schema AND ensured in `scripts/ensure-indexes.ts` (idempotent, `background: true`), never on boot. Compute-then-swap by `dataVersion` for rebuilt collections (pattern in `src/jobs/refresh-product-analytics.ts`). Frontend follows `app/DESIGN.md` (CSS tokens, `<MoneyAmount>` gold=money, `t(...)` both locales in the same key order, `useSeo`, SSR `useFetch`, responsive to 360px).

---

## 2. Data model — two new collections

### 2.1 `sice_catalog` — `shared/models/sice_catalog.ts` (one doc per article)

Keyed by `code` = `classification.id` = `ART_SERV_OBRA.COD`.

```ts
interface ISiceCatalog {
  code: string;               // ART_SERV_OBRA.COD as string, e.g. "28267" — unique
  canonicalName: string;      // ART_SERV_OBRA.DESCRIPCION
  isService: boolean;         // IND_ART_SERV === 'S'
  // rubro path (numeric codes) + denormalized names for read-without-join
  famiCode: string;  famiName: string;
  subfCode: string;  subfName: string;
  clasCode: string;  clasName: string;
  subcCode: string;  subcName: string;
  rubroPath: string;          // "F.SF.C.SC" numeric dotted, e.g. "2.6.5.3"
  rubroTokens: string[];      // the 4 ancestor tokens: ["F2","SF2.6","C2.6.5","SC2.6.5.3"]
  unitCode?: string;          // UNME_COD
  unitName?: string;          // UNIDADES_MED.DESCRIPCION (default unit)
  odg?: string;               // objeto del gasto code
  synonyms: string[];         // SINONIMOS.DESCRIPCION for this article (search aid)
  retired: boolean;           // FECHA_BAJA present (kept, flagged, excluded from pickers)
  dataVersion: string;        // compute-then-swap tag
  updatedAt: Date;
}
```
Indexes: `{ code: 1 }` unique · `{ rubroPath: 1 }` · `{ 'rubroTokens': 1 }` multikey · text index `{ canonicalName: 'text', synonyms: 'text' }` (`default_language: 'none'`, name `sice_catalog_text`) · `{ dataVersion: 1 }`.

### 2.2 `sice_rubro` — `shared/models/sice_rubro.ts` (one doc per tree node)

The lightweight tree that powers the picker cascader and the breadcrumbs — ~2,170 nodes, so the UI never scans 91k articles to draw a level.

```ts
interface ISiceRubro {
  token: string;              // "F2" | "SF2.6" | "C2.6.5" | "SC2.6.5.3" — unique
  level: 'familia' | 'subfamilia' | 'clase' | 'subclase';
  name: string;               // node DESCRIPCION
  path: string;               // numeric dotted, e.g. "2.6.5"
  parentToken?: string;       // null for familia
  articleCount: number;       // # non-retired articles at/under this node (picker hint)
  purchasable: boolean;       // FAMILIAS.COMPRABLE==='S' propagated (familia); default true below
  dataVersion: string;
}
```
Indexes: `{ token: 1 }` unique · `{ parentToken: 1 }` · `{ level: 1 }` · text `{ name: 'text' }` (`sice_rubro_text`) · `{ dataVersion: 1 }`.

### 2.3 The classification-token namespace (the load-bearing idea)

A single string namespace shared by `open_calls.classificationSet`, `watch.categories`, and `item_price_baseline`:

| Level | Token form | Example |
|---|---|---|
| Artículo (leaf) | the bare code | `28267` |
| Subclase | `SC{fami}.{subf}.{clas}.{subc}` | `SC2.6.5.3` |
| Clase | `C{fami}.{subf}.{clas}` | `C2.6.5` |
| Subfamilia | `SF{fami}.{subf}` | `SF2.6` |
| Familia | `F{fami}` | `F2` |

An article "belongs to" its code plus its 4 ancestor tokens (`sice_catalog.rubroTokens`). Matching is set intersection in this namespace, so a watch subscribed to `C2.6.5` matches any call carrying an article under clase 2/6/5, and a watch subscribed to the bare code `28267` behaves exactly as today. **Backward compatibility:** existing watches store bare codes; `open_calls.classificationSet` continues to include bare codes, so they keep matching with zero migration.

---

## 3. Workstream 4a — Catalog ingestion

### 3.1 Parser — `src/jobs/sice/parse.ts` (pure, unit-tested)
Parses the dump's `INSERT` statements into typed rows. **Traps handled (all confirmed against the real dump):** file encoding is **Latin-1/CP1252** (read as `latin1`, not utf-8, or names mojibake); statements are `insert into <table>(cols) values (...)`, not CSV; `''` inside a string is an escaped single quote and also means empty-string when whole; dates appear as `date 'YYYY-MM-DD'`; DDL table names are plural (`familias`, `subflias`, `clases`, `subclases`, `unidades_med`, `sinonimos`, `art_serv_obra`).
- Exports pure functions: `parseArtServObra(sql) → ArtRow[]`, `parseFamilias`, `parseSubflias`, `parseClases`, `parseSubclases`, `parseUnidadesMed`, `parseSinonimos`. Each returns plain objects keyed by the columns we need (ignore unused columns).
- A generic `parseInserts(sql, table, colCount)` tokenizer underlies them, handling quoted strings with `''` escapes and `NULL`/`date '...'` literals.

### 3.2 Import job — `src/jobs/import-sice-catalog.ts`
1. **Discover + freshness:** GET CKAN `https://catalogodatos.gub.uy/api/3/action/package_show?id=acce-catalogo-acce`, resolve the TGZ resource URL (fallback constant `http://www.comprasestatales.gub.uy/datos_abiertos/imp_catalogo.tgz`). `HEAD` it; compare `ETag`/`Last-Modified` to a stored watermark (`sice_import_state` singleton doc, or reuse a small meta doc). Skip if unchanged unless `--force`.
2. **Download + extract:** stream the TGZ to a temp dir, `gunzip`+untar (use `zlib` + `tar`-less manual, or the already-present `yauzl` is zip-only — the file is `.tgz`, so use Node `zlib.gunzipSync` + a minimal tar reader, or shell `tar` where available; implement a tiny tar extractor in `src/jobs/sice/untar.ts` to avoid a new dependency and stay cross-platform). Read the needed `.sql` files as `latin1`.
3. **Build docs:** parse the 7 tables; join article → hierarchy names + rubroPath + rubroTokens; attach default unit name (UNME_COD→UNIDADES_MED); group synonyms by `arse_cod`. Build `sice_rubro` nodes from the 4 hierarchy tables with `articleCount` rolled up from non-retired articles.
4. **Compute-then-swap:** write to `sice_catalog`/`sice_rubro` under a fresh `dataVersion`, then delete the previous version's docs (same discipline as `product_analytics`). Bulk upserts in batches.
5. **Log coverage:** article count, node counts per level, and (optional) a sample join check. Update the watermark.
- Throttling/robustness mirrors existing jobs (timeouts, browser-like UA, non-fatal on a transient CKAN hiccup — the constant URL is the fallback).

### 3.3 Cron wiring — `src/cronserver.ts`
Add `catalogStatus`/`isCatalogRunning`, `runCatalogImportJob()` (spawns `jobs/import-sice-catalog` via `runJobProcess`), a weekly schedule (e.g. `0 3 * * 1` Mon 03:00 America/Montevideo, before nothing else), and `GET/POST /cron/import-catalog` + `/cron/import-catalog/status`. Independent of `busyWith()` (writes its own collections; reads nothing hot). Add npm script `import-sice-catalog`.

### 3.4 Indexes — `scripts/ensure-indexes.ts`
Add the `sice_catalog` and `sice_rubro` indexes (§2.1/§2.2) to the side-collection block.

---

## 4. Workstream 4b — Alerts "mis productos" + advanced picker

### 4.1 open_calls enrichment — `src/jobs/open-calls/project.ts`
When projecting a release's items into an `OpenCall`, look each `classification.id` up in an in-memory catalog map (loaded once per job run: `sice_catalog` is ~91k small docs, hold a `Map<code, {rubroTokens, canonicalName, synonyms, unitName}>`). For each item:
- push the bare `code` **and** its `rubroTokens` into `classificationSet` (dedup);
- append `canonicalName` + `synonyms` to the normalized `searchText`;
- (optional) store the canonical name / official unit on the embedded item for display.
Codes absent from the catalog fall through with just the bare code (unchanged behavior). Backfill: a one-off re-projection of existing `open_calls` (or let the hourly sync re-enrich them; `lastSyncedAt` restamp is harmless).

### 4.2 Matcher — `shared/matching/match.ts`
**No logic change.** `watch.categories` and `call.classificationSet` are both token sets; the existing `matchedCategories = categories.filter(c => call.classificationSet.includes(c))` now transparently supports rubro-node subscriptions. Add unit tests for: rubro-node match (call article under a subscribed `C…`/`SC…` node), leaf-code match (unchanged), mixed watch, and no-match. `MatchReason.categories` will contain the matched tokens; the email/UI resolve token→name via `sice_rubro`/`sice_catalog`.

### 4.3 Category API — `app/server/api/categories.get.ts` (+ maybe split)
Replace the flat regex-over-`product_analytics.description` with catalog-backed hierarchical endpoints:
- **Browse:** `?level=familia` or `?parent=<token>` → `sice_rubro` children (token, name, level, articleCount) sorted by name; leaf level returns `sice_catalog` articles under a subclase.
- **Search:** `?q=…` → text search over `sice_rubro.name` + `sice_catalog.{canonicalName,synonyms}`, returning nodes/articles with `token`, `label`, `level`, and an ancestor breadcrumb (resolved from `rubroPath`). Rank rubro nodes above articles; cap results.
- **Resolve:** `?tokens=a,b,c` → map tokens back to `{token,label,level}` for rendering saved watches' chips.
Keep the response shape compatible with `useMonitorApi.categories.search` or extend it (see 4.5).

### 4.4 Watch form UI — `app/components/WatchForm.vue` + `app/pages/app/alertas.vue`
- Replace the single flat `v-autocomplete` with a **rubro tree/cascader + search box** (Vuetify `v-treeview` lazy-loaded by `parent`, plus a search field that switches to the flat search results). Multi-select nodes at any level; selected nodes render as **named chips** (resolve via the API), fixing the current count-only "N categorías" chip in `alertas.vue`.
- **Expose the already-supported watch fields** that the form currently drops: remove the hardcoded `buyers: []`, and add to `save()` and the live-preview payload: `buyers` (organismo autocomplete), `minValue`/`maxValue` (UYU range with `<MoneyAmount>`-styled inputs), `procurementMethods` (multi-select of the Spanish method names). These already flow through `watch-input.ts` → model → matcher.
- Keep the "coincide con N llamados" live preview (`/api/watches/test`) working with the new token categories.
- i18n: add keys to **both** `es.json` (source) + `en.json` (mirror, same order) under `alerts.*` for the tree/search/filters labels.

### 4.5 Client + validation
- `app/composables/useMonitorApi.ts`: extend `categories` with `browse(level|parent)`, `search(q)`, `resolve(tokens)`; `WatchPayload` already carries value/method — ensure buyers/min/max/method are sent.
- `app/server/utils/watch-input.ts`: accept token strings in `categories` (validate against the `F|SF|C|SC` prefixes or bare numeric); raise the per-watch category cap (50 → e.g. 300; env `WATCH_CATEGORY_CAP`) since one rubro node stands in for many articles. Watch **count** cap unchanged.

---

## 5. Workstream 4c — Individual product pages

### 5.1 Enrich `product_analytics` — `src/jobs/refresh-product-analytics.ts`
In the build step, left-join `sice_catalog` by `code` and store on each product doc: `canonicalName`, `rubroPath`, the 4 level names, `unitName`, `isService`. Add these optional fields to `IProductAnalytics` (`shared/models/product_analytics.ts`). Codes absent from the catalog keep the current modal `description` as fallback.

### 5.2 Product pages — `app/pages/products/[code].vue` + `app/pages/products/index.vue`
- `[code]`: show the **canonical name** as the title (fallback to modal `description`), a **rubro breadcrumb** (familia › subfamilia › clase › subclase, each linking to a filtered index), and the **official unit**. `app/server/api/analytics/products/[code].get.ts` returns the new fields.
- `index`: add a **rubro filter** (familia/subfamilia dropdown backed by `sice_rubro`) alongside the existing search; show the rubro on each row. `app/server/api/analytics/products.get.ts` supports `?rubro=<token>` via `product_analytics.rubroPath` prefix.
- `app/server/api/open-calls/[compraId]/benchmarks.get.ts` gains rubro context in its response (canonical name + rubro for each item's classification).

---

## 6. Workstream 4d — Overpricing detector + AI triage (same catalog representation)

All catalog data here comes from the **same `sice_catalog`** the alerts use — no parallel taxonomy. **Scope:** improve the EXISTING overpricing (unit-price outlier) anomaly, its baselines, and its AI triage — do **not** add a new anomaly type/category. The catalog makes the current overpricing flag more accurate (like-for-like baselines) and better explained.

### 6.1 Canonical unit as the baseline key — `src/jobs/detect-anomalies.ts` + `src/jobs/anomaly-stats.ts`
Today baselines group by `{classification.id, currency, unit.name}` where `unit.name` is free text, so `u`/`un`/`uni`/`unid`/`unidad` fragment one economic baseline. Introduce `canonicalUnit`:
- `canonicalUnit(unitName, code)` = a normalized unit string, using the catalog article's default `unitName` when the raw name normalizes ambiguously, else a synonym-folded normalization (lowercase, strip punctuation/plurals, map the known `u/un/uni/unid/unidad → UNIDAD` family). Pure + unit-tested.
- Change the baseline `$group._id` and `BaselineKey`/`baselineMapKey` to use `canonicalUnit`. Store `canonicalUnit` (and `rubroPath`, `canonicalName`, `subclaseToken`) on `item_price_baseline` (`shared/models/item_price_baseline.ts`); retain raw `unitName` for debugging. Canonicalize identically in the scoring path (`scoreReleases`/`normaliseRow`).

### 6.2 Rubro-level fallback for sparse codes — `src/jobs/anomaly-stats.ts`
Also build **subclase-level baselines** keyed by `{subclaseToken, currency, canonicalUnit}`. In `scoreUnitPrice`, when the article-level sample `n < MIN_BASELINE_N`, fall back to the subclase baseline instead of silently skipping the line. Add a unit-mismatch pre-filter analogous to the existing `isLineTotalArtifact` guard.

### 6.3 AI triage prompt — `src/jobs/score-anomalies-ai.ts`
- `buildContext()`: load a `catalogByCode` map (from `sice_catalog`) for the flagged items.
- `buildPrompt()` / `SYSTEM_INSTRUCTION`: add authoritative context lines — "Nombre canónico (catálogo)", "Unidad oficial", "Rubro/Subrubro" — and an internal unit-mismatch hint so the triage can discount a "high price" that is really a unit mismatch. This **replaces** the best-effort HTML scraping in `src/jobs/ai/item-features.ts` (which failed on ~29% of compras) with deterministic catalog data as the primary source (keep the scraper only as a secondary enrichment, or retire it). **No new anomaly category** — the existing `CATEGORY_VALUES` / `shared/models/anomaly.ts` enum is unchanged; this only feeds better context into the existing overpricing verdict.

### 6.4 Metadata + filters
- `buildAnomalyDoc()`: enrich `metadata.itemClassification` with `rubroPath` + `canonicalName`, and `metadata.itemUnit` with the official unit + an internal `unitMismatch` boolean (a precision signal, not a new category).
- `app/server/api/analytics/anomalies.get.ts` + `app/pages/analytics/anomalies.vue`: add a **rubro filter** and prefer the canonical name in `itemLabel()`.

---

## 7. Ordering, phasing & isolation

The core (models + parser + import job) must land first; the four consumers depend on it. Implementation order:

1. **Core** — `sice_catalog` + `sice_rubro` models/types/barrel; indexes; token helpers (`shared/utils/rubro-tokens.ts`, pure).
2. **Parser + import job** (TDD parser) — populate the live collections; this is the gate that unblocks everything.
3. **4b alerts** — enrichment + API + UI + matcher tests.
4. **4c product pages** — enrichment + views.
5. **4d anomalies** — canonical unit + fallback + prompt + filters.

Each consumer is independently shippable once the core exists; they touch mostly disjoint files (only `shared/types/database.ts`, `shared/models/index.ts`, `scripts/ensure-indexes.ts`, `src/cronserver.ts`, and the i18n files are shared, and are edited additively).

---

## 8. Testing strategy

- **Unit (pure, high value):**
  - `parse.ts` against real fixture snippets from the dump (`ART_SERV_OBRA`, `FAMILIAS`, `SINONIMOS`, a row with `''` escapes and a `date '...'`).
  - `rubro-tokens.ts`: code → tokens, token → level/path, ancestor expansion.
  - `match.ts`: rubro-node match, leaf-code match (regression), mixed, no-match, refinements still AND.
  - `canonicalUnit`: `u/un/uni/unid/unidad` collapse; catalog-preference path.
- **Integration:**
  - import job against the real (already-downloaded) TGZ fixture → expected article/node counts, spot-check code 28267 → `SC2.6.5.3` path + unit.
  - `project.ts` enrichment: an item with a known code yields the code + 4 tokens in `classificationSet`.
- **Coverage regression:** re-run the join-coverage check (product_analytics ∩ catalog) after import; assert ≥99%.
- Tests live under `tests/unit` and `tests/integration` following the existing plain-`tsx` assertion style; verification per phase uses the `run`/`verify` skills against the live DB (override `MONGODB_URI` per the DESIGN.md dev-server truth).

---

## 9. Risks & mitigations

- **TGZ freshness metadata lies** — CKAN `metadata_modified` frozen at 2020; gate on the TGZ `ETag`/`Last-Modified` only. *Mitigated in §3.2.*
- **Latin-1 + SQL parse** — mojibake/corruption if read as utf-8 or split naïvely on commas inside quoted strings. *Mitigated by the tokenizer + `latin1` read + fixture tests.*
- **Baseline re-key changes anomaly outputs** — moving from raw to canonical unit re-shapes baselines. *Additive (keep raw), and coverage/regression-checked; detection is idempotent and re-runs nightly.*
- **`.tgz` extraction cross-platform** — no `tar` guaranteed on Windows. *Ship a tiny dependency-free tar reader (`untar.ts`) + `zlib.gunzip`.*
- **Non-joinable free-text lines** (`classification.id` empty/`0`) — cannot be enriched. *Expected and quantified (~0% of coded spend); they simply keep current behavior.*
- **Watch backward-compat** — existing article-code watches must keep matching. *Guaranteed: bare codes remain in `classificationSet`.*
- **Licensing** — `odc-uy` permits commercial use **with attribution to ARCE**. *Add an attribution line on catalog-derived UI/pages.*

---

## 10. File map (to create / edit)

**Create:** `shared/models/sice_catalog.ts`, `shared/models/sice_rubro.ts`, `shared/utils/rubro-tokens.ts`, `src/jobs/sice/parse.ts`, `src/jobs/sice/untar.ts`, `src/jobs/import-sice-catalog.ts`, tests under `tests/unit/` + `tests/integration/`.
**Edit:** `shared/types/database.ts`, `shared/models/index.ts`, `scripts/ensure-indexes.ts`, `src/cronserver.ts`, `package.json` (script), `src/jobs/open-calls/project.ts`, `shared/matching/match.ts` (tests only), `app/server/api/categories.get.ts`, `app/components/WatchForm.vue`, `app/pages/app/alertas.vue`, `app/composables/useMonitorApi.ts`, `app/server/utils/watch-input.ts`, `app/i18n/locales/{es,en}.json`, `src/jobs/refresh-product-analytics.ts`, `shared/models/product_analytics.ts`, `app/pages/products/[code].vue`, `app/pages/products/index.vue`, `app/server/api/analytics/products.get.ts`, `app/server/api/analytics/products/[code].get.ts`, `app/server/api/open-calls/[compraId]/benchmarks.get.ts`, `src/jobs/detect-anomalies.ts`, `src/jobs/anomaly-stats.ts`, `src/jobs/score-anomalies-ai.ts`, `src/jobs/ai/item-features.ts`, `shared/models/item_price_baseline.ts`, `shared/models/anomaly.ts`, `app/server/api/analytics/anomalies.get.ts`, `app/pages/analytics/anomalies.vue`.

## 11. Deploy (go-live)
1. `npx tsx scripts/ensure-indexes.ts` (builds the new sice indexes + any new baseline fields' indexes).
2. `npm run import-sice-catalog` (populate `sice_catalog` + `sice_rubro`; re-runnable, gated by ETag).
3. Re-project open calls (hourly sync will re-enrich; or a one-off) and `npm run refresh-product-analytics` to attach canonical names.
4. `npm run detect-anomalies` (rebuild baselines on canonical unit) — optional immediate; else the nightly job.
5. `cd app && npm run build` then redeploy dashboard (PM2 `gastos-gub-dashboard`); `npm run cronserver:restart` to pick up the weekly catalog job.
6. Smoke: browse the rubro tree in `/app/alertas`, create a rubro-node watch, confirm the preview count; open a `products/[code]` page and confirm canonical name + rubro + unit.
