# src/ — ingestion, services and batch entrypoints

Everything that gets Uruguayan OCDS procurement data **into** Mongo and turns it into the precomputed collections the Nuxt app reads. One long-running process ([cronserver.ts](cronserver.ts), pm2) schedules 13 cron jobs and spawns each heavy one as a child process from [jobs/](jobs/). Nothing here serves HTTP to users — the real API is `app/server/api/**`. A large part of this tree is dead legacy (the 2025 zip-scrape path, `src/api/**`); the map below marks it.

## Map

### Live ingestion + scheduling

| path | purpose |
|---|---|
| [cronserver.ts](cronserver.ts) | 1300-line Express scheduler + control plane. 13 `cron.schedule` calls (`:645`–`:811`, all tz `America/Montevideo`), child spawner `runJobProcess()` `:137`, mutual-exclusion guard `busyWith()` `:121`, HTTP triggers/status routes, `start(port = 3002)` `:1286`. Runs `ReleaseUploaderNew` **in-process**; everything else is a spawned child. |
| [uploaders/release-uploader-new.ts](uploaders/release-uploader-new.ts) | LIVE RSS/API ingestion → `releases`. 4 public methods (`:17-20`): `uploadReleasesFromWeb` `:34`, `uploadCurrentMonthFromWeb` `:119`, `uploadLastSevenDaysFromWeb` `:165`, `reconcileNonFinalReleases(monthsBack=5)` `:676`. Freshness diff `filterReleasesNeedingSync()` `:637`. `require.main` block `:847`. |
| [services/release-rss-fetcher.ts](services/release-rss-fetcher.ts) | Where raw OCDS enters. `comprasestatales.gub.uy/ocds/rss/{year}/{MM}` → xml2js → `{id,title,link,publishDate}`; `fetchReleaseData(url)` GETs the per-release JSON. |
| [utils/amount-calculator.ts](utils/amount-calculator.ts) | THE money computation. `calculateTotalAmounts()` `:153`, `AMOUNT_CALCULATION_VERSION = 2` `:58`, `FALLBACK_RATES` `:46`, `createAmountUpdateQuery()` `:250`, `needsAmountUpdate()` `:260`. Live FX from two third-party endpoints. |
| [add-missing-amounts.ts](add-missing-amounts.ts) | Backfill: recompute `amount` where `amount.version != 2`. Skips `verifiedOverride` docs. `npm run add_amounts`. |
| [populate-filters.ts](populate-filters.ts) | LIVE (spawned at the tail of the analytics cron). Rebuilds `filter_data` from `releases`. Sets `MONGO_SOCKET_TIMEOUT_MS` to 30 min before connecting (`:13-16`). |

### jobs/ — the batch layer (see per-file notes)

| path | purpose |
|---|---|
| [jobs/](jobs/) | 25 top-level `.ts` entrypoints + 12 library subdirs. Each entrypoint connects, does one thing, exits. |
| [jobs/detect-anomalies.ts](jobs/detect-anomalies.ts) | Price baselines (`item_price_baselines`) + robust log modified-z scoring → `anomalies`. Exports `anomalyContentVersion()` `:231` (content-hash `dataVersion`) and `rescoreReleaseIds()`. **Binary-classified file — see Gotchas.** |
| [jobs/score-anomalies-ai.ts](jobs/score-anomalies-ai.ts) | Gemini 2nd-stage triage → `anomalies.aiVerdict`. Exports `findTargetItemIndex`, `normalizeVerdict`. |
| [jobs/refresh-analytics.ts](jobs/refresh-analytics.ts) | Rebuilds `supplier_patterns`/`buyer_patterns` + compute-then-swap `spending_trends`/`top_entities`/`category_distribution`/`dashboard_metrics`. Header `:5-8` states it replaces `populate-analytics.ts` + `precalculate-dashboard.ts`. |
| [jobs/refresh-product-analytics.ts](jobs/refresh-product-analytics.ts) · [jobs/refresh-product-variants.ts](jobs/refresh-product-variants.ts) | `product_analytics` / `product_variants` per SICE catalogue code. |
| [jobs/refresh-organism-groups.ts](jobs/refresh-organism-groups.ts) · [jobs/refresh-dept-indicators.ts](jobs/refresh-dept-indicators.ts) | Monthly COLLSCAN rollups → `organism_group_stats`, `dept_indicators`. |
| [jobs/cross-provider-anomalies.ts](jobs/cross-provider-anomalies.ts) | Groups AI-unexplained flags by supplier name → `provider_anomaly_stats` / `_summary`. |
| [jobs/reconcile-award-amendments.ts](jobs/reconcile-award-amendments.ts) | Folds `ajuste_adjudicacion`/`awardUpdate` deltas into the base award release, recomputes `amount`, re-scores. Prints `RECONCILE_SUMMARY corrected=<n>` parsed at [cronserver.ts:191](cronserver.ts). |
| [jobs/correct-lumpsum-artifacts.ts](jobs/correct-lumpsum-artifacts.ts) | The ONLY thing that rewrites an inflated stored total, stamping `amount.verifiedOverride`. **Not scheduled, no npm script.** |
| [jobs/sync-open-calls.ts](jobs/sync-open-calls.ts) · [jobs/backfill-open-calls.ts](jobs/backfill-open-calls.ts) | `releases` → `open_calls` projection + watch matching + alert dispatch. Backfill runs with alerts suppressed. |
| [jobs/deadline-reminders.ts](jobs/deadline-reminders.ts) · [jobs/alert-digest.ts](jobs/alert-digest.ts) · [jobs/webhooks/run.ts](jobs/webhooks/run.ts) | Daily reminders, daily digest, webhook produce+dispatch tick. |
| [jobs/import-sice-catalog.ts](jobs/import-sice-catalog.ts) · [jobs/load-dei.ts](jobs/load-dei.ts) | External data loaders → `sice_catalog`/`sice_rubro`, `dei_companies`. |
| [jobs/refresh-exchange-rates.ts](jobs/refresh-exchange-rates.ts) · [jobs/seed-historical-rates.ts](jobs/seed-historical-rates.ts) | `exchange_rates` monthly BCU averages (cron) / one-time 2000–2022 SOAP backfill. No npm scripts. |
| [jobs/backfill-pliego-docs.ts](jobs/backfill-pliego-docs.ts) · [jobs/backfill-reiteracion-docs.ts](jobs/backfill-reiteracion-docs.ts) | One-off deterministic document-URL probes for the two feed gaps. No npm scripts. |
| [jobs/enrich-suppliers.ts](jobs/enrich-suppliers.ts) · [jobs/enrich-supplier-contacts.ts](jobs/enrich-supplier-contacts.ts) | `supplier_enrichment` (category + one-liner) / `supplier_contacts` (cold-email Phase A). No npm scripts. |
| [jobs/pliego-summary.ts](jobs/pliego-summary.ts) | Gemini pliego summaries cached on `open_calls.aiSummary`. |
| [jobs/analytics-pipeline.ts](jobs/analytics-pipeline.ts) | **LIBRARY, no imports.** The money rule for every aggregate: `MAX_PLAUSIBLE_RELEASE_UYU` `:47` (env `ANALYTICS_MAX_RELEASE_UYU`, default 50e9), `AWARD_MATCH`, `FX_SCALE`, `UNWOUND_ITEM_UYU`. |
| [jobs/anomaly-stats.ts](jobs/anomaly-stats.ts) | **LIBRARY, zero imports.** The whole estimator + every tuning constant (`Z_FLAG_THRESHOLD`, `MIN_BASELINE_N`, `MAX_REPORTED_Z`, …). Change severity behaviour here, not in the detector. |
| [jobs/lib/](jobs/lib/) | `lumpsum-candidates.ts` (`candidateMatchStage`, `isLumpsumSuspect`, `isArtifactConfirmed`, `LUMPSUM_DEFAULTS` `:60`), `comprasestatales-total.ts` (parses the official "Monto Total de la Compra"), `bcu-historical-rates.ts` (BCU SOAP). |
| [jobs/ai/](jobs/ai/) | `gemini-client.ts` (dependency-free structured-output client; never reads `process.env`), `item-features.ts` (gov "Características" scraper). |
| [jobs/open-calls/](jobs/open-calls/) | `project.ts` (PURE projection), `sync.ts` (orchestrator), `pliego-probe.ts` (+ the reusable `mapLimit()`). |
| [jobs/releases/reiteracion-probe.ts](jobs/releases/reiteracion-probe.ts) | Probes `/Resoluciones/reiter_{compraId}.doc`. Imported **back into** the live uploader (`release-uploader-new.ts:8`, called `:409`). |
| [jobs/matching/](jobs/matching/) | `match.ts` is a 3-line re-export of `shared/matching/match`; `run.ts` inserts one idempotent `notifications` row per enabled channel. |
| [jobs/alerts/](jobs/alerts/) | `dispatch.ts` (email + shared primitives), `dispatch-push.ts`, `dispatch-telegram.ts`. |
| [jobs/webhooks/](jobs/webhooks/) | `produce.ts` (rolling-window scan → `webhook_deliveries`), `dispatch.ts` (HMAC POST + backoff), `run.ts`. |
| [jobs/pliego/summarize.ts](jobs/pliego/summarize.ts) | PDF → text → Gemini summary. Deadlines always come from OCDS `tenderPeriod`, never from this. |
| [jobs/sice/](jobs/sice/) | `untar.ts` (dependency-free tgz), `parse.ts` (Latin-1 ANSI-SQL INSERT parser). |
| [jobs/variants/rollup.ts](jobs/variants/rollup.ts) | PURE `rollupVariants()` over a fixed axes table. |
| [jobs/enrich/](jobs/enrich/) | Contact-enrichment library + `resolvers/{dei,website,web-search,impo,google-maps}.ts`. |
| [jobs/campaign/](jobs/campaign/) | Cold-email: `enqueue.ts`, `send.ts`, `recipients.ts`, `suppression.ts`, `unsubscribe-core.ts`, `brevo-events.ts`, `open-calls-count.ts`. The last two are **also imported by live Nitro routes**. |

### Services and support

| path | purpose |
|---|---|
| [services/database-service.ts](services/database-service.ts) | Thin mongoose connect/disconnect wrapper (injected into the uploaders/cronserver). Logs a redacted URI. |
| [services/logger-service.ts](services/logger-service.ts) | `[INFO]/[WARN]/[ERROR]` console Logger used by cronserver, uploaders and several jobs. |
| [services/mailer.ts](services/mailer.ts) | Resend behind a `Mailer` interface; `NoopMailer` when `RESEND_API_KEY` is absent. |
| [services/cold-mailer.ts](services/cold-mailer.ts) | Separate nodemailer SMTP (`COLD_SMTP_*`) for the campaign — deliberately NOT Resend. |
| [services/telegram.ts](services/telegram.ts) · [services/webpush.ts](services/webpush.ts) | Bot-API and VAPID transports; both no-op without their env vars. |
| [services/pliego-extractor.ts](services/pliego-extractor.ts) | Downloads a pliego PDF, extracts text with `unpdf`; returns `null` instead of throwing. |
| [services/file-service.ts](services/file-service.ts) | Recursive `*.json` finder/reader for the legacy `db/` tree. |
| [emails/templates.ts](emails/templates.ts) · [emails/campaign-templates.ts](emails/campaign-templates.ts) | LIVE HTML/text renderers for alerts, reminders and campaign mail. |

### Legacy / dead — do not extend

| path | status |
|---|---|
| [extract.ts](extract.ts) + [scrapers/](scrapers/) + [extractors/](extractors/) + [parsers/](parsers/) + [http/](http/) + [writers/](writers/) + [downloaders/](downloaders/) + [managers/](managers/) + [factories/scraper-factory.ts](factories/scraper-factory.ts) + [config/config.ts](config/config.ts) | The 2025 zip-scrape path: catalogodatos.gub.uy → `urls.json` → download/unzip into `db/`. Nothing schedules it. |
| [upload-releases.ts](upload-releases.ts) + [uploaders/release-uploader.ts](uploaders/release-uploader.ts) | Legacy file uploader. `release-uploader.ts` is still reachable via `scripts/sync-year-zip.ts` for a historical re-import. |
| [uploaders/mongo-data-uploader.ts](uploaders/mongo-data-uploader.ts) · [processors/streaming-json-processor.ts](processors/streaming-json-processor.ts) · [analyzer.ts](analyzer.ts) · [analyzers/](analyzers/) | Reachable only through `ScraperFactory` → `analyzer.ts`. The "streaming" processor actually `readFileSync`s the whole file. |
| [populate-analytics.ts](populate-analytics.ts) · [precalculate-dashboard.ts](precalculate-dashboard.ts) · [quick-precalculate.ts](quick-precalculate.ts) | Superseded by `jobs/refresh-analytics.ts` and `jobs/detect-anomalies.ts`. They sum raw `unit.value.amount` and hardcode years. Do not edit these to change dashboards. |
| [api/](api/) (`app.ts`, `server.ts`, `routes/{analytics,buyers,contracts,dashboard,search,suppliers}.ts`) · [analytics-server.ts](analytics-server.ts) · [services/analytics-data-service.ts](services/analytics-data-service.ts) | Legacy Express REST API. Nothing in `ecosystem.config.js` starts it. Real API = `app/server/api/**`. |
| [database/item-model.ts](database/item-model.ts) | Orphaned — `ItemModel` appears in no other file in the repo. |
| [utils/logger.ts](utils/logger.ts) | `ConsoleLogger`, imported only by `extractors/url-extractor.ts` and `factories/scraper-factory.ts`. Live code uses `services/logger-service.ts`. |
| [clear-database.ts](clear-database.ts) · [inspect-ocds-data.ts](inspect-ocds-data.ts) · [verify-currency-pattern.ts](verify-currency-pattern.ts) | Ad-hoc dev utilities, not scheduled. |

## Entry points / how to run

```bash
# scheduler (dev) — Express on CRON_SERVER_PORT, default 3002
npm run cronserver

# scheduler (prod) — tsc to dist/ then pm2 with cronserver.config.js (port 3902)
npm run cronserver:start
npm run cronserver:restart
npm run cronserver:logs
npm run cronserver:status

# control plane
curl http://localhost:3002/health
curl http://localhost:3002/cron/status
curl -X POST http://localhost:3002/cron/trigger      # ingest
curl -X POST http://localhost:3002/cron/analytics
curl -X POST http://localhost:3002/cron/reconcile

# ingestion / amounts / filters
npx tsx src/uploaders/release-uploader-new.ts        # runs uploadReleasesFromWeb (2025-hardcoded)
npx tsx scripts/sync-year-zip.ts 2025                # historical re-import via the zip path
npm run add_amounts
npm run populate-filters

# jobs with npm scripts
npm run refresh-analytics            # [-- --patterns | --dashboard]
npm run refresh-product-analytics
npm run refresh-product-variants
npm run refresh-organism-groups
npm run refresh-dept-indicators
npm run detect-anomalies             # [-- --all|--year=2024|--since=ISO|--ids=a,b|--dry-run]
npm run score-anomalies-ai           # [-- --limit=20 --rpm=18 --dry-run]
npm run cross-provider-anomalies
npm run reconcile-amendments         # [-- --dry-run --since-days=10]
npm run sync-open-calls
npm run backfill-open-calls
npm run deadline-reminders
npm run alert-digest
npm run webhooks
npm run pliego-summary
npm run import-sice-catalog
npm run load-dei

# jobs WITHOUT npm scripts
npx tsx src/jobs/correct-lumpsum-artifacts.ts [--commit] [--release=adjudicacion-53193 [--force]] [--limit=50]
npx tsx src/jobs/refresh-exchange-rates.ts [--period=72]
npx tsx src/jobs/seed-historical-rates.ts [--commit --from=2004 --to=2006]
npx tsx src/jobs/backfill-pliego-docs.ts --limit 500 --concurrency 8
npx tsx src/jobs/backfill-reiteracion-docs.ts --limit 2000 --concurrency 8
npx tsx src/jobs/enrich-suppliers.ts --dry-run
npx tsx src/jobs/enrich-supplier-contacts.ts --limit=100 --dry-run
npx tsx src/jobs/campaign/enqueue.ts --campaign=promo1
npx tsx src/jobs/campaign/send.ts --campaign=promo1 --dry-run

# legacy zip path (kept for reference)
npm run extract
npm run upload

npm run build    # tsc → dist/, needed only so cronserver.config.js can run dist/src/cronserver.js
npm run lint     # eslint src --ext .ts
```

## Conventions

- **Models come from `shared/models`, never defined here.** `import { ReleaseModel } from '../../shared/models'` ([uploaders/release-uploader-new.ts:1](uploaders/release-uploader-new.ts)). Two legacy files import `../app/server/utils/models` instead ([precalculate-dashboard.ts](precalculate-dashboard.ts), [quick-precalculate.ts](quick-precalculate.ts)) — don't copy that. Note [populate-filters.ts:3](populate-filters.ts) still connects via `../app/server/utils/database`; new code should use `shared/connection/database`.
- **Every write to `releases.amount` must first call `hasVerifiedOverride(doc)`** from `shared/utils/verified-override` and skip that field. All four writers do: [release-uploader-new.ts:431](uploaders/release-uploader-new.ts) and `:786`, [add-missing-amounts.ts:3](add-missing-amounts.ts), [uploaders/release-uploader.ts](uploaders/release-uploader.ts).
- **Writes are `bulkWrite(ops, { ordered: false })` in slices**, `updateOne + upsert:true` filtered on `{ id: release.id }` (the OCDS release id, never `_id`). Every doc is stamped with `sourceFileName` + `sourceYear`; the live path uses `sourceFileName: 'web'` plus the `rss*` fields.
- **All money aggregation imports from [jobs/analytics-pipeline.ts](jobs/analytics-pipeline.ts).** Never `$sum: '$awards.items.unit.value.amount'` — use `amount.primaryAmount` for release sums and `FX_SCALE`/`UNWOUND_ITEM_UYU` per item.
- **New scheduled work** = a file in `jobs/<name>.ts`, an npm script `tsx src/jobs/<name>.ts`, and a `this.runJobProcess('jobs/<name>', args)` call — path relative to `src/`, no extension ([cronserver.ts:137](cronserver.ts)). Copy an existing cron block wholesale: a `isXRunning` boolean + `xStatus`, a `runXJob()`, GET+POST `/cron/<name>` + `/cron/<name>/status` routes, and a `cron.schedule(expr, …, { timezone: 'America/Montevideo' })`.
- **Never run a heavy aggregation in-process in cronserver.** It runs at `--max-old-space-size=512`; children get 2048MB.
- **Long jobs set `process.env.MONGO_SOCKET_TIMEOUT_MS = 30*60*1000` BEFORE the first `connectToDatabase()`** — see [populate-filters.ts:13-16](populate-filters.ts). The shared 45s idle-socket default is tuned for the web app and kills legitimate aggregations mid-flight.
- **Compute-then-swap, never delete-then-compute.** Either `swapCollection()` (refuses to swap on 0 computed docs, [jobs/refresh-analytics.ts](jobs/refresh-analytics.ts)) or write the new `dataVersion` then `deleteMany({ dataVersion: { $ne: current } })`.
- **Jobs report back to the scheduler via a machine-readable stdout line.** `runJobProcess` returns accumulated stdout and the caller regexes it — `RECONCILE_SUMMARY corrected=(\d+)` at [cronserver.ts:191](cronserver.ts).
- **Entrypoint shape:** `#!/usr/bin/env tsx` + a docblock stating WHY, then `main()`, then `if (require.main === module) { … }`. Only the `require.main` form is importable as a library (that's how `reconcile-award-amendments.ts` imports `rescoreReleaseIds` from `detect-anomalies.ts`).
- **Pure/testable split is deliberate.** [jobs/anomaly-stats.ts](jobs/anomaly-stats.ts), [jobs/analytics-pipeline.ts](jobs/analytics-pipeline.ts), [jobs/open-calls/project.ts](jobs/open-calls/project.ts), [jobs/variants/rollup.ts](jobs/variants/rollup.ts) have no I/O imports. New statistics/merge logic goes there, not in an entrypoint.
- **Optional transports degrade to a logged no-op** when their env var is missing rather than throwing ([services/mailer.ts](services/mailer.ts)) — keep that for any new transport.
- **tsconfig is strict with `exactOptionalPropertyTypes` + `noUnusedLocals`.** Use conditional spreads instead of assigning `undefined`.

## Gotchas

- **THE amount bug: [utils/amount-calculator.ts:175](utils/amount-calculator.ts)** — `const itemTotal = item.unit.value.amount * quantity`. When the government puts a contract lump sum in the unit price, `amount.primaryAmount` is inflated by orders of magnitude and stored forever. Nothing in `src/` corrects it: the detector only *suppresses* (`isLineTotalArtifact`), the pipeline only *excludes* (`MAX_PLAUSIBLE_RELEASE_UYU`, [jobs/analytics-pipeline.ts:47](jobs/analytics-pipeline.ts)), and the only rewriter is [jobs/correct-lumpsum-artifacts.ts](jobs/correct-lumpsum-artifacts.ts) — which is neither scheduled nor npm-scripted.
- **[jobs/detect-anomalies.ts](jobs/detect-anomalies.ts) contains a literal NUL byte** (inside `anomalyContentVersion`, near `:231`). `file` reports "binary data" and ripgrep/grep return only "Binary file … matches" — the Grep tool silently finds nothing in it. Use `Read`, or `grep -a`. Biggest time-waster in this tree.
- **`uploadReleasesFromWeb()` hardcodes 2025** ([uploaders/release-uploader-new.ts:34](uploaders/release-uploader-new.ts) and the loops below). It is NOT a general backfill — use `uploadLastSevenDaysFromWeb` / `uploadCurrentMonthFromWeb`, or the zip path. It is also what the file's own `require.main` block at `:847` runs.
- **The two uploaders write differently on conflict.** Legacy `ReleaseUploader` uses a **pipeline** update that keeps stored `awards`/`amount` when the stored doc has strictly more awards; live `ReleaseUploaderNew` does a plain `$set` of a fully rebuilt doc (`:464`), so a thin re-publish can overwrite a richer one. Know which you're touching. Pipeline-style `$set` also evaluates values as aggregation expressions, so every field must be `$literal`-wrapped or Mongo rejects empty nested objects like `buyer.contactPoint: {}`.
- **Exchange rates are fetched once per upload run** and silently fall back to `FALLBACK_RATES` ([utils/amount-calculator.ts:46](utils/amount-calculator.ts)) on failure — a rate-API outage produces plausible-looking but wrong UYU totals, with no marker other than `exchangeRateDate`.
- **`calculateSimpleTotalAmounts()` ([utils/amount-calculator.ts:230](utils/amount-calculator.ts)) returns version 1 and skips conversion.** Since `createAmountUpdateQuery()` selects on `amount.version != 2`, anything it writes is permanently re-queued by `add-missing-amounts`. Nothing live calls it — don't start.
- **Reconciliation must not touch the `rss*` fields.** `reconcileNonFinalReleases` ([uploaders/release-uploader-new.ts:676](uploaders/release-uploader-new.ts)) only `$set`s OCDS-derived fields + `reconciledAt`, because the hourly job's freshness diff compares stored `rssPublishDate` against the feed. Its candidate projection must also keep `amount.verifiedOverride` — the guard at `:786` reads it off that same lean doc, so a narrower projection silently disables the protection.
- **`busyWith()` covers only 4 jobs** (ingest / reconcile / analytics / anomalies — the ones that touch `releases`), and they are **in-process booleans, not durable locks** ([cronserver.ts:121](cronserver.ts), comment at `:50`). A pm2 restart forgets them while spawned children keep running. Every other job guards only against itself.
- **cronserver spawns children differently depending on how it was started**: `npx tsx <file>.ts` when `__filename` ends in `.ts`, compiled node otherwise ([cronserver.ts:137](cronserver.ts)). If you add a job and only test under tsx, verify `npm run build` emits it to `dist/src/jobs/`. A typo in the `runJobProcess` path fails only at spawn time.
- **Two pm2 apps are named `gastos-gub-cronserver` with different ports and scripts**: `ecosystem.config.js` (`CRON_SERVER_PORT: 3002`, tsx source) vs `cronserver.config.js` (`CRON_SERVER_PORT: 3902`, `dist/src/cronserver.js`, 512MB). `npm run cronserver:start` uses the latter and therefore needs `npm run build` first; `npm run pm2:start` uses the former.
- **lumpsum: `candidateMatchStage()` is a loose Mongo pre-filter** that cannot express the `maxPricedItems` cap. Every consumer must re-check each fetched doc with `isLumpsumSuspect()` before acting — the contract is spelled out in the module docblock ([jobs/lib/lumpsum-candidates.ts:23-29](jobs/lib/lumpsum-candidates.ts)). Known latent gap documented at `:49-54`: the Mongo currency `$in` is case-sensitive while `isLumpsumSuspect()` upper-cases.
- **`anomalies.dataVersion` is content-derived** (`anomalyContentVersion`, [jobs/detect-anomalies.ts:231](jobs/detect-anomalies.ts)) and is the AI-triage incremental gate. Do not fold baseline bounds/severity/zScore into that hash or the nightly triage re-charges the whole corpus. The detector class *also* has a run-scoped `this.dataVersion` used only for the `item_price_baselines` swap — same field name, different thing.
- **`releases.buyer.id` has NO index** (`buyer.name` does). `refresh-dept-indicators` and `refresh-organism-groups` are deliberate monthly COLLSCANs with `allowDiskUse`. Never put a `buyer.id`-led aggregate on a request path.
- **`score-anomalies-ai --rpm` defaults to unthrottled**; the cronserver always passes `--rpm=${AI_TRIAGE_RPM||18}` because the Gemini free tier is 20 RPM. Running it by hand without `--rpm` on a free key 429-storms.
- **[jobs/refresh-product-variants.ts](jobs/refresh-product-variants.ts) imports from `../../app/server/utils/query`** — a job reaching into the Nuxt tree. Moving that file breaks the job. Likewise [jobs/ai/item-features.ts](jobs/ai/item-features.ts) is a deliberate duplicate of `app/server/api/contracts/[id]/features.get.ts` (src/ cannot import Nuxt routes) — keep the two parsers in sync.
- **[jobs/campaign/unsubscribe-core.ts](jobs/campaign/unsubscribe-core.ts) and [jobs/campaign/brevo-events.ts](jobs/campaign/brevo-events.ts) are imported by live Nitro routes** under `app/server/api/campaign/`. Editing them changes HTTP behaviour, not just a job.
- **`shared/config.ts` calls `dotenv.config({ override: true })`** — the root `.env` WINS over shell env vars, deliberately. `MONGODB_URI=... npx tsx src/jobs/…` does **not** do what you expect for anything importing a model. Do not "fix" this.
- **`src/config/config.ts` `MONGO_CONFIG` only affects the legacy `ScraperFactory`/`MongoDbClient` path.** Changing `MONGODB_DATABASE`/`MONGODB_COLLECTION` there has zero effect on live ingest, which goes through mongoose models + `shared/config`.
- **`npm run create-items` points at `src/create-items-collection.ts`, which does not exist** (verified: `ls` fails). [database/item-model.ts](database/item-model.ts) is its orphaned companion.
- **No test *framework* (no vitest/jest).** Tests are standalone tsx assertion scripts under `tests/unit/`; run them individually or via the minimal runner: `npm test` (= `node scripts/run-tests.mjs unit`). Also verify with targeted `npx tsc --noEmit` and the `--dry-run` flags (`detect-anomalies`, `score-anomalies-ai`, `correct-lumpsum-artifacts`, `reconcile-amendments`, `load-dei`, `campaign/send`).

## Cron schedule (authoritative source: [cronserver.ts:645-811](cronserver.ts), tz `America/Montevideo`)

| when | what |
|---|---|
| `5 * * * *` | ingest (`ReleaseUploaderNew`, in-process) → `jobs/reconcile-award-amendments --since-days=10` → organism-groups only if `corrected > 0` |
| `20 * * * *` | `jobs/sync-open-calls` |
| `*/2 * * * *` | `jobs/webhooks/run` |
| `30 */6 * * *` | `jobs/refresh-exchange-rates` → `jobs/refresh-analytics` → `populate-filters` → `jobs/refresh-product-analytics` |
| `15 4 * * *` | `jobs/detect-anomalies` → `jobs/score-anomalies-ai --rpm=N` |
| `0 5 * * *` / `0 6 * * *` / `0 8 * * *` | deadline-reminders / cross-provider-anomalies / alert-digest |
| `0 2 * * 0` / `0 7 * * 0` | weekly `reconcileNonFinalReleases` + full reconcile / `jobs/refresh-product-variants` |
| `0 3 * * 1` | `jobs/import-sice-catalog` |
| `0 3 1 * *` / `0 4 1 * *` | `jobs/refresh-organism-groups` / `jobs/refresh-dept-indicators` |

Non-fatal tails: exchange-rates, product-analytics and AI triage are `.catch()`ed so a hiccup never marks the primary job failed.

## Env

| var | effect |
|---|---|
| `MONGODB_URI` | Mongo connection (via `shared/config.ts`, with `MONGO_URI` fallback; also read directly in `cronserver.ts` and `config/config.ts`). `.env` overrides shell env. |
| `MONGO_SOCKET_TIMEOUT_MS` | Per-process socket timeout; `populate-filters.ts` sets it to 30 min if unset. |
| `CRON_SERVER_PORT` | cronserver HTTP port. Code default 3002 ([cronserver.ts:1298](cronserver.ts)); `cronserver.config.js` sets 3902. |
| `REITER_PROBE_MAX_PER_RUN` | Cap on reiteración HEAD probes per upload run (default 500, [uploaders/release-uploader-new.ts:14](uploaders/release-uploader-new.ts)). |
| `ANALYTICS_MAX_RELEASE_UYU` | Plausibility ceiling for aggregates, default 50e9; 0 disables ([jobs/analytics-pipeline.ts:47](jobs/analytics-pipeline.ts)). |
| `LUMPSUM_QTY_THRESHOLD`, `LUMPSUM_SUSPECT_MIN_UYU`, `LUMPSUM_RATIO_MIN`, `LUMPSUM_MAX_ITEMS` | Lump-sum candidate band ([jobs/lib/lumpsum-candidates.ts:60](jobs/lib/lumpsum-candidates.ts)). |
| `GEMINI_API_KEY` / `GOOGLE_API_KEY` | Gemini for triage, pliego summaries, supplier enrichment, the Maps match-judge. |
| `AI_TRIAGE_RPM` | Passed as `--rpm` to `score-anomalies-ai` (default 18; free tier is 20 RPM). |
| `PROVIDER_OVERPRICE_CEILING_UYU`, `_OTHER`, `PROVIDER_OVERPRICE_UYU_TODAY_CEILING` | Overprice clamps in `cross-provider-anomalies`. |
| `PV_ONLY_CODE`, `PV_MAX_CODES`, `PV_MAX_CONTRACTS_PER_CODE` | Scope knobs for `refresh-product-variants`; a partial run skips the swap cleanup. |
| `PLIEGO_PROBE_MAX_PER_SYNC`, `PLIEGO_EAGER_LIMIT`, `SYNC_EAGER_SUMMARY_LIMIT`, `PLIEGO_AI_MODEL` | Pliego probe/summary budget. |
| `WEBHOOK_PRODUCE_WINDOW_MS`, `WEBHOOK_DISPATCH_BATCH` | Webhook producer window / drain batch. |
| `RESEND_API_KEY`, `ALERTS_FROM_EMAIL`, `ALERTS_REPLY_TO` | Transactional email; absent ⇒ `NoopMailer`. |
| `COLD_SMTP_HOST/PORT/USER/PASS/FROM/REPLY_TO` | Cold-email SMTP ([services/cold-mailer.ts](services/cold-mailer.ts)). |
| `CAMPAIGN_TOKEN_SALT`, `CAMPAIGN_SENDER_IDENTITY`, `CAMPAIGN_UNSUB_MAILTO` | Campaign identity + unsubscribe token salt. |
| `TELEGRAM_BOT_TOKEN` / `VAPID_PUBLIC_KEY`+`VAPID_PRIVATE_KEY`+`VAPID_SUBJECT` | Telegram / web-push channels; absent ⇒ no-op. |
| `APP_BASE_URL` | Link base in alert/reminder emails and push/telegram cards. |
| `MAPS_PROXY_URL` | Google Maps proxy for the `google-maps` contact resolver. |
| `MONGODB_DB`, `MONGODB_DATABASE`, `MONGODB_COLLECTION`, `MONGODB_BATCH_SIZE` | Legacy `MongoDbClient` path only — no effect on live ingest. |
| `API_PORT`, `FRONTEND_URL`, `NODE_ENV` | Legacy `src/api` + `src/analytics-server.ts` only. |

## Related

- [../shared/](../shared/) — models, connection singleton, and the pure algorithms shared with the Nuxt app (`shared/utils/verified-override.ts` is the amount-protection contract).
- [../app/context.md](../app/context.md) — Nuxt frontend.
- [../app/server/context.md](../app/server/context.md) — the real HTTP API that reads what this layer writes.
- [../scripts/context.md](../scripts/context.md) — deploy, index migrations, asset builders, one-off diagnostics.
- [../tests/context.md](../tests/context.md) — the tsx-assertion test surface (there is no runner).
- [../docs/context.md](../docs/context.md) — guides, archive, and the dated spec/plan artifacts.
