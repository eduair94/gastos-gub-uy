# app/server/ — Nitro API

The Nuxt/Nitro HTTP layer: 85 file-routed endpoints under [api/](api/) that read MongoDB through mongoose models re-exported from repo-root `shared/models`. There is no service or controller layer — each route file owns its own query, validation and response shape. It serves three audiences at once: the Nuxt SSR/CSR frontend (session-cookie auth), the signed-in account area (watches / saved calls / notifications / API keys), and a public developer platform (`/api/v1/*` cursor feeds + webhooks, `gk_live_` API keys, OpenAPI at `/openapi.json`, Scalar at `/docs`).

## Map

| Path | Purpose |
|---|---|
| [middleware/apiAuth.ts](middleware/apiAuth.ts) | #1 alphabetically. `Authorization: Bearer gk_live_…` / `x-api-key` → `event.context.apiKey` + `.user`. Hard 401 on bad key (`apiAuth.ts:40,44`). Throttles `lastUsedAt` writes to 1/min/key. |
| [middleware/auth.ts](middleware/auth.ts) | #2. Firebase `__session` cookie → `event.context.user` (lean doc) or `null`. Never throws. Bails if `apiKey` already set (`auth.ts:20`). |
| [middleware/cache.ts](middleware/cache.ts) | #3. Read-through in-process cache (3 `SimpleCache` maps: query 5min / filter 30min / static 1h) for whitelisted public GETs. A HIT returns from middleware. Also exports `storeCachedResponse`. |
| [middleware/rateLimit.ts](middleware/rateLimit.ts) | #4. Fixed-window limiters for `/api/*` only: anon 60/min, `/api/search` 30/min, keyed read 600/min, keyed write 120/min. |
| [plugins/cache-store.ts](plugins/cache-store.ts) | Nitro `beforeResponse` hook — the WRITE half of the cache. Delete it and `cache.ts` is a silent 100%-miss no-op. |
| [routes/openapi.json.get.ts](routes/openapi.json.get.ts) | `GET /openapi.json`, CORS `*`, `cache-control: public, max-age=3600`. Not under `/api` → not rate-limited/cached. |
| [routes/docs.get.ts](routes/docs.get.ts) | `GET /docs` Scalar reference. Scalar pinned to CDN `@scalar/api-reference@1.62.9` (`docs.get.ts:109`); has its OWN inline gtag block (`docs.get.ts:39-55`) because Nuxt plugins don't run on Nitro routes. |
| [api/contracts/index.get.ts](api/contracts/index.get.ts) | Contract explorer AND the shared filter compiler: exports `ContractFilters`, `buildContractFilters()` (:96), `toMatchDocument()` (:265). Page cap 100, limit cap 50, count capped at 10001. |
| [api/contracts/](api/contracts/) | `[id].get.ts`, `stats.get.ts`, `filters.get.ts`, `[id]/features.get.ts`, `item-features/batch.post.ts` (live gov HTML scrape; `MAX_ITEMS=25`, `CONCURRENCY=5`, `BUDGET_MS=12000`). |
| [api/suppliers/](api/suppliers/) | `index.get.ts` (paging + DEI filters, `attachEnrichment`/`attachDei`), `[id].get.ts`, `autocomplete.get.ts`, `dei-map.get.ts`. |
| [api/buyers/](api/buyers/) | `index.get.ts`, `[id].get.ts` — the one read route with NO `success` envelope (returns the buyer object at top level). |
| [api/analytics/](api/analytics/) | `anomalies.get.ts` + `anomalies/{[id],facets,stats,load-error-stats}` + `anomalies/[id]/feedback.{post,delete}`, `category-distribution`, `top-buyers`, `top-suppliers`, `supplier-types`, `products(.get + [code])`, `provider-anomalies`, `organism-groups`, `intendencias`, `party-comparison`, `dei-signals`. |
| [api/open-calls/](api/open-calls/) | `index.get.ts`, `[compraId].get.ts`, `[compraId]/{summary,benchmarks,estimate}.get.ts`. |
| [api/v1/](api/v1/) | Public platform: `tenders/changes`, `anomalies/changes`, `awards/changes` (cursor feeds) + `webhooks/index.{get,post}`, `webhooks/[id].delete`, `webhooks/[id]/test.post`. All webhook routes call `requireWrite()`. |
| [api/watches/](api/watches/) | `index.{get,post}`, `[id].{get,put,delete}`, `test.post.ts` (dry-run matcher preview). Validation in [utils/watch-input.ts](utils/watch-input.ts). |
| [api/account/](api/account/) | `preferences.{get,put}`, `api-keys/index.{get,post}`, `api-keys/[id].delete`. POST returns the raw `gk_live_…` token exactly once. |
| [api/auth/](api/auth/) | `session.post.ts` (Firebase ID token → httpOnly `__session` cookie + user upsert), `me.get.ts`, `logout.post.ts`. |
| [api/notifications/](api/notifications/), [api/push/](api/push/), [api/telegram/](api/telegram/) | Multi-channel alert plumbing: in-app inbox + `read-all`/`[id]/read`; `push/{subscribe,unsubscribe}.post` + `vapid-key.get`; `telegram/{link,unlink}.post` + `webhook.post`. |
| [api/campaign/](api/campaign/) | Cold-email surface: `unsubscribe.{get,post}` (GET renders HTML), `webhook.post.ts` (Brevo events, guarded by `CAMPAIGN_WEBHOOK_SECRET`). |
| [api/unsubscribe.get.ts](api/unsubscribe.get.ts), [api/unsubscribe.post.ts](api/unsubscribe.post.ts) | DIFFERENT surface from `campaign/unsubscribe`: flips `users.notificationPrefs` by `users.unsubscribeToken` (List-Unsubscribe one-click). Do not merge them. |
| [api/curros/](api/curros/), [api/recopilatorios/](api/recopilatorios/) | `index.get.ts` + `[slug].get.ts` each. Static definition tables in [utils/curros.ts](utils/curros.ts) / [utils/recopilatorios.ts](utils/recopilatorios.ts) resolved LIVE against `releases` via `buildContractFilters`. Each index has its own module-level 1h cache. |
| [api/search/index.get.ts](api/search/index.get.ts) | Multi-entity search. `MIN_QUERY_LENGTH=2` (:8), `MAX_TIME_MS=5000` (:12). |
| [api/health.get.ts](api/health.get.ts), [api/rates.get.ts](api/rates.get.ts), [api/pauta.get.ts](api/pauta.get.ts), [api/categories.get.ts](api/categories.get.ts) | health check; BCU rate table (1h module cache in [utils/rates.ts](utils/rates.ts)); advertising spend (own 1h cache, `pauta.get.ts:23-25`); SICE taxonomy. |
| [api/dashboard/](api/dashboard/), [api/calendar/](api/calendar/), [api/saved-calls/](api/saved-calls/) | `metrics`/`spending-trends` (precomputed reads); auth'd deadline union of saved calls + watch matches; saved-call CRUD. |
| [utils/query.ts](utils/query.ts) | `escapeRegex`, `sanitizeSearch`, `safeRegex`, `toInt`, `toNumberOrNull`, `toArray`, `sourceUrl`, `compraIdFromOcid`, `awardUrl`, `ocdsJsonUrl`. |
| [utils/auth.ts](utils/auth.ts) | `SessionUser`, `ApiKeyContext`, `getUser`, `getApiKey`, `requireUser`, `requireWrite`, `assertSameOrigin`, `toPublicUser`. |
| [utils/api-key.ts](utils/api-key.ts) | `hashToken`, `generateApiKey`, `parsePrefix`, `verifyToken` (sha256 + timing-safe compare). |
| [utils/cursor.ts](utils/cursor.ts) | `Cursor {t,id}`, `encodeCursor`, `decodeCursor` — base64url `"<t>:<id>"`. |
| [utils/firebase-admin.ts](utils/firebase-admin.ts) | `adminAuth()`, `isFirebaseAdminConfigured()` (:98), `SESSION_COOKIE = '__session'`, `SESSION_MAX_AGE_MS` (14d). |
| [utils/enrichment.ts](utils/enrichment.ts), [utils/dei.ts](utils/dei.ts) | `fetchEnrichment`/`attachEnrichment` (by supplier NAME) and `deiRut`/`fetchDei`/`attachDei` (by `digits(supplierId) == rut`). |
| [utils/anomaly-feedback.ts](utils/anomaly-feedback.ts) | `feedbackSummaries`, `feedbackSummary`, `feedbackCounts` — public up/down counts + the requesting user's `myVote`/`myComment`. |
| [utils/watch-input.ts](utils/watch-input.ts) | `WATCH_CAP` (:5, env `WATCH_CAP_FREE`, default 10), `WatchPayload`, `parseWatchPayload`. Internal caps: `MAX_KEYWORDS=25`, `MAX_CATEGORIES` (env `WATCH_CATEGORY_CAP`, default 300), `MAX_BUYERS=50`, `MAX_METHODS=20`. |
| [utils/openapi.ts](utils/openapi.ts) | Hand-written literal `openApiDocument` (`openapi: '3.1.0'`, :122; 44 documented paths). Not generated. |
| [utils/curros.ts](utils/curros.ts) | `CURROS` table + `listCurroDefs`, `getCurroDef`, `curroText`, `curroToQueryParams`. |
| [utils/recopilatorios.ts](utils/recopilatorios.ts) | `RECOPILATORIOS` + `listRecopDefs`, `getRecopDef`, `recopText`, `recopToQueryParams`. |
| [utils/database.ts](utils/database.ts), [utils/models.ts](utils/models.ts), [utils/index.ts](utils/index.ts) | One-line re-exports of `shared/connection/database` and `shared/models`. All real connection logic lives in `shared/`. |
| [types/global.d.ts](types/global.d.ts) | Declares the Nuxt server auto-imports (`defineEventHandler`, `createError`, `getQuery`, `readBody`, `setHeader`, `setCookie`, `getCookie`) — why `cache.ts:142` calls `getQuery` with no import. |

## Entry points / how to run

```bash
cd app && npm run dev            # Nuxt dev server + Nitro API on port 3600 (nuxt.config.ts:373-375)
cd app && npm run build          # prebuild gates: check-node + mdi-subset --check + vuetify-utilities --check
cd app && npm run type-check     # nuxt typecheck
cd app && npm run lint           # eslint .

curl -s localhost:3600/api/health
curl -si 'localhost:3600/api/contracts?limit=2' | grep -i x-cache      # HIT/MISS from middleware/cache.ts
curl -s 'localhost:3600/api/v1/tenders/changes?limit=2'                # cursor feed + nextCursor
curl -s -H 'x-api-key: gk_live_XXXXXXXX_...' localhost:3600/api/v1/webhooks
curl -s localhost:3600/openapi.json | head
curl -H 'cf-connecting-ip: 1.2.3.4' localhost:3600/api/search?q=aa     # only way to trigger a local 429

npm run ensure-indexes           # repo root — required before push/telegram/webhooks work
npm run webhooks                 # repo root — src/jobs/webhooks/run.ts, produce + dispatch
```

## Conventions

- **Response envelope** `{ success: true, data: … }` on 81 of 85 files under `api/`. The four exceptions are deliberate third-party/HTML contracts: [api/buyers/[id].get.ts](api/buyers/[id].get.ts), [api/campaign/unsubscribe.get.ts](api/campaign/unsubscribe.get.ts), [api/campaign/webhook.post.ts](api/campaign/webhook.post.ts), [api/telegram/webhook.post.ts](api/telegram/webhook.post.ts). Errors are thrown h3 `createError({statusCode, statusMessage})` — Spanish on account/auth routes, English on public data routes.
- **Every handler calls `await connectToDatabase()` itself.** There is NO database Nitro plugin (see the comment at `api/buyers/[id].get.ts:8-12`). `ensureConnection()` is the same thing, used only by `api/dashboard/metrics.get.ts:8`.
- **Auth is opt-in per handler, never by route prefix.** `requireUser(event)` for reads, `requireWrite(event)` for mutations ([utils/auth.ts](utils/auth.ts):37,54) — 28 route files call one of them. `requireWrite` branches: API-key callers need the `write` scope and SKIP the CSRF check; cookie callers get `assertSameOrigin()`. Routes that only ever run from the web page (`api/auth/*`, `api/account/api-keys/index.post.ts`) call `assertSameOrigin()` explicitly.
- **Two pagination styles, both live.** Offset: `data.pagination = { page, limit, total, totalPages }`. Contracts adds `{ totalIsCapped, hasMore, estimatedTotalPages, currentCount }` (`api/contracts/index.get.ts:535`). `api/buyers/[id].get.ts` uses a third variant `{page,limit,total,hasMore}`. Keyset for `/api/v1`: `{ success, data: [...], nextCursor, hasMore }`.
- **Cursor pagination** = `encodeCursor({t: ms, id})` → base64url `"<t>:<id>"` ([utils/cursor.ts](utils/cursor.ts)), passed back as `?since=`. Reference implementation: [api/v1/tenders/changes.get.ts](api/v1/tenders/changes.get.ts). Limit is always `toInt(q.limit, 25, 1, 50)`.
- **All user input goes through [utils/query.ts](utils/query.ts) before Mongo**: `sanitizeSearch` (120-char cap), `escapeRegex`/`safeRegex` (ReDoS guard over a ~2.2M-doc collection), `toInt(v, fallback, min, max)`, `toArray` (accepts scalar, repeated key, or comma list).
- **Never hand-write a gov link.** Derive it: `sourceUrl(ocid)` (llamado page), `awardUrl(ocid)` (adjudicación page), `ocdsJsonUrl(releaseId)`. Keyed on **`ocid`**, not `id` — `id` lands on a different, real contract on `ajuste_`/`cancelacion` records ([utils/query.ts](utils/query.ts):77-111).
- **Model imports drifted.** Older files use `../../utils/models`; newer ones deep-import `../../../../shared/models/<name>` (what `api/v1/*` and `middleware/apiAuth.ts:4-5` do). Prefer the deep import in new files.
- **Adding an endpoint to the public contract = editing [utils/openapi.ts](utils/openapi.ts) by hand.** It is a literal object, not generated. `notifications`/`push`/`telegram`/`campaign`/`curros`/`recopilatorios`/`pauta`/`rates`/`auth`/`unsubscribe`/`contracts.item-features` are deliberately undocumented internal surface.
- **Per-user caps are env-overridable consts and return 409, not 400**: `WATCH_CAP` ([utils/watch-input.ts](utils/watch-input.ts):5), `API_KEY_CAP` (`shared/models/api_key`), `WEBHOOK_SUBSCRIPTION_CAP` (`shared/models/webhook_subscription`).
- **Keyword normalization parity** comes from `shared/utils/text.normalizeKeyword`, imported at [utils/watch-input.ts](utils/watch-input.ts):2 and used at :49 — the matcher only works because both sides normalize identically.

## Gotchas

- **Middleware order is ALPHABETICAL and the code depends on it**: `apiAuth.ts → auth.ts → cache.ts → rateLimit.ts`. `auth.ts:20` bails when `event.context.apiKey` is set; `rateLimit.ts:141` reads `event.context.apiKey`. Renaming any middleware file reorders the chain and silently breaks both.
- **A cache HIT ends the request from middleware** (`cache.ts:148-152`), so `rateLimit.ts` never runs on hits — cached endpoints are effectively unlimited for repeat queries.
- **Cache leaks per-user data.** `cache.ts:107` routes anything containing `/analytics/` into the 1-hour `staticCache`, and the key (`cache.ts:90-101`) is url+query ONLY — no user dimension. But `api/analytics/anomalies.get.ts:221-224` and `api/analytics/anomalies/[id].get.ts:46` embed `feedback.myVote`/`myComment` for the *requesting* user. The first caller's vote is served to everyone else for an hour. The plugin's claim that "None of those read the session" (`plugins/cache-store.ts:14`) is stale. Fix by keying on uid or stripping `myVote` before storing.
- **`/api/search` is NEVER cached.** The whitelist entry is `'/api/search/'` WITH a trailing slash (`cache.ts:127`) while the real URL is `/api/search?q=…`, so `startsWith` is always false. This is the exact bug class already fixed in `rateLimit.ts:117-124` — the cache copy was not fixed.
- **`exportLimiter` (5/min, `rateLimit.ts:60,127-129`) is dead code**: `find api -name '*.ts'` shows no `export` route. Don't assume exports are throttled.
- **Rate limiting is disabled for loopback/unknown-IP requests** (`rateLimit.ts:100-115,158-162`): `getClientId` returns `null` when there's no `cf-connecting-ip`/`x-forwarded-for`/`x-real-ip` and the socket is loopback. Deliberate — SSR `$fetch` would otherwise 429 itself and render "No encontramos ese contrato". Consequence: you cannot reproduce a 429 locally without faking a header, and a direct-to-origin attacker hitting 127.0.0.1 is unlimited.
- **All limiter/cache state is per-process, in-memory `Map`s** (`rateLimit.ts:11`, `cache.ts:11`). Under pm2 cluster mode the effective limit is N× configured, and every deploy resets every window. Same for [utils/rates.ts](utils/rates.ts):11, [api/pauta.get.ts](api/pauta.get.ts):25, and the curros/recopilatorios index caches.
- **The cache WRITE only exists in [plugins/cache-store.ts](plugins/cache-store.ts).** Delete it and `cache.ts` degrades silently to 100% MISS with no error (documented at `cache.ts:161-170` — that was its state for its whole life). `storeCachedResponse` refuses to store `success:false` bodies or anything with a `statusCode` key (`cache.ts:177-179`).
- **`/api/contracts` hard-caps `page` at 100 and throws 400 past it** (`api/contracts/index.get.ts:330-336`), caps `limit` at 50, and caps counts at 10001 with `totalIsCapped:true` (`:298-299`) → the UI must render "10,000+". `?count=false` skips the count and `total` comes back `null`; `hasMore` is then inferred from row count.
- **`/api/v1/awards/changes` sorts on `date` ALONE with no `_id` tiebreak** so it can ride the `tag_1_date_-1` index over 2.2M releases (`api/v1/awards/changes.get.ts:8-13,33`). Awards sharing an identical `date` at a page boundary CAN be skipped. Do NOT "fix" this by adding the tiebreak — it forces a blocking in-memory sort and times out.
- **`apiAuth.ts` throws a hard 401 on any malformed/revoked key** (`:40,44`); it never downgrades to anonymous. Sending a stale key to a *public* endpoint fails where sending no header succeeds.
- **A bad session cookie is silent, not an error**: `auth.ts:33-36` swallows everything and sets `user = null`. A 401 from `requireUser` therefore never tells you whether Firebase Admin is misconfigured — check `isFirebaseAdminConfigured()` ([utils/firebase-admin.ts](utils/firebase-admin.ts):98). With Firebase env vars missing the whole auth surface degrades to anonymous.
- **`auth.ts:30` does a `UserModel.findOne({uid})` on EVERY cookie-carrying `/api/*` request**, uncached. `apiAuth.ts` additionally does an `ApiKeyModel` + `UserModel` lookup per keyed request (only the `lastUsedAt` write is throttled, to 1/min/key, `apiAuth.ts:22,54-60`).
- **`MONGODB_URI` must NOT go into nuxt.config `runtimeConfig`** — a runtimeConfig default is evaluated at BUILD time and was baking the prod DB password into `.output/server/chunks/nitro/nitro.mjs` (`app/nuxt.config.ts:299-306`). The server reads `process.env.MONGODB_URI` at runtime via `shared/config.ts`.
- **`/openapi.json` and `/docs` live in [routes/](routes/), not `api/`** — `rateLimit.ts:135` only matches `/api/`, so neither is limited nor cached by middleware; they set their own `cache-control: public, max-age=3600`.
- **`releases.buyer.id` has NO index** (`buyer.name` does). Never put a `buyer.id`-led aggregate on a request path — lead with `awards.suppliers.id` or `$text`, or read a precomputed collection.

## Related

- Repo-wide instructions: [CLAUDE.md](../../CLAUDE.md) — root project memory (absent at the time this file was written; check before relying on it).
- Frontend that consumes these routes: [app/context.md](../context.md) — pages call them as URL strings via `useFetch`/`useMonitorApi`; `runtimeConfig.public.apiBase = '/api'` (`app/nuxt.config.ts:313`).
- Models, connection singleton and pure algorithms these routes import: [shared/context.md](../../shared/context.md) — `shared/models` (single source of truth for every collection), `shared/connection/database`, `shared/matching/match`, `shared/webhooks/sign`, `shared/utils/{text,units,real-value,ocid}`.
- Jobs that WRITE the collections these routes read, and that deliver the webhooks this API only registers: [src/jobs/context.md](../../src/jobs/context.md).
- Ingestion layer that fills `releases`: [src/context.md](../../src/context.md).
- Index migration (`autoIndex` is off globally — no index exists unless declared there) and ops/deploy: [scripts/context.md](../../scripts/context.md).
- Design contract for anything user-facing these routes feed: [app/DESIGN.md](../DESIGN.md).
