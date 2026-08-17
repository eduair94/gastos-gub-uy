# src/jobs/ — analytical + enrichment jobs

This directory holds every offline computation in gastos-gub. Jobs turn the raw OCDS `releases` collection into the precomputed collections the Nuxt app reads (`dashboard_metrics`, `spending_trends`, `top_entities`, `category_distribution`, `supplier_patterns`, `buyer_patterns`, `product_analytics`, `organism_group_stats`, `dept_indicators`, `provider_anomaly_*`). Jobs also run the statistical price-anomaly detector and its Gemini second-stage triage, the open-calls → alerts → webhooks pipeline, and the enrichment loaders (SICE catalog, DEI, exchange rates, supplier contacts).

Nothing here sits on the request path. [`src/cronserver.ts`](../cronserver.ts) spawns each job as a child process (`runJobProcess`, cronserver.ts:137); you can also run one by hand with `npx tsx`. Top-level `*.ts` files are entrypoints. Subdirectories are their libraries, kept I/O-free where possible so `tests/unit/` can import them.

## Map

### Entrypoints (top-level `*.ts`)

| Path | Purpose |
|---|---|
| [detect-anomalies.ts](detect-anomalies.ts) | Stage 1 builds price baselines per {classificationId, currency, canonicalUnit} → `item_price_baselines`. Stage 2 scores award item unit prices with a robust log modified z-score, then reconciles `anomalies`; the self-healing delete stays scoped to rescanned releases. Applies the legal timbre schedule ([shared/timbre-values.ts](../../shared/timbre-values.ts)); `--classification=<id>` repairs a single code. Exports `rescoreReleaseIds`, `anomalyContentVersion`, `AnomalyDetector`, `parseArgs`. **Contains a NUL byte — see Gotchas.** |
| [score-anomalies-ai.ts](score-anomalies-ai.ts) | Gemini second-stage triage of `price_spike` flags → advisory `anomalies.aiVerdict {explainable, category, reason, analysis, evidence, confidence, usedFeatures, dataVersion}`. Incremental via `dataVersion`. Joins `releases.date` so bounded batches take the newest purchases first. Also writes `contract_item_features` (scrape cache) and `data/anomaly-ai-verdicts/*.json`. |
| [refresh-analytics.ts](refresh-analytics.ts) | Rebuilds `supplier_patterns` + `buyer_patterns`, then compute-then-swaps `spending_trends`, `top_entities`, `category_distribution`, `dashboard_metrics` (`swapCollection`, refresh-analytics.ts:600). |
| [refresh-product-analytics.ts](refresh-product-analytics.ts) | Rollup per catalogue code → `product_analytics`. Swaps by `dataVersion`. Reads `releases` + `sice_catalog`. |
| [refresh-product-variants.ts](refresh-product-variants.ts) | For catalogue codes carrying an unexplained anomaly: samples awards, caches características, rolls up Marca/Presentación/… → `product_variants`. |
| [refresh-organism-groups.ts](refresh-organism-groups.ts) | Monthly capped spend per `buyer.id`, folded into the `ORGANISM_GROUPS` taxonomy → `organism_group_stats`. |
| [refresh-spending-trend.ts](refresh-spending-trend.ts) | Monthly year-over-year spending decomposition → `spending_trend`. Rebuilds every amount from `amount.totalAmounts` at its OWN month's FX (NOT `primaryAmount`), deflates by the month's UI, and drops as artefacts the releases whose REAL value clears 5e10. Writes the exact base+inflation+entrants+exits+panel bridge. `--ai` lets Gemini reword the sentences (rejected unless the digits are identical). |
| [refresh-integrity-signals.ts](refresh-integrity-signals.ts) | **Señales de gestión.** One doc per `buyer.id` over a trailing 36-month window → `integrity_signals`, with five measured indicators (supplier concentration, award bursts, direct-award share, express bidding windows, unexplained price flags). Levels are a POPULATION PERCENTILE (p90/p97) plus an absolute floor, not fixed bars. Compute-then-swap with a `$lt` sweep and a write-count check. |
| [refresh-dept-indicators.ts](refresh-dept-indicators.ts) | Monthly indicators per (buyer.id, year) for the 19 Intendencias (80-1…98-1) → `dept_indicators`. COLLSCANs over `releases` + `anomalies`. |
| [cross-provider-anomalies.ts](cross-provider-anomalies.ts) | Groups AI-unexplained flags (`aiVerdict.explainable === 'no'`) by supplier/buyer → `provider_anomaly_stats` + `provider_anomaly_summary`. |
| [reconcile-award-amendments.ts](reconcile-award-amendments.ts) | Merges `ajuste_adjudicacion` (tag `awardUpdate`) item deltas into the base `adjudicacion-*` release, recomputes `amount`, re-scores via `rescoreReleaseIds`. See [Conventions](#conventions). |
| [correct-lumpsum-artifacts.ts](correct-lumpsum-artifacts.ts) | Rewrites `releases.amount` for totals inflated by qty × a lump sum in `unit.value.amount`, using the official scraped "Monto Total de la Compra" at the release's own month BCU rate. Stamps `amount.verifiedOverride`. Never touches `awards[]`. |
| [sync-open-calls.ts](sync-open-calls.ts) | Hourly: projects `releases` → `open_calls`, matches against `watches` → `notifications`, dispatches email/push/telegram, runs bounded eager pliego AI summaries. |
| [backfill-open-calls.ts](backfill-open-calls.ts) | One-time day-1 backfill with alerts suppressed (`syncOpenCalls({ suppressAlerts: true })`). Idempotent. |
| [deadline-reminders.ts](deadline-reminders.ts) | Daily reminder email for `saved_calls` nearing their reception deadline. Writes `saved_calls.reminderSentAt` + `notifications`. |
| [alert-digest.ts](alert-digest.ts) | Thin wrapper: `dispatchAlerts({ frequency: 'daily' })` — one bundled email per daily-frequency user. |
| [weekly-newsletter.ts](weekly-newsletter.ts) | Monday publisher for the previous completed Uruguay week. Computes top plausible awards + objective anomaly totals, asks Gemini for a schema-constrained editorial reading, upserts the public issue, then drains an idempotent Resend/Web Push outbox. `--dry-run` writes and sends nothing. |
| [pliego-summary.ts](pliego-summary.ts) | Gemini pliego summaries cached on `open_calls.aiSummary`. Not on cron (sync-open-calls does a bounded eager pass). |
| [import-sice-catalog.ts](import-sice-catalog.ts) | Downloads ACCE `imp_catalogo.tgz`, parses Latin-1 SQL INSERTs → `sice_catalog` + `sice_rubro`. Self-skips on unchanged ETag/Last-Modified via `sice_import_state`. |
| [extract-acta-bidders.ts](extract-acta-bidders.ts) | **Who else bid.** Fetches `/Resoluciones/acta_<compraId>.pdf` for awarded COMPETITIVE calls, extracts its text and parses the offers it enumerates → `acta_bidders`. Serial, delayed, resumable: it stores every probed call, silent ones too, so a re-run never re-fetches. ~4% of actas enumerate — a per-CONTRACT fact, never an organism-level rate. |
| [load-udeco-sanctions.ts](load-udeco-sanctions.ts) | UDECO consumer-protection sanctions (1,482 rows, 1,103 firms, 2017-2024) → `udeco_sanctions`. The file is SEMICOLON-delimited and **LATIN-1** despite its UTF-8 headers. Upsert, never sweep. |
| [refresh-udeco-crossref.ts](refresh-udeco-crossref.ts) | Sanctioned firms × state suppliers → `udeco_supplier_stats`. The RUT join needs a 12-digit normalisation (`R/…`, `R/… `, `R…`, bare) that no index can serve — an exact `$in` misses 28% — so it lives here, not on a request path. |
| [load-jutep-omisos.ts](load-jutep-omisos.ts) | JUTEP roster of officials declared omisos on their sworn asset declaration (Ley 17.060) → `jutep_omisos`. **Upsert by (documento, fecha), never a swap** — JUTEP republishes cumulatively, so a vanished row is their correction, not our deletion. Resolves the free-text inciso label to a `buyer.id` prefix via [shared/jutep-incisos.ts](../../shared/jutep-incisos.ts) (99.7% of rows; only COLEGIO MEDICO is unresolved, correctly). |
| [load-dei.ts](load-dei.ts) | Loads the MIEM DEI industrial-registry CSV → `dei_companies`, upsert by RUT. The RUT join happens at read time in `app/server/utils/dei.ts`. |
| [refresh-exchange-rates.ts](refresh-exchange-rates.ts) | Upserts monthly BCU USD/EUR/UI averages into `exchange_rates` from api.cambio-uruguay.com. Never deletes months. |
| [seed-historical-rates.ts](seed-historical-rates.ts) | One-time `exchange_rates` backfill 2000-01…2022-11 via the BCU SOAP service. |
| [backfill-pliego-docs.ts](backfill-pliego-docs.ts) | One-off: HEAD-probes `/Pliegos/pliego_{compraId}.pdf` for active docs-empty `open_calls`. Resumable via `documentsProbedAt`. |
| [backfill-reiteracion-docs.ts](backfill-reiteracion-docs.ts) | One-off: probes `/Resoluciones/reiter_{compraId}.doc` for releases with an awardNotice but no reiteración. Resumable via `reiteracionProbedAt`. ~500k eligible — run bounded. |
| [fetch-reiteracion-docs.ts](fetch-reiteracion-docs.ts) | Downloads the reiteración document of every release that has one (~5.8k), extracts its text and parses the objection → `reiteracion_docs`. PDFs via `unpdf`, legacy `.doc` via `word-extractor` — reading a `.doc` as latin1 returns the embedded JPEG, not text. Paced at one request per second: it hits a state site. Resumable; `--refetch` re-downloads. |
| [build-derived-casos.ts](build-derived-casos.ts) | Builds the `gasto-observado` case files from `reiteracion_docs` at four grains (organism, supplier, stated reason, single purchase) → `derived_casos` with `origin: 'reiteracion'`. Thresholds per grain; deletes by explicit slug list, never by `$ne` generation. |
| [build-tcr-casos.ts](build-tcr-casos.ts) | Builds the `tribunal-de-cuentas` case files from the resolutions already tied to a purchase → `derived_casos` with `origin: 'tcr'`. Quotes the VISTO and never claims the Court objected: the ruling itself is only in the scanned PDF. |
| [enrich-suppliers.ts](enrich-suppliers.ts) | Supplier category + one-line description (~97% free name rules, LLM only for the tail) → `supplier_enrichment`. |
| [enrich-supplier-contacts.ts](enrich-supplier-contacts.ts) | Cold-email Phase A. Resolves emails, phones, address, hours, contact form and social profiles from DEI, the supplier site via Crawl4AI, web search, IMPO and Google Maps → `supplier_contacts`. Every channel keeps its evidence `sourceUrl`, and `enrichmentMethods` records the paths tried. Writes stay additive: a later run never erases a valid email. |

### Libraries (subdirectories + pure top-level modules)

| Path | Purpose |
|---|---|
| [analytics-pipeline.ts](analytics-pipeline.ts) | **The money rule for all aggregates.** No imports, no I/O. `AWARD_MATCH`, `IMPLAUSIBLE_MATCH`, `MAX_PLAUSIBLE_RELEASE_UYU` (50e9, env `ANALYTICS_MAX_RELEASE_UYU`, analytics-pipeline.ts:47), `FX_SCALE`, `UNWOUND_ITEM_UYU`. |
| [anomaly-stats.ts](anomaly-stats.ts) | The estimator, **zero imports**: `weightedPercentile`, `weightedMedian`, `computeBaselineStats`, `modifiedZScore`, `scoreUnitPrice`, `severityRankFromAbsZ`, `confidenceFromZ` + every constant (`Z_FLAG_THRESHOLD=3.5`, `MIN_LOG_DEVIATION=ln 1.25`, `IQR_FENCE_K=3`, `RECURRING_PRICE_MIN_COUNT=3`, `MIN_BASELINE_N=10`, `ROBUST_MIN_N=30`, `MAX_REPORTED_Z=1000`, `DEVIATION_FROM_MODE_MIN_SHARE=0.55`). Change threshold/severity behaviour HERE. `ScoringContext.officialPrices` is the one PER-OBSERVATION input: it is date-dependent, so it cannot live on the baseline ([shared/timbre-values.ts](../../shared/timbre-values.ts)). |
| [lib/lumpsum-candidates.ts](lib/lumpsum-candidates.ts) | `candidateMatchStage()` (loose indexed Mongo pre-filter), `isLumpsumSuspect()` (full rule, enforces `maxPricedItems`), `isArtifactConfirmed()`, `LUMPSUM_DEFAULTS`. Load-bearing contract in the module docblock (lines 23-55). |
| [lib/comprasestatales-total.ts](lib/comprasestatales-total.ts) | Fetch (`fetchOfficialTotal`, `detalleUrl`, `idCompraFromOcid`) + re-export of the pure parser, which lives in [shared/utils/comprasestatales-total.ts](../../shared/utils/comprasestatales-total.ts) (`parseUyNumber`, `parseOfficialTotal`) so the contract detail page shares it. The parser binds to the label's sibling `<li>` — the only defence against writing a wrong number as "verified". |
| [lib/bcu-historical-rates.ts](lib/bcu-historical-rates.ts) | BCU SOAP client: `BCU_CODES` ({usd:2225, eur:1111, ui:9800}), `buildCotizacionesEnvelope`, `parseCotizaciones`, `parseResponseStatus`, `monthlyAveragesByCurrency`, `fetchBcuRange`. Only seed-historical-rates.ts uses it. |
| [ai/gemini-client.ts](ai/gemini-client.ts) | Dependency-free Gemini v1beta `generateContent` with `responseSchema` structured output: `callGeminiStructured`, `estimateCostUsd`, `FLASH_LITE_PRICING`, `GeminiSchema`, `GeminiUsage`. Never reads `process.env` — the caller passes `apiKey`. |
| [ai/item-features.ts](ai/item-features.ts) | Scraper for the gov "Características" table + buy-object: `scrapeCompraFeatures`, `parseItemFeatures`, `parseBuyObject`, `compraIdFromOcid`, `llamadoUrl`, `adjudicacionUrl`, `ScrapedItem`. Deliberate duplicate of `app/server/api/contracts/[id]/features.get.ts`, because src/ cannot import Nuxt routes. |
| [open-calls/project.ts](open-calls/project.ts) | **Pure** (no DB/network): `projectOpenCall`, `deriveStatus`, `releaseKind`, `buildSearchText`, `enrichProjectionWithCatalog`. The latest tender-phase release wins; pliego documents are UNIONed across all of them. |
| [open-calls/sync.ts](open-calls/sync.ts) | Orchestrator `syncOpenCalls({ suppressAlerts, log })`: reads `releases` + `sice_catalog`, bulkWrites `open_calls`, runs the pliego probe. |
| [open-calls/pliego-probe.ts](open-calls/pliego-probe.ts) | `pliegoUrl`, `probePliegoDoc`, `attachProbedPliegos`, plus the generic `mapLimit()` helper (see Conventions). |
| [releases/reiteracion-probe.ts](releases/reiteracion-probe.ts) | Same gap class for awards: `reiteracionUrl`, `probeReiteracionDoc`, `attachProbedReiteraciones`. **The live uploader imports it** (`src/uploaders/release-uploader-new.ts`) — a reverse dependency from src/ into src/jobs/. |
| [pliego/summarize.ts](pliego/summarize.ts) | `summarizeOpenCall()`: downloads all PDF/Word pliegos + later clarifications → full-text category coverage → model ladder → verified facts → `open_calls.aiSummary`. Scanned PDFs without a text layer go to `unreadableDocs` instead of blocking every readable source. Guardrail: user-facing deadlines always come from OCDS `tenderPeriod`, never from model guesses. |
| [matching/match.ts](matching/match.ts) | 3-line re-export of `shared/matching/match` so jobs and the Nitro dry-run endpoint share one matcher. Add no logic here. |
| [matching/run.ts](matching/run.ts) | `runMatching()`: evaluates newly-opened calls against watches, bulk-inserts one idempotent `alert` notification **per enabled channel**. Sends nothing. |
| [alerts/dispatch.ts](alerts/dispatch.ts) | Email dispatcher + the shared primitives every other dispatcher imports: `MAX_ATTEMPTS` (5), `EMAIL_CALL_SELECT`, `appBaseUrl`, `toEmailCall`, `unsubscribeUrl`, `listUnsubHeaders`, `dispatchAlerts`. |
| [alerts/dispatch-push.ts](alerts/dispatch-push.ts) | Web Push dispatcher (instant only). 404/410 deactivates the `push_subscriptions` row. |
| [alerts/dispatch-telegram.ts](alerts/dispatch-telegram.ts) | Telegram dispatcher (instant only). 403 (user blocked bot) deactivates the link on `users`. |
| [webhooks/run.ts](webhooks/run.ts) | One tick: `produceWebhookDeliveries()` then `dispatchWebhookDeliveries()`. |
| [webhooks/produce.ts](webhooks/produce.ts) | Rolling-window scan (`WEBHOOK_PRODUCE_WINDOW_MS`) over `open_calls`/`anomalies`/`releases` → one `webhook_deliveries` row per matching subscription, deduped by unique `dedupeKey`. |
| [webhooks/dispatch.ts](webhooks/dispatch.ts) | Drains the outbox with HMAC-signed POSTs; 2^attempts-minute backoff capped at 60min, `WEBHOOK_MAX_ATTEMPTS`, auto-disable after consecutive subscription failures. |
| [sice/untar.ts](sice/untar.ts) | `extractTgz()` — dependency-free gunzip + 512-byte tar header walk (no `tar` binary needed on Windows). |
| [sice/parse.ts](sice/parse.ts) | Quote-aware parser for ACCE's ANSI-SQL INSERT dumps: `parseInserts`, `parseFamilias`, `parseSubflias`, … Latin-1; `''` is an escaped quote; keyed by column name, not position. |
| [variants/rollup.ts](variants/rollup.ts) | **Pure** `rollupVariants()`: folds scraped características into a per-code distribution over a fixed AXES table; `key` axes decide `varies`. The product page mirrors it client-side. |
| [enrich/](enrich/) | Contact-enrichment library: [types.ts](enrich/types.ts) (`ContactResolver`), [hygiene.ts](enrich/hygiene.ts) (merge/pick + MX & DNS hygiene), [match-score.ts](enrich/match-score.ts) (deterministic, pure), [match-judge.ts](enrich/match-judge.ts) (Gemini judge), [rubros.ts](enrich/rubros.ts), [email-regex.ts](enrich/email-regex.ts), [backends.ts](enrich/backends.ts) (HTTP/search/Maps-proxy). |
| [enrich/resolvers/](enrich/resolvers/) | One resolver per source, selected by `--sources`: [dei.ts](enrich/resolvers/dei.ts), [website.ts](enrich/resolvers/website.ts), [web-search.ts](enrich/resolvers/web-search.ts), [impo.ts](enrich/resolvers/impo.ts), [google-maps.ts](enrich/resolvers/google-maps.ts) (goes through `MAPS_PROXY_URL` and REQUIRES the judge — findPlace alone returns junk). |
| [campaign/](campaign/) | Cold email: [enqueue.ts](campaign/enqueue.ts), [send.ts](campaign/send.ts) (throttled, warmup ramp, auto-pause kill-switch), [recipients.ts](campaign/recipients.ts), [suppression.ts](campaign/suppression.ts), [open-calls-count.ts](campaign/open-calls-count.ts), [unsubscribe-core.ts](campaign/unsubscribe-core.ts), [brevo-events.ts](campaign/brevo-events.ts) — the last two also serve live routes, see Gotchas. |

## How to run

```bash
# scheduler (spawns every job below as a child process)
npm run cronserver                 # dev, tsx
npm run cronserver:start           # npm run build (tsc) + pm2 start cronserver.config.js
curl http://localhost:3002/cron/status
curl -X POST http://localhost:3002/cron/analytics

# jobs WITH an npm script
npm run detect-anomalies -- --dry-run
npm run detect-anomalies -- --all            # or --year=2024 --since=ISO --ids=a,b --baselines-only --score-only
npm run detect-anomalies -- --classification=10233 --score-only   # repair ONE catalogue code (narrows only)
npm run score-anomalies-ai -- --limit=20 --rpm=18 --dry-run
npm run refresh-analytics -- --patterns      # or --dashboard
npm run refresh-product-analytics
npm run refresh-product-variants
npm run refresh-organism-groups
npm run refresh-dept-indicators
npm run refresh-integrity-signals -- --dry-run    # or --months=60
npm run refresh-spending-trend
npm run cross-provider-anomalies
npm run reconcile-amendments -- --dry-run --since-days=10
npm run sync-open-calls
npm run backfill-open-calls
npm run deadline-reminders
npm run alert-digest
npm run weekly-newsletter -- --dry-run
npm run webhooks
npm run pliego-summary -- --eager
npm run import-sice-catalog -- --force
npm run load-dei -- --dry-run
npm run load-jutep-omisos -- --dry-run
npm run load-udeco-sanctions -- --dry-run
npm run refresh-udeco-crossref -- --dry-run
npm run extract-acta-bidders -- --limit=200 --dry-run   # or --ocid=ocds-yfs5dr-1311173 --force

# jobs WITHOUT an npm script (npx tsx only)
npx tsx src/jobs/correct-lumpsum-artifacts.ts --limit=50          # dry by default; add --commit
npx tsx src/jobs/correct-lumpsum-artifacts.ts --release=adjudicacion-53193 --force --commit
npx tsx src/jobs/refresh-exchange-rates.ts
npx tsx src/jobs/seed-historical-rates.ts --commit --from=2004 --to=2006
npx tsx src/jobs/backfill-pliego-docs.ts --limit 500 --concurrency 8
npx tsx src/jobs/backfill-reiteracion-docs.ts --limit 2000 --concurrency 8
npx tsx src/jobs/enrich-suppliers.ts --dry-run
npx tsx src/jobs/enrich-supplier-contacts.ts --limit=100 --dry-run
npx tsx src/jobs/campaign/enqueue.ts --campaign=promo1
npx tsx src/jobs/campaign/send.ts --campaign=promo1 --dry-run

# verification (there is NO test runner in this repo)
npx tsx tests/unit/test-anomaly-stats.ts; echo $?
npx tsx tests/unit/test-lumpsum-artifacts.ts
npx tsc --noEmit                    # targeted root typecheck
npm run lint                        # eslint src --ext .ts
```

Cron schedule (all `America/Montevideo`, defined in [`src/cronserver.ts`](../cronserver.ts) `setupCronJob`):

| Expr | Work |
|---|---|
| `5 * * * *` | in-process ingest → `jobs/reconcile-award-amendments --since-days=10` → organism-groups **only if** `corrected>0` |
| `20 * * * *` | `jobs/sync-open-calls` |
| `*/2 * * * *` | `jobs/webhooks/run` |
| `30 */6 * * *` | `jobs/refresh-exchange-rates` → `jobs/refresh-analytics` → `populate-filters` → `jobs/refresh-product-analytics` |
| `15 4 * * *` | `jobs/detect-anomalies` → unlimited high/critical AI lane → bounded recent all-severity lane |
| `50 * * * *` | bounded `jobs/score-anomalies-ai --min-rank=1 --limit=$AI_TRIAGE_BATCH_LIMIT` retry/backfill, newest source date first |
| `0 5 * * *` / `0 6 * * *` / `0 8 * * *` | `jobs/deadline-reminders` / `jobs/cross-provider-anomalies` / `jobs/alert-digest` |
| `15 9 * * 1` | `jobs/weekly-newsletter` for the previous completed Uruguay week |
| `0 2 * * 0` / `0 7 * * 0` | weekly reconcileNonFinalReleases → full `jobs/reconcile-award-amendments` / `jobs/refresh-product-variants` |
| `40 6 * * 1` | `jobs/load-udeco-sanctions` → `jobs/refresh-udeco-crossref` — weekly, small, and the cross-ref reads what the loader just wrote |
| `20 3 * * *` | `jobs/extract-acta-bidders --limit=400` — bounded on purpose; the backlog drains over nights instead of grinding the gov site |
| `15 6 * * 1` | `jobs/load-jutep-omisos` — weekly; JUTEP republishes a few times a year, the load is a 5s upsert |
| `30 5 * * *` | `jobs/refresh-integrity-signals` — after the 04:15 detector, because it reads the anomalies its AI lane triages |
| `0 3 * * 1` / `0 3 1 * *` / `0 4 1 * *` / `0 5 1 * *` | `jobs/import-sice-catalog` / `jobs/refresh-organism-groups` / `jobs/refresh-dept-indicators` / `jobs/refresh-spending-trend` |

## Conventions

- **Entrypoint shape.** `#!/usr/bin/env tsx` + a docblock stating WHY, then `main()`, then either `if (require.main === module) { … }` (12 files, e.g. refresh-analytics.ts, detect-anomalies.ts, score-anomalies-ai.ts, correct-lumpsum-artifacts.ts) or a bare top-level `main()` call (sync-open-calls.ts, alert-digest.ts, load-dei.ts). **Only the `require.main` form is importable as a library**: reconcile-award-amendments.ts:70 does `import { rescoreReleaseIds } from "./detect-anomalies"`, and the guard is what makes it work.
- **Compute-then-swap, never delete-then-compute.** `swapCollection` (refresh-analytics.ts:600) refuses to swap when 0 documents were computed. import-sice-catalog / refresh-product-analytics / cross-provider-anomalies / refresh-product-variants use the other variant: write the new `dataVersion`, then `deleteMany({ dataVersion: { $ne: current } })`.
- **All money aggregation imports from [analytics-pipeline.ts](analytics-pipeline.ts).** Use `amount.primaryAmount` for release-level sums and `FX_SCALE`/`UNWOUND_ITEM_UYU` per item. Never `$sum: '$awards.items.unit.value.amount'`.
- **Mongo 4.4 standalone constraints** (detect-anomalies.ts:23-30): no `$percentile`/`$median`/`$sortArray`/`$topN`, no transactions, hard 100MB per-stage limit, no `allowDiskUseByDefault`. Every aggregate passes `.allowDiskUse(true)` (9 call sites across `src/jobs/*.ts`) and streams via `.cursor()`. `$push` is banned — it does not spill to disk.
- **Raise the socket timeout BEFORE connecting**: `if (!process.env.MONGO_SOCKET_TIMEOUT_MS) process.env.MONGO_SOCKET_TIMEOUT_MS = String(30*60*1000)` — done in detect-anomalies.ts:891, refresh-analytics.ts:646, score-anomalies-ai.ts:698, refresh-product-analytics.ts:333, cross-provider-anomalies.ts:349, refresh-organism-groups.ts:41, refresh-dept-indicators.ts:36. The shared default is 45s and kills a legitimately-working aggregation.
- **Canonical units.** Baseline/scoring keys always go through `canonicalUnit()` / `canonicalUnitExpr()` from `shared/utils/units`, server-side in the pipeline so grouping stays streaming. `anomalies.metadata.itemUnit.name` is therefore canonical (lowercased) while raw award items are not: match case-insensitively (`findTargetItemIndex`, score-anomalies-ai.ts:309).
- **Machine-readable summary lines** when the scheduler needs to react: reconcile-award-amendments.ts:470 prints `RECONCILE_SUMMARY corrected=… skipped=… removedUYU=… basesChecked=…`, parsed at cronserver.ts:191.
- **Pure/testable split is deliberate.** [anomaly-stats.ts](anomaly-stats.ts), [analytics-pipeline.ts](analytics-pipeline.ts), [open-calls/project.ts](open-calls/project.ts), [variants/rollup.ts](variants/rollup.ts), [enrich/match-score.ts](enrich/match-score.ts) have no I/O imports. Put new statistics/merge logic there, not in the entrypoint, and export it so `tests/unit/` can import it.
- **Any write to stored money must record an audit override** as ONE complete `$set`: `amount.verifiedOverride { source, sourceUrl, officialTotal, officialCurrency, rateMonth, previousPrimaryAmount, previousComputedTotal, verifiedAt, reason }` (correct-lumpsum-artifacts.ts). A partial write permanently masks the release from recomputation. Every job writing `release.amount` must first call `hasVerifiedOverride()` from `shared/utils/verified-override` and skip.
- **Gemini prompts are Spanish, inline in the job**, always with a structured `responseSchema` (never free chat). Verdicts are ADVISORY — they never delete a statistical flag.
- **Concurrency helpers are local, not a dependency**: `runPool()` (score-anomalies-ai.ts:647), `mapLimit()` (open-calls/pliego-probe.ts:60).
- **Non-fatal tail jobs**: exchange-rates, product-analytics and AI triage record their own failures, so a network/Gemini hiccup never marks the primary job failed. Anomaly AI has its own health state and hourly retry lane.

## Gotchas

- **Search [detect-anomalies.ts](detect-anomalies.ts) with `Read` or `grep -a`.** It carries a literal NUL byte at byte offset 10106 (line 246), inside `].join("\0")` in `anomalyContentVersion`. ripgrep/grep classify the file as binary, so the Grep tool and `grep -rn` return only "Binary file … matches". Biggest time-waster in this subsystem.
- **Re-check every fetched doc with `isLumpsumSuspect()` before you act on it.** `candidateMatchStage()` is looser: it cannot express the `maxPricedItems` cap (lumpsum-candidates.ts:23-29, restated at :80-85). Latent gap at lumpsum-candidates.ts:49-54: the Mongo `$in: ['USD','EUR']` is case-**sensitive** while `isLumpsumSuspect()` upper-cases, so a lower-case currency passes the JS rule and Mongo drops it.
- **Lump-sum correction deliberately excludes amendment-tagged releases** (`awardUpdate`/`awardCancellation`, lumpsum-candidates.ts:36-47) — a known uncorrected example is `ajuste_adjudicacion-28580` at ~10.85e9 UYU. `--force` is refused without `--release=<id>` (correct-lumpsum-artifacts.ts:27-32).
- **Nothing scheduled corrects an inflated stored total.** detect-anomalies only *suppresses* line-total artifacts (`isLineTotalArtifact`, detect-anomalies.ts:275), and `MAX_PLAUSIBLE_RELEASE_UYU` (analytics-pipeline.ts:47) only excludes them from aggregates. The one writer is [correct-lumpsum-artifacts.ts](correct-lumpsum-artifacts.ts), which is neither on cron nor in package.json.
- **Prices fixed by law are not scored statistically.** Classification `10233` (TIMBRE PROFESIONAL) is a menu of nine denominations set by decree and raised EVERY SEMESTER, all pooled under one catalogue code. `scoreUnitPrice` takes that semester's legal menu from [shared/timbre-values.ts](../../shared/timbre-values.ts) and never flags an exact match. An off-menu timbre price gets the legal menu as its `expectedRange` plus `metadata.officialTariff`, instead of the meaningless `p25..p95` (`140..170` for an item whose legal price reaches 16 870). Without it, every January's new schedule flagged `critical` until each value had been bought three times: `RECURRING_PRICE_MIN_COUNT` is date-blind, cannot fix that, and also suppresses a stale value in a later year. **Update the table manually twice a year**; [tests/unit/test-timbre-values.ts](../../tests/unit/test-timbre-values.ts) hard-fails once the current semester is missing. Every other catalogue code containing the word "timbre" is a DOORBELL and must stay out.
- **`--classification=<id>` narrows, it never widens.** It intersects with the date scope and does NOT relax the default trailing 24 months. Dropping the date bound made a dry run emit 558 findings where 178 existed; the extra ~380 were 2005-2023 flags in unrelated classifications that merely shared a release with the targeted code. Use `--classification=<id> --all` when the whole history really is wanted.
- **Two different things are called `dataVersion` in detect-anomalies.ts.** `anomalies.dataVersion` is CONTENT-derived (detect-anomalies.ts:231/:735) and gates the incremental AI triage — never fold baseline bounds/severity/zScore into that hash, or the nightly triage re-charges the whole corpus. The detector instance ALSO has a run-scoped `this.dataVersion = v${ts}` (detect-anomalies.ts:290), used only for the `item_price_baselines` swap.
- **`reconcile()` uses `{$and: [scopeFilter, {id: {$in: batch}}]}`, not object spread** (detect-anomalies.ts:866). Spreading lets the batch's `id` overwrite a targeted rescore's `id`, unbounding the delete to every non-reproduced anomaly in the DB.
- **`normalizeVerdict()` (score-anomalies-ai.ts:604)** enforces `explainable==='no'` ⇔ `category==='sin-explicacion'`; a contradiction resolves to `uncertain`, never a clean `yes`. Every downstream "unexplained" consumer (cross-provider-anomalies.ts, refresh-product-variants.ts, `/analytics/unexplained`) depends on that invariant.
- **`itemNro()` (score-anomalies-ai.ts:260)** parses the LEADING integer of an award item id, because the id is a plain int in some extraction batches and `"<nro>-<sub>"` in others. A plain numeric cast silently dropped características for ~29% of triaged anomalies. `--rescore-featureless` (score-anomalies-ai.ts:223) repairs the verdicts made blind.
- **A triage run with 0 successful verdicts does not overwrite `data/anomaly-ai-verdicts/latest.json`** (score-anomalies-ai.ts:1035) — a 429-storm cannot destroy a previous good dump.
- **Anomaly AI uses the shared Gemini → Groq model ladder** with streaming, a 45s inactivity timeout per model and a 180s overall budget per flag. A stuck model falls through instead of retrying the same timeout forever; a whole-ladder failure stays pending for the hourly retry lane.
- **Pass `--rpm` when you run the AI triage by hand.** It defaults to unthrottled, and a free key 429-storms; the cronserver always passes `--rpm=${AI_TRIAGE_RPM || 18}` (cronserver.ts:1016) because the Gemini free tier is 20 RPM.
- **`releases.buyer.id` has NO index** (`buyer.name` does), so refresh-dept-indicators and refresh-organism-groups are deliberate monthly COLLSCANs with `allowDiskUse`. Never put a `buyer.id`-led aggregate on a request path.
- **[refresh-product-variants.ts:34](refresh-product-variants.ts) imports `../../app/server/utils/query`** — a job reaching into the Nuxt app tree. Moving or renaming that file breaks the job, and a root `tsc` sees it. [ai/item-features.ts](ai/item-features.ts) crosses the same boundary by copy: keep it in sync with `app/server/api/contracts/[id]/features.get.ts`.
- **The cronserver's mutual-exclusion guard `busyWith()` (cronserver.ts:121) covers only ingest / reconcile / analytics / anomalies.** Every other job uses its own boolean and can run concurrently. These are in-process booleans, not durable locks — a pm2 restart forgets them while an orphan child keeps running.
- **`runJobProcess` takes a path relative to `src/` WITHOUT extension** (cronserver.ts:141-148) and picks `npx tsx` vs `process.execPath --max-old-space-size=2048` by whether `__filename` ends in `.ts`. A typo fails only at spawn time, as a non-zero exit. After you add a job, verify that `npm run build` emits it to `dist/src/jobs/` — testing under tsx alone proves nothing.
- **The cron server only nudges `organism_group_stats` after a reconcile that actually corrected something** (cronserver.ts:190-191). `dept_indicators` has no such nudge, so a correction to an Intendencia award can sit uncorrected there until the 1st of the month.
- **`MAX_ANOMALIES = 50_000`** (detect-anomalies.ts:70) keeps the worst findings (sorted by severity desc) and logs loudly when hit (:643) — a safety cap, not a correctness bound.
- **Two campaign library files change live HTTP behaviour**: `app/server/api/campaign/*` imports [campaign/unsubscribe-core.ts](campaign/unsubscribe-core.ts) and [campaign/brevo-events.ts](campaign/brevo-events.ts) directly.
- **No test *framework* (no vitest/jest), no CI test step.** Tests are standalone tsx assertion scripts under `tests/unit/`; run one directly or all via `npm test` (= `node scripts/run-tests.mjs unit`). Also verify with targeted `npx tsc --noEmit` and the `--dry-run` flags (detect-anomalies, score-anomalies-ai, correct-lumpsum-artifacts, reconcile-award-amendments, load-dei, campaign/send).
- **`shared/config.ts` calls `dotenv.config({ override: true })`** — the root `.env` WINS over shell env vars. `MONGODB_URI=… npx tsx src/jobs/<x>.ts` does NOT do what it looks like for anything importing a shared model. Edit `.env` instead.

## Environment

| Var | Effect |
|---|---|
| `MONGODB_URI` | Mongo connection (via `shared/config.ts`). |
| `MONGO_SOCKET_TIMEOUT_MS` | Idle socket timeout; jobs self-set it before connecting. |
| `GEMINI_API_KEY` / `GOOGLE_API_KEY` | Gemini for anomaly triage, pliego summaries, supplier enrichment, the Maps match-judge. |
| `NEWSLETTER_GEMINI_MODEL` | Optional weekly editorial model override; defaults to `gemini-2.5-flash`. |
| `AI_TRIAGE_RPM` | Throttle passed as `--rpm` by the cronserver (default 18; free tier is 20 RPM). |
| `AI_TRIAGE_BATCH_LIMIT` | Hourly all-severity recent/retry queue size (default 60). |
| `ANALYTICS_MAX_RELEASE_UYU` | Plausibility ceiling for aggregates, default 50e9; 0 disables (analytics-pipeline.ts:47-48). |
| `MAX_PLAUSIBLE_RELEASE_UYU`, `LUMPSUM_QTY_THRESHOLD` (1000), `LUMPSUM_SUSPECT_MIN_UYU` (1e9), `LUMPSUM_RATIO_MIN` (5), `LUMPSUM_MAX_ITEMS` (2) | Lump-sum candidate band (lumpsum-candidates.ts:60-71). |
| `PROVIDER_OVERPRICE_CEILING_UYU` (1e8), `PROVIDER_OVERPRICE_CEILING_OTHER` (2.5e6), `PROVIDER_OVERPRICE_UYU_TODAY_CEILING` (1.5e8) | Overprice clamps (cross-provider-anomalies.ts:64-75). |
| `PV_ONLY_CODE`, `PV_MAX_CODES`, `PV_MAX_CONTRACTS_PER_CODE` (300) | Scope knobs for refresh-product-variants (refresh-product-variants.ts:37-39); a partial run skips the swap cleanup. |
| `PLIEGO_PROBE_MAX_PER_SYNC`, `PLIEGO_EAGER_LIMIT`, `SYNC_EAGER_SUMMARY_LIMIT`, `PLIEGO_AI_MODEL` | Pliego probe + summary budget and model. |
| `WEBHOOK_PRODUCE_WINDOW_MS`, `WEBHOOK_DISPATCH_BATCH`, `WEBHOOK_MAX_ATTEMPTS` | Webhook producer window, drain batch, retry ceiling. |
| `APP_BASE_URL` | Link base in alert/reminder emails and push/telegram cards. |
| `RESEND_API_KEY`, `ALERTS_FROM_EMAIL`, `ALERTS_REPLY_TO` | Transactional email; absent ⇒ NoopMailer. |
| `TELEGRAM_BOT_TOKEN`, `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT` | Telegram / Web Push transports; absent ⇒ logged no-op. |
| `MAPS_PROXY_URL` | Google Maps proxy for the google-maps contact resolver. |
| `COLD_SMTP_*`, `CAMPAIGN_TOKEN_SALT`, `CAMPAIGN_SENDER_IDENTITY`, `CAMPAIGN_UNSUB_MAILTO` | Cold-email campaign transport + identity (deliberately NOT Resend). |

## Related

- [`../context.md`](../context.md) — `src/` ingestion layer + the cronserver that schedules everything here.
- [`../../shared/context.md`](../../shared/context.md) — models, connection singleton, `verified-override`, `units`, `real-value`, matcher.
- [`../../app/server/context.md`](../../app/server/context.md) — the Nitro routes that READ the collections these jobs write.
- [`../../scripts/context.md`](../../scripts/context.md) — `ensure-indexes.ts` (the only thing that actually builds indexes; `autoIndex` is off), deploy, one-off ops.
- Root repo guide: [`../../CLAUDE.md`](../../CLAUDE.md).
