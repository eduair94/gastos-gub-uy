<div align="center">

# Con la tuya, contribuyente

**Every peso the Uruguayan state spends, traceable.**

A transparency platform over Uruguay's public-procurement open data (OCDS). It covers ~2.17M contract
records since 2002, 42,510 suppliers and 397 buying agencies. It publishes them as a dashboard, a
public API and an MCP server.

[**Live site → conlatuya.checkleaked.cc**](https://conlatuya.checkleaked.cc) ·
[API docs](https://conlatuya.checkleaked.cc/docs) ·
[OpenAPI](https://conlatuya.checkleaked.cc/openapi.json) ·
[llms.txt](https://conlatuya.checkleaked.cc/llms.txt)

![Home](docs/screenshots/home.png)

</div>

---

## Table of contents

- [What this is](#what-this-is)
- [Feature tour](#feature-tour)
- [Repository map](#repository-map)
- [Quick start](#quick-start)
- [The data pipeline](#the-data-pipeline)
- [Public API, webhooks and MCP](#public-api-webhooks-and-mcp)
- [Deployment](#deployment)
- [Testing](#testing)
- [Documentation index](#documentation-index)
- [For AI agents](#for-ai-agents)
- [License](#license)

---

## What this is

Uruguay publishes its procurement data as [OCDS](https://standard.open-contracting.org/) releases on
`catalogodatos.gub.uy` and `comprasestatales.gub.uy`. The raw feed is open, but you cannot use it as it
comes. It ships multi-GB yearly ZIPs. Amounts need multi-currency normalisation. Corrections never
rewrite the record they correct. Nothing answers "is this price normal?".

This repo turns that feed into a record a journalist, a supplier or a citizen can use:

| | |
|---|---|
| **Ingest** | Streams the yearly OCDS ZIPs and the daily RSS feed into MongoDB. Normalises every award into a comparable UYU amount with historical BCU rates (UYI, USD). |
| **Reconcile** | Folds award-amendment releases back into the base award. The government never rewrites the original, so uncorrected totals are wildly inflated. |
| **Screen** | Compares every award line against a 36-month robust (log-median) price reference for the same catalogue article, currency and unit, and flags the outliers. A second-stage LLM triage then separates real overprice signals from data-loading errors. |
| **Cross-reference** | Joins the SICE article catalogue, the MIEM industrial registry (DEI), governing-party mandates and documented corruption cases against the same contract IDs. |
| **Publish** | A Nuxt 3 dashboard, a versioned public REST API with API keys and webhooks, and an MCP server, so an LLM can query it directly. |
| **Alert** | Suppliers subscribe to open tenders by rubro or keyword. Alerts fan out over email, web push, Telegram and an in-app inbox. |

Every figure comes from official open data and links back to its source record on
`comprasestatales.gub.uy`.

---

## Feature tour

### Search and browse the whole spending record

Contracts, suppliers, buying agencies and products each get a filterable index and a detail page. One
logarithmic gold bar shows every amount site-wide, so you compare magnitudes without reading digits.
The rule lives in [app/DESIGN.md](app/DESIGN.md).

| Contracts | Contract detail |
|---|---|
| ![Contracts](docs/screenshots/contratos.png) | ![Contract detail](docs/screenshots/contrato-detalle.png) |

| Suppliers | Supplier profile |
|---|---|
| ![Suppliers](docs/screenshots/proveedores.png) | ![Supplier profile](docs/screenshots/proveedor-detalle.png) |

| Buying agencies | Products / catalogue |
|---|---|
| ![Buyers](docs/screenshots/organismos-compradores.png) | ![Products](docs/screenshots/productos.png) |

### Price-anomaly screening

A flag is **not an accusation**. The page says so and explains the method inline. You filter by
severity, by LLM triage verdict (`sin explicación`, `a revisar`, `con explicación`) and by error type.

![Anomalies](docs/screenshots/anomalias.png)

A dedicated page separates *data-loading errors* from real signals. Any visitor reports a record that
disagrees with the official page:

![Load errors](docs/screenshots/errores-carga.png)

### Analytics

| Spending by governing party (SVG choropleth) | Spending by organism group |
|---|---|
| ![Parties](docs/screenshots/partidos.png) | ![Organisms](docs/screenshots/organismos.png) |

The section also holds a departmental map, an analytics hub and per-mandate attribution: which
president or intendente governed the agency in the year of the spending.

### Investigations and documented cases

Long-form investigations run on the same database. *Curros en evidencia* collects cases from the press,
audit bodies and the courts. Each case carries its sources and legal status, cross-checked one by one
against the official data.

| Investigations | Curros |
|---|---|
| ![Investigations](docs/screenshots/investigaciones.png) | ![Curros](docs/screenshots/curros.png) |

### Open tenders + bid intelligence (for suppliers)

Active calls show their pliegos, items and deadlines. A bid estimate answers "how much should I bid to
win?". It uses the unit prices the state awarded before in the same rubro, unit-matched and expressed
as percentiles.

![Open call](docs/screenshots/llamado-detalle.png)

Save a call, or subscribe to a rubro or keyword watch to receive the alerts.

### Developer platform

Self-service API keys, interactive docs, webhooks and an official MCP server. Details:
[Public API, webhooks and MCP](#public-api-webhooks-and-mcp).

![Developers](docs/screenshots/developers.png)

### Mobile

The whole site is responsive. You install it as a PWA.

<div align="center">
<img src="docs/screenshots/mobile-home.png" width="30%" alt="Mobile home">
<img src="docs/screenshots/mobile-llamados.png" width="30%" alt="Mobile open calls">
<img src="docs/screenshots/mobile-anomalias.png" width="30%" alt="Mobile anomalies">
</div>

> The screenshots come from the live site. The full set (28 views) is in
> [docs/screenshots/](docs/screenshots/). Refresh it with
> `node scripts/capture-screenshots.mjs`.

---

## Repository map

The repo holds two npm projects: the **root** package (ingestion, jobs, cron server, ops) and **`app/`**
(the Nuxt dashboard, which also serves the API). They share `shared/` by relative import.

| Path | What lives there | Context file |
|---|---|---|
| [`src/`](src/) | Ingestion, scrapers, uploaders, services, the cron server | [src/context.md](src/context.md) |
| [`src/jobs/`](src/jobs/) | Every analytical / enrichment job: anomalies, reconciliation, rollups, open-call sync, AI triage, alerts, webhooks | [src/jobs/context.md](src/jobs/context.md) |
| [`shared/`](shared/) | Mongoose models, DB connection, alert channels, matching, cross-layer utils — imported by **both** projects | [shared/context.md](shared/context.md) |
| [`app/`](app/) | Nuxt 3 + Vuetify dashboard: pages, components, composables, stores, i18n, PWA | [app/context.md](app/context.md) |
| [`app/server/`](app/server/) | Nitro API: internal `/api/*` routes and the public `/api/v1/*` surface | [app/server/context.md](app/server/context.md) |
| [`packages/mcp/`](packages/mcp/) | `@gastos-gub/mcp` — MCP server over the public API | [packages/mcp/README.md](packages/mcp/README.md) |
| [`scripts/`](scripts/) | Deploy, index management, build-time asset subsetting, one-off DB tools | [scripts/context.md](scripts/context.md) |
| [`tests/`](tests/) | Plain `tsx` assertion scripts (unit / integration / performance) | [tests/context.md](tests/context.md) |
| [`docs/`](docs/) | Guides, design specs and implementation plans, screenshots, archive | [docs/context.md](docs/context.md) |
| [`investigaciones/`](investigaciones/) | Standalone HTML investigation artifacts | — |

Root config: [`ecosystem.config.js`](ecosystem.config.js) (PM2 apps),
[`cronserver.config.js`](cronserver.config.js), [`.env.example`](.env.example) — every environment
variable, documented inline.

---

## Quick start

**Requirements:** use Node 18, 20 or 22, and a MongoDB instance. Node 23+ breaks the Nuxt 3.19 build
nondeterministically; [scripts/check-node.mjs](scripts/check-node.mjs) hard-fails on it, and
[`app/.nvmrc`](app/.nvmrc) pins the version.

```bash
git clone https://github.com/eduair94/gastos-gub-uy.git
cd gastos-gub-uy

# 1. root project (ingestion + jobs)
npm install
cp .env.example .env          # set MONGODB_URI at minimum

# 2. dashboard
npm --prefix app ci
cp .env app/.env              # the app reads its own .env

# 3. run the dashboard (http://localhost:3600)
npm --prefix app run dev
```

Populate an empty database before the dashboard shows anything:

```bash
npm run extract                  # discover the yearly OCDS ZIP URLs -> urls.json
npm run upload                   # stream releases into MongoDB
npm run ensure-indexes           # create every index the queries assume
npm run reconcile-amendments     # fold award amendments into their base award
npm run precalculate-dashboard   # dashboard_metrics
npm run refresh-analytics        # supplier / buyer / insight rollups
npm run detect-anomalies         # price-outlier screening
```

`npm run` with no arguments lists every job. Per-job detail:
[src/jobs/context.md](src/jobs/context.md).

---

## The data pipeline

```
catalogodatos.gub.uy (yearly OCDS ZIPs)     comprasestatales.gub.uy (RSS + HTML)
             │                                          │
             ▼                                          ▼
      src/extract.ts                        src/services/release-rss-fetcher.ts
      src/upload-releases.ts                src/uploaders/release-uploader-new.ts
             │                                          │
             └──────────────► MongoDB `releases` ◄──────┘
                                    │
        ┌───────────────────────────┼──────────────────────────┐
        ▼                           ▼                          ▼
  reconcile-amendments        detect-anomalies           refresh-analytics
  (corrections folded in)     + score-anomalies-ai       refresh-organism-groups
                              (Gemini triage)            refresh-dept-indicators
                                    │                    precalculate-dashboard
                                    ▼                          │
                          `anomalies` collection               ▼
                                    │                  precomputed rollups
                                    └──────────┬───────────────┘
                                               ▼
                              app/server/api/**  (Nitro, reads rollups)
                                               ▼
                                Nuxt dashboard · /api/v1 · webhooks · MCP
```

Five enrichment layers join onto the same records: the **SICE** article catalogue (91k articles,
5-level rubro tree), the **MIEM/DEI** industrial registry (joined by RUT), item features scraped from
the government HTML, **political mandates**, and the documented-case ledger behind `/curros`.

[`src/cronserver.ts`](src/cronserver.ts) holds the schedule and runs as PM2 app
`gastos-gub-cronserver`. It staggers ingest, analytics, anomaly detection, weekly reconciliation,
open-call sync, deadline reminders, digests and webhook dispatch. Every job runs in
`America/Montevideo`. Details: [docs/guides/cronserver.md](docs/guides/cronserver.md).

---

## Public API, webhooks and MCP

The dashboard's own routes live under `/api/*`. The **stable, versioned, key-authenticated** surface is
`/api/v1/*`:

```bash
curl -H "x-api-key: gk_live_xxx" \
  "https://conlatuya.checkleaked.cc/api/v1/tenders/changes?since=2026-07-01"
```

- **Keys** — created from your account, prefixed `gk_live_`, hashed at rest.
- **Polling** — `/api/v1/{tenders,awards,anomalies}/changes` are cursor-paginated and designed for
  Zapier / n8n-style "something new" triggers.
- **Webhooks** — subscribe an HTTPS URL, receive HMAC-signed events.
- **MCP** — [`packages/mcp`](packages/mcp/) exposes the same data as tools to Claude and other MCP clients.
- **Spec** — [`/openapi.json`](https://conlatuya.checkleaked.cc/openapi.json), rendered with Scalar at
  [`/docs`](https://conlatuya.checkleaked.cc/docs).

---

## Deployment

Production is a Linux server, called *167* throughout the docs. It runs two PM2 apps from
[`ecosystem.config.js`](ecosystem.config.js): the dashboard on port 3600 and the cron server.

A push to `master` triggers [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) on a
**self-hosted runner installed on the prod box**. The runner dials out to GitHub, so the box needs no
inbound port. [`scripts/deploy-dashboard.mjs`](scripts/deploy-dashboard.mjs) runs the deploy itself: it
builds into a staging output, health-checks it, swaps atomically, and **rolls back automatically** if
the new build fails. A GitHub concurrency group and the script's own lockfile serialise concurrent
deploys.

Setup notes: [docs/guides/runner-setup-167.md](docs/guides/runner-setup-167.md) ·
[docs/guides/credenciales.md](docs/guides/credenciales.md).

---

## Testing

There is no test framework. Tests are plain `tsx` scripts that assert and exit non-zero on failure.
`npm test` runs the pure unit set. Run a single script directly:

```bash
npx tsx tests/unit/test-lumpsum-artifacts.ts
npx tsx tests/unit/openapi.test.ts
npx tsx tests/integration/test-dashboard.ts     # needs a live MONGODB_URI
```

`tests/unit/` is pure (no DB, no network); `tests/integration/` and `tests/performance/` need a
database. See [tests/context.md](tests/context.md).

---

## Documentation index

| Doc | Contents |
|---|---|
| [app/DESIGN.md](app/DESIGN.md) | The binding design contract: gold = money, the peso magnitude rule, typography, component rules |
| [docs/guides/](docs/guides/) | Operational guides: cron server, MongoDB ingestion, RSS fetcher, web uploader, credentials, prod runner, anomaly heuristics |
| [docs/superpowers/specs/](docs/superpowers/specs/) | Design specs — the *what* and *why* of each feature, dated |
| [docs/superpowers/plans/](docs/superpowers/plans/) | Step-by-step implementation plans derived from those specs |
| [docs/archive/](docs/archive/) | Superseded historical documents, kept for provenance |
| [docs/screenshots/](docs/screenshots/) | Live-site captures used in this README |

---

## For AI agents

Work in this repo without reading everything:

- **[CLAUDE.md](CLAUDE.md)** / **[AGENTS.md](AGENTS.md)** — root brief: architecture, commands,
  conventions, and the traps that cost a wasted cycle.
- **`context.md` in every major directory** — read the one for the directory you touch instead of
  grepping the tree. Each map lists what every file does, how to run it, what to change for a given
  task, and what will bite you.
- **[app/public/llms.txt](app/public/llms.txt)** — the public-site equivalent, for crawlers and LLMs.

---

## License

MIT. The procurement data is Uruguayan government open data. This project neither owns nor alters it.
