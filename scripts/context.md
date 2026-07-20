# scripts/ — operational and build scripts

The repo's one-shot CLI drawer: index migrations, DB export/import, the production deploy driver, generated-asset builders wired into the Nuxt `prebuild`, and live-feed diagnostics. **Recurring/scheduled work does NOT live here** — it lives in `../src/jobs/` and is scheduled by `../src/cronserver.ts`. 23 files, flat, no subdirectories; 11 have an npm alias in the root `package.json`, the rest are run with `npx tsx scripts/<f>.ts`. Nothing here is typechecked by `npm run build` (root `tsconfig.json` includes only `src/**/*` and `shared/**/*`).

## Map

| Path | Purpose |
| --- | --- |
| [ensure-indexes.ts](ensure-indexes.ts) | **The single source of truth for every index in the system** (Mongoose `autoIndex` is off). `INDEX_SPECS` for `releases` at :45–152 (each with a `rationale`), side-collection `createIndex` calls at :364+. Always `{background:true}`, skips existing, NEVER drops (redundant ones only reported). Raw `mongodb` MongoClient, not mongoose. |
| [deploy-dashboard.mjs](deploy-dashboard.mjs) | The production deploy. Lockfile mutex → force a Nuxt-supported Node → build to `app/.output-next` → smoke-boot on `SMOKE_PORT` → pm2 stop → atomic swap (`.output` ⇄ `.output-prev`) → health check → auto-rollback. Cross-platform (Linux 167 + Windows). Guarantees listed at :5–14. |
| [check-node.mjs](check-node.mjs) | 11 lines. Hard-fails on Node `<18` or `>=23` (Nuxt 3.x unsupported; Node ≥23 was the 2026-07-18 outage trigger). Run automatically by `app` `prebuild`. |
| [build-mdi-subset.mjs](build-mdi-subset.mjs) | Scans `app/` for `mdi-*` literals + Vuetify's internal aliases, emits `app/assets/fonts/mdi-subset.woff2` (:37) + `app/assets/scss/mdi-subset.scss` (:38). Both COMMITTED. `--check` (:43) fails when an icon used in source is absent from the committed subset. |
| [build-vuetify-utilities-subset.mjs](build-vuetify-utilities-subset.mjs) | Copies (never re-derives) the Vuetify utility rules the templates use out of `vuetify/lib/styles/utilities.css` → `app/assets/scss/vuetify-utilities-subset.css` (:31), plus `app/assets/scss/vuetify-base.css` (:32). `--check` at :36. |
| [build-og-image.mjs](build-og-image.mjs) | Renders `app/public/og-default.png` by screenshotting inline HTML with the local Chrome (`CHROME_PATH` or a probe list). One-shot; output committed. `useSeo()` had always emitted an `og:image` that 404'd. |
| [build-uruguay-geo.mjs](build-uruguay-geo.mjs) | One-shot geometry baker: geoBoundaries URY ADM1 (pinned commit `9469f09`) → Douglas-Peucker → Web-Mercator → `app/assets/geo/uruguay-dept-paths.ts`, keyed by Intendencia `buyer.id` `80-1`…`98-1`. Needs network once; runtime never fetches. |
| [capture-screenshots.mjs](capture-screenshots.mjs) | Regenerates `docs/screenshots/*.png` from the LIVE site with Playwright. Defaults: `--base https://conlatuya.checkleaked.cc` (:26), `--out <cwd>/docs/screenshots` (:27). Playwright is deliberately NOT a repo dependency. No npm alias. |
| [export-database.ts](export-database.ts) | Full DB export: `mongodump` and/or custom JSON (`--format mongodump\|json\|both`, `--output/-o`, `--collections a,b`, `--no-indexes`, `--no-compress`, `--help`; parsing at :296+). Also writes indexes + metadata. |
| [import-database.ts](import-database.ts) | Counterpart importer (`mongorestore` / json / `auto` format detection at :61-63), optional index recreation (:85-86). |
| [create-text-index.ts](create-text-index.ts) | Creates the `comprehensive_text_search` `$text` index on `releases` (:107). Drops pre-existing text indexes first (:39, :46). |
| [update-text-index-for-exact-search.ts](update-text-index-for-exact-search.ts) | **Drops** the existing text index (:48) and recreates it as `comprehensive_text_search_exact` with `default_language:'none'` (:105-106) so stemming is off and exact phrases match. This name must stay in sync with `shared/models/release.ts`. |
| [sync-year-zip.ts](sync-year-zip.ts) | Imports ONE year from `db/5203/extracted/<year>` (:26) via the legacy `ReleaseUploader` — the still-usable form of the bulk/zip ingest path. Exits 1 without `mongoUri`. |
| [audit-recent-sync.ts](audit-recent-sync.ts) | Samples recently-synced releases, re-fetches from the live OCDS feed via `ReleaseRSSFetcher` and reports %STALE + a changed-field breakdown + count of non-final releases the weekly reconcile will refresh. Run ON the server. |
| [check-release.ts](check-release.ts) | Diagnose ONE release: in Mongo? fresh? still matching the live API? Accepts a release id, an ocid, or a free-text fragment matched against supplier/buyer/title. |
| [audit-unexplained-anomalies.ts](audit-unexplained-anomalies.ts) | One-off: dumps FULL context for every anomaly with `aiVerdict.explainable === 'no'` (line total, award total, baseline span, whether características exist under a case-insensitive `canonicalUnit` match) to JSON. |
| [campaign-stats.ts](campaign-stats.ts) | Read-only cold-email funnel over `campaign_sends`: 9-status funnel overall + per rubro, plus a best-effort signup count. `--campaign=<campaignId>`. |
| [migrate-dates.ts](migrate-dates.ts) | One-shot string→Date migration on `releases` (top-level `date`, `awards[].date`, document `datePublished`, tender periods). Raw MongoClient; reads `MONGODB_URI` + `MONGODB_DB` (:7-8). |
| [check-specific-entry.ts](check-specific-entry.ts) | LEGACY one-off debug. Hardcodes ObjectId `6894e567fbc85dc56ba8c864` (:8) + `AMOUNT_CALCULATION_VERSION = 2` (:25) to explain the amount-migration query. No alias — don't extend. |
| [explain-query-logic.ts](explain-query-logic.ts) | LEGACY one-off debug, same hardcoded ObjectId (:9). Prints the amount-migration query conditions. |
| [create-supplier-id-index.ts](create-supplier-id-index.ts) | LEGACY/DEAD. Creates a single-field `awards_suppliers_id_1`. Superseded by the compound `awards.suppliers.id_1_date_-1` in `ensure-indexes.ts` (same prefix). Untouched since Aug 2025. |
| [populate-anomalies.ts](populate-anomalies.ts) | **DEAD — 0 bytes.** Replaced by `npm run detect-anomalies` (`src/jobs/detect-anomalies.ts`). |

## Entry points / how to run

```bash
# Indexes (run this after adding any new lead-field query anywhere)
npx tsx scripts/ensure-indexes.ts --dry-run     # print the plan, touch nothing
npm run ensure-indexes                          # build in background

# Deploy the Nuxt dashboard
npm run deploy:dashboard:dry                    # build + verify + smoke, no swap
npm run deploy:dashboard                        # full atomic deploy + health check

# Generated assets (regenerate + COMMIT the output)
npm run build:mdi-subset      && npm run check:mdi-subset
npm run build:vuetify-utilities && npm run check:vuetify-utilities
npm run build:og-image                          # needs local Chrome
npm run build-uruguay-geo                       # needs network once

# Text index (search)
npm run create-text-index
npm run update-text-index-exact                 # DROPS then recreates — see gotchas

# DB export / import  (note the `--` before flags)
npm run export-db -- --format json --output ./backup
npm run import-db -- --help

# Diagnostics / one-offs (no npm alias)
npx tsx scripts/check-release.ts adjudicacion-496833
npx tsx scripts/check-release.ts URBITEL
npx tsx scripts/audit-recent-sync.ts 5 300
npx tsx scripts/audit-unexplained-anomalies.ts
npx tsx scripts/campaign-stats.ts --campaign=promo1
npx tsx scripts/sync-year-zip.ts 2025
npx tsx scripts/migrate-dates.ts

# Screenshots (Playwright installed ad hoc)
npm i -D playwright && npx playwright install chromium
node scripts/capture-screenshots.mjs --base http://localhost:3600 --out /tmp/shots
```

## Conventions

- **CLI shape**: `#!/usr/bin/env tsx` (or `node` for `.mjs`) + a block comment stating WHY and the exact usage line, then flag parsing. See [ensure-indexes.ts](ensure-indexes.ts):1-15, [deploy-dashboard.mjs](deploy-dashboard.mjs):1-17, [campaign-stats.ts](campaign-stats.ts):1-10.
- **Anything destructive or generated ships a safe mode**: `--dry-run` ([ensure-indexes.ts](ensure-indexes.ts):337, [deploy-dashboard.mjs](deploy-dashboard.mjs):51) or `--check` ([build-mdi-subset.mjs](build-mdi-subset.mjs):43, [build-vuetify-utilities-subset.mjs](build-vuetify-utilities-subset.mjs):36). Follow this for new scripts.
- **Generated assets are COMMITTED, not built at deploy time** (`mdi-subset.woff2/.scss`, `vuetify-utilities-subset.css`, `vuetify-base.css`, `uruguay-dept-paths.ts`, `og-default.png`). The `--check` variants in `app/package.json`'s `prebuild` are what stop a stale committed asset shipping.
- **Never drop an index in a migration** — [ensure-indexes.ts](ensure-indexes.ts):7-10 only *reports* redundancy and always builds `{background:true}` ([ensure-indexes.ts](ensure-indexes.ts):240). The two text-index scripts are the deliberate exception.
- **Every new index spec goes in `INDEX_SPECS`** with a `name`, `key` and a prose `rationale` naming the query it unblocks ([ensure-indexes.ts](ensure-indexes.ts):50-58). Adding `.index()` to a schema in `shared/models/` does nothing.
- **Two DB-access styles coexist**: raw `mongodb` `MongoClient` for pure migrations ([ensure-indexes.ts](ensure-indexes.ts):18, [migrate-dates.ts](migrate-dates.ts):2) vs `connectToDatabase()` + models from `shared/` for anything that needs the schemas ([audit-recent-sync.ts](audit-recent-sync.ts):16-17, [campaign-stats.ts](campaign-stats.ts):11-14). Pick raw MongoClient when you don't want the `shared/config` dotenv side effect.
- **Live-feed diagnostics go through `ReleaseRSSFetcher`** (`src/services/release-rss-fetcher.ts`) — the single gateway to comprasestatales; [audit-recent-sync.ts](audit-recent-sync.ts):18 and [check-release.ts](check-release.ts):20 both instantiate it with their own UA string.
- **Recurring work belongs in `src/jobs/`**, exposed as an `npm run <job>` alias and spawned by `src/cronserver.ts` via `runJobProcess('jobs/<name>')`. Do not add a cron-shaped script here.

## Gotchas

- **`npm run build` (root `tsc`) does not typecheck this directory.** `tsconfig.json` `include` is only `src/**/*` + `shared/**/*`. A type error in any `scripts/*.ts` surfaces only when you run it under `tsx`.
- **`.env` override trap.** `shared/config.ts` calls dotenv with `{ override: true }`, so for any script that imports from `shared/` (models, `connectToDatabase`, `mongoUri`), the root `.env` **beats an inline/shell `MONGODB_URI`**. [ensure-indexes.ts](ensure-indexes.ts):20 calls plain `config()` (no override) and reads `process.env` directly (:23), so it *does* honour the shell env — the two halves of `scripts/` behave differently. Check which one you're running before assuming which DB you hit.
- **`ensure-indexes.ts` hardcodes the database name**: `DB_NAME = 'gastos_gub'` and `COLLECTION = 'releases'` at [ensure-indexes.ts](ensure-indexes.ts):24-25. A `MONGODB_URI` pointing at a different DB is ignored for DB selection — it will build indexes in `gastos_gub` on that host.
- **`update-text-index-exact` DROPS the live text index before recreating it** ([update-text-index-for-exact-search.ts](update-text-index-for-exact-search.ts):48). On a ~2.1M-doc collection, `$text` search is degraded until the rebuild completes. The name it creates, `comprehensive_text_search_exact` (:105), must match `shared/models/release.ts` or mongoose tries to create a second text index and Mongo rejects it (one text index per collection).
- **npm swallows flags without `--`**: use `npm run export-db -- --format json`, not `npm run export-db --format json`. (`export-database.ts`'s own help text at :370 shows the wrong form.)
- **`export-database.ts` loads a whole collection into memory** — `collection.find({}).toArray()` at [export-database.ts](export-database.ts):209. Do NOT run `--format json` against `releases` (~2.2M docs); use `mongodump`.
- **`import-database.ts` index restore is fragile**: it spreads the whole `listIndexes` doc into `createIndex` options, passing `key`/`v`/`ns` through. Prefer re-running `npm run ensure-indexes` after a restore.
- **The deploy health check is not a ping.** [deploy-dashboard.mjs](deploy-dashboard.mjs):44 hits `/api/contracts?limit=1&hasAmount=true` and requires HTTP 200 **and** `json.data.contracts.length >= 1` (:203-204). A server that boots fine but has a bad Mongo URI in `app/.env` fails smoke and the deploy aborts with the live site untouched.
- **The smoke test reads `app/.env`, not your shell env** ([deploy-dashboard.mjs](deploy-dashboard.mjs):293 `parseEnvFile(ENV_FILE)`). Exporting a good `MONGODB_URI` in the shell will not rescue a stale `app/.env`.
- **Rollback window is short**: `.output-prev` is deleted immediately after the post-deploy health check passes ([deploy-dashboard.mjs](deploy-dashboard.mjs):406). After a successful deploy there is nothing to roll back to.
- **The deploy lock is stealable**: after 30 min (`STALE_LOCK_MS`, [deploy-dashboard.mjs](deploy-dashboard.mjs):48) or when a same-host holder pid is dead ([deploy-dashboard.mjs](deploy-dashboard.mjs):80-86). A hung deploy on a *different* host is only released by the 30-minute backstop.
- **Exit code 4 = build-config regression**: [deploy-dashboard.mjs](deploy-dashboard.mjs):275-278 aborts if the staging dir stayed empty while the live `.output` mtime changed — i.e. `NITRO_OUTPUT_DIR` is no longer honored by `app/nuxt.config.ts`. Don't "simplify" that config block.
- **This box's Node is unsupported for building.** `app/package.json` declares `engines.node ">=18 <23"` and [check-node.mjs](check-node.mjs):7 hard-fails outside it, so `npm --prefix app run build` refuses to run on Node ≥23. The deploy script instead relocates to a supported Node (`DEPLOY_NODE`, else scans `NVM_HOME`/`NVM_DIR`, [deploy-dashboard.mjs](deploy-dashboard.mjs):131-144).
- **Adding an `mdi-*` icon or a Vuetify utility class without regenerating breaks the Nuxt build** — `app` `prebuild` runs both `--check` scripts. That failure is intentional; fix it by running the builder and committing the regenerated asset.
- **`audit-unexplained-anomalies.ts` header lies about its output path**: the comment says `scratchpad/unexplained-context.json`, the code writes `./scratchpad-unexplained-context.json` (or `$AUDIT_OUT`).
- **`build-og-image.mjs` needs a real Chrome** on the box (`CHROME_PATH` or its hardcoded probe list) — it will not run in a bare container. **`capture-screenshots.mjs` needs an ad-hoc Playwright install** and defaults to the LIVE site, not localhost.
- **Dead/legacy, do not extend**: `populate-anomalies.ts` (0 bytes), `create-supplier-id-index.ts` (redundant with `ensure-indexes.ts`), `check-specific-entry.ts` + `explain-query-logic.ts` (both hardcode the same ObjectId `6894e567fbc85dc56ba8c864`).
- **Shared working tree**: multiple agent sessions share one checkout. Check the branch first, stage explicit paths, never `git add -A`.

## Related

- [../src/context.md](../src/context.md) — ingestion + cron scheduler (`cronserver.ts`, uploaders, `amount-calculator`).
- [../src/jobs/context.md](../src/jobs/context.md) — the scheduled batch/analytics jobs these scripts complement.
- [../shared/context.md](../shared/context.md) — models, connection singleton, and why `autoIndex` is off (the reason `ensure-indexes.ts` exists).
- [../app/context.md](../app/context.md) — the Nuxt app this directory builds assets for and deploys.
- [../tests/context.md](../tests/context.md) — the tsx-assertion test suite (there is no test runner and no `npm test`).
- [../CLAUDE.md](../CLAUDE.md) — repo-wide instructions.
