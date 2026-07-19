# Anomaly hub · Errores de carga · Report guide · Category filter · Nav dropdowns — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, chosen) to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Surface AI-classified "load errors" (`aiVerdict.category`) as a real-time, reportable page; add a category filter to the anomalies list; add an anomalies hub and a report guide; and group the nav into two dropdowns so TV Ciudad and the investigation sub-pages stop hiding in the "Más" overflow.

**Architecture:** Additive. Two server endpoints gain a validated `category` query param (filter on `aiVerdict.category`). Three new pages + one dialog component reuse existing patterns (`unexplained.vue` list, `investigaciones/index.vue` card hub, the account `v-menu`). The nav array in `default.vue` collapses six analytics + seven investigation entries into two parent entries with `children`, rendered as `v-menu` (bar) / nested `v-list-group` (overflow) / `<details>` (drawer).

**Tech Stack:** Nuxt 3, Vue 3 `<script setup>`, Vuetify (menus/drawer/icons only), `@nuxtjs/i18n` (es default + en), Mongoose, h3 server routes. Test-less repo → verify via targeted `tsc`, `tsx` assertion scripts, dev-server `curl`, and browser screenshots.

## Global Constraints

- Category values (verbatim from `shared/models/anomaly.ts` `aiVerdict.category` enum): `cantidad-baja`, `producto-distinto`, `marca-especializado`, `urgencia`, `servicio-incluido`, `error-carga`, `moneda-erronea`, `sin-explicacion`, `otro`.
- "Load errors" = `category ∈ {error-carga, moneda-erronea}` with `aiVerdict.explainable === 'yes'`.
- Category i18n labels already exist at `anomalies.ai.category.*` in `es.json`/`en.json` — REUSE, do not duplicate.
- Nav gotcha: never pass the string `'NuxtLink'` to `:is`; use the resolved `NuxtLinkC` component object (see `default.vue:8`).
- Money colour (`--sol`/`--money`/gold) means spend magnitude (`app/DESIGN.md`). The load-error page must NOT use gold; use a neutral/data-quality accent (`--celeste`/`--rule`) so it never implies "big money".
- Do NOT invent ACCE/organismo contact strings — verify against comprasestatales.gub.uy during Task 4; degrade gracefully if unconfirmed.
- Both `es.json` and `en.json` updated for every new key.
- Routes: `/analytics` (hub), `/analytics/errores-carga`, `/analytics/como-reportar`.

---

### Task 1: `category` query param on both anomaly endpoints

**Files:**
- Create: `shared/utils/anomaly-categories.ts`
- Modify: `app/server/api/analytics/anomalies.get.ts`
- Modify: `app/server/api/v1/anomalies/changes.get.ts`
- Verify: `scripts/verify-category-filter.mjs` (throwaway `tsx`/curl assertions)

**Interfaces:**
- Produces: `AI_CATEGORY_VALUES: readonly string[]`, `parseCategories(q: unknown): string[]` (splits comma-joined or repeated params; lowercases; keeps only enum members; dedupes).
- Consumes: nothing.

- [ ] **Step 1: shared constant + parser**

```ts
// shared/utils/anomaly-categories.ts
export const AI_CATEGORY_VALUES = [
  'cantidad-baja', 'producto-distinto', 'marca-especializado', 'urgencia',
  'servicio-incluido', 'error-carga', 'moneda-erronea', 'sin-explicacion', 'otro',
] as const

export type AiCategory = typeof AI_CATEGORY_VALUES[number]

const SET = new Set<string>(AI_CATEGORY_VALUES)

/** Accepts ?category=a,b OR repeated ?category=a&category=b. Keeps only known
 *  enum members, lowercased + de-duplicated. Unknown values are dropped, so a
 *  garbage param yields [] (→ no category filter) rather than an empty result. */
export function parseCategories(v: unknown): AiCategory[] {
  const raw: string[] = Array.isArray(v)
    ? v.flatMap(x => typeof x === 'string' ? x.split(',') : [])
    : typeof v === 'string' ? v.split(',') : []
  const out: AiCategory[] = []
  for (const s of raw) {
    const k = s.trim().toLowerCase()
    if (SET.has(k) && !out.includes(k as AiCategory)) out.push(k as AiCategory)
  }
  return out
}
```

- [ ] **Step 2: wire into `anomalies.get.ts`** — after the existing `ai` block (~line 128), add:

```ts
// Filter by the second-stage AI category (the semantic "tipo de error": error-carga,
// producto-distinto, sin-explicacion, …). Composes with the `ai` explainable bucket.
const categories = parseCategories(query.category)
if (categories.length === 1) filter['aiVerdict.category'] = categories[0]
else if (categories.length > 1) filter['aiVerdict.category'] = { $in: categories }
```
Import at top: `import { parseCategories } from '../../../../shared/utils/anomaly-categories'`.

- [ ] **Step 3: wire into `changes.get.ts`** — after the currency line (~23), add:

```ts
const categories = parseCategories(q.category)
if (categories.length === 1) filter['aiVerdict.category'] = categories[0]
else if (categories.length > 1) filter['aiVerdict.category'] = { $in: categories }
```
Import: `import { parseCategories } from '../../../../../shared/utils/anomaly-categories'` (verify depth from this file). Also add `aiVerdict.category` to the `PROJECTION` string so the feed row carries it.

- [ ] **Step 4: targeted typecheck** — `npx tsc --noEmit` on the two server files + the shared util (root tsconfig). Expected: no new errors.

- [ ] **Step 5: assertion via dev server** — with dev server running, curl and assert:
  - `/api/analytics/anomalies?ai=explainable&category=error-carga&limit=1` → every row `aiVerdict.category === 'error-carga'`; `pagination.total` ≈ 1012 (±, it's live).
  - `/api/analytics/anomalies?category=bogus&limit=1` → behaves as no category filter (total = full set), not empty.
  - `/api/v1/anomalies/changes?category=error-carga&limit=5` → rows all `error-carga`.

- [ ] **Step 6: commit** — `git add shared/utils/anomaly-categories.ts app/server/api/analytics/anomalies.get.ts app/server/api/v1/anomalies/changes.get.ts && git commit -m "feat(anomalies): filter list + changes feed by aiVerdict.category"`

---

### Task 2: i18n keys (es + en)

**Files:** Modify `app/i18n/locales/es.json`, `app/i18n/locales/en.json`

**Interfaces:**
- Produces the keys consumed by Tasks 3–8: `nav.analisis`, `nav.erroresCarga`, `nav.comoReportar`; `erroresCarga.*`; `comoReportar.*`; `analyticsHub.*`; `reportDialog.*`; `anomalies.category.label` + `anomalies.category.all`; `seo.erroresCarga.*`, `seo.comoReportar.*`, `seo.analyticsHub.*`.
- Consumes: existing `anomalies.ai.category.*` labels (reused for chips).

- [ ] **Step 1:** Add the `nav` keys `analisis`, `erroresCarga`, `comoReportar` to both files (es: "Análisis", "Errores de carga", "Cómo reportar"; en: "Analysis", "Data-load errors", "How to report").
- [ ] **Step 2:** Add `erroresCarga` block: `eyebrow, title, lead, banner, bannerLink, newFlags` (pluralised "{n} nuevos errores de carga"), `report` (button), `reason`, `empty.title/body`, `disclaimer`.
- [ ] **Step 3:** Add `comoReportar` block: `title, dek, whoTitle, whoBody, stepsTitle, steps[]` (as discrete keys, not an array in JSON — use `step1..step5`), `attachTitle, attachBody, contactsTitle, contactsBody, disclaimer`.
- [ ] **Step 4:** Add `analyticsHub` block: `kicker, title, dek`, and per-card `cards.<key>.title` + `.dek` for: alertas, unexplained, erroresCarga, providerAnomalies, intendencias, organismos, mapa, estadisticas, comoReportar.
- [ ] **Step 5:** Add `reportDialog` block: `title, intro, contractLabel, organismLabel, copyText` (the copy-paste template with `{ref} {organism} {item} {detected} {expected}` placeholders), `copy, copied, openContract, openOfficial, guideLink, close`.
- [ ] **Step 6:** Add `anomalies.category.label` ("Tipo de error"/"Error type") and `anomalies.category.all` ("Todos"/"All").
- [ ] **Step 7:** Add `seo.erroresCarga`, `seo.comoReportar`, `seo.analyticsHub` (`title`,`description`).
- [ ] **Step 8: validate JSON** — `node -e "JSON.parse(require('fs').readFileSync('app/i18n/locales/es.json'))"` for both; expected no throw.
- [ ] **Step 9: commit** — `git commit -m "i18n(anomalies): keys for hub, errores-carga, report guide, category filter"`

---

### Task 3: `ReportErrorDialog.vue`

**Files:** Create `app/components/ReportErrorDialog.vue`

**Interfaces:**
- Consumes: `anomaly` prop (the row object from the list API), `v-model` open state.
- Produces: a self-contained Vuetify `v-dialog` reused by Task 5. Emits `update:modelValue`.

- [ ] **Step 1:** Build a `v-dialog` with props `{ modelValue: boolean, anomaly: any }`. Compute `ref` (releaseId), `organism` (`metadata.buyerName`), `item` (itemClassification.description || itemDescription), `detected`/`expected` strings. Build the official comprasestatales deep-link from `releaseId` (mirror `/contracts/[id]` linkage; if the id space differs, fall back to the on-site `/contracts/{releaseId}` link + the platform home). Build `copyText` from the i18n template. A copy button uses `navigator.clipboard.writeText` with a `copied` flash. Link to `/analytics/como-reportar`.
- [ ] **Step 2:** Neutral styling (no gold). Reuse `.navmenu`/surface tokens.
- [ ] **Step 3: verify render** — mounted from Task 5; visually confirm open/copy in the browser check (Task 9).
- [ ] **Step 4: commit** — `git commit -m "feat(anomalies): ReportErrorDialog with prefilled copy-text + official deep-link"`

---

### Task 4: `/analytics/como-reportar` guide page

**Files:** Create `app/pages/analytics/como-reportar.vue`

- [ ] **Step 1: verify real contacts** — check comprasestatales.gub.uy for the public mesa-de-ayuda / contact channel and the canonical record URL format. Record findings in the page; if none confirmable, use the graceful-degradation copy (contact the buyer organism's mesa de entrada + ACCE via its public contact page, which is linked).
- [ ] **Step 2:** Static bilingual page from the `comoReportar.*` i18n block: hero (title/dek), "quién corrige los datos", numbered steps, "qué adjuntar", contacts, disclaimer. `useSeo` with `seo.comoReportar`. Style mirrors `about.vue`/`unexplained.vue` prose.
- [ ] **Step 3: verify** — dev-server GET `/analytics/como-reportar` renders 200 in es and `/en/analytics/como-reportar`.
- [ ] **Step 4: commit** — `git commit -m "feat(anomalies): /analytics/como-reportar report guide"`

---

### Task 5: `/analytics/errores-carga` real-time page

**Files:** Create `app/pages/analytics/errores-carga.vue`

**Interfaces:**
- Consumes: `/api/analytics/anomalies?ai=explainable&category=error-carga,moneda-erronea&sortBy=divergence&sortOrder=desc` (list) and `/api/v1/anomalies/changes?category=error-carga&limit=25` (live poll). `ReportErrorDialog` from Task 3.

- [ ] **Step 1:** Clone the `unexplained.vue` structure (hero + `PaginatedList` + row list + states). Swap query to the errores-carga filter. Replace the gold pending styling with a neutral/celeste accent. Row shows detected vs expected, organismo, proveedor, item, the AI `reason` (from `aiVerdict.reason`, any explainable category), a **[Reportar]** button opening `ReportErrorDialog` for that row, and the contract deep-link.
- [ ] **Step 2: live poll** — on mount, seed the cursor from the newest loaded row's `firstDetectedAt`; every 60s and on `visibilitychange` (when visible) call the changes feed with `since=<cursor>` scoped to `category=error-carga`; accumulate `data.length` into `newCount`; a pill `t('erroresCarga.newFlags', { n })` appears when `newCount > 0`; clicking it `refresh()`es the list and resets `newCount`. Clear the interval on unmount; pause when hidden.
- [ ] **Step 3:** Banner: "estos son errores de datos, no necesariamente corrupción" + link to `/analytics/como-reportar`. `useSeo` with `seo.erroresCarga`.
- [ ] **Step 4: verify** — dev-server GET renders 200, list non-empty (≈1012), the [Reportar] dialog opens, es + en both render.
- [ ] **Step 5: commit** — `git commit -m "feat(anomalies): /analytics/errores-carga real-time load-error list + report action"`

---

### Task 6: `/analytics` anomalies hub

**Files:** Create `app/pages/analytics/index.vue`

- [ ] **Step 1:** Card grid modeled on `investigaciones/index.vue` (reuse the `.inv-*` card classes or local equivalents). One card per: Alertas, Sin explicación, Errores de carga, Proveedores señalados, Intendencias, Gasto por organismo, Mapa del gasto, Estadísticas, Cómo reportar — each `NuxtLink` to its route, title + dek from `analyticsHub.cards.*`. No heavy aggregation on the request path; optionally fetch `/api/analytics/anomalies/stats` for a couple of cheap counts, else omit counts.
- [ ] **Step 2:** `useSeo` with `seo.analyticsHub`.
- [ ] **Step 3: verify** — dev-server GET `/analytics` renders 200 with all nine cards linking correctly; es + en.
- [ ] **Step 4: commit** — `git commit -m "feat(analytics): /analytics anomalies+analysis hub landing"`

---

### Task 7: category filter control on `/analytics/anomalies`

**Files:** Modify `app/pages/analytics/anomalies.vue`

**Interfaces:** Consumes Task 1's `category` param.

- [ ] **Step 1:** Add state mirroring `ai`: `const category = ref((route.query.category as string) ?? '')`. Add `const CATEGORIES = ['error-carga','producto-distinto','sin-explicacion','moneda-erronea','servicio-incluido','urgencia','marca-especializado','cantidad-baja','otro'] as const`. Add `category` to both `watch` dependency arrays (page-reset + URL-sync), and to the URL builder (`if (category.value) q.category = category.value`). Add to the `useFetch` query (`...(category.value ? { category: category.value } : {})`).
- [ ] **Step 2:** Add a chip row (a new `.controls` block like the AI-triage row) labelled `t('anomalies.category.label')`: an "all" chip (`category = ''`) + one chip per `CATEGORIES` value using the existing `t('anomalies.ai.category.'+c)` label. Reuse `.chip`/`.chip--on` styles.
- [ ] **Step 3: verify** — dev-server: selecting "Error de carga" sets `?category=error-carga` and narrows the list; label reads from existing i18n; es + en.
- [ ] **Step 4: commit** — `git commit -m "feat(anomalies): expose aiVerdict.category as a type filter on the alerts page"`

---

### Task 8: nav dropdowns (Análisis + Investigaciones) in `default.vue`

**Files:** Modify `app/layouts/default.vue`

**Interfaces:** Consumes `nav.analisis`, `nav.erroresCarga` (child), `nav.comoReportar` (optional child), existing `nav.*` child keys.

- [ ] **Step 1: restructure the `nav` array** to add optional `children`. Replace the six analytics entries (`anomalies…mapa`) with one parent, and the `investigaciones`+`tvciudad` entries with one parent carrying all seven investigation children:

```ts
{ key: 'analisis', to: localePath('/analytics'), icon: 'mdi-chart-box-outline', children: [
  { key: 'anomalies', to: localePath('/analytics/anomalies'), icon: 'mdi-flag-outline' },
  { key: 'unexplained', to: localePath('/analytics/unexplained'), icon: 'mdi-help-rhombus-outline' },
  { key: 'erroresCarga', to: localePath('/analytics/errores-carga'), icon: 'mdi-database-alert-outline' },
  { key: 'providerAnomalies', to: localePath('/analytics/proveedores-anomalias'), icon: 'mdi-account-alert-outline' },
  { key: 'intendencias', to: localePath('/analytics/intendencias'), icon: 'mdi-city-variant-outline' },
  { key: 'organismos', to: localePath('/analytics/organismos'), icon: 'mdi-finance' },
  { key: 'mapa', to: localePath('/analytics/mapa'), icon: 'mdi-view-grid-outline' },
]},
{ key: 'investigaciones', to: localePath('/investigaciones'), icon: 'mdi-magnify-scan', children: [
  { key: 'tvciudad', to: localePath('/investigaciones/tv-ciudad'), icon: 'mdi-television-classic' },
  { key: 'invCasinos', to: localePath('/investigaciones/casinos'), icon: 'mdi-slot-machine-outline' },
  { key: 'invCasinosCortesia', to: localePath('/investigaciones/casinos-cortesia'), icon: 'mdi-cards-playing-outline' },
  { key: 'invIm', to: localePath('/investigaciones/intendencia-montevideo'), icon: 'mdi-city-variant-outline' },
  { key: 'invEmpresas', to: localePath('/investigaciones/empresas-senaladas'), icon: 'mdi-domain-off' },
  { key: 'invAsse', to: localePath('/investigaciones/asse-ambulancias'), icon: 'mdi-ambulance' },
  { key: 'invSaturno', to: localePath('/investigaciones/frigorifico-saturno'), icon: 'mdi-cow' },
]},
```
Add the new child `nav.*` labels in Task 2's scope (fold in: `invCasinos`, `invCasinosCortesia`, `invIm`, `invEmpresas`, `invAsse`, `invSaturno` — reuse existing hub card titles where sensible). `isActive` for a parent = own route OR any child active.

- [ ] **Step 2: bar rendering** — in `.topnav`, for a `visibleNav` item WITH `children`, render a `v-menu` activator button (chevron) + a `v-list` of child `v-list-item`s (same pattern as the account menu). Item WITHOUT children renders the existing link. Add `hasChildren`/`groupActive(n)` helpers.
- [ ] **Step 3: overflow rendering** — in the "Más" `v-list`, an `overflowNav` item WITH children renders a `v-list-group` (activator title + child items); without children stays a `v-list-item`.
- [ ] **Step 4: measuring rail** — render group items in the rail as label + chevron span so the fit math accounts for the wider activator.
- [ ] **Step 5: drawer rendering** — for items WITH children, render a native `<details class="drawer__group">` with a `<summary>` (icon + label + chevron) and the child links inside (`.drawer__link` indented); default-open when a child is active. Items without children unchanged.
- [ ] **Step 6: verify** — dev-server + browser screenshot at ≥1200px (both dropdowns visible, open Análisis → 7 items incl. Errores de carga; open Investigaciones → 7 items incl. TV Ciudad), at ~1000px (overflow nested submenu works), and mobile drawer (<900px, `<details>` groups expand). Confirm links navigate and active state highlights the parent. es + en.
- [ ] **Step 7: commit** — `git commit -m "feat(nav): collapse analytics + investigations into two dropdowns; unhide TV Ciudad"`

---

### Task 9: full verification + finish

- [ ] **Step 1:** Targeted `tsc --noEmit` clean on all changed `.ts`/`.vue` server + shared files.
- [ ] **Step 2:** Dev-server smoke: GET each of `/analytics`, `/analytics/errores-carga`, `/analytics/como-reportar`, `/analytics/anomalies?category=error-carga` → 200, and the `/en/...` variants.
- [ ] **Step 3:** Browser screenshots: hub, errores-carga (with Reportar dialog open), como-reportar, anomalies with category chips, nav dropdowns (desktop + mobile). Attach to the branch.
- [ ] **Step 4:** Update memory (`gastos-gub-provider-anomalies` or a new note) with the category-filter + errores-carga surface.
- [ ] **Step 5:** `finishing-a-development-branch` skill to decide merge/PR.

## Self-Review

**Spec coverage:** #1 errores-carga → Task 5; #2 report guide → Tasks 3+4; #3 category filter → Tasks 1+7; #4 hub → Task 6; #5 nav dropdown → Task 8; API/i18n → Tasks 1+2. All covered.

**Placeholder scan:** the only deliberate "verify later" is the ACCE contact string (Task 4 Step 1) — flagged, with a defined fallback, not a silent TODO.

**Type consistency:** `parseCategories`/`AI_CATEGORY_VALUES` names match across Tasks 1/7/8; `category` param name identical in both endpoints and both pages; child `nav.*` keys added in Task 2 match those referenced in Task 8.
