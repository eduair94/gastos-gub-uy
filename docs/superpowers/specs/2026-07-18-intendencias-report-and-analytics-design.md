# Intendencias — investigation report + departmental analytics + a reusable report-generation flow

Date: 2026-07-18. Branch: `feat/sice-catalog-integration`.
Author decisions recorded here per the standing autonomy grant (working-style memory):
Eduardo wants judgement calls made and reported, not queued as questions. This
doc is the record of the calls; it is not an approval gate.

## Goal (from the request)

1. **Investigation report** on the *Intendencia de Montevideo* (IM): its fiscal
   deficit, the news around it, and every expense in the procurement data that
   looks **superfluous / unnecessary** given that financial situation. Same
   editorial flow as the casinos investigation.
2. **A reusable report-generation flow** ("un flujo de generación de informes en
   base a una temática") — generalise the one-off casinos process into a
   parameterised pipeline that, given a *theme + buyer*, researches, mines the
   DB, adversarially verifies, and emits the report's structured content.
3. **A departmental analytics page** for the 19 Intendencias: total & per-capita
   spending, year trends, comparisons — surfacing bad income distribution /
   waste ("mala distribución de ingresos, despilfarro").

Constraints: use Workflows + Artifact; follow the site framework (Nuxt 3 +
Vuetify sparingly), the `Con la tuya` design system (`app/DESIGN.md`, gold=money),
bilingual es/en, verify against the **live** DB, never fabricate a number.

## Non-negotiable data discipline (transparency product)

- Numbers come from the **live** DB (root `.env` `MONGODB_URI`), never the stale
  local mirror the dev server defaults to. Verify, don't assume.
- **Never a raw grand total.** A handful of corrupt-quantity records dominate
  sums (DESIGN.md: 3 records = 86% of the 30.9T). Headline money uses the
  **median** contract; any total is **plausibility-capped** and labelled as such.
  `amount.primaryAmount` (= unit×qty, UYU-normalised) is the field; cap the
  extreme tail before summing.
- **Every cited contract links to its official ficha** via `govSourceUrl(ocid)`
  — derived from `ocid`, never `id`. Every ledger row is individually checkable.
- "Superfluous" is an **editorial judgement stated as such**, evidenced by the
  contract's own category/description, not asserted as fact. The page says how
  the call was made and lets the reader open the source.

## Deliverable 1 — the report-generation flow (Workflow)

A saved, reusable Workflow: `.claude/workflows/report-generation.js`, invoked
with `args = { theme, buyerName, buyerId }`. Phases:

- **Research** (parallel, structured output each):
  - *Web* — the buyer's fiscal deficit (amount, year, cited source URL) + news of
    wasteful/superfluous spending + political context. (WebSearch/WebFetch.)
  - *DB mining* — connect live Mongo, aggregate the buyer's spend: capped total,
    median contract, by-year, top categories, top suppliers, and **candidate
    superfluous contracts** by discretionary-category heuristics (catering,
    events, publicity/marketing, vehicles, furniture, consultancy, hospitality,
    travel, high-unit-price non-essentials). Each candidate carries `ocid`,
    `idCompra`, amount, supplier, date, `govUrl`, and a `why`.
  - *Reference data* — INE census population for all 19 departments (cited) +
    the buyer's budget/deficit reference figures.
- **Verify** (pipeline per candidate): re-query the live DB for the cited `ocid`,
  confirm amount/supplier/date, judge genuinely-discretionary vs essential,
  assign final category + confidence. Unverified/essential candidates dropped.
- **Synthesise**: assemble the verified findings + web context into a structured
  content package (headline stats, category breakdown, verified ledger, source
  list, bilingual narrative draft) + the analytics-page data needs.

The workflow **returns JSON**; the human (me) verifies spot figures against the
live DB and edits the narrative to the site's wry register before shipping. The
workflow is the automated, adversarially-verified successor to the casinos
"query + manual verify" process — same flow, encoded and reusable per theme.

## Deliverable 2 — investigation pages (mirror casinos)

- **Content**: a new module `app/data/investigaciones-im.ts` (the main
  `investigaciones.ts` is already 629 lines — keep the IM dataset isolated,
  same shape: typed const arrays + `IM_CONTENT` bilingual object + accessor).
- **Page**: `app/pages/investigaciones/intendencia-montevideo.vue` — a
  comprehensive overview like `casinos.vue`: cover, KPI tiles (capped total,
  median, deficit, superfluous-share), the deficit vs spend context, category
  breakdown of discretionary spend (`InvHBars`), top discretionary suppliers,
  a **verified ledger** table of the most emblematic superfluous contracts (each
  row → ficha), methodology, sources, disclaimer. Reuse `inv-*` classes +
  `InvHBars`/`MoneyAmount`; no new CSS unless a new layout appears.
- **Hub**: add `cardIm` to the hub content + a card in
  `app/pages/investigaciones/index.vue`, and remove/replace the matching "soon"
  slot if present.
- **Artifact**: build `investigaciones/im-*.html` standalone mockup (design aid,
  untracked) and publish a Claude Artifact of the report.

## Deliverable 3 — departmental analytics page

- **Server**: `app/server/api/analytics/intendencias.get.ts` — live aggregation
  over `releases`, `$match` on the 19 `buyer.id`s (`80-1`..`98-1`), grouping per
  department: capped total spend, median contract, contract count, by-year, top
  categories. Returns `{ success, data }`. Cap the extreme tail before summing
  (same rule as everywhere). Per-capita is computed page-side from a static,
  cited `DEPARTMENT_POPULATION` map (INE census) since population isn't in the DB.
- **Page**: `app/pages/analytics/intendencias.vue` — template from
  `proveedores-anomalias.vue`: KPI row (total across all 19, national per-capita,
  #departments, Montevideo share), a **per-department table** (spend, per-capita,
  contracts, median) sortable, and `.pgrid` chart panels: `InvHBars` spend
  ranking, `InvHBars` **per-capita** ranking (the distribution-fairness lens),
  `YearBars` trend, `InvScatter` population-vs-spend. Methodology box explains
  the cap + the per-capita source. Every peso via `<MoneyAmount>`.
- **Nav**: one entry in `app/layouts/default.vue` `nav` computed
  (`{ key: 'intendencias', to: localePath('/analytics/intendencias'), icon: 'mdi-city-variant-outline' }`);
  `nav.intendencias` + `seo.intendencias` + page namespace in **both** locales.

## Per-capita & fairness methodology

Per-capita = capped department spend ÷ INE census population. This is the
headline fairness metric: it normalises Montevideo's dominance and exposes
departments spending far above/below the national per-capita line. Caveat shown
on the page: procurement coverage varies by department (some Intendencias
publish little to Compras Estatales — e.g. Lavalleja/Soriano have 0 priced
records), so a low per-capita can mean *under-reporting*, not thrift. State this;
don't let the chart imply completeness it doesn't have.

## Build order

1. Author + run the workflow → verified data package (figures, candidates,
   population). 2. Analytics server endpoint + page + nav/i18n/SEO. 3. IM
   investigation data module + page + hub card. 4. Standalone artifact + Artifact.
5. Verify end-to-end vs live DB (light/dark, es/en, 360px). 6. Commit.

## Risks / open calls

- **Outliers**: IM has a single ~1.8e11 UYU release. Cap by dropping the top
  plausibility-violating tail (per DESIGN.md); report the capped basis on the page.
- **"Superfluous" is editorial** — framed as judgement, evidenced, source-linked.
  Keep the register factual and wry, never accusatory beyond what the ficha shows.
- **Coverage gaps** across departments — disclosed on the analytics page.
- Deficit figure is external news → cite the source URL and date; if sources
  disagree, show the range and attribute.
