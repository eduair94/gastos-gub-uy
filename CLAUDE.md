# CLAUDE.md — gastos-gub

Root brief for AI agents. Read this first, then the `context.md` in whichever directory you are
touching. Every major directory has one — they are the map; do not grep the whole tree instead.

## What this repo is

**Con la tuya, contribuyente** (live: [conlatuya.checkleaked.cc](https://conlatuya.checkleaked.cc),
canonical `gastos.gub.uy`) — a transparency platform over Uruguay's public-procurement open data (OCDS).
It ingests ~2.17M contract records since 2002 into MongoDB, normalises amounts across currencies,
reconciles government corrections, screens for price anomalies (statistics + an LLM second stage),
cross-references several external registries, and publishes a Nuxt dashboard, a public API, webhooks and
an MCP server.

## Two projects, one repo

| | Root package (`package.json`) | `app/` package (`app/package.json`) |
|---|---|---|
| Name | `gastos_gub-scraper` | `gastos_gub-dashboard` |
| Role | Ingestion, batch jobs, cron server, ops | Nuxt 3 dashboard **and** the live API (Nitro) |
| Runtime | `tsx`/`node`, CommonJS | Nuxt 3.19.3, ESM |
| Runs on prod as | PM2 app `gastos-gub-cronserver` | PM2 app `gastos-gub-dashboard` (port 3600) |

Both import [`shared/`](shared/) — the Mongo models + pure cross-layer helpers. `app/server` imports it
by **relative path**; `app/` client code uses the `#shared/*` alias.

```
OCDS feed ──► src/ (ingest) ──► MongoDB `releases` ──► src/jobs/ (rollups + anomalies + AI triage)
                                                             │
                                              precomputed collections
                                                             │
                                              app/server/api/** (Nitro, reads rollups)
                                                             │
                                    Nuxt dashboard · /api/v1 · webhooks · packages/mcp
```

## Directory map → context files

| Directory | Read before working in it |
|---|---|
| [`src/`](src/) — ingestion, services, cron server | [src/context.md](src/context.md) |
| [`src/jobs/`](src/jobs/) — analytical + enrichment jobs | [src/jobs/context.md](src/jobs/context.md) |
| [`shared/`](shared/) — models, connection, pure utils | [shared/context.md](shared/context.md) |
| [`app/`](app/) — Nuxt dashboard (frontend) | [app/context.md](app/context.md) |
| [`app/server/`](app/server/) — Nitro API | [app/server/context.md](app/server/context.md) |
| [`scripts/`](scripts/) — deploy, indexes, build assets | [scripts/context.md](scripts/context.md) |
| [`tests/`](tests/) — assertion scripts (no runner) | [tests/context.md](tests/context.md) |
| [`docs/`](docs/) — guides, specs, plans, screenshots | [docs/context.md](docs/context.md) |
| [`packages/mcp/`](packages/mcp/) — MCP server | [packages/mcp/README.md](packages/mcp/README.md) |
| UI design contract | [app/DESIGN.md](app/DESIGN.md) — **read before any UI change** |

## Commands

```bash
# Dashboard (dev, http://localhost:3600)
npm --prefix app run dev
npm --prefix app run build          # prebuild enforces Node 18/20/22 + asset subsets

# Batch jobs (root) — `npm run` with no args lists them all
npm run detect-anomalies            # price screening
npm run reconcile-amendments        # fold gov corrections into base awards
npm run refresh-analytics           # supplier/buyer/insight/dashboard rollups
npm run ensure-indexes              # THE only thing that builds indexes (autoIndex is off)

# Tests — no framework; each file is a tsx program that exits non-zero on failure
npm test                            # tests/unit, pure only (skips *.verify.ts + credentialed)
npx tsx tests/unit/test-matcher.ts  # or run one directly
npm run test:integration            # needs a live MONGODB_URI

# Screenshots for docs/README (Playwright installed ad hoc — see the script header)
npm run screenshots
```

## Conventions (repo-wide)

- **Money:** every amount is `amount.primaryAmount` (UYU-normalised, `AMOUNT_CALCULATION_VERSION`). Never
  re-sum `awards.items.unit.value.amount` raw — that is the pre-normalisation number and the bug behind
  the legacy `precalculate-dashboard`/`populate-analytics` path. Cross-currency/cross-year comparisons
  go through [shared/utils/real-value.ts](shared/utils/real-value.ts).
- **Gov links** are always derived from `ocid` via [shared/utils/ocid.ts](shared/utils/ocid.ts), never
  from a release `id` (ids diverge on aclaración/ajuste records).
- **New Mongoose models** use the guarded form (`mongoose.models.X || mongoose.model('X', S)`), an
  explicit `{ collection }`, and add every field to **both** the interface and the Schema.
- **Indexes** exist only if [scripts/ensure-indexes.ts](scripts/ensure-indexes.ts) builds them —
  `autoIndex` is off. A `Schema.index()` alone does nothing.
- **Optional TS props** are written `?: T | undefined` (root tsconfig sets `exactOptionalPropertyTypes`).
- **UI:** gold = money, one logarithmic magnitude scale site-wide, es/en via i18n. The full contract is
  [app/DESIGN.md](app/DESIGN.md) — binding, not advisory.
- **File references in Markdown** use relative links so they stay clickable.

## Traps that cost a cycle

- **Concurrent sessions share one working tree.** Branches switch under you; a broad `git add` sweeps
  another session's uncommitted files. Check the branch, stage explicit paths, never `git add -A`.
- **Node 23+ breaks the Nuxt build** nondeterministically. Use 18/20/22 (`app/.nvmrc`);
  [scripts/check-node.mjs](scripts/check-node.mjs) hard-fails otherwise.
- **`.env` wins over shell env** — importing any model runs `dotenv config({ override: true })`. A stale
  shell var will not override `.env`; edit `.env`.
- **Long jobs must raise `MONGO_SOCKET_TIMEOUT_MS` before `connectToDatabase()`** or the 45s default
  kills the aggregation mid-flight.
- **Anomalies:** sort on `severityRank`, not the `severity` string; "recent" means `firstDetectedAt`,
  not `detectedAt` (which is restamped every run).
- **Never restore an inflated lump-sum total:** any job writing `release.amount` must check
  `hasVerifiedOverride()` and skip. See [line-total artifact](docs/superpowers/specs/).
- **No `npm test` framework.** Tests are standalone `tsx` scripts; discover them by listing `tests/`.
- The Express API under `src/api/**` and the `precalculate-dashboard`/`populate-analytics` scripts are
  **legacy/dead** — the live API is `app/server/api/**` and the live rollups are `src/jobs/refresh-*`.
- Contact-directory exports deliberately use Mongo cursors, 250-row serializers and one shared heavy
  export slot per dashboard worker ([app/server/utils/heavy-export.ts](app/server/utils/heavy-export.ts)).
  Do not restore a 50k-document `.lean()` array or ExcelJS `writeBuffer()` on a request path.

## Deploy

Push to `master` → GitHub Actions on a self-hosted runner **on the prod box** →
[scripts/deploy-dashboard.mjs](scripts/deploy-dashboard.mjs) builds to staging, health-checks, swaps
atomically, rolling-reloads two pm2 workers, and auto-rolls-back on failure. Full story: [docs/context.md](docs/context.md) and
[docs/guides/](docs/guides/).

## Verifying work in a test-less repo

- Root typecheck: `npx tsc --noEmit` (compiles `src/` + `shared/`).
- Lint the non-Nuxt half: `npx eslint src shared scripts tests` (config at `eslint.config.mjs`).
- Behaviour: add/run a `tsx` assertion script under `tests/unit/`.
- Live checks: `curl` the dev server on `:3600` (typecheck/build env can be broken while the server runs).
