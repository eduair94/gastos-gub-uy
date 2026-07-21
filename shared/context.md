# shared/ — models, connection, cross-layer utilities

The single source of truth for the Mongo data layer and for every **pure** algorithm that must behave
identically in a cron job and in an HTTP handler. Imported by **both** the batch layer (`src/`,
`scripts/`) and the Nuxt app (`app/`). Nothing here is Nuxt- or Vue-aware — `app/server/utils/database.ts`
and `app/server/utils/models.ts` are one-line re-exports of this directory.

Holds: ~37 registered Mongoose models across 33 files ([models/](models/)), the process-wide connection
singleton ([connection/database.ts](connection/database.ts)), DB-free helpers (watch↔call matcher,
text/unit normalization, OCID→gov-URL derivation, FX/inflation re-basing, rubro tokens, webhook
HMAC+SSRF, alert-card renderer), and three curated static tables that are *data, not code*
(organism groups, political mandates, procurement-method classification).

## Map

### Connection & config
| Path | Purpose |
|---|---|
| [config.ts](config.ts) | 9 lines. `dotenv config({ override: true })` (**`.env` beats shell env, deliberate**) → exports `mongoUri` / `mongoDatabase`. Imported transitively by nearly every model, so importing any model loads `.env` as a side effect. |
| [connection/database.ts](connection/database.ts) | THE connection. `connectToDatabase()` / `ensureConnection()` / `disconnectFromDatabase()` / `maskMongoUri()`; re-exports the `mongoose` singleton (:218). Pool opts, `autoIndex:false` (:103), `bufferCommands:false` (:93). No boot-time nitro plugin — every job & endpoint calls `connectToDatabase()` itself. |
| [connection/mongodb-client.ts](connection/mongodb-client.ts) | **LEGACY.** Raw `MongoClient` used only by `src/factories/scraper-factory.ts` → `src/extract.ts`/`src/analyzer.ts`. Options (:24-33) are driver-v3 era, meaningless under installed v6. `createRecommendedIndexes()` conflicts with `scripts/ensure-indexes.ts`. Do not extend. |

### models/ — collection = source of truth
Barrel: [models/index.ts](models/index.ts) exports 32 of 37 models. **NOT exported** (import by file path):
`supplier_contacts`, `supplier_enrichment`, `email_campaign`, `email_suppression`, `campaign_send`.

| Model file | Collection | Notes |
|---|---|---|
| [release.ts](models/release.ts) | `releases` | The ONLY raw ingested collection (~2.2M OCDS docs). `strict:false`. `date` omitted from schema but present in DB & indexed. Single weighted text index `comprehensive_text_search_exact`. `amount.verifiedOverride` (Mixed) written only by `correct-lumpsum-artifacts`. |
| [anomaly.ts](models/anomaly.ts) | `anomalies` | Detector output. `severityRank` numeric mirror (sorting the STRING orders critical<high<low<medium). `detectedAt`=last confirmed, `firstDetectedAt`=$setOnInsert. `aiVerdict.*` written by `score-anomalies-ai`. |
| [anomaly_feedback.ts](models/anomaly_feedback.ts) | `anomaly_feedback` | One vote per user per anomaly; unique `{userId,anomalyId}`; `{anomalyId,vote}` serves the count aggregate from the index. |
| [api_key.ts](models/api_key.ts) | `api_keys` | `gk_live_` creds; only sha256 `hash` + public unique `prefix` stored. Exports `API_KEY_CAP` (default 10). |
| [buyer_pattern.ts](models/buyer_pattern.ts) | `buyer_patterns` | PRECOMPUTED per-buyer rollup. `suppliers[]` @deprecated + actively `$unset` (one buyer had 1,833 ids). |
| [supplier_pattern.ts](models/supplier_pattern.ts) | `supplier_patterns` | PRECOMPUTED per-supplier rollup, unique `supplierId`. Read by the DEI RUT join & name→RUT resolution. |
| [campaign_send.ts](models/campaign_send.ts) | `campaign_sends` | One cold-email send per `{campaignId,email}` (unique); unique `token`; status enum. Not in index barrel. |
| [contract_item_features.ts](models/contract_item_features.ts) | `contract_item_features` | SCRAPED cache of gov HTML *Características/Variación/object*, unique `compraId`. Empty `items[]` cached deliberately. No TTL. |
| [dei_company.ts](models/dei_company.ts) | `dei_companies` | IMPORTED MIEM registry (`load-dei`). Join `rut`(digits)==digits(supplierId). Fact of record. |
| [dept_indicators.ts](models/dept_indicators.ts) | `dept_indicators` | PRECOMPUTED per `{buyerId,year}` for /analytics/partidos; monthly `refresh-dept-indicators`. |
| [email_campaign.ts](models/email_campaign.ts) | `email_campaigns` | Cold-email campaign def. Not in index barrel. |
| [email_suppression.ts](models/email_suppression.ts) | `email_suppressions` | Ley 18.331 opt-out store, unique email. Not in index barrel. |
| [exchange_rate.ts](models/exchange_rate.ts) | `exchange_rates` | One doc per YYYY-MM (unique), BCU monthly-avg usd/eur/ui. `ui` feeds `utils/real-value`. |
| [expense_insight.ts](models/expense_insight.ts) | `expense_insights` | PRECOMPUTED; only writer `src/populate-analytics.ts`, only reader the LEGACY Express API. Dormant for Nuxt. |
| [filter_data.ts](models/filter_data.ts) | `filter_data` | PRECOMPUTED dropdown options, one doc per `type` (unique). Written only by `populate-filters`. |
| [item_price_baseline.ts](models/item_price_baseline.ts) | `item_price_baselines` | PRECOMPUTED price distribution per `{classificationId,currency,canonicalUnit}` (unique). Log-space median/MAD. Built by `detect-anomalies`. `unitName` MUST be `canonicalUnit`. |
| [notification.ts](models/notification.ts) | `notifications` | Per-CHANNEL outbox + in-app inbox. `dedupeKey` unique = `alert:{channel}:{uid}:{compraId}`. channel enum email\|push\|telegram\|inapp. |
| [open_call.ts](models/open_call.ts) | `open_calls` | PROJECTION of `releases` (`sync-open-calls`), unique `compraId`. `classificationSet` (multikey), normalized `searchText`, `documentsProbedAt`, `firstSeenAt` vs `lastSyncedAt`. Never derive gov link from `id` — use `ocid`. |
| [organism_group_stats.ts](models/organism_group_stats.ts) | `organism_group_stats` | PRECOMPUTED per group, unique `groupKey`; monthly `refresh-organism-groups`. Capped amounts; over-cap in `excludedRecords`. |
| [precalculated-models.ts](models/precalculated-models.ts) | `dashboard_metrics`, `spending_trends`, `top_entities`, `category_distribution` | FOUR models in one file. Versioned by `dataVersion`. **Only model file importing `mongoose` from `'mongoose'` directly** (still the same singleton). |
| [product_analytics.ts](models/product_analytics.ts) | `product_analytics` | PRECOMPUTED per `classification.id` (~20k, unique `code`), `refresh-product-analytics`. Counts over all coded lines; SPEND gated on plausible amount. |
| [product_variants.ts](models/product_variants.ts) | `product_variants` | PRECOMPUTED característica distribution per code; `varies` when Marca/Presentación/Nombre >1 value. Built for UNEXPLAINED-anomaly codes, others lazily. |
| [provider_anomaly_stats.ts](models/provider_anomaly_stats.ts) | `provider_anomaly_stats` + `provider_anomaly_summary` | TWO models. Per `metadata.supplierName` (anomalies carry no RUT) + one rollup doc. 24h `cross-provider-anomalies`. `overpriceUyuToday` via `real-value.toTodayUyu`; `clampedFlags` = plausibility-ceiling footnote. |
| [push_subscription.ts](models/push_subscription.ts) | `push_subscriptions` | One endpoint per browser (unique), `active:false` on 404/410. |
| [saved_call.ts](models/saved_call.ts) | `saved_calls` | User bookmark, unique `{userId,compraId}`; drives calendar + reminders (`reminderSentAt` guard). |
| [sice_catalog.ts](models/sice_catalog.ts) | `sice_catalog` | IMPORTED ACCE/SICE catalog (~91k, `import-sice-catalog`). `code`(unique) IS OCDS `classification.id` — the join key. 5-level rubro names + `rubroTokens` + synonyms. |
| [sice_rubro.ts](models/sice_rubro.ts) | `sice_rubro` | ~2,170-node rubro tree, unique `token`, `parentToken` for the cascader. |
| [supplier_contacts.ts](models/supplier_contacts.ts) | `supplier_contacts` | DERIVED contact record per `supplierId`: emails, website, first-party phone/address/form/social links and place metadata. Provenance gates public display (dei/rupe/website=ok, googleMaps=ToS-restricted). Not in index barrel. |
| [supplier_enrichment.ts](models/supplier_enrichment.ts) | `supplier_enrichment` | AI-WRITTEN (Gemini) blurb+category per supplier NAME. Exports `SUPPLIER_CATEGORIES`. NOT a fact of record — must be labeled AI. Not in index barrel. |
| [user.ts](models/user.ts) | `users` | Keyed by Firebase `uid`. `notificationPrefs.channels` optional (absent ⇒ `DEFAULT_CHANNELS`). No field-level `unique` — uniqueness from ensure-indexes. |
| [watch.ts](models/watch.ts) | `watches` | Rubro subscription. categories+keywords = OR triggers; buyers/value/methods = AND refinements. Keywords stored PRE-NORMALIZED via `text.normalizeKeyword`. |
| [webhook_delivery.ts](models/webhook_delivery.ts) | `webhook_deliveries` | Idempotent outbox, `dedupeKey` unique, `{status,nextAttemptAt}` for the drain. Exports `WEBHOOK_MAX_ATTEMPTS` (default 6). |
| [webhook_subscription.ts](models/webhook_subscription.ts) | `webhook_subscriptions` | HTTPS endpoint + HMAC `secret` + event enum. Exports `WEBHOOK_SUBSCRIPTION_CAP` (default 10). |

### Pure helpers & static tables
| Path | Purpose |
|---|---|
| [matching/match.ts](matching/match.ts) | `watchMatchesCall(watch, call)` — the ONLY watch↔llamado matcher. Pure. A call with no `estimatedValue` is never excluded by a value range. |
| [alerts/build-alert-content.ts](alerts/build-alert-content.ts) | ONE `AlertCard` model + per-channel renderers (`buildAlertCard`, `renderPushPayload`, `renderTelegramHtml`). es/en strings inline. |
| [alerts/channels.ts](alerts/channels.ts) | `DEFAULT_CHANNELS` (email+inapp) + `resolveChannels(user)` — PREFERENCE only; dispatcher still gates on real connection / emailVerified. |
| [alerts/link-token.ts](alerts/link-token.ts) | Stateless Telegram link token (HMAC over `TELEGRAM_LINK_SECRET`, 15-min TTL, constant-time compare). No DB row. |
| [webhooks/sign.ts](webhooks/sign.ts) | `signPayload` (`sha256=…`), `generateWebhookSecret` (`whsec_…`), `assertSafeWebhookUrl` SSRF guard. node:crypto only. |
| [utils/text.ts](utils/text.ts) | `normalizeText`/`normalizeKeyword`/`tokenize`/`phraseMatches`. NFD diacritic strip. Both the `searchText` projector and the watch keyword store MUST use this. |
| [utils/units.ts](utils/units.ts) | `canonicalUnit(raw)` (JS) + `canonicalUnitExpr(fieldRef)` (MQL) — identical folds. Baselines keyed with MQL form, looked up with JS form; change both together. |
| [utils/ocid.ts](utils/ocid.ts) | `compraIdFromOcid`, `sourceUrl`, `awardUrl`, `ocdsRecordUrl`. Never derive a gov link from a release `id`. |
| [utils/real-value.ts](utils/real-value.ts) | Pure FX+inflation re-basing over a caller-loaded `RateTable`. `toNominalUyu` (own-month rate), `toTodayUyu`. Returns null when unconvertible → caller shows nominal. |
| [utils/rubro-tokens.ts](utils/rubro-tokens.ts) | Classification-token namespace (`F2`/`SF2.6`/`C2.6.5`/… or bare code) shared by `open_calls.classificationSet` / `watch.categories` / `sice_*`. Matching = set intersection. |
| [utils/anomaly-categories.ts](utils/anomaly-categories.ts) | `AI_CATEGORY_VALUES`, `LOAD_ERROR_CATEGORIES`, `parseCategories(v)` (drops unknown values ⇒ no filter, never an empty set). |
| [utils/item-features.ts](utils/item-features.ts) | The single gov-HTML scraper/parser (`parseBuyObject`, `parseItemFeatures`, `scrapeItemFeatures`). null = gov site down, [] = no features. Also lifts each item's `quantity` (FRACTIONAL — OCDS truncates to int), `netUnitPrice` (sin imp), `grossTotal` (con imp) + the compra `total`, the only source of tax-inclusive figures. |
| [utils/comprasestatales-total.ts](utils/comprasestatales-total.ts) | Pure parser for the gov page's "Monto Total de la Compra" (`parseOfficialTotal`, `parseUyNumber`, `parseUyCurrency`, `siblingStrongValue`). Shared by the lump-sum correction job (`src/jobs/lib/comprasestatales-total.ts` re-exports + keeps the fetch) and the contract detail page. Value bound to the label's sibling `<li>`; null on any mismatch. |
| [utils/verified-override.ts](utils/verified-override.ts) | `hasVerifiedOverride(doc)`. **LOAD-BEARING**: every job writing `release.amount` MUST check and skip, or a re-sync restores the inflated lump-sum total. |
| [organism-groups.ts](organism-groups.ts) | Static taxonomy for /analytics/organismos+intendencias. `buyer.id = <inciso>-<unidad>`; member match = exact id or inciso prefix. Single source for the precompute job AND the read endpoints. |
| [political-mandates.ts](political-mandates.ts) | Curated electoral table + `mandateForBuyer`/`mandateTimeline`. National (1 Mar) vs departmental (~Jul) handover offset + COVID-extended 2020 term. Self-governed bodies return NO mandate. |
| [procurement-method.ts](procurement-method.ts) | `methodClass(details)` → direct\|tender\|other\|unknown. **% compra directa computed over direct+tender+other, never total** (~69% declare no method). |
| [types/database.ts](types/database.ts) | OCDS document types + rollup interfaces. `IRelease.date` declared though schema omits it. |
| [types/monitor.ts](types/monitor.ts) | Auth + Monitor-de-Llamados interfaces. Every optional is `?: T \| undefined` (exactOptionalPropertyTypes). |
| [types/interfaces.ts](types/interfaces.ts) | LEGACY SOLID-scraper abstractions. Only `MongoConfig`/`DatabaseClient`/`Logger` still live. NOT re-exported by index. |
| [types/index.ts](types/index.ts) | One line: `export * from './database'`. Does NOT re-export monitor/interfaces — import by path. |

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

- **New models MUST use the guarded registration form:** `mongoose.models.X as Model<T> || mongoose.model<T>('X', S)` (see [models/user.ts](models/user.ts), [models/open_call.ts](models/open_call.ts)). 15 older models use bare `mongoose.model()` — do not copy them.
- **Import `mongoose` from [connection/database.ts](connection/database.ts)**, not from `'mongoose'`. Only `precalculated-models.ts` breaks this.
- **Declare the collection name explicitly** via `{ collection: '...' }` in schema options — never rely on pluralisation.
- **Add a field to BOTH the interface and the Schema.** Schemas are `strict` (except `release.ts`); a field on the TS interface but missing from the Schema is *silently stripped on write* (this happened to `detectedAt`/`aiVerdict`).
- **Precomputed rollups use compute-then-swap** keyed on a `dataVersion` (`v${Date.now()}`); the read path only `.find()`/`.findOne()` by index, never aggregates.
- **Idempotency = unique keys, not app logic** (`notifications.dedupeKey`, `webhook_deliveries.dedupeKey`, `{userId,anomalyId}`, `{userId,compraId}`, `{campaignId,email}`).
- **Optional props are `?: T | undefined`** (root tsconfig sets `exactOptionalPropertyTypes:true`).
- **Gov links from `ocid` via [utils/ocid.ts](utils/ocid.ts)**, never from a release `id`.
- **Normalize both sides of any comparison** — keywords through `utils/text`, units through `utils/units`.
- `app/server` imports shared by RELATIVE path; `app/` pages/components use the `#shared/*` alias (app/nuxt.config.ts). `app/server/utils/{database,models}.ts` are one-line re-exports.

## Gotchas

- **`autoIndex:false` (connection/database.ts:103)** — every `Schema.index()` is documentation. Indexes exist only if `scripts/ensure-indexes.ts` builds them. Verify with `db.<coll>.getIndexes()`.
- **`ensure-indexes.ts` does NOT cover:** `dept_indicators`, `dei_companies`, `supplier_enrichment`, `exchange_rates`, `item_price_baselines`, `buyer_patterns`, `expense_insights`, `filter_data`, `dashboard_metrics`, `spending_trends`, `top_entities`, `category_distribution`. No job builds them either — do not assume a declared index is live.
- **OverwriteModelError:** the 15 bare-`mongoose.model()` models throw if their module is evaluated twice (Nuxt HMR, or `../../../shared/models/release` vs `#shared/models/release` resolving to two module records). Symptom: 500 on dev after an edit. Workaround: restart dev; fix: convert to the guarded form.
- **`MONGO_SOCKET_TIMEOUT_MS` is read at connect time** (database.ts:84). A job must set `process.env.MONGO_SOCKET_TIMEOUT_MS` BEFORE `connectToDatabase()` or the 45s default kills long aggregations (pattern: `refresh-dept-indicators.ts`, `score-anomalies-ai.ts`).
- **`connectToDatabase()` waits for a mid-flight connection** (readyState 2/3) instead of disconnecting (database.ts:41-45). Ripping the socket caused intermittent SSR 404s under `bufferCommands:false`. Do not "simplify".
- **`bufferCommands:false`** — a query before the connection is ready throws immediately. Always `await connectToDatabase()` first; nothing does it for you at boot.
- **One text index per collection.** `releases` text index name `comprehensive_text_search_exact` must match `scripts/update-text-index-for-exact-search.ts`, or the server rejects a second text index with `IndexOptionsConflict` on every boot. `default_language:'none'` disables stemming (the point of `_exact`).
- **Sort anomalies on `severityRank`, not `severity`** (string sort puts `low` above `high`).
- **`anomalies.detectedAt` is restamped every run;** only `firstDetectedAt` means "newly discovered". Keying "recent" off `detectedAt` marks everything recent after a rescan.
- **Any job writing `release.amount` MUST call `hasVerifiedOverride()` and skip** — else a re-sync restores the inflated qty×lump-sum total.
- **`models/index.ts` does NOT export** `supplier_contacts`, `supplier_enrichment`, `email_campaign`, `email_suppression`, `campaign_send` — import by file path.
- **Importing any model runs `config.ts` → dotenv `override:true`.** `.env` WINS over shell/system env (a stale Windows-user `GEMINI_API_KEY` once shadowed the paid key). Setting the var in the shell will not override `.env`.
- **`buyer_patterns.suppliers[]` is `$unset`** but the list endpoint does `.find().lean()` with no `.select()` — re-populating it ships the whole array to the browser.
- **Shared code must satisfy BOTH tsconfigs:** root compiles src+shared as CommonJS/node; `app/tsconfig.json` compiles shared as ESNext/bundler with `verbatimModuleSyntax`. Use `import type` for type-only imports.

## Related

- Root brief: [../CLAUDE.md](../CLAUDE.md)
- Batch layer that writes these collections: [../src/context.md](../src/context.md), [../src/jobs/context.md](../src/jobs/context.md)
- API layer that reads them: [../app/server/context.md](../app/server/context.md)
- Index management + tests: [../scripts/context.md](../scripts/context.md), [../tests/context.md](../tests/context.md)
