# Anomaly hub · Errores de carga · Report guide · Category filter · Nav dropdowns — Design

**Date:** 2026-07-19
**Status:** Approved (design), pending implementation plan
**Author:** Eduardo + Claude

## Problem

Five related gaps in the anomaly surface and site navigation:

1. **No load-error surface.** ~1012 anomalies are AI-classified as `aiVerdict.category = 'error-carga'` (data-entry errors: quantity 10000 vs 1, line total loaded as unit price, wrong currency) plus 1 `moneda-erronea`. These are **not corruption** — they are bad data that should be reported to whoever loaded it. They are buried inside the generic Alertas list with no dedicated, real-time, reportable view.
2. **No "how to report" page.** A citizen who spots a load error has nowhere that explains who owns the data and how to get it corrected.
3. **Missing type filter.** `/analytics/anomalies` cannot filter by error type. The meaningful "tipo de error" lives on `aiVerdict.category` (9 values). The API accepts neither a `category` param nor exposes a UI control (it accepts a structural `type` param, but only `price_spike` is ever generated, so that axis is useless today).
4. **No anomalies hub.** The six `/analytics/*` pages are exposed as six flat top-nav entries; there is no landing page that groups the anomaly/analysis tools.
5. **Inaccessible pages + nav overflow.** The nav is a flat 21-item array that overflows into a priority "Más" menu. Six `/investigaciones/*` sub-pages are reachable only by first visiting the investigaciones hub, and TV Ciudad — although technically in the nav — is item #18 and folds into the overflow on most widths.

## Decisions (from brainstorming)

- **Reporting = guide + deep-link, no backend.** The site stays a watchdog; corrections are owned by the buyer organism (data entry via SICE) and ACCE (platform, comprasestatales.gub.uy). No on-site form, no report-storage collection.
- **Real-time = live polling.** Reuse the existing keyset "changes" feed and `firstDetectedAt` cursor infra; show a "N nuevos" pill.
- **Nav = two real dropdowns** (Análisis + Investigaciones), not a single hub-only path.
- **Type filter = `aiVerdict.category`** (the 9 semantic types), not the structural `type` enum.
- **Routes** under `/analytics/*`.

## Current-state facts (verified)

- Anomaly model: `shared/models/anomaly.ts`, collection `anomalies`. `aiVerdict.category` enum: `cantidad-baja`, `producto-distinto`, `marca-especializado`, `urgencia`, `servicio-incluido`, `error-carga`, `moneda-erronea`, `sin-explicacion`, `otro` (line ~83). `aiVerdict.explainable` ∈ `yes|no|uncertain`. Invariant: `explainable:'no' ⇔ category:'sin-explicacion'` (enforced by `normalizeVerdict()` in `src/jobs/score-anomalies-ai.ts`).
- Live category distribution (DB `gastos_gub.anomalies`, 2026-07-19): unscored/no-verdict 4197; `error-carga` 1012; `producto-distinto` 775; `servicio-incluido` 43; `sin-explicacion` 38; `urgencia` 35; `otro` 10; `marca-especializado` 7; `cantidad-baja` 2; `moneda-erronea` 1.
- List API: `app/server/api/analytics/anomalies.get.ts` already handles `type`, `severity`, `currency`, `ai` (explainable bucket), `minZ`, supplier/buyer/rubroName/product facets, sort. **No `category` param.**
- Changes feed: `app/server/api/v1/anomalies/changes.get.ts` — keyset feed sorted `firstDetectedAt:-1,_id:-1`, filters `minZ|minAmount|severity|currency`, returns `nextCursor`/`hasMore`. **No `category` param.**
- Anomalies page: `app/pages/analytics/anomalies.vue`. Filters today: severity chips, `ai` bucket, sort, `minZ`, currency, advanced facet multiselects. **No category control.**
- Freshness: `dataVersion` content hash; `firstDetectedAt` (`$setOnInsert`) vs `detectedAt` (restamped); `triage.pending` count returned by the list API; `unexplained.vue` renders the "settling" indicator.
- Nav: `app/layouts/default.vue`, flat `nav` computed (lines ~26-60), i18n keys `nav.*` in `app/i18n/locales/{es,en}.json`. No `v-list-group` anywhere. Overflow "Más" `v-menu` at ~269-300. Top-bar links must use a **resolved** `NuxtLink` component object, not the string `'NuxtLink'` (known gotcha — string `:is` renders an inert `<nuxtlink>`).
- Category labels already exist in i18n (`es.json`/`en.json`, ~lines 853-863).
- Investigaciones hub pattern: `app/pages/investigaciones/index.vue` (card grid from `~/data/investigaciones`).

## Deliverables

### A. API: category filter

**`app/server/api/analytics/anomalies.get.ts`** — add `category` query param:
- Accept comma-joined or repeated values; validate against the `aiVerdict.category` enum; ignore unknowns.
- Apply as `{ 'aiVerdict.category': { $in: [...] } }`. Composes with existing `ai` bucket filter (both may be present; `category=sin-explicacion` naturally aligns with `ai=unexplained`).
- No index change required for correctness; existing `{ 'aiVerdict.explainable':1, severityRank:-1 }` index still serves the common paths. (Note in plan: if `category`-only queries are slow, consider a compound index — defer until measured.)

**`app/server/api/v1/anomalies/changes.get.ts`** — add `category` param (same validation), applied to the keyset match so the live poll can scope to load errors.

### B. Page: `/analytics/errores-carga` (real-time load errors)

New `app/pages/analytics/errores-carga.vue`.

- **Query:** `/api/analytics/anomalies?ai=explainable&category=error-carga,moneda-erronea&sortBy=divergence&sortOrder=desc`.
- **Live polling:** on an interval (60s) and on `visibilitychange`, call `/api/v1/anomalies/changes?category=error-carga&minZ=…&since=<cursor>`; accumulate `count` into a "N nuevos errores de carga" pill; clicking the pill prepends the new rows and advances the cursor. Pause polling when tab hidden. Reuses the pattern already in `proveedores-anomalias.vue` (30-min refresh + visibilitychange) but with the changes cursor.
- **Row content:** detected value vs expected range, organismo comprador (`metadata.buyerName`), proveedor (`metadata.supplierName`), item/description, the AI `reason` (why it reads as a load error, e.g. "total cargado como unitario"), deep-link to `/contracts/[releaseId]`, and a **[Reportar]** button (section D).
- **Framing banner:** explicit "esto son errores de datos, no necesariamente corrupción" note, and a link to `/analytics/como-reportar`. Visual identity distinct from Alertas: use a neutral/data-quality accent (not money-gold/red), per `app/DESIGN.md` (gold = money; do not imply spend magnitude here).
- **Empty/settling state:** if `triage.pending > 0`, show the "N aún en triage" indicator so a short list doesn't read as "todo limpio".

### C. Hub: `/analytics` (anomalies/analysis landing)

New `app/pages/analytics/index.vue` — card grid modeled on `investigaciones/index.vue`.

- Cards (title · icon · one-liner · optional cheap live count): Alertas (`/analytics/anomalies`), Sin explicación (`/analytics/unexplained`), **Errores de carga** (`/analytics/errores-carga`), Proveedores señalados (`/analytics/proveedores-anomalias`), Intendencias (`/analytics/intendencias`), Gasto por organismo (`/analytics/organismos`), Mapa del gasto (`/analytics/mapa`), Estadísticas (`/estadisticas`), and **Cómo reportar** (`/analytics/como-reportar`).
- Counts, where shown, come from cheap existing endpoints (`anomalies/stats.get.ts`) or are omitted; the hub must not add heavy aggregation on the request path.
- The "Análisis ▾" nav dropdown's parent link points here.

### D. Report mechanism (guide + per-row deep-link)

**Per-row [Reportar] → modal** (a shared component, e.g. `app/components/ReportErrorDialog.vue`), prefilled with the anomaly's context:
- Deep-link to the official record on comprasestatales.gub.uy (built from `releaseId` / the same identifier the contract detail uses).
- The organismo comprador (who entered the data) and the ACCE mesa de ayuda contact.
- An auto-built **copy-paste report text** (contract reference + a plain-language description of the load error and the corrected expectation), with a copy button.
- A link to the full guide page.

**`app/pages/analytics/como-reportar.vue`** — bilingual static explainer:
- Who owns and corrects the data (organismo vía SICE → publicado por ACCE en comprasestatales).
- The correction circuit and the steps to report.
- What to attach (contract id, screenshot, the specific field).
- Contacts.

> **Open item (implementation):** the exact ACCE / organismo contact strings and the canonical comprasestatales deep-link format must be verified against the live site during implementation — do **not** invent addresses. If a reliable public contact cannot be confirmed, the guide degrades to "contactar al organismo comprador vía su mesa de entrada + reportar a ACCE" with the platform's public contact page linked, and the per-row modal drops the mailto in favour of the deep-link + copy-text.

### E. Anomalies page: category filter control

**`app/pages/analytics/anomalies.vue`** — add a "Tipo de error" chip/select group bound to `category`, reusing existing i18n category labels. Wires to the new API param; participates in the existing URL-sync/filter state; a chip is the errores-carga shortcut (selecting `error-carga` here reproduces the dedicated page's core filter).

### F. Nav restructure (two dropdowns)

**`app/layouts/default.vue`** — extend the `nav` model to support an optional `children` array; render:
- Desktop: a `v-menu` + `v-list` for parents that have children (same pattern as the existing account menu), parent label clickable → parent route.
- Drawer: `v-list-group` (first use in this app) for the same parents.
- Groups:
  - **Análisis ▾** (parent → `/analytics`): Alertas, Sin explicación, Errores de carga, Proveedores señalados, Intendencias, Gasto por organismo, Mapa del gasto.
  - **Investigaciones ▾** (parent → `/investigaciones`): TV Ciudad, Casinos, Casino cortesía, Intendencia Montevideo, Empresas señaladas, ASSE ambulancias, Frigorífico Saturno.
- Flat top-level entries after grouping: Panel, Gastos, Recopilatorios, Pauta, Contratos, Productos, Proveedores, Organismos, **Análisis ▾**, **Investigaciones ▾**, Estadísticas, Curros, Llamados, Desarrolladores, API. This roughly halves the flat count and removes TV Ciudad from the overflow.
- `isActive()` (`startsWith`) already keeps a parent highlighted on child routes.
- Preserve the resolved-`NuxtLink` gotcha; children links must not pass the string `'NuxtLink'` to `:is`.
- The overflow "Más" logic (`recomputeNav`) still applies to the reduced top-level list.

### G. i18n

- New nav keys: `nav.analisis` (Análisis dropdown parent), `nav.erroresCarga`, `nav.comoReportar`. The Investigaciones dropdown parent reuses the existing `nav.investigaciones` key ("Investigaciones").
- New page copy: errores-carga (title, banner, row labels, "N nuevos" pill), como-reportar (full guide), hub (`/analytics`) titles/one-liners, report dialog strings.
- Reuse existing category labels for the type-filter chips.
- Both `es.json` and `en.json`.

## Non-goals / out of scope

- No report-storage backend, collection, moderation, or admin panel.
- No new cron/job and no change to anomaly scoring — the existing detect → AI-triage pipeline already sets `error-carga`/`moneda-erronea`.
- No migration of the existing `/analytics/*` routes; the hub is additive.
- No change to the structural `type` enum handling.

## Components / boundaries

| Unit | Purpose | Depends on |
|---|---|---|
| `anomalies.get.ts` `category` param | server-side filter by AI category | anomaly enum |
| `changes.get.ts` `category` param | scope live feed to load errors | anomaly enum |
| `errores-carga.vue` | real-time load-error list | list API + changes feed + ReportErrorDialog |
| `como-reportar.vue` | static report guide | i18n only |
| `ReportErrorDialog.vue` | per-row report context + copy-text | anomaly row data + i18n |
| `analytics/index.vue` | anomalies hub | stats endpoint (optional) |
| `anomalies.vue` category control | expose type filter | list API `category` param |
| `default.vue` nav groups | 2 dropdowns | i18n nav keys |

Each unit is independently testable: API params via `tsx` assertion scripts / dev-server curl; pages via dev-server render; nav via visual check (desktop menu + mobile drawer).

## Verification (test-less repo)

Per the developer-platform note: run targeted `tsc` on changed server/shared files, `tsx` assertion scripts for the new API params (assert `category=error-carga` narrows results and rejects unknown values), and dev-server `curl` for the endpoints and page renders. Manual visual pass on desktop dropdowns + mobile drawer `v-list-group`, and the real-time pill (simulate by inserting/altering `firstDetectedAt`). Confirm the errores-carga page is non-empty against the 1012 live rows.

## Risks

- **Contact accuracy** (biggest): reporting guidance must not fabricate ACCE/organismo contacts — see the open item under D; degrade gracefully.
- **Changes-feed category scoping**: the feed keys on `firstDetectedAt`; a category-scoped poll must still page correctly — assert cursor behaviour.
- **Nav regression**: `v-list-group` is new here; verify the resolved-NuxtLink gotcha and that overflow math still runs on the reduced list.
- **Live counts on hub**: keep off the heavy aggregation path; prefer the precomputed stats endpoint or omit.
