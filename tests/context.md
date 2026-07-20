# tests/ — assertion scripts (no runner)

The entire automated-test surface of gastos-gub: 41 files in [unit/](unit/), 7 in [integration/](integration/), 2 in [performance/](performance/), 2 HTML/XML [fixtures/](fixtures/). There is **no test runner, no `npm test`, and no CI test step** — every file is a standalone `tsx` program that either throws (`node:assert`) or counts failures and calls `process.exit(1)`. A pass is exit code 0. You discover tests by listing the directory, not by running a suite.

## Map

| Path | Purpose |
|---|---|
| [README.md](README.md) | **STALE.** Lists ~14 tests; the tree has 50. Predates `fixtures/` and every `*.test.ts`. Do not use as an index. |
| [fixtures/bcu-cotizaciones-2005-06-28.xml](fixtures/bcu-cotizaciones-2005-06-28.xml) | BCU SOAP cotizaciones response; read by `test-bcu-historical-rates.ts:14`. |
| [fixtures/comprasestatales-53193.html](fixtures/comprasestatales-53193.html) | Gov contract detail page (the SURYPARK lump-sum case); read by `test-comprasestatales-total.ts:31`. |
| **unit/ — pure logic** | |
| [unit/test-anomaly-stats.ts](unit/test-anomaly-stats.ts) | Largest test (481 L). `src/jobs/anomaly-stats`: computeBaselineStats, modifiedZScore, weightedPercentile, confidenceFromZ, scoreUnitPrice, severityRankFromAbsZ + tuning constants. |
| [unit/test-anomaly-content-version.ts](unit/test-anomaly-content-version.ts) | `anomalyContentVersion` exported from `src/jobs/detect-anomalies` — the content-hash `dataVersion` that stops nightly AI re-triage. |
| [unit/test-target-item-match.ts](unit/test-target-item-match.ts) | `findTargetItemIndex` from `src/jobs/score-anomalies-ai` (case-insensitive canonical-unit match). |
| [unit/test-verdict-normalize.ts](unit/test-verdict-normalize.ts) | `normalizeVerdict` from `src/jobs/score-anomalies-ai` (explainable ⇔ category invariant). |
| [unit/test-lumpsum-artifacts.ts](unit/test-lumpsum-artifacts.ts) | `hasVerifiedOverride` (shared/utils/verified-override), `amountPipelineExpr` (src/uploaders/release-uploader), `isArtifactConfirmed`/`isLumpsumSuspect`/`LUMPSUM_DEFAULTS` (src/jobs/lib/lumpsum-candidates). |
| [unit/test-comprasestatales-total.ts](unit/test-comprasestatales-total.ts) | `src/jobs/lib/comprasestatales-total` against the HTML fixture. |
| [unit/test-bcu-historical-rates.ts](unit/test-bcu-historical-rates.ts) | `src/jobs/lib/bcu-historical-rates` against the XML fixture. |
| [unit/test-matcher.ts](unit/test-matcher.ts) | `watchMatchesCall` from `shared/matching/match` + `shared/utils/text`. |
| [unit/test-text-normalize.ts](unit/test-text-normalize.ts) | `shared/utils/text` normalizeText / normalizeKeyword / phraseMatches. |
| [unit/test-sice.ts](unit/test-sice.ts) | `src/jobs/sice/parse` + `shared/utils/rubro-tokens` + `shared/utils/units` + `src/jobs/open-calls/project`. |
| [unit/test-open-call-project.ts](unit/test-open-call-project.ts) | `src/jobs/open-calls/project` (deriveStatus, projectOpenCall). |
| [unit/test-open-calls-count.ts](unit/test-open-calls-count.ts) | `buildOpenCallCountQuery` from `src/jobs/campaign/open-calls-count`. |
| [unit/test-alerts-multichannel.ts](unit/test-alerts-multichannel.ts) | `shared/alerts/build-alert-content`, `/channels`, `/link-token`. |
| [unit/test-mask-mongo-uri.ts](unit/test-mask-mongo-uri.ts) | `maskMongoUri` from `shared/connection/database` — guards the prod-credential-in-logs incident. |
| [unit/webhook.test.ts](unit/webhook.test.ts) | `shared/webhooks/sign`: signPayload shape/determinism, generateWebhookSecret, assertSafeWebhookUrl SSRF blocklist. |
| [unit/api-key.test.ts](unit/api-key.test.ts) | `app/server/utils/api-key`: gk_live_ format, parsePrefix, hashToken, verifyToken. |
| [unit/cursor.test.ts](unit/cursor.test.ts) | `app/server/utils/cursor` encode/decode round-trip + malformed input. |
| [unit/openapi.test.ts](unit/openapi.test.ts) | Structural validation of `app/server/utils/openapi` (3.1.0, securitySchemes, every op has responses). |
| [unit/item-features.test.ts](unit/item-features.test.ts) | `shared/utils/item-features` parseItemFeatures / parseBuyObject over inline HTML. |
| [unit/variants-rollup.test.ts](unit/variants-rollup.test.ts) | `rollupVariants` from `src/jobs/variants/rollup`. |
| [unit/test-rubro-watch.ts](unit/test-rubro-watch.ts) | `buildRubroWatchPayload` from `app/utils/rubro-watch` — the ONLY test of Nuxt front-end code. |
| [unit/test-campaign-models.ts](unit/test-campaign-models.ts) | `shared/models/{email_suppression,email_campaign,campaign_send}` via `validateSync()` + `collection.name`, no DB. |
| [unit/test-campaign-recipients.ts](unit/test-campaign-recipients.ts) | `src/jobs/campaign/recipients`. |
| [unit/test-campaign-send-helpers.ts](unit/test-campaign-send-helpers.ts) | `warmupCap`, `makeToken` exported from `src/jobs/campaign/send`. |
| [unit/test-campaign-suppression.ts](unit/test-campaign-suppression.ts) | `src/jobs/campaign/suppression`. |
| [unit/test-campaign-template.ts](unit/test-campaign-template.ts) | `src/emails/campaign-templates`. |
| [unit/test-campaign-unsubscribe.ts](unit/test-campaign-unsubscribe.ts) | `src/jobs/campaign/unsubscribe-core` with injected findSend/markUnsub/suppress closures. |
| [unit/test-brevo-webhook.ts](unit/test-brevo-webhook.ts) | `src/jobs/campaign/brevo-events` mapBrevoEvent. |
| [unit/test-cold-mailer.ts](unit/test-cold-mailer.ts) | `src/services/cold-mailer` with a fake nodemailer transport. |
| [unit/test-contact-hygiene.ts](unit/test-contact-hygiene.ts) | `src/jobs/enrich/hygiene`. |
| [unit/test-contact-resolvers.ts](unit/test-contact-resolvers.ts) | `src/jobs/enrich/resolvers/{dei,website,web-search,impo}` with a hand-rolled `fakeDb()` (line 9). |
| [unit/test-contact-rubros.ts](unit/test-contact-rubros.ts) | `src/jobs/enrich/rubros`. |
| [unit/test-places-enrichment.ts](unit/test-places-enrichment.ts) | `src/jobs/enrich/{match-score,match-judge,backends}` + `resolvers/google-maps`. |
| [unit/test-supplier-contacts-model.ts](unit/test-supplier-contacts-model.ts) | `shared/models/supplier_contacts` (validateSync, no connection). |
| **unit/ — NOT pure (network or DB)** | |
| [unit/test-amount-calculator.ts](unit/test-amount-calculator.ts) | Calls `fetchCurrencyRates()`/`fetchUYIRate()` at :38-39 → **live HTTP**. |
| [unit/test-script-consistency.ts](unit/test-script-consistency.ts) | Same calls at :16-17 → **live HTTP**. |
| [unit/test-uploader-structure.ts](unit/test-uploader-structure.ts) | Same calls at :31-32 → **live HTTP**. |
| [unit/test-rss-fetcher.ts](unit/test-rss-fetcher.ts) | `src/services/release-rss-fetcher` against comprasestatales.gub.uy → **live HTTP**. |
| [unit/test-url-structure.ts](unit/test-url-structure.ts) | Raw `axios` GET/HEAD probes of gov URLs → **live HTTP**. |
| [unit/focus-item.verify.ts](unit/focus-item.verify.ts) | **Not a unit test.** Connects to Mongo (mongoose direct) and verifies the focusItem projection. Requires `MONGODB_URI`; exits 1 without it (:8). |
| [unit/test-amount-calculation.ts](unit/test-amount-calculation.ts) | Zero imports — inline mock release + reimplemented logic. Documentation-grade, does not exercise the real calculator. |
| **integration/ — all require a live Mongo** | |
| [integration/test-open-calls-sync.ts](integration/test-open-calls-sync.ts) | Runs `syncOpenCalls({suppressAlerts:true})` → **WRITES `open_calls`**, then asserts shape. The only integration file written as a real pass/fail test. |
| [integration/test-single-upload.ts](integration/test-single-upload.ts) | **WRITES a real release** (adjudicacion-1217812) via DatabaseService + ReleaseUploader path. Header at :17-19 records the credential-leak incident: never hardcode a URI here. |
| [integration/test-anomalies.ts](integration/test-anomalies.ts) | Read-only sample of AnomalyModel; has explicit exit(0/1). |
| [integration/test-autocomplete-api.ts](integration/test-autocomplete-api.ts) | Read-only print. Connects via `app/server/utils/database`, not `shared/connection/database`. |
| [integration/test-supplier-ids.ts](integration/test-supplier-ids.ts) | Read-only print; same app-side connector. |
| [integration/test-supplier-patterns.ts](integration/test-supplier-patterns.ts) | Read-only print; same app-side connector. |
| [integration/test-dashboard.ts](integration/test-dashboard.ts) | **DEAD — 0 bytes.** |
| **performance/** | |
| [performance/test-parallel-fetcher.ts](performance/test-parallel-fetcher.ts) | Times `ReleaseRSSFetcher.fetchReleasesWithDataParallel`. Network, no DB. exit(1) on throw. |
| [performance/test-supplier-id-performance.ts](performance/test-supplier-id-performance.ts) | Live DB; proves the `awards.suppliers.id` index is used. exit(0/1). |

## Entry points / how to run

```bash
# one test; 0 = pass
npx tsx tests/unit/test-anomaly-stats.ts; echo $?
npx tsx tests/unit/webhook.test.ts

# the whole pure-unit surface (bash)
for f in tests/unit/*.ts; do echo "== $f"; npx tsx "$f" >/dev/null || echo "FAIL $f"; done

# DB-touching (see gotchas — .env overrides these inline vars for most files)
MONGODB_URI=... npx tsx tests/integration/test-open-calls-sync.ts
MONGODB_URI=... FOCUS_CODE=26392 npx tsx tests/unit/focus-item.verify.ts
npx tsx tests/performance/test-supplier-id-performance.ts
```

There is no `npm test`, no `--watch`, no filter flag. `npm run lint` covers `src` only.

## Conventions

| Rule | Cite |
|---|---|
| Two failure styles, both accepted. (a) bare `import assert from 'node:assert'` / `'node:assert/strict'`, throw to fail, no exit call — 27 files. (b) local `ok(name, cond)` counter with ✓/✗ output and a terminal `process.exit(failed === 0 ? 0 : 1)` — 15 files. Pick (a) for short tests, (b) when you want per-assertion output. | [unit/webhook.test.ts:1](unit/webhook.test.ts) vs [unit/test-matcher.ts:9-14](unit/test-matcher.ts) and its last line |
| Naming: newer files are `<subject>.test.ts`, legacy bulk is `test-<subject>.ts`. Both live in `unit/`. Do not normalise one to the other. | [unit/variants-rollup.test.ts](unit/variants-rollup.test.ts) vs [unit/test-sice.ts](unit/test-sice.ts) |
| Every test carries a runnable command in its own header comment — that is the only discovery mechanism. Add one. | [unit/test-matcher.ts:2-3](unit/test-matcher.ts), [integration/test-open-calls-sync.ts:6](integration/test-open-calls-sync.ts) |
| To test a job, **export the pure function out of the job module** and import it directly. Job modules do not execute on import (they guard with `require.main === module`). | `anomalyContentVersion` ← [unit/test-anomaly-content-version.ts:11](unit/test-anomaly-content-version.ts); `warmupCap`/`makeToken` ← [unit/test-campaign-send-helpers.ts:2](unit/test-campaign-send-helpers.ts) |
| Purity comes from hand-rolled dependency injection, never a mocking library. There is no jest/vitest/sinon in this repo — do not add one. | `fakeDb()` at [unit/test-contact-resolvers.ts:9](unit/test-contact-resolvers.ts); fake transport in [unit/test-cold-mailer.ts](unit/test-cold-mailer.ts); injected closures in [unit/test-campaign-unsubscribe.ts](unit/test-campaign-unsubscribe.ts) |
| Mongoose models are tested with **no connection**: `new Model({...}).validateSync() === undefined` plus `doc.collection.name` to pin the collection. | [unit/test-campaign-models.ts:7-8](unit/test-campaign-models.ts) |
| Fixtures are read `join(__dirname, "../fixtures/<file>")` so tests are cwd-independent for fixture paths. | [unit/test-comprasestatales-total.ts:31](unit/test-comprasestatales-total.ts) |
| Integration tests must read the URI from the environment. Never hardcode a connection string — this is a public repo and that line once leaked the prod password. | [integration/test-single-upload.ts:17-22](integration/test-single-upload.ts) |

## Gotchas

- **No CI runs any of this.** `package.json` has no `test` script, and `.github/workflows/deploy.yml` only writes `app/.env`, runs `npm --prefix app ci`, and `node scripts/deploy-dashboard.mjs`. Nothing catches a broken test but you.
- **`.env` overrides your inline env var.** `shared/config.ts:8` calls `config({ override: true })`. Any test that transitively imports `shared/config` (i.e. all of `shared/models`, `shared/connection/database`, `src/services/*`) ignores `MONGODB_URI=... npx tsx ...` and uses the `.env` value instead — including [integration/test-open-calls-sync.ts](integration/test-open-calls-sync.ts), whose own header (:6) claims otherwise. Only [unit/focus-item.verify.ts](unit/focus-item.verify.ts) (mongoose-only, no `shared/config`) truly honours the inline var.
- **…and the root `.env` currently points at production Mongo** (`167.148.41.10:27017/gastos_gub`). Combined with the override above, running [integration/test-open-calls-sync.ts](integration/test-open-calls-sync.ts) or [integration/test-single-upload.ts](integration/test-single-upload.ts) **writes to the live DB** (`open_calls` / `releases`). Edit `.env` or do not run them.
- **Nothing here is typechecked.** Root `tsconfig.json` `include` is only `src/**/*` + `shared/**/*`, and `exclude` lists `**/*.test.ts`. `npm run build` (tsc) sees no test file. A type error surfaces only when you run the file with `tsx`.
- **[README.md](README.md) is stale** — lists ~14 tests against 50 on disk, and predates `fixtures/` and the `*.test.ts` family entirely.
- **Seven files under `unit/` are a staged-but-uncommitted move** from a former top-level `test/` directory: `git ls-tree -r HEAD --name-only | grep '^test/'` still shows `test/api-key.test.ts`, `cursor.test.ts`, `focus-item.verify.ts`, `item-features.test.ts`, `openapi.test.ts`, `variants-rollup.test.ts`, `webhook.test.ts`, while `git status --porcelain tests` shows them as `A`/`AM` under `tests/unit/`. Multiple agent sessions share ONE working tree — switching branches can move them under you. Their headers still cite the old `test/` path ([unit/focus-item.verify.ts:5](unit/focus-item.verify.ts)).
- **Six files in `unit/` are not unit tests and fail offline**: [test-amount-calculator.ts](unit/test-amount-calculator.ts):38-39, [test-script-consistency.ts](unit/test-script-consistency.ts):16-17 and [test-uploader-structure.ts](unit/test-uploader-structure.ts):31-32 all call `fetchCurrencyRates()`/`fetchUYIRate()`; [test-rss-fetcher.ts](unit/test-rss-fetcher.ts) and [test-url-structure.ts](unit/test-url-structure.ts) hit comprasestatales.gub.uy; [focus-item.verify.ts](unit/focus-item.verify.ts) connects to Mongo.
- **[unit/test-amount-calculation.ts](unit/test-amount-calculation.ts) imports nothing** — it reimplements the amount logic inline. It cannot detect a regression in `src/utils/amount-calculator.ts`. Do not trust it as coverage.
- **[integration/test-dashboard.ts](integration/test-dashboard.ts) is 0 bytes** and exits 0. So does anything that reads it as "passing".
- Four of the seven integration files ([test-autocomplete-api](integration/test-autocomplete-api.ts), [test-supplier-ids](integration/test-supplier-ids.ts), [test-supplier-patterns](integration/test-supplier-patterns.ts)) are print-and-eyeball diagnostics with **no `process.exit`** — they exit 0 no matter what they find. Only [test-open-calls-sync.ts](integration/test-open-calls-sync.ts), [test-single-upload.ts](integration/test-single-upload.ts) and [test-anomalies.ts](integration/test-anomalies.ts) signal failure.
- **Two Mongo connectors coexist.** [integration/test-autocomplete-api.ts:1](integration/test-autocomplete-api.ts), [test-supplier-ids.ts:1](integration/test-supplier-ids.ts) and [test-supplier-patterns.ts:1](integration/test-supplier-patterns.ts) import `connectToDatabase` from `app/server/utils/database` (the Nuxt-side re-export); everything else uses `shared/connection/database`.
- If a `src/jobs/*` or `shared/*` signature changes, the matching file here is the **single** place that breaks — nothing else enforces those contracts. `unit/` is also the only automated check the `app/server/utils/{api-key,cursor,openapi}` developer-platform code has; `cd app && npm run type-check` does not run these.

## Related

- Root [CLAUDE.md](../CLAUDE.md) — repo-wide instructions.
- [../scripts/context.md](../scripts/context.md) — operational CLI drawer (index migrations, deploy, asset builders); recurring jobs do **not** live there.
- [../src/context.md](../src/context.md) — ingestion + uploaders; [../src/jobs/context.md](../src/jobs/context.md) — the batch/analytics jobs whose exported pure functions most of `unit/` imports.
- [../shared/context.md](../shared/context.md) — models, matcher, text/unit normalization, verified-override; the other half of what `unit/` tests.
- [../app/context.md](../app/context.md) — Nuxt frontend; [../app/server/context.md](../app/server/context.md) — Nitro API (`utils/api-key`, `utils/cursor`, `utils/openapi` are covered here).
