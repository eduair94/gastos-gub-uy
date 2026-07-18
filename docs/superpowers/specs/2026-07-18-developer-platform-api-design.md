# gastos.gub.uy Developer Platform — Design

**Date:** 2026-07-18
**Status:** Approved, implementing
**Branch base:** `feat/sice-catalog-integration`

## 1. Purpose

Expose the procurement data and the "Monitor de Llamados" account features as a
documented, key-authenticated public API so third parties can integrate the
product into Zapier, MCP clients (Claude, etc.), and their own tooling.

Concretely, ship five things:

1. An **API-key system** with a user-facing page to create/revoke keys.
2. **Key-based authentication** on the existing `/api/*` surface, alongside the
   current Firebase session cookie.
3. **Complete, friendly OpenAPI + Scalar documentation** covering every curated
   public endpoint (today the spec only covers a read subset).
4. **Integration-friendly polling endpoints** ("changes since a cursor") that map
   cleanly to Zapier polling triggers.
5. **Outbound webhooks** (REST Hooks) for push integrations, plus a **shipped MCP
   server** package.

### Non-goals (YAGNI)

- No OAuth / third-party app authorization flow. Keys are issued to the account
  owner and used server-to-server.
- No billing / paid tiers. Rate-limit tiers only.
- No hosted/SSE MCP transport in the first cut (stdio only; HTTP MCP is a later
  option).
- No re-pathing of the 40+ existing `/api/*` handlers (see §4).

## 2. Current state (what exists)

- **Auth:** Firebase Auth (identity) + Mongo `users` (system of record) + a
  Firebase Admin **session cookie** `__session`. `app/server/middleware/auth.ts`
  resolves the cookie into `event.context.user` on every `/api/*` request
  (never throws; anon → `null`). Route handlers opt into protection with
  `requireUser(event)` from `app/server/utils/auth.ts`, and guard mutations with
  `assertSameOrigin(event)`.
- **No API-key concept exists.** Grep for `api-key|bearer|x-api-key` finds only
  Firebase config. This layer is net-new.
- **Rate limiting:** `app/server/middleware/rateLimit.ts` — in-memory, per-IP
  (`socket.remoteAddress`), per-process. Buckets: `/api/*` 60/min, `/api/search`
  30/min, `/api/export` 5/min.
- **Docs already served:** `GET /openapi.json`
  (`app/server/routes/openapi.json.get.ts`, spec built in
  `app/server/utils/openapi.ts`) + `GET /docs`
  (`app/server/routes/docs.get.ts`, renders Scalar from a pinned CDN build). The
  spec covers only: health, contracts, search, suppliers, buyers, an analytics
  subset, dashboard. **Everything else is undocumented.**
- **Endpoints that exist but are undocumented** (the documentation gap): all of
  `open-calls/*` (llamados/tenders), `watches/*`, `saved-calls/*`, `account/*`,
  `calendar`, `unsubscribe`, `categories`, `analytics/products*`,
  `analytics/provider-anomalies`, `analytics/organism-groups`,
  `analytics/intendencias`, `contracts/{id}/features`.
- **Notifications:** email only. `watches` = subscription unit; `notifications` =
  idempotent email outbox (unique `dedupeKey`). Producers are cron jobs in
  `src/jobs/` scheduled by `src/cronserver.ts` (RSS ingest hourly, open-calls
  sync hourly, anomaly detection daily, deadline reminders daily, cross-provider
  anomalies daily). **Anomalies are detected but not wired to any outbound
  channel** — webhooks fill this gap.
- **Money convention:** `amount.primaryAmount` is UYU-normalized for sorting;
  currencies are never summed across UYU/USD/UYI. Join key across a tender's
  lifecycle is `ocid`, never `id`. Live-call surface keys on `compraId`.

## 3. Phasing

Each phase becomes its own implementation plan. Order matters: 1 is the
foundation everything else needs; 2 is mostly parallel to 3–5.

| Phase | Deliverable | Depends on |
|---|---|---|
| 1 | API-key model + auth middleware + `/app/api-keys` page + rate-limit re-key | — |
| 2 | Complete OpenAPI spec + polished Scalar docs + developer landing | 1 (documents auth) |
| 3 | Polling "changes since" endpoints under `/api/v1/` | 1 |
| 4 | Webhooks: subscriptions + HMAC-signed delivery + cron producers | 1 |
| 5 | MCP server package | 1 |

## 4. URL & versioning scheme (decision: hybrid)

- Existing `/api/*` handlers are **not** re-pathed. They keep serving the SSR
  frontend and become the documented "v1" read/account surface.
- The public OpenAPI spec exposes only a **curated subset** of `/api/*` (the
  data + account endpoints listed in §7), not the internal-only ones.
- **New** integration surface (polling, webhooks) lives under `/api/v1/` to keep
  a clean, versioned contract for machine consumers:
  `/api/v1/tenders/changes`, `/api/v1/anomalies/changes`,
  `/api/v1/awards/changes`, `/api/v1/webhooks`.
- Base server in docs: `https://gastos.gub.uy` (from `NUXT_PUBLIC_SITE_URL`).

## 5. Phase 1 — API keys + authentication

### 5.1 Data model — `shared/models/api_key.ts` (collection `api_keys`)

```
{
  userId: string          // owner uid (indexed)
  label: string           // human name, e.g. "Zapier prod"
  prefix: string          // public lookup id, e.g. "gk_live_ab12cd34" (unique index)
  hash: string            // sha256(fullSecret) — the only stored form of the secret
  scopes: ('read'|'write')[]   // default ['read']
  lastUsedAt?: Date
  requestCount: number    // cheap usage counter, best-effort
  revokedAt?: Date        // soft-revoke; null/absent = active
  createdAt, updatedAt    // timestamps
}
```

Interface added to `shared/types/monitor.ts` (`IApiKey`); model registered
HMR-safely and exported from `shared/models/index.ts`. Indexes (added to
`scripts/ensure-indexes.ts`): `{ prefix: 1 }` unique, `{ userId: 1, createdAt: -1 }`.

### 5.2 Key format & lifecycle

- Full secret: `gk_live_<prefixRand><secretRand>` where the token is
  `gk_live_` + 8 base62 chars (the `prefix`, stored & shown in listings) + `_` +
  32 base62 chars (the secret half). Generated with `crypto.randomBytes`.
- On creation the API returns the **full secret exactly once**; afterwards only
  `prefix`, `label`, `scopes`, `lastUsedAt`, `createdAt` are readable. Storage is
  `hash = sha256(fullSecret)` + `prefix`. Verification: parse the prefix from the
  presented token, `findOne({ prefix, revokedAt: null })`, compare
  `sha256(presented) === hash` in constant time.
- Revoke = set `revokedAt`. Keys are never un-revoked; user creates a new one.
- Per-user cap: `API_KEY_CAP` (default 10, env-overridable), mirroring
  `WATCH_CAP`.

### 5.3 Management endpoints (session-cookie auth, `write` via UI)

`app/server/api/account/api-keys/`:

- `GET  index.get.ts` — list caller's keys (never the secret/hash).
- `POST index.post.ts` — `{ label, scopes? }` → create; returns the **full
  secret once**. Enforces cap (409). `assertSameOrigin` + `requireUser`.
- `DELETE [id].delete.ts` — revoke a key owned by the caller.

These use the existing session-cookie gated pattern (they are called from the
authed web page, not by API keys).

### 5.4 Authentication middleware — `app/server/middleware/apiAuth.ts`

Runs on `/api/*`. Alphabetical middleware order is `apiAuth` → `auth` → `cache`
→ `rateLimit`, so key resolution happens first and both middlewares cooperate:

- If `Authorization: Bearer gk_...` or `x-api-key: gk_...` present: parse prefix,
  look up, verify hash. On success set `event.context.apiKey = { id, userId,
  scopes }` and `event.context.user` = the owner's lean user doc (so downstream
  `getUser`/`requireUser` work unchanged). Best-effort bump `lastUsedAt` /
  `requestCount` (fire-and-forget, throttled to ≤1 write/key/min to avoid write
  amplification). On invalid/revoked/malformed key → **401** immediately.
- If no key header: do nothing — `auth.ts` still runs and resolves any session
  cookie. Anonymous stays allowed on public reads.
- A key **is** the credential, so `assertSameOrigin` must be **skipped** when
  `event.context.apiKey` is set. Add `requireWrite(event)` helper in
  `app/server/utils/auth.ts`: if `apiKey` present it must include `'write'`
  scope (else 403); if only a session cookie, fall back to
  `assertSameOrigin(event)` + `requireUser(event)`. Existing write handlers
  switch their `assertSameOrigin(event); const user = requireUser(event)` pair
  to `const user = requireWrite(event)`.

### 5.5 Rate limiting re-key

Extend `rateLimit.ts` to identify clients by API-key id when
`event.context.apiKey` is set, else by IP (unchanged). New buckets:

| Caller | Limit |
|---|---|
| Anonymous IP (existing) | 60/min |
| Keyed, read | 600/min |
| Keyed, write | 120/min |

Return `X-RateLimit-Limit` / `X-RateLimit-Remaining` / `Retry-After` headers.
(Still in-memory/per-process — a documented limitation; Redis is a future item.)

### 5.6 UI — `app/pages/app/api-keys.vue`

Authed page (`definePageMeta({ middleware: 'auth' })`), mirrors
`app/pages/app/cuenta.vue`. Lists keys (label, prefix, scopes, created,
last-used), a "Create key" dialog (label + read/write scope toggle), and a
**one-time reveal** of the new secret with copy button + "you won't see this
again" warning. Revoke with confirm. Nav entry added to `app/layouts/default.vue`;
strings added to both `app/i18n/locales/es.json` and `en.json`. Client calls go
through a new `apiKeys` group in `app/composables/useMonitorApi.ts`. Include a
short "Use in Zapier / MCP" callout linking to `/docs`.

## 6. Phase 2 — OpenAPI + Scalar docs

- Extend `app/server/utils/openapi.ts` to document the full curated surface (§7)
  with request params, JSON response schemas, and realistic examples.
- Add `components.securitySchemes`: `apiKeyHeader` (`x-api-key`) and `bearerAuth`
  (HTTP bearer). Mark account/write and `/api/v1/*` operations with a `security`
  requirement; leave public reads with optional security (documented as
  "key optional, raises rate limit").
- Add `tags` with descriptions and order them for the sidebar: **Licitaciones
  (llamados)**, **Contratos**, **Analytics**, **Anomalías**, **Proveedores y
  compradores**, **Alertas y cuenta**, **Integración (polling)**, **Webhooks**,
  **Sistema**.
- Top-level `info.description` = a quickstart (get a key → first authed request →
  Zapier/MCP pointers), Spanish prose, English field names.
- Polish `app/server/routes/docs.get.ts` Scalar config: keep the pinned CDN
  build, enable grouped sidebar, `hiddenClients` trimmed to curl/JS(fetch)/Python
  code samples, auth persistence, search. Bump the boot copy to bilingual.
- Add a lightweight **developer landing** `app/pages/developers.vue` (public,
  indexable) that markets the API, shows the quickstart, and links to `/docs`
  and the key page. Add a footer/nav link.
- **Validation test:** a test that loads the built spec object and asserts it is
  valid OpenAPI 3.1 (structural checks: every path has an operation, every
  operation has responses, security schemes resolve). Guards against drift.

## 7. Curated public surface (what the docs expose)

Read (key optional):
- Licitaciones: `GET /api/open-calls`, `/api/open-calls/{compraId}`,
  `/api/open-calls/{compraId}/summary`, `/api/open-calls/{compraId}/benchmarks`.
- Contratos: `GET /api/contracts`, `/stats`, `/filters`, `/{id}`,
  `/{id}/features`.
- Analytics: `GET /api/analytics/anomalies`, `/anomalies/stats`, `/anomalies/{id}`,
  `/top-suppliers`, `/top-buyers`, `/category-distribution`, `/products`,
  `/products/{code}`, `/provider-anomalies`, `/organism-groups`, `/intendencias`.
- Proveedores/compradores: `GET /api/suppliers`, `/suppliers/{id}`,
  `/suppliers/autocomplete`, `/buyers`, `/buyers/{id}`.
- Catálogo: `GET /api/categories`.
- Búsqueda: `GET /api/search`.
- Sistema: `GET /api/health`.

Account (key with `write`, or session):
- Alertas: `GET/POST /api/watches`, `GET/PUT/DELETE /api/watches/{id}`,
  `POST /api/watches/test`.
- Guardados: `GET/POST /api/saved-calls`, `DELETE /api/saved-calls/{compraId}`.
- Cuenta: `GET/PUT /api/account/preferences`; `GET/POST/DELETE
  /api/account/api-keys`.
- Calendario: `GET /api/calendar`.

Integración (§8, §9): `/api/v1/tenders/changes`, `/api/v1/anomalies/changes`,
`/api/v1/awards/changes`, `/api/v1/webhooks*`.

Not documented (internal): `auth/*`, `unsubscribe` (email-link only), dashboard
SSR-only aggregates if any are redundant with analytics.

## 8. Phase 3 — Polling endpoints ("changes since a cursor")

Design for Zapier polling triggers ("New Tender", "New Anomaly", "New Award"):
newest-first, deduplicated by a stable id, cursor-based so a poller never
misses or repeats.

- `GET /api/v1/tenders/changes?since=<cursor>&limit=&status=&category=&buyer=`
  → new/updated `open_calls`. Cursor = `firstSeenAt` timestamp (ms) + `_id`
  tiebreak, opaque base64. Items projected like `/api/open-calls`. Response:
  `{ data: [...], nextCursor, hasMore }`.
- `GET /api/v1/anomalies/changes?since=&minZ=&severity=&minAmount=&currency=`
  → new `anomalies` by `firstDetectedAt`. Enables "alert on anomalies over $Y /
  z≥Z".
- `GET /api/v1/awards/changes?since=&supplierId=&buyerId=&minAmount=`
  → new award releases (`releases` where `tag:'award'`) by award date/ingest
  time. Enables "notify when supplier Z wins".

Cursor is monotonic on an indexed field; add indexes if missing
(`open_calls.firstSeenAt` exists; verify `anomalies.firstDetectedAt`,
`releases` award-date index). Without `since`, return the most recent page +
a `nextCursor` the poller stores as its starting point (Zapier "dedupe on first
poll" pattern). Reads accept an optional key; recommend a key for the higher
rate limit given pollers hit every few minutes.

## 9. Phase 4 — Webhooks (REST Hooks)

### 9.1 Model — `shared/models/webhook_subscription.ts` (`webhook_subscriptions`)

```
{
  userId: string
  apiKeyId?: string          // key that created it (audit)
  url: string                // HTTPS target
  events: string[]           // subscribed event types (§9.2)
  filters?: {                // optional narrowing, event-dependent
    categories?: string[]; keywords?: string[]; buyers?: string[]
    minAmount?: number; minZ?: number; severity?: string
    supplierId?: string
  }
  secret: string             // HMAC signing secret (generated, shown once)
  active: boolean
  failureCount: number       // consecutive failures; auto-disable past a cap
  lastDeliveryAt?: Date
  createdAt, updatedAt
}
```

### 9.2 Event catalog

- `tender.matched` — a newly-opened call matches the subscription filters. Reuses
  `shared/matching/match.ts` `watchMatchesCall` against the subscription's
  `filters` (treated as a watch-shaped criteria object).
- `anomaly.detected` — a new anomaly passes `filters` (minZ / severity /
  minAmount).
- `award.created` — a new award release, optionally filtered by `supplierId` /
  `buyerId` / `minAmount`.
- `deadline.approaching` — a saved/relevant call nears its `tenderPeriod.endDate`
  (N days). *(Optional in first cut; include if cheap.)*

### 9.3 Subscribe/unsubscribe endpoints (REST Hook shape for Zapier)

`app/server/api/v1/webhooks/`:
- `POST index.post.ts` — `{ url, events, filters? }` → create; returns the
  subscription incl. the signing `secret` **once**. `requireWrite`.
- `GET index.get.ts` — list caller's subscriptions.
- `DELETE [id].delete.ts` — unsubscribe (Zapier calls this on unsubscribe).
- `POST [id]/test.post.ts` — send a sample event to the URL (Zapier "perform
  list"/test). Returns delivery result.

### 9.4 Delivery — outbox mirroring `notifications`

- New collection `webhook_deliveries` (idempotent by unique `dedupeKey =
  ${event}:${subscriptionId}:${resourceId}`), status machine
  `pending→sent/failed`, `attempts`, `lastError`, exponential backoff, cap
  MAX_ATTEMPTS (reuse the value/pattern from `notifications`).
- Signature: `X-GastosGub-Signature: sha256=<hmac(secret, rawBody)>` +
  `X-GastosGub-Event`, `X-GastosGub-Delivery` (id), timestamp. Documented so
  receivers can verify.
- Consecutive `failureCount` past a cap (e.g. 15) auto-sets `active:false`
  (documented; user re-enables from the API-keys/webhooks page or re-subscribes).

### 9.5 Producers (wired into existing cron jobs)

Enqueue deliveries where the events already occur, so no new schedule is needed:
- `src/jobs/open-calls/sync.ts` (or `src/jobs/matching/run.ts`) — on newly-opened
  calls, match active `webhook_subscriptions` for `tender.matched` alongside the
  existing email `alert` enqueue.
- `src/jobs/detect-anomalies*` — on new anomalies, enqueue `anomaly.detected`.
- Award reconcile / RSS ingest — enqueue `award.created` for new award releases.
- A small dispatcher `src/jobs/webhooks/dispatch.ts` (invoked by the cron server
  on a short cadence, e.g. every minute, and after each producer) drains
  `webhook_deliveries`. Add a manual trigger `/cron/webhooks` + status endpoint
  on the cron server, matching the existing job pattern.

### 9.6 Web UI

Extend `app/pages/app/api-keys.vue` (or a sibling `app/pages/app/webhooks.vue`)
to list/create/delete webhook subscriptions and show the signing secret once.
Reuse the same i18n + composable patterns.

## 10. Phase 5 — MCP server

- New package `packages/mcp/` (Node + TypeScript + `@modelcontextprotocol/sdk`),
  its own `package.json`, published as e.g. `@gastos-gub/mcp`. Wired into the repo
  as a workspace if the repo uses workspaces; otherwise a standalone package
  directory with its own build.
- **Transport:** stdio (Claude Desktop / MCP-CLI native). Config via env
  `GASTOS_GUB_API_KEY` and optional `GASTOS_GUB_BASE_URL`
  (default `https://gastos.gub.uy`).
- **Tools** (each = a thin call to the documented API with the key):
  `search_tenders`, `get_tender`, `get_tender_summary`, `get_tender_benchmarks`,
  `list_contracts`, `get_contract`, `get_supplier`, `get_buyer`,
  `list_anomalies`, `get_provider_anomalies`, `get_analytics_category_distribution`,
  `list_my_watches`, `create_watch`, `list_saved_calls`, `get_calendar`.
- Read tools work with a `read` key; account tools require a `write` key
  (documented; tool returns a clear error if the key lacks scope).
- README with Claude Desktop `mcpServers` config snippet. Hosted HTTP/SSE MCP is
  a documented future option, not built now.

## 11. Security

- Secrets (API keys, webhook signing secrets) are stored **hashed** (keys) or
  as generated random strings shown once (webhook secret is needed in plaintext
  server-side to sign, so it is stored as-is but never returned after creation —
  acceptable; documented). Prefer storing the webhook secret encrypted at rest if
  a KMS/secret already exists; otherwise plaintext-in-DB with restricted access,
  matching how Firebase/Resend secrets already live in env.
- Constant-time hash comparison for key verification.
- Webhook target URLs must be `https://` and are validated to block SSRF to
  internal ranges (reject localhost, RFC1918, link-local) at subscribe time.
- Key auth bypasses same-origin CSRF by design; writes therefore require an
  explicit `write` scope, and the key page warns that write keys can manage the
  account.
- Rate-limit tiers cap abuse; per-key limits mean one noisy integration can't
  exhaust another's budget.

## 12. Testing

- **Unit:** key generation/format, `sha256` hash + constant-time verify, scope
  enforcement (`requireWrite`), rate-limit keying (IP vs key), cursor
  encode/decode + monotonicity, HMAC signature, `watchMatchesCall` ↔ webhook
  filter mapping, SSRF URL validation.
- **Integration:** `apiAuth` middleware (valid/invalid/revoked/malformed key,
  scope denial on writes), api-keys CRUD round-trip, `/api/v1/*/changes` cursor
  paging returns no gaps/dupes across two polls, webhook subscribe → producer
  enqueue → dispatch → signed POST → retry on failure, MCP tool round-trip
  against a running dev server.
- **Docs:** OpenAPI 3.1 structural validation test (§6).
- Follow the repo's existing test setup; add fixtures for a test user + key.

## 13. Rollout / ops notes

- All new indexes added to `scripts/ensure-indexes.ts` (repo builds indexes there;
  `autoIndex:false` globally).
- Webhook dispatch runs in the **cron server** (`src/cronserver.ts`), which is
  deployed as compiled `dist` on the Windows prod box (per deploy notes). New
  job + trigger endpoint follow the existing `runJobProcess`/`/cron/<name>`
  pattern.
- Feature-flag safety: the API-key + webhook UI depends on auth being configured
  (`useAuthEnabled()`); server endpoints guard on `isFirebaseAdminConfigured()`
  and return 503 when auth is off, matching the existing account endpoints.
- Env additions: `API_KEY_CAP` (default 10), `WEBHOOK_SUBSCRIPTION_CAP`
  (default 10), `WEBHOOK_MAX_ATTEMPTS` (default reuse notifications'),
  documented in `.env.example` + `docs/CONFIGURACION-CREDENCIALES.md`.

## 14. Open items deferred (future)

- Redis-backed distributed rate limiting.
- Hosted HTTP/SSE MCP endpoint.
- Paid tiers / higher quotas.
- OAuth app authorization for multi-tenant third-party apps.
- Encrypted-at-rest webhook secrets via a KMS.
