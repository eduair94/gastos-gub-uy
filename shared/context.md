# shared/ — models, connection, cross-layer utilities

Single source of truth for the Mongo data layer. Also holds every **pure** algorithm that must behave
the same in a cron job and in an HTTP handler. Both the batch layer (`src/`, `scripts/`) and the Nuxt
app (`app/`) import it. Nothing here is Nuxt- or Vue-aware.

Contents: ~39 registered Mongoose models across 35 files ([models/](models/)), the process-wide
connection singleton ([connection/database.ts](connection/database.ts)), DB-free helpers (watch↔call
matcher, text/unit normalization, OCID→gov-URL derivation, FX/inflation re-basing, rubro tokens,
webhook HMAC+SSRF, alert-card renderer), and three curated static tables that are *data, not code*
(organism groups, political mandates, procurement-method classification).

## Map

### Connection & config
| Path | Purpose |
|---|---|
| [config.ts](config.ts) | 9 lines. Runs `dotenv config({ override: true })`, then exports `mongoUri` / `mongoDatabase`. See [Gotchas](#gotchas) for the override trap. |
| [connection/database.ts](connection/database.ts) | THE connection. `connectToDatabase()` / `ensureConnection()` / `disconnectFromDatabase()` / `maskMongoUri()`. Re-exports the `mongoose` singleton (:218). Sets pool opts, `autoIndex:false` (:103), `bufferCommands:false` (:93). No boot-time nitro plugin — see [Gotchas](#gotchas). |
| [connection/mongodb-client.ts](connection/mongodb-client.ts) | **LEGACY. Do not extend.** Raw `MongoClient`, used only by `src/factories/scraper-factory.ts` → `src/extract.ts`/`src/analyzer.ts`. Options (:24-33) are driver-v3 era and mean nothing under the installed v6. `createRecommendedIndexes()` conflicts with `scripts/ensure-indexes.ts`. |

### models/ — collection = source of truth
Barrel: [models/index.ts](models/index.ts) exports 32 of 39 models. Import the other 7 by file path:
`supplier_contacts`, `supplier_enrichment`, `email_campaign`, `email_suppression`, `campaign_send`,
`newsletter_issue`, `newsletter_delivery`.

| Model file | Collection | Notes |
|---|---|---|
| [release.ts](models/release.ts) | `releases` | The ONLY raw ingested collection (~2.2M OCDS docs). `strict:false`. `date` is absent from the schema, but present in the DB and indexed. One weighted text index, `comprehensive_text_search_exact`. Only `correct-lumpsum-artifacts` writes `amount.verifiedOverride` (Mixed). |
| [anomaly.ts](models/anomaly.ts) | `anomalies` | Detector output. `severityRank` is the numeric mirror of `severity`. `detectedAt`=last confirmed, `firstDetectedAt`=$setOnInsert. `score-anomalies-ai` writes `aiVerdict.*`. |
| [anomaly_feedback.ts](models/anomaly_feedback.ts) | `anomaly_feedback` | One vote per user per anomaly. Unique `{userId,anomalyId}`. `{anomalyId,vote}` serves the count aggregate from the index. |
| [api_key.ts](models/api_key.ts) | `api_keys` | `gk_live_` creds. Stores only the sha256 `hash` + the public unique `prefix`. Exports `API_KEY_CAP` (default 10). |
| [buyer_pattern.ts](models/buyer_pattern.ts) | `buyer_patterns` | PRECOMPUTED per-buyer rollup. `suppliers[]` @deprecated + actively `$unset` (one buyer had 1,833 ids). |
| [supplier_pattern.ts](models/supplier_pattern.ts) | `supplier_patterns` | PRECOMPUTED per-supplier rollup, unique `supplierId`. Read by the DEI RUT join and by name→RUT resolution. |
| [campaign_send.ts](models/campaign_send.ts) | `campaign_sends` | One cold-email send per `{campaignId,email}` (unique). Unique `token`. Status enum. |
| [contract_item_features.ts](models/contract_item_features.ts) | `contract_item_features` | SCRAPED cache of gov HTML *Características/Variación/object*, unique `compraId`. Caches an empty `items[]` deliberately. No TTL. |
| [dei_company.ts](models/dei_company.ts) | `dei_companies` | IMPORTED MIEM registry (`load-dei`). Join `rut`(digits)==digits(supplierId). Fact of record. |
| [dept_indicators.ts](models/dept_indicators.ts) | `dept_indicators` | PRECOMPUTED per `{buyerId,year}` for /analytics/partidos. Monthly `refresh-dept-indicators`. |
| [email_campaign.ts](models/email_campaign.ts) | `email_campaigns` | Cold-email campaign definition. |
| [email_suppression.ts](models/email_suppression.ts) | `email_suppressions` | Ley 18.331 opt-out store, unique email. |
| [exchange_rate.ts](models/exchange_rate.ts) | `exchange_rates` | One doc per YYYY-MM (unique). BCU monthly-avg usd/eur/ui. `ui` feeds `utils/real-value`. |
| [expense_insight.ts](models/expense_insight.ts) | `expense_insights` | PRECOMPUTED. Only writer `src/populate-analytics.ts`, only reader the LEGACY Express API. Dormant for Nuxt. |
| [filter_data.ts](models/filter_data.ts) | `filter_data` | PRECOMPUTED dropdown options, one doc per `type` (unique). Written only by `populate-filters`. |
| [item_price_baseline.ts](models/item_price_baseline.ts) | `item_price_baselines` | PRECOMPUTED price distribution per `{classificationId,currency,canonicalUnit}` (unique). Log-space median/MAD. Built by `detect-anomalies`. `unitName` MUST be `canonicalUnit`. |
| [newsletter_issue.ts](models/newsletter_issue.ts) | `newsletter_issues` | One immutable weekly blog/newsletter edition per `weekKey`/`slug` (both unique). Holds source totals, top awards, deterministic anomaly counts and the labeled Gemini editorial layer. |
| [newsletter_delivery.ts](models/newsletter_delivery.ts) | `newsletter_deliveries` | Idempotent email/push outbox, unique `{issueId,userId,channel}`. `{status,nextAttemptAt}` drives bounded retries. |
| [notification.ts](models/notification.ts) | `notifications` | Per-CHANNEL outbox + in-app inbox. `dedupeKey` unique = `alert:{channel}:{uid}:{compraId}`. channel enum email\|push\|telegram\|inapp. |
| [open_call.ts](models/open_call.ts) | `open_calls` | PROJECTION of `releases` (`sync-open-calls`), unique `compraId`. `classificationSet` (multikey), normalized `searchText`, `documentsProbedAt`, `firstSeenAt` vs `lastSyncedAt`. |
| [spending_trend.ts](models/spending_trend.ts) | `spending_trend` | PRECOMPUTED one doc per year, unique `year`. Monthly `refresh-spending-trend`. Deflated series + the year-over-year bridge + the published exclusion list. |
| [organism_group_stats.ts](models/organism_group_stats.ts) | `organism_group_stats` | PRECOMPUTED per group, unique `groupKey`. Monthly `refresh-organism-groups`. Capped amounts; over-cap rows go to `excludedRecords`. |
| [precalculated-models.ts](models/precalculated-models.ts) | `dashboard_metrics`, `spending_trends`, `top_entities`, `category_distribution` | FOUR models in one file. Versioned by `dataVersion`. **Only model file importing `mongoose` from `'mongoose'` directly** (still the same singleton). |
| [product_analytics.ts](models/product_analytics.ts) | `product_analytics` | PRECOMPUTED per `classification.id` (~20k, unique `code`), `refresh-product-analytics`. Counts cover all coded lines; SPEND is gated on a plausible amount. |
| [product_variants.ts](models/product_variants.ts) | `product_variants` | PRECOMPUTED característica distribution per code. `varies` when Marca/Presentación/Nombre hold >1 value. Built for UNEXPLAINED-anomaly codes; other codes build lazily. |
| [provider_anomaly_stats.ts](models/provider_anomaly_stats.ts) | `provider_anomaly_stats` + `provider_anomaly_summary` | TWO models. Per `metadata.supplierName` (anomalies carry no RUT) + one rollup doc. 24h `cross-provider-anomalies`. `overpriceUyuToday` via `real-value.toTodayUyu`. `clampedFlags` = plausibility-ceiling footnote. |
| [push_subscription.ts](models/push_subscription.ts) | `push_subscriptions` | One endpoint per browser (unique). Goes `active:false` on 404/410. |
| [saved_call.ts](models/saved_call.ts) | `saved_calls` | User bookmark, unique `{userId,compraId}`. Drives calendar + reminders (`reminderSentAt` guard). |
| [sice_catalog.ts](models/sice_catalog.ts) | `sice_catalog` | IMPORTED ACCE/SICE catalog (~91k, `import-sice-catalog`). `code`(unique) IS OCDS `classification.id` — the join key. 5-level rubro names + `rubroTokens` + synonyms. |
| [sice_rubro.ts](models/sice_rubro.ts) | `sice_rubro` | ~2,170-node rubro tree, unique `token`. `parentToken` drives the cascader. |
| [supplier_contacts.ts](models/supplier_contacts.ts) | `supplier_contacts` | DERIVED contact record per `supplierId`. Additive email/phone/social arrays keep `source` + the exact `sourceUrl` evidence. Singular phone/email stay as compatibility primaries. Also holds website, first-party address/form and place metadata. `enrichmentMethods` records every attempted path for the transparency chips. Google Maps contact/location values keep their Maps evidence link. |
| [supplier_enrichment.ts](models/supplier_enrichment.ts) | `supplier_enrichment` | AI-WRITTEN (Gemini) blurb+category per supplier NAME. Exports `SUPPLIER_CATEGORIES`. NOT a fact of record — label it AI. |
| [user.ts](models/user.ts) | `users` | Keyed by Firebase `uid`. `notificationPrefs.channels` optional (absent ⇒ `DEFAULT_CHANNELS`). `newsletter` stores the weekly-summary consent independently. No field-level `unique`; uniqueness comes from ensure-indexes. |
| [watch.ts](models/watch.ts) | `watches` | Rubro subscription. categories+keywords = OR triggers; buyers/value/methods = AND refinements. Keywords stored PRE-NORMALIZED via `text.normalizeKeyword`. |
| [webhook_delivery.ts](models/webhook_delivery.ts) | `webhook_deliveries` | Idempotent outbox, `dedupeKey` unique. `{status,nextAttemptAt}` drives the drain. Exports `WEBHOOK_MAX_ATTEMPTS` (default 6). |
| [webhook_subscription.ts](models/webhook_subscription.ts) | `webhook_subscriptions` | HTTPS endpoint + HMAC `secret` + event enum. Exports `WEBHOOK_SUBSCRIPTION_CAP` (default 10). |

### Pure helpers & static tables
| Path | Purpose |
|---|---|
| [ai/structured.ts](ai/structured.ts) | `callStructured()` — reemplazo directo de `callGeminiStructured` que antepone el escalón Claude. Todo job que llamaba a Gemini de forma directa pasa por acá. La única excepción es el OCR, que manda binario. |
| [ai/claude-agent-client.ts](ai/claude-agent-client.ts) | Cliente de `claude-agent-api` (servidor 104). Pide salida estructurada con `jsonSchema` y anula el modo caveman por request. Nunca reintenta un 429: cada intento gasta cuota de suscripción. |
| [ai/rotator.ts](ai/rotator.ts) | `ProviderRotator` — escalera Claude → Gemini → Groq. Banca un escalón ante la pared diaria y sigue con el siguiente. `claudeRungFromEnv()` lee el escalón Claude del entorno. |
| [matching/match.ts](matching/match.ts) | `watchMatchesCall(watch, call)` — the ONLY watch↔llamado matcher. Pure. A value range never excludes a call that has no `estimatedValue`. |
| [alerts/build-alert-content.ts](alerts/build-alert-content.ts) | ONE `AlertCard` model + per-channel renderers (`buildAlertCard`, `renderPushPayload`, `renderTelegramHtml`). es/en strings inline. |
| [alerts/channels.ts](alerts/channels.ts) | `DEFAULT_CHANNELS` (email+inapp) + `resolveChannels(user)`. PREFERENCE only: the dispatcher still gates on a real connection / emailVerified. |
| [alerts/link-token.ts](alerts/link-token.ts) | Stateless Telegram link token (HMAC over `TELEGRAM_LINK_SECRET`, 15-min TTL, constant-time compare). No DB row. |
| [webhooks/sign.ts](webhooks/sign.ts) | `signPayload` (`sha256=…`), `generateWebhookSecret` (`whsec_…`), `assertSafeWebhookUrl` SSRF guard. node:crypto only. |
| [utils/text.ts](utils/text.ts) | `normalizeText`/`normalizeKeyword`/`tokenize`/`phraseMatches`. NFD diacritic strip. The `searchText` projector and the watch keyword store MUST both use this. |
| [utils/units.ts](utils/units.ts) | `canonicalUnit(raw)` (JS) + `canonicalUnitExpr(fieldRef)` (MQL) — identical folds. Baselines are keyed with the MQL form and looked up with the JS form. Change both together. |
| [utils/ocid.ts](utils/ocid.ts) | `compraIdFromOcid`, `sourceUrl`, `awardUrl`, `ocdsRecordUrl`. |
| [utils/real-value.ts](utils/real-value.ts) | Pure FX+inflation re-basing over a caller-loaded `RateTable`. `toNominalUyu` (own-month rate), `toTodayUyu`. Returns null when unconvertible, so the caller shows nominal. |
| [utils/rubro-tokens.ts](utils/rubro-tokens.ts) | Classification-token namespace (`F2`/`SF2.6`/`C2.6.5`/… or bare code) shared by `open_calls.classificationSet` / `watch.categories` / `sice_*`. Matching = set intersection. |
| [utils/anomaly-categories.ts](utils/anomaly-categories.ts) | `AI_CATEGORY_VALUES`, `LOAD_ERROR_CATEGORIES`, `parseCategories(v)` (drops unknown values ⇒ no filter, never an empty set). |
| [utils/item-features.ts](utils/item-features.ts) | The single gov-HTML scraper/parser (`parseBuyObject`, `parseItemFeatures`, `scrapeItemFeatures`). null = gov site down, [] = no features. Also lifts each item's `quantity` (FRACTIONAL — OCDS truncates to int), `netUnitPrice` (sin imp) and `grossTotal` (con imp), plus the compra `total`. The only source of tax-inclusive figures. |
| [utils/comprasestatales-total.ts](utils/comprasestatales-total.ts) | Pure parser for the gov page's "Monto Total de la Compra" (`parseOfficialTotal`, `parseUyNumber`, `parseUyCurrency`, `siblingStrongValue`). Shared by the lump-sum correction job (`src/jobs/lib/comprasestatales-total.ts` re-exports it and keeps the fetch) and by the contract detail page. The value binds to the label's sibling `<li>`; any mismatch returns null. |
| [utils/verified-override.ts](utils/verified-override.ts) | `hasVerifiedOverride(doc)`. **LOAD-BEARING** — see [Gotchas](#gotchas). |
| [organism-groups.ts](organism-groups.ts) | Static taxonomy for /analytics/organismos+intendencias. `buyer.id = <inciso>-<unidad>`; member match = exact id or inciso prefix. Single source for the precompute job AND the read endpoints. |
| [political-mandates.ts](political-mandates.ts) | Curated electoral table + `mandateForBuyer`/`mandateTimeline`. National (1 Mar) vs departmental (~Jul) handover offset + COVID-extended 2020 term. Self-governed bodies return NO mandate. |
| [integrity-signals.ts](integrity-signals.ts) | **Pure**, zero I/O. The five señales-de-gestión indicators + `measureOrganism`, `deriveCutoffs`, `classifyOrganism`, `percentile`, `percentileRank`, `signalWeight`. A level is the population's p90/p97 AND an absolute floor. The docblock carries the corpus measurements behind every constant, plus the feed gaps (tenderers 0%) that rule out single-bidding. |
| [acta-bidders.ts](acta-bidders.ts) | **Pure.** `parseActaBidders(text)` — the bidder list an acta de adjudicación enumerates, or null. Matching runs on a DESPACED copy with an index map back, because the PDFs hard-wrap mid-word ("se present\naron", "la s firmas"). **Fails closed.** Its docblock records why this is a per-contract fact and not a single-bidding indicator (0% `tender.tenderers` in the feed, ~4-8% enumeration in the actas). |
| [acta-pdf-text.ts](acta-pdf-text.ts) | `extractActaText(buf)`. The actas are RSTXPDF3 output: content streams UNCOMPRESSED and show-text operands in HEX (`<434F4E…>Tj`). A generic extractor returns nothing and the acta looks like a scan. It is not: 37/37 sampled carried a real text layer. |
| [models/udeco_sanction.ts](models/udeco_sanction.ts) · [models/udeco_supplier_stats.ts](models/udeco_supplier_stats.ts) | UDECO sanctions and their cross-reference with state suppliers. A sanction judges the firm's conduct toward CONSUMERS, never a public contract. Every row carries `sanctionedFirmsTotal`, so nobody can quote the headline without its denominator. |
| [jutep-incisos.ts](jutep-incisos.ts) | **Pure.** JUTEP inciso label → `buyer.id` inciso prefix, plus `normalizeIncisoName` and `maskDocument`. Handles the published typos (DURANO, TACUAREMBOÓ, ECONOMIA/ECONOMÍA). An unknown label returns null and **never** a fuzzy match, because a wrong join attributes one organism’s omisos to another. |
| [timbre-values.ts](timbre-values.ts) | Official DGI timbre-profesional schedule, 2005-2026 × 2 semesters × 9 grupos, + `officialTimbrePrices(date)` (window −2/+1 semesters). Scope is classification `10233` ONLY — every other "timbre" code is a doorbell. Returns `null` for an uncovered year and NEVER extrapolates. [tests/unit/test-timbre-values.ts](../tests/unit/test-timbre-values.ts) catches a stale table. |
| [procurement-method.ts](procurement-method.ts) | `methodClass(details)` → direct\|tender\|other\|unknown. **% compra directa computed over direct+tender+other, never total** (~69% declare no method). |
| [types/database.ts](types/database.ts) | OCDS document types + rollup interfaces. `IRelease.date` is declared although the schema omits it. |
| [types/monitor.ts](types/monitor.ts) | Auth + Monitor-de-Llamados interfaces. |
| [types/interfaces.ts](types/interfaces.ts) | LEGACY SOLID-scraper abstractions. Only `MongoConfig`/`DatabaseClient`/`Logger` still live. NOT re-exported by index. |
| [types/index.ts](types/index.ts) | One line: `export * from './database'`. Does NOT re-export monitor/interfaces — import those by path. |

## Entry points / how to run

```bash
await connectToDatabase()          # top of every job/handler; idempotent

npm run ensure-indexes             # THE only thing that builds indexes (autoIndex is off)
npx tsx scripts/ensure-indexes.ts --dry-run
npm run update-text-index-exact    # rebuild the releases text index

npx tsx tests/unit/test-matcher.ts            # matching/match.ts
npx tsx tests/unit/test-text-normalize.ts     # utils/text.ts
npx tsx tests/unit/test-mask-mongo-uri.ts     # connection maskMongoUri
npx tsx tests/unit/webhook.test.ts            # webhooks/sign.ts
```

## Conventions

- **New models MUST use the guarded registration form:** `mongoose.models.X as Model<T> || mongoose.model<T>('X', S)` (see [models/user.ts](models/user.ts), [models/open_call.ts](models/open_call.ts)). 15 older models use bare `mongoose.model()`. Do not copy them.
- **Import `mongoose` from [connection/database.ts](connection/database.ts)**, not from `'mongoose'` (see the [Map](#map) for the one exception).
- **Declare the collection name explicitly** via `{ collection: '...' }` in the schema options. Never rely on pluralisation.
- **Add a field to BOTH the interface and the Schema.** Schemas are `strict` (except `release.ts`). A field on the TS interface but missing from the Schema is *silently stripped on write* (this happened to `detectedAt`/`aiVerdict`).
- **Precomputed rollups use compute-then-swap** keyed on a `dataVersion` (`v${Date.now()}`). The read path only `.find()`/`.findOne()` by index, never aggregates.
- **Idempotency = unique keys, not app logic** (`notifications.dedupeKey`, `webhook_deliveries.dedupeKey`, `{userId,anomalyId}`, `{userId,compraId}`, `{campaignId,email}`).
- **Optional props are `?: T | undefined`** (root tsconfig sets `exactOptionalPropertyTypes:true`).
- **Derive gov links from `ocid`** via [utils/ocid.ts](utils/ocid.ts), never from a release `id`.
- **Normalize both sides of any comparison** — keywords through `utils/text`, units through `utils/units`.
- `app/server` imports shared by RELATIVE path; `app/` pages/components use the `#shared/*` alias (app/nuxt.config.ts). `app/server/utils/{database,models}.ts` are one-line re-exports.

## Gotchas

- **Build every index with `scripts/ensure-indexes.ts`.** Under `autoIndex:false` (connection/database.ts:103) a `Schema.index()` is documentation. Verify with `db.<coll>.getIndexes()`.
- **`ensure-indexes.ts` does NOT cover:** `dept_indicators`, `dei_companies`, `supplier_enrichment`, `exchange_rates`, `item_price_baselines`, `buyer_patterns`, `expense_insights`, `filter_data`, `dashboard_metrics`, `spending_trends`, `top_entities`, `category_distribution`. No job builds them either. A declared index on those is not live.
- **OverwriteModelError:** the 15 bare-`mongoose.model()` models throw if their module is evaluated twice (Nuxt HMR, or `../../../shared/models/release` vs `#shared/models/release` resolving to two module records). Symptom: 500 on dev after an edit. Workaround: restart dev. Fix: convert to the guarded form.
- **Set `process.env.MONGO_SOCKET_TIMEOUT_MS` BEFORE `connectToDatabase()`.** database.ts:84 reads it at connect time, and the 45s default kills long aggregations (pattern: `refresh-dept-indicators.ts`, `score-anomalies-ai.ts`).
- **`connectToDatabase()` waits for a mid-flight connection** (readyState 2/3) instead of disconnecting (database.ts:41-45). Ripping the socket caused intermittent SSR 404s under `bufferCommands:false`. Do not "simplify" it.
- **Always `await connectToDatabase()` first.** Under `bufferCommands:false` a query before the connection is ready throws immediately. Nothing connects for you at boot.
- **One text index per collection.** The `releases` text index name `comprehensive_text_search_exact` must match `scripts/update-text-index-for-exact-search.ts`, or the server rejects a second text index with `IndexOptionsConflict` on every boot. `default_language:'none'` disables stemming (the point of `_exact`).
- **Sort anomalies on `severityRank`, not `severity`** (the string sort orders critical<high<low<medium).
- **Key "recent" off `firstDetectedAt`.** Every run restamps `anomalies.detectedAt`, so a rescan marks everything recent.
- **Any job writing `release.amount` MUST call `hasVerifiedOverride()` and skip** — else a re-sync restores the inflated qty×lump-sum total.
- **Import the 7 non-barrel models by file path** — the barrel note above the models table names them.
- **El escalón Claude tiene una cuota dura de 600 llamadas por día, y es la MISMA que consume el Claude Code interactivo.** `CLAUDE_AGENT_MIN_REMAINING` reserva las últimas 150 para el uso interactivo: al llegar a ese piso el escalón se banca y la tanda sigue con Gemini. El saldo se lee de `GET /health`, que no consume cuota, y se cachea 30 segundos. Corre sobre una suscripción personal en el servidor 104, no sobre una API elástica. Por eso [ai/claude-agent-client.ts](ai/claude-agent-client.ts) nunca reintenta un `429`, un `queue_full` ni un `queue_timeout`: banca el escalón y el rotator sigue con Gemini. Un job de miles de ítems agota la cuota a la llamada 200 y termina la tanda con Gemini. Eso es lo esperado, no una falla.
- **El endpoint de 104 escucha sólo en `127.0.0.1:9310`.** Prod llega por la unit `claude-agent-tunnel.service`. Sin túnel el escalón se banca al primer intento y ningún job se rompe. Nunca abras ese puerto al exterior: el agente corre como root.
- **`.env` beats shell env, and that is deliberate.** Importing any model runs `config.ts` → dotenv `override:true` (a stale Windows-user `GEMINI_API_KEY` once shadowed the paid key). Edit `.env`; setting the var in the shell does nothing.
- **`buyer_patterns.suppliers[]` is `$unset`**, but the list endpoint does `.find().lean()` with no `.select()`. Re-populating it ships the whole array to the browser.
- **Shared code must satisfy BOTH tsconfigs:** root compiles src+shared as CommonJS/node; `app/tsconfig.json` compiles shared as ESNext/bundler with `verbatimModuleSyntax`. Use `import type` for type-only imports.

## Related

- Root brief: [../CLAUDE.md](../CLAUDE.md)
- Batch layer that writes these collections: [../src/context.md](../src/context.md), [../src/jobs/context.md](../src/jobs/context.md)
- API layer that reads them: [../app/server/context.md](../app/server/context.md)
- Index management + tests: [../scripts/context.md](../scripts/context.md), [../tests/context.md](../tests/context.md)
