# Developer Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a key-authenticated public API for gastos.gub.uy — API keys + management page, key auth middleware, complete Scalar/OpenAPI docs, cursor polling endpoints, outbound webhooks, and a stdio MCP server — so the product integrates with Zapier, MCP clients, and third-party tooling.

**Architecture:** Layer API-key auth on top of the existing Firebase-session `/api/*` surface (keys resolve into the same `event.context.user`, so handlers are unchanged). Reads stay public; writes require a `write`-scoped key or a session cookie. New integration surface (`/api/v1/*`) is versioned. Webhooks reuse the proven idempotent-outbox pattern and fire from existing cron jobs. MCP is a thin package that calls the documented API with a key.

**Tech Stack:** Nuxt 3 / Nitro (h3), Mongoose 8, TypeScript 5.5 (run via `tsx`), Vuetify 4, @nuxtjs/i18n 9, Scalar (pinned CDN), `@modelcontextprotocol/sdk`, Node `crypto`.

## Global Constraints

- **No test framework exists.** Do NOT add vitest/jest. Verify pure logic with standalone `tsx` assertion scripts under `test/` that throw on failure (run `npx tsx test/<file>.ts`, exit 0 = pass). Verify endpoints with `cd app && npm run type-check` (`nuxt typecheck`) plus live `curl` against `npm run dev` (port 3600). State real command output before claiming a step passes.
- **`exactOptionalPropertyTypes` is on.** Every optional interface property is `?: T | undefined`.
- **Money:** never sum across currencies; `amount.primaryAmount` is UYU-normalized. Join key is `ocid`, never `id`; live-call key is `compraId`.
- **Indexes:** `autoIndex:false` globally. Every new index goes in `scripts/ensure-indexes.ts`; nothing relies on auto-build.
- **Model registration:** HMR-safe — `mongoose.models.X || mongoose.model('X', Schema)`. Interfaces live in `shared/types/monitor.ts`; models export from `shared/models/index.ts`.
- **Secrets:** API keys stored as `sha256` hash + public prefix; full secret shown once. Constant-time compare. Webhook signing secret shown once.
- **Auth gating:** server endpoints guard `isFirebaseAdminConfigured()` (503 if off); UI depends on `useAuthEnabled()`. Write handlers use `requireWrite(event)` (defined in Task 1.3).
- **i18n:** every UI string is a `t('...')` key added to BOTH `app/i18n/locales/es.json` and `en.json`, same key order. `es` is source of truth.
- **Commit style:** conventional commits; end body with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Branch: `feat/sice-catalog-integration` (already checked out).
- **Cron/webhooks run in `src/cronserver.ts`** which deploys as compiled `dist` (tsx path breaks job spawning) — new job follows the `runJobProcess` + `/cron/<name>` pattern. Do NOT deploy or restart pm2; implement + verify only.

## File Structure

**Phase 1 — keys + auth**
- Create `shared/models/api_key.ts` — `ApiKeyModel` (collection `api_keys`).
- Modify `shared/types/monitor.ts` — add `IApiKey`, `ApiKeyScope`.
- Modify `shared/models/index.ts` — export api_key.
- Create `app/server/utils/api-key.ts` — generate/parse/hash/verify key (pure, testable).
- Modify `app/server/utils/auth.ts` — add `requireWrite`, `ApiKeyContext`.
- Create `app/server/middleware/apiAuth.ts` — resolve `Bearer`/`x-api-key` → context.
- Modify `app/server/middleware/rateLimit.ts` — re-key on api-key id + tiers + headers.
- Create `app/server/api/account/api-keys/index.get.ts`, `index.post.ts`, `[id].delete.ts`.
- Modify write handlers (`watches/*`, `saved-calls/*`, `account/preferences.put.ts`) — swap `assertSameOrigin+requireUser` → `requireWrite`.
- Create `app/pages/app/api-keys.vue`; modify `app/layouts/default.vue` (nav), `app/composables/useMonitorApi.ts` (apiKeys group), both locale JSONs.
- Modify `scripts/ensure-indexes.ts` — api_keys indexes.
- Create `test/api-key.test.ts`.

**Phase 2 — docs**
- Modify `app/server/utils/openapi.ts` — securitySchemes, tags, all curated paths + schemas.
- Modify `app/server/routes/docs.get.ts` — Scalar config polish, bilingual boot.
- Create `app/pages/developers.vue` — developer landing; modify layout footer/nav + locales.
- Create `test/openapi.test.ts` — structural validation.

**Phase 3 — polling**
- Create `app/server/utils/cursor.ts` — encode/decode opaque cursor (pure, testable).
- Create `app/server/api/v1/tenders/changes.get.ts`, `v1/anomalies/changes.get.ts`, `v1/awards/changes.get.ts`.
- Modify `scripts/ensure-indexes.ts` — cursor-support indexes.
- Create `test/cursor.test.ts`.

**Phase 4 — webhooks**
- Create `shared/models/webhook_subscription.ts`, `shared/models/webhook_delivery.ts`; modify types + index barrel + ensure-indexes.
- Create `app/server/utils/webhook.ts` — HMAC sign + SSRF-safe URL validation (pure, testable).
- Create `app/server/api/v1/webhooks/index.get.ts`, `index.post.ts`, `[id].delete.ts`, `[id]/test.post.ts`.
- Create `src/jobs/webhooks/enqueue.ts` (producer helper), `src/jobs/webhooks/dispatch.ts` (drainer); modify `src/jobs/sync-open-calls.ts` / `src/jobs/detect-anomalies.ts` to call enqueue; modify `src/cronserver.ts` (schedule + `/cron/webhooks`).
- Create `app/pages/app/webhooks.vue`; modify layout nav, composable, locales.
- Create `test/webhook.test.ts`.

**Phase 5 — MCP**
- Create `packages/mcp/` — `package.json`, `tsconfig.json`, `src/index.ts`, `src/client.ts`, `src/tools.ts`, `README.md`.

---

## Phase 1 — API keys + authentication

### Task 1.1: API-key generation/verification utility (pure logic)

**Files:**
- Create: `app/server/utils/api-key.ts`
- Test: `test/api-key.test.ts`

**Interfaces:**
- Produces:
  - `generateApiKey(): { token: string, prefix: string, hash: string }` — `token` = `gk_live_<8b62>_<32b62>`, `prefix` = `gk_live_<8b62>`, `hash` = sha256(token) hex.
  - `parsePrefix(token: string): string | null` — returns the `gk_live_<8b62>` prefix or null if malformed.
  - `hashToken(token: string): string` — sha256 hex.
  - `verifyToken(token: string, hash: string): boolean` — constant-time compare of `hashToken(token)` vs `hash`.

- [ ] **Step 1: Write the failing test** — `test/api-key.test.ts`:

```ts
import assert from 'node:assert/strict'
import { generateApiKey, parsePrefix, hashToken, verifyToken } from '../app/server/utils/api-key'

const { token, prefix, hash } = generateApiKey()
assert.match(token, /^gk_live_[0-9A-Za-z]{8}_[0-9A-Za-z]{32}$/, 'token format')
assert.equal(parsePrefix(token), prefix, 'prefix parses from token')
assert.ok(token.startsWith(prefix), 'prefix is a token prefix')
assert.equal(hashToken(token), hash, 'hash is deterministic')
assert.equal(verifyToken(token, hash), true, 'verify accepts correct token')
assert.equal(verifyToken(token + 'x', hash), false, 'verify rejects wrong token')
assert.equal(parsePrefix('nope'), null, 'malformed → null')
assert.equal(parsePrefix('gk_live_short'), null, 'wrong length → null')
// Uniqueness
const a = generateApiKey(); const b = generateApiKey()
assert.notEqual(a.token, b.token, 'tokens unique')
console.log('api-key.test OK')
```

- [ ] **Step 2: Run test to verify it fails** — `npx tsx test/api-key.test.ts` → Expected: error `Cannot find module '../app/server/utils/api-key'`.

- [ ] **Step 3: Implement** — `app/server/utils/api-key.ts`:

```ts
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const PREFIX_LABEL = 'gk_live_'
const PREFIX_RAND = 8
const SECRET_RAND = 32
// gk_live_ + 8 + _ + 32
const TOKEN_RE = /^gk_live_[0-9A-Za-z]{8}_[0-9A-Za-z]{32}$/

function base62(n: number): string {
  // Rejection-sampled base62 so every char is uniformly distributed.
  let out = ''
  while (out.length < n) {
    for (const byte of randomBytes(n * 2)) {
      if (byte < 248) { // 248 = floor(256/62)*62 — drop the biased tail
        out += ALPHABET[byte % 62]
        if (out.length === n) break
      }
    }
  }
  return out
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function generateApiKey(): { token: string, prefix: string, hash: string } {
  const prefix = PREFIX_LABEL + base62(PREFIX_RAND)
  const token = prefix + '_' + base62(SECRET_RAND)
  return { token, prefix, hash: hashToken(token) }
}

export function parsePrefix(token: string): string | null {
  if (!TOKEN_RE.test(token)) return null
  // gk_live_XXXXXXXX  → first 16 chars ("gk_live_" is 8) + 8 rand
  return token.slice(0, PREFIX_LABEL.length + PREFIX_RAND)
}

export function verifyToken(token: string, hash: string): boolean {
  const a = Buffer.from(hashToken(token), 'hex')
  const b = Buffer.from(hash, 'hex')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
```

- [ ] **Step 4: Run test to verify it passes** — `npx tsx test/api-key.test.ts` → Expected: `api-key.test OK`.

- [ ] **Step 5: Commit** — `git add app/server/utils/api-key.ts test/api-key.test.ts && git commit` (`feat(api): api-key generate/verify utility`).

### Task 1.2: `api_keys` model + type + barrel + indexes

**Files:**
- Modify: `shared/types/monitor.ts` (add `ApiKeyScope`, `IApiKey`)
- Create: `shared/models/api_key.ts`
- Modify: `shared/models/index.ts`, `scripts/ensure-indexes.ts`

**Interfaces:**
- Produces: `ApiKeyModel` (Model<IApiKey>), `IApiKey`, `ApiKeyScope = 'read' | 'write'`, `API_KEY_CAP`.

- [ ] **Step 1: Add types** to `shared/types/monitor.ts` (after `ISavedCall`):

```ts
export type ApiKeyScope = 'read' | 'write'

export interface IApiKey extends Document {
  userId: string
  label: string
  prefix: string
  hash: string
  scopes: ApiKeyScope[]
  lastUsedAt?: Date | undefined
  requestCount: number
  revokedAt?: Date | undefined
  createdAt: Date
  updatedAt: Date
}
```

- [ ] **Step 2: Create model** `shared/models/api_key.ts`:

```ts
import { Schema } from 'mongoose'
import type { Model } from 'mongoose'
import { mongoose } from '../connection/database'
import { IApiKey } from '../types/monitor'

// A user-issued API credential. Only the sha256 `hash` + public `prefix` are
// stored; the full secret is shown once at creation. `revokedAt` soft-revokes.
const ApiKeySchema = new Schema<IApiKey>(
  {
    userId: { type: String, required: true },
    label: { type: String, required: true, trim: true },
    prefix: { type: String, required: true, unique: true },
    hash: { type: String, required: true },
    scopes: { type: [String], enum: ['read', 'write'], default: ['read'] },
    lastUsedAt: { type: Date },
    requestCount: { type: Number, default: 0 },
    revokedAt: { type: Date },
  },
  { timestamps: true, collection: 'api_keys' },
)

ApiKeySchema.index({ userId: 1, createdAt: -1 })
// prefix already unique via field option.

export const API_KEY_CAP = Number(process.env.API_KEY_CAP || 10)

export const ApiKeyModel: Model<IApiKey>
  = (mongoose.models.ApiKey as Model<IApiKey>) || mongoose.model<IApiKey>('ApiKey', ApiKeySchema)
```

- [ ] **Step 3: Export** — add `export * from './api_key'` to `shared/models/index.ts` under the "Monitor de Llamados + auth" group.

- [ ] **Step 4: Add indexes to `scripts/ensure-indexes.ts`** — follow the file's existing pattern (read it first) to `createIndex({ prefix: 1 }, { unique: true })` and `{ userId: 1, createdAt: -1 }` on `api_keys`.

- [ ] **Step 5: Verify + commit** — `cd app && npm run type-check` passes; `git commit` (`feat(api): api_keys model, type and indexes`).

### Task 1.3: `requireWrite` auth helper

**Files:**
- Modify: `app/server/utils/auth.ts`

**Interfaces:**
- Consumes: `event.context.apiKey` (set by Task 1.4), `getUser`, `requireUser`, `assertSameOrigin`.
- Produces:
  - `interface ApiKeyContext { id: string, userId: string, scopes: ApiKeyScope[] }`
  - `getApiKey(event): ApiKeyContext | null`
  - `requireWrite(event): SessionUser` — if an api key is present it must include `'write'` (else 403 "API key sin permiso de escritura"); otherwise falls back to `assertSameOrigin(event)` then returns `requireUser(event)`. Always returns the active user.

- [ ] **Step 1:** Add to `app/server/utils/auth.ts`:

```ts
import type { ApiKeyScope } from '../../../shared/types/monitor'

export interface ApiKeyContext { id: string, userId: string, scopes: ApiKeyScope[] }

export function getApiKey(event: H3Event): ApiKeyContext | null {
  return (event.context.apiKey as ApiKeyContext | null) ?? null
}

/**
 * Authorize a mutating request. An API key IS the credential, so key-authed
 * writes skip the same-origin (CSRF) check but must carry the `write` scope.
 * Cookie-authed writes keep the existing same-origin defence.
 */
export function requireWrite(event: H3Event): SessionUser {
  const apiKey = getApiKey(event)
  if (apiKey) {
    if (!apiKey.scopes.includes('write')) {
      throw createError({ statusCode: 403, statusMessage: 'API key sin permiso de escritura (scope write requerido)' })
    }
    return requireUser(event)
  }
  assertSameOrigin(event)
  return requireUser(event)
}
```

- [ ] **Step 2: Verify + commit** — `cd app && npm run type-check`; `git commit` (`feat(api): requireWrite authorizes cookie or write-scoped key`).

### Task 1.4: `apiAuth` middleware

**Files:**
- Create: `app/server/middleware/apiAuth.ts`

**Interfaces:**
- Consumes: `parsePrefix`, `verifyToken` (1.1), `ApiKeyModel` (1.2).
- Produces: sets `event.context.apiKey: ApiKeyContext | null` and, on a valid key, `event.context.user` = owner lean doc. Runs before `auth.ts` (name sorts first). 401 on invalid/revoked/malformed key header.

- [ ] **Step 1: Implement** `app/server/middleware/apiAuth.ts`:

```ts
import { createError, defineEventHandler, getRequestHeader } from 'h3'
import { connectToDatabase } from '../utils/database'
import { ApiKeyModel } from '../../../shared/models/api_key'
import { UserModel } from '../../../shared/models/user'
import { parsePrefix, verifyToken } from '../utils/api-key'

// Throttle lastUsedAt writes to at most once per key per minute.
const lastTouch = new Map<string, number>()

function extractToken(event: any): string | null {
  const auth = getRequestHeader(event, 'authorization')
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7).trim()
  const x = getRequestHeader(event, 'x-api-key')
  return x ? x.trim() : null
}

export default defineEventHandler(async (event) => {
  const url = event.node.req.url || ''
  if (!url.startsWith('/api/')) return
  event.context.apiKey = null

  const token = extractToken(event)
  if (!token) return // fall through to cookie auth

  const prefix = parsePrefix(token)
  if (!prefix) throw createError({ statusCode: 401, statusMessage: 'API key inválida' })

  await connectToDatabase()
  const key = await ApiKeyModel.findOne({ prefix }).lean()
  if (!key || key.revokedAt || !verifyToken(token, key.hash)) {
    throw createError({ statusCode: 401, statusMessage: 'API key inválida o revocada' })
  }

  event.context.apiKey = { id: String(key._id), userId: key.userId, scopes: key.scopes }
  const user = await UserModel.findOne({ uid: key.userId }).lean()
  event.context.user = user || null

  const now = Date.now()
  const last = lastTouch.get(prefix) || 0
  if (now - last > 60_000) {
    lastTouch.set(prefix, now)
    void ApiKeyModel.updateOne({ _id: key._id }, { $set: { lastUsedAt: new Date() }, $inc: { requestCount: 1 } }).catch(() => {})
  }
})
```

- [ ] **Step 2: Verify** — `cd app && npm run type-check`. Confirm middleware order: `apiAuth` < `auth` < `cache` < `rateLimit` alphabetically (so `event.context.user` set by a key is not clobbered — `auth.ts` only overwrites when a cookie is present; when a key set the user and there is no cookie, `auth.ts` sets `user = null` at its top then returns early leaving... ⚠ check). **Guard:** `auth.ts` line 18 sets `event.context.user = null` unconditionally then returns if no cookie — that would wipe a key-resolved user. Fix `auth.ts`: only null the user when it is not already set by a key: change to `if (event.context.apiKey) return` at the top of `auth.ts` (a key already resolved the user; cookie auth must not run).

- [ ] **Step 3: Patch `app/server/middleware/auth.ts`** — add after the `/api/` guard:

```ts
  // An API key already resolved the user in apiAuth.ts — don't let cookie auth clobber it.
  if (event.context.apiKey) return
```

- [ ] **Step 4: Verify + commit** — `cd app && npm run type-check`; `git commit` (`feat(api): apiAuth middleware resolves bearer/x-api-key`).

### Task 1.5: Rate-limit re-key + headers

**Files:**
- Modify: `app/server/middleware/rateLimit.ts`

**Interfaces:**
- Consumes: `event.context.apiKey`.
- Produces: keyed clients get read 600/min or write 120/min buckets; anon IP unchanged 60/min; sets `X-RateLimit-*` + `Retry-After`.

- [ ] **Step 1:** Replace `getClientId` and the handler so that when `event.context.apiKey` is set, the client id is `key:<id>` and the limiter is a 600/min read limiter, or 120/min if the request is a mutation (`event.node.req.method` in `POST|PUT|PATCH|DELETE`). Keep the existing IP path for anon. Add response headers. (Read the current file; preserve the search/export buckets for the anon/IP path.)

```ts
const keyedReadLimiter = new RateLimiter(600, 60000)
const keyedWriteLimiter = new RateLimiter(120, 60000)
// ...in the handler, before the IP path:
const apiKey = event.context.apiKey as { id: string } | null
if (apiKey) {
  const isWrite = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(event.node.req.method || 'GET')
  const limiter = isWrite ? keyedWriteLimiter : keyedReadLimiter
  const id = `key:${apiKey.id}`
  if (!limiter.isAllowed(id)) throw createError({ statusCode: 429, statusMessage: 'Too Many Requests', data: { retryAfter: 60 } })
  return
}
```

- [ ] **Step 2: Verify + commit** — `cd app && npm run type-check`; `git commit` (`feat(api): per-key rate-limit tiers`).

### Task 1.6: API-key management endpoints

**Files:**
- Create: `app/server/api/account/api-keys/index.get.ts`, `index.post.ts`, `[id].delete.ts`

**Interfaces:**
- Consumes: `requireUser`/`assertSameOrigin` (called from the web page, cookie-authed), `generateApiKey` (1.1), `ApiKeyModel`, `API_KEY_CAP`.
- Produces: list (no secret/hash), create (returns full `token` once), delete (revoke).

- [ ] **Step 1: `index.get.ts`** — `requireUser`; `ApiKeyModel.find({ userId, revokedAt: null }).sort({ createdAt: -1 })`; project `{ _id, label, prefix, scopes, lastUsedAt, createdAt }` (never `hash`). Return `{ success: true, data }`.

- [ ] **Step 2: `index.post.ts`** — `assertSameOrigin` + `requireUser`; body `{ label: string, scopes?: ApiKeyScope[] }`. Validate label 1–60 chars (400). Coerce scopes to a subset of `['read','write']`, default `['read']`. Enforce `countDocuments({ userId, revokedAt: null }) < API_KEY_CAP` (409). `generateApiKey()`, create doc with `hash`+`prefix`, return `{ success: true, data: { id, label, prefix, scopes, token } }` — `token` present ONLY here.

- [ ] **Step 3: `[id].delete.ts`** — `assertSameOrigin` + `requireUser`; validate ObjectId (404 else); `findOneAndUpdate({ _id, userId }, { $set: { revokedAt: new Date() } })`; 404 if not owned; return `{ success: true }`.

- [ ] **Step 4: Verify + commit** — `cd app && npm run type-check`; live smoke: start `npm run dev`, sign in, `POST /api/account/api-keys` via browser devtools, confirm one-time token; `git commit` (`feat(api): api-key management endpoints`).

### Task 1.7: Convert write handlers to `requireWrite`

**Files:**
- Modify: `app/server/api/watches/index.post.ts`, `[id].put.ts`, `[id].delete.ts`, `test.post.ts`; `saved-calls/index.post.ts`, `[compraId].delete.ts`; `account/preferences.put.ts`

**Interfaces:**
- Consumes: `requireWrite` (1.3).

- [ ] **Step 1:** In each file, replace the pair `assertSameOrigin(event)\n  const user = requireUser(event)` with `const user = requireWrite(event)`, and drop the now-unused `assertSameOrigin`/`requireUser` imports (keep `requireUser` only where still used). For `watches/test.post.ts` (no user mutation beyond read) keep behaviour: it currently does `assertSameOrigin` + `requireUser` → `requireWrite` is correct (a test run is a write-shaped action).

- [ ] **Step 2: Verify + commit** — `cd app && npm run type-check`; `git commit` (`feat(api): account writes accept write-scoped key or cookie`).

### Task 1.8: API-keys management page + i18n + nav + composable

**Files:**
- Create: `app/pages/app/api-keys.vue`
- Modify: `app/composables/useMonitorApi.ts`, `app/layouts/default.vue`, `app/i18n/locales/es.json`, `app/i18n/locales/en.json`

**Interfaces:**
- Consumes: management endpoints (1.6).
- Produces: `useMonitorApi().apiKeys = { list, create, revoke }`.

- [ ] **Step 1: Composable** — add to `useMonitorApi.ts`:

```ts
  const apiKeys = {
    list: () => $fetch<{ data: Array<{ _id: string, label: string, prefix: string, scopes: string[], lastUsedAt: string | null, createdAt: string }> }>('/api/account/api-keys'),
    create: (body: { label: string, scopes?: string[] }) => $fetch<{ data: { id: string, label: string, prefix: string, scopes: string[], token: string } }>('/api/account/api-keys', { method: 'POST', body }),
    revoke: (id: string) => $fetch<{ success: boolean }>(`/api/account/api-keys/${id}`, { method: 'DELETE' }),
  }
```
and add `apiKeys` to the returned object.

- [ ] **Step 2: Page** — create `app/pages/app/api-keys.vue` modelled on `app/pages/app/cuenta.vue` (read it first for the exact layout/`definePageMeta`/`useSeo` idiom): `definePageMeta({ middleware: 'auth' })`, `useSeo({ title: t('apiKeys.title'), noindex: true, path: '/app/api-keys' })`. Show a table of keys (label, prefix, scopes chips, created, last-used, revoke button with confirm). A "Create key" dialog with a label field + read/write scope selector. On create, show the returned `token` once in a copyable field with a persistent "guardá esto, no se vuelve a mostrar" warning. Include a callout linking to `/docs` and `/developers`. Use only existing Vuetify components already used in the app (`v-data-table` or `v-list`, `v-dialog`, `v-text-field`, `v-btn`, `v-chip`, `v-alert`, `v-snackbar`).

- [ ] **Step 3: Nav** — add an "API keys" entry to the authed nav/user-menu in `app/layouts/default.vue` (read it first; mirror how `cuenta`/`alertas` are linked, use `useLocalePath()`).

- [ ] **Step 4: i18n** — add an `apiKeys.*` block to both locale JSONs (title, subtitle, table headers, create/revoke labels, scope names, one-time-secret warning, empty state). Same key order in both.

- [ ] **Step 5: Verify + commit** — `cd app && npm run type-check`; live: visit `/app/api-keys`, create + reveal + revoke a key; `git commit` (`feat(api): API keys management page`).

---

## Phase 2 — OpenAPI + Scalar docs

### Task 2.1: Security schemes + auth documentation

**Files:** Modify `app/server/utils/openapi.ts`

- [ ] **Step 1:** Add `components.securitySchemes`:
```ts
securitySchemes: {
  apiKeyHeader: { type: 'apiKey', in: 'header', name: 'x-api-key', description: 'Your API key (gk_live_…). Create one at /app/api-keys.' },
  bearerAuth: { type: 'http', scheme: 'bearer', description: 'Send the API key as `Authorization: Bearer gk_live_…`.' },
},
```
Extend the top-level `DESCRIPTION` with an **Authentication** section (key optional on reads → higher rate limit; required with `write` scope on account/write endpoints) and a Zapier/MCP pointer. Add new tags in sidebar order: `Licitaciones`, keep `Contracts`, `Analytics`, `Suppliers`, `Buyers`, add `Alertas y cuenta`, `Integración`, `Webhooks`.

- [ ] **Step 2:** `cd app && npm run type-check`; `git commit` (`docs(api): security schemes + auth section`).

### Task 2.2: Document the licitaciones + account + missing analytics paths

**Files:** Modify `app/server/utils/openapi.ts`

- [ ] **Step 1:** Add path entries (with parameters, response schemas via new `components.schemas`, realistic examples) for: `/api/open-calls`, `/api/open-calls/{compraId}`, `/api/open-calls/{compraId}/summary`, `/api/open-calls/{compraId}/benchmarks`, `/api/contracts/{id}/features`, `/api/analytics/products`, `/api/analytics/products/{code}`, `/api/analytics/provider-anomalies`, `/api/analytics/organism-groups`, `/api/analytics/intendencias`, `/api/categories`, `/api/watches` (GET/POST), `/api/watches/{id}` (GET/PUT/DELETE), `/api/watches/test`, `/api/saved-calls` (GET/POST), `/api/saved-calls/{compraId}` (DELETE), `/api/account/preferences` (GET/PUT), `/api/account/api-keys` (GET/POST), `/api/account/api-keys/{id}` (DELETE), `/api/calendar`. Mark account/write ops with `security: [{ apiKeyHeader: [] }, { bearerAuth: [] }]`. Add schemas `OpenCall`, `OpenCallSummary`, `Watch`, `WatchInput`, `SavedCall`, `Preferences`, `ApiKey`, `Category`. (Ground each schema in the real handler output — read each handler if unsure.)

- [ ] **Step 2:** `cd app && npm run type-check`; validate spec structurally (Task 2.4 runs it); `git commit` (`docs(api): document llamados, account and analytics endpoints`).

### Task 2.3: Scalar polish + developer landing

**Files:** Modify `app/server/routes/docs.get.ts`; create `app/pages/developers.vue`; modify layout + locales.

- [ ] **Step 1:** In `docs.get.ts` Scalar `configuration`: set `defaultOpenAllTags: false`, add `hiddenClients` to keep curl/JS `fetch`/Python `requests`, keep the pinned CDN, make the boot copy bilingual, keep the origin-server prefill. (Auth persistence is on by default in Scalar; leave the `authentication` config to prefill an `apiKeyHeader` field empty.)

- [ ] **Step 2:** Create `app/pages/developers.vue` — public, indexable (`useSeo` without `noindex`): hero, 3-step quickstart (create key → `curl` with header → integrate), cards linking `/docs`, `/app/api-keys`, and MCP/Zapier notes. Add a nav/footer link in `default.vue`. Add `developers.*` i18n keys to both locales.

- [ ] **Step 3:** `cd app && npm run type-check`; live: load `/docs` (renders, auth field present), `/developers`; `git commit` (`docs(api): friendly Scalar config + developer landing`).

### Task 2.4: OpenAPI structural validation test

**Files:** Create `test/openapi.test.ts`

- [ ] **Step 1:** Assertion script: import `openApiDocument`, assert `openapi === '3.1.0'`, every value in `paths` has ≥1 operation, every operation has `responses`, every `$ref` under `paths` resolves to a defined `components.schemas`/`responses` key, and both security schemes exist. Throw on any failure.

- [ ] **Step 2:** `npx tsx test/openapi.test.ts` → `openapi.test OK`; `git commit` (`test(api): openapi structural validation`).

---

## Phase 3 — Polling endpoints

### Task 3.1: Cursor utility (pure logic)

**Files:** Create `app/server/utils/cursor.ts`; Test `test/cursor.test.ts`

**Interfaces:**
- Produces:
  - `encodeCursor(c: { t: number, id: string }): string` — base64url of `${t}:${id}`.
  - `decodeCursor(s: string): { t: number, id: string } | null` — null on malformed.

- [ ] **Step 1: Test** `test/cursor.test.ts`:
```ts
import assert from 'node:assert/strict'
import { encodeCursor, decodeCursor } from '../app/server/utils/cursor'
const c = { t: 1721000000000, id: '6894de0cfbc85dc56b8ca856' }
const s = encodeCursor(c)
assert.deepEqual(decodeCursor(s), c, 'round-trips')
assert.equal(decodeCursor('!!not-base64!!'), null, 'malformed → null')
assert.equal(decodeCursor(Buffer.from('nope').toString('base64url')), null, 'no colon → null')
console.log('cursor.test OK')
```
- [ ] **Step 2:** `npx tsx test/cursor.test.ts` fails (module missing).
- [ ] **Step 3: Implement** — encode `Buffer.from(`${t}:${id}`).toString('base64url')`; decode: base64url→utf8, split on first `:`, `Number()` the first part (return null if `NaN` or no id).
- [ ] **Step 4:** `npx tsx test/cursor.test.ts` → `cursor.test OK`.
- [ ] **Step 5: Commit** (`feat(api): opaque cursor codec`).

### Task 3.2: `/api/v1/tenders/changes`

**Files:** Create `app/server/api/v1/tenders/changes.get.ts`; Modify `scripts/ensure-indexes.ts`

- [ ] **Step 1:** Handler: parse `since` (decodeCursor → `{t,id}`), `limit` (1–50, default 25), optional `status`/`category`/`buyer`. Query `open_calls` where `firstSeenAt < cursor.t` OR (`=== t` AND `_id < id`) — newest-first keyset pagination; without `since`, most-recent page. Project like `/api/open-calls`. Return `{ success: true, data, nextCursor: <last item cursor or null>, hasMore }`. Optional key (public read).
- [ ] **Step 2:** Ensure index `open_calls` `{ firstSeenAt: -1, _id: -1 }` in `ensure-indexes.ts`.
- [ ] **Step 3:** `cd app && npm run type-check`; live: two sequential polls return no dup/gap; `git commit` (`feat(api): v1 tenders changes polling endpoint`).

### Task 3.3: `/api/v1/anomalies/changes` and `/api/v1/awards/changes`

**Files:** Create `app/server/api/v1/anomalies/changes.get.ts`, `app/server/api/v1/awards/changes.get.ts`; Modify `scripts/ensure-indexes.ts`

- [ ] **Step 1: anomalies** — same keyset pattern on `anomalies.firstDetectedAt` (verify field/index; add `{ firstDetectedAt: -1, _id: -1 }`). Filters `minZ` (`metadata.zScore`), `severity`, `minAmount` (`detectedValue`), `currency`.
- [ ] **Step 2: awards** — keyset over `releases` `{ tag: 'award' }` by award/ingest date (use an existing indexed date; add a partial index if needed). Filters `supplierId` (`awards.suppliers.id`), `buyerId`, `minAmount` (`amount.primaryAmount`). Document that this is the heaviest endpoint; cap `limit` at 50.
- [ ] **Step 3:** `cd app && npm run type-check`; live smoke each; `git commit` (`feat(api): v1 anomalies + awards changes endpoints`).

---

## Phase 4 — Webhooks

### Task 4.1: Webhook utility — HMAC sign + SSRF-safe URL (pure)

**Files:** Create `app/server/utils/webhook.ts`; Test `test/webhook.test.ts`

**Interfaces:**
- Produces:
  - `signPayload(secret: string, rawBody: string): string` — `sha256=<hex hmac>`.
  - `assertSafeWebhookUrl(url: string): void` — throws if not `https:`, or host is localhost / RFC1918 / link-local / `.local` / an IP literal in a private range.
  - `generateWebhookSecret(): string`.

- [ ] **Step 1: Test** — assert `signPayload('s','b')` is stable + starts `sha256=`; `assertSafeWebhookUrl('https://hooks.zapier.com/x')` ok; each of `http://x`, `https://localhost`, `https://127.0.0.1`, `https://10.0.0.1`, `https://192.168.1.1`, `https://169.254.1.1` throws. `console.log('webhook.test OK')`.
- [ ] **Step 2:** `npx tsx test/webhook.test.ts` fails.
- [ ] **Step 3: Implement** — HMAC via `crypto.createHmac('sha256', secret)`. URL check: `new URL()`, require `protocol==='https:'`, reject hostname `localhost`/`*.local`; if hostname is an IPv4 literal, reject `10.`, `192.168.`, `172.16–31.`, `127.`, `169.254.`, `0.`; reject `::1` and IPv6. (DNS-rebinding beyond scope — documented.)
- [ ] **Step 4:** `npx tsx test/webhook.test.ts` → `webhook.test OK`.
- [ ] **Step 5: Commit** (`feat(webhooks): hmac signing + ssrf-safe url validation`).

### Task 4.2: Subscription + delivery models

**Files:** Create `shared/models/webhook_subscription.ts`, `shared/models/webhook_delivery.ts`; Modify `shared/types/monitor.ts`, `shared/models/index.ts`, `scripts/ensure-indexes.ts`

- [ ] **Step 1:** Add `IWebhookSubscription` (fields per spec §9.1) + `IWebhookDelivery` (`{ subscriptionId, event, dedupeKey (unique), payload, status: 'pending'|'sent'|'failed', attempts, lastError?, nextAttemptAt?, sentAt?, createdAt, updatedAt }`) to `monitor.ts`.
- [ ] **Step 2:** Create both models (collections `webhook_subscriptions`, `webhook_deliveries`), HMR-safe. Indexes: subscription `{ userId: 1 }`, `{ active: 1, events: 1 }`; delivery `{ dedupeKey: 1 } unique`, `{ status: 1, nextAttemptAt: 1 }`. Add to barrel + `ensure-indexes.ts`.
- [ ] **Step 3:** `cd app && npm run type-check`; `git commit` (`feat(webhooks): subscription + delivery models`).

### Task 4.3: Webhook subscription endpoints

**Files:** Create `app/server/api/v1/webhooks/index.get.ts`, `index.post.ts`, `[id].delete.ts`, `[id]/test.post.ts`

- [ ] **Step 1: POST** — `requireWrite`; body `{ url, events[], filters? }`; `assertSafeWebhookUrl(url)` (400 on throw), validate `events` ⊆ catalog, `generateWebhookSecret()`, create; return sub incl. `secret` once. Enforce `WEBHOOK_SUBSCRIPTION_CAP` (default 10, 409).
- [ ] **Step 2: GET** list caller's subs (no `secret`). **DELETE** revoke/remove owned sub. **POST `[id]/test`** — build a sample event payload, sign, POST to the URL with a 5s timeout, return `{ ok, status }` (do not persist a delivery).
- [ ] **Step 3:** `cd app && npm run type-check`; live: subscribe to a `https://webhook.site` URL, hit `/test`, confirm signed delivery; `git commit` (`feat(webhooks): subscription CRUD + test endpoint`).

### Task 4.4: Producer + dispatcher + cron wiring

**Files:** Create `src/jobs/webhooks/enqueue.ts`, `src/jobs/webhooks/dispatch.ts`; Modify `src/jobs/sync-open-calls.ts`, `src/jobs/detect-anomalies.ts`, `src/cronserver.ts`

- [ ] **Step 1: `enqueue.ts`** — `enqueueWebhook(event, resourceId, payload)`: find active subs matching `event` (+ `filters` via `watchMatchesCall` for `tender.matched`), insert a `webhook_deliveries` doc per sub with `dedupeKey = `${event}:${subId}:${resourceId}`` (idempotent — ignore dup-key errors).
- [ ] **Step 2: `dispatch.ts`** — drain `pending`/retry-due deliveries: load sub, `signPayload(sub.secret, body)`, POST with headers `X-GastosGub-Event/-Delivery/-Signature/-Timestamp`, 10s timeout. On 2xx → `sent`; else `attempts++`, exponential `nextAttemptAt`, `failed` past `WEBHOOK_MAX_ATTEMPTS`; bump sub `failureCount`, auto-disable past 15.
- [ ] **Step 3:** Call `enqueueWebhook('tender.matched', …)` where `sync-open-calls` enqueues email alerts; `enqueueWebhook('anomaly.detected', …)` in `detect-anomalies` on new anomalies. Add to `cronserver.ts` a `* * * * *` schedule running `dispatch` (via `runJobProcess` pattern) + a manual `/cron/webhooks` trigger + `/cron/webhooks/status`.
- [ ] **Step 4:** `npx tsc --noEmit` at repo root (cron code is root TS); manual: `npm run <dispatch script>` drains a queued delivery to webhook.site; `git commit` (`feat(webhooks): producers, dispatcher and cron wiring`).

### Task 4.5: Webhooks management page

**Files:** Create `app/pages/app/webhooks.vue`; Modify composable, layout nav, locales.

- [ ] **Step 1:** Add `webhooks` group to `useMonitorApi.ts` (`list/create/remove/test`). Build the page like `api-keys.vue` (list subs, create dialog with url + event checkboxes + optional filters, one-time secret reveal, test button, delete). Nav entry + `webhooks.*` i18n in both locales.
- [ ] **Step 2:** `cd app && npm run type-check`; live round-trip; `git commit` (`feat(webhooks): management page`).

---

## Phase 5 — MCP server

### Task 5.1: MCP package scaffold + client

**Files:** Create `packages/mcp/package.json`, `packages/mcp/tsconfig.json`, `packages/mcp/src/client.ts`

**Interfaces:**
- Produces: `class GastosClient { constructor(apiKey, baseUrl?); get(path, params?) }` using global `fetch` with `x-api-key`.

- [ ] **Step 1:** `package.json` — name `@gastos-gub/mcp`, `type: module`, `bin: { "gastos-gub-mcp": "dist/index.js" }`, deps `@modelcontextprotocol/sdk`, devDeps `typescript`/`@types/node`, scripts `build: tsc`. `tsconfig` → NodeNext, outDir `dist`.
- [ ] **Step 2:** `client.ts` — read `GASTOS_GUB_API_KEY` + `GASTOS_GUB_BASE_URL` (default `https://gastos.gub.uy`); `get(path, params)` builds a query string, sends `x-api-key`, throws on non-2xx with the `statusMessage`.
- [ ] **Step 3:** `cd packages/mcp && npm install && npm run build` compiles; `git commit` (`feat(mcp): package scaffold + api client`).

### Task 5.2: MCP tools + server entry

**Files:** Create `packages/mcp/src/tools.ts`, `packages/mcp/src/index.ts`, `packages/mcp/README.md`

- [ ] **Step 1: `tools.ts`** — export an array of tool defs `{ name, description, inputSchema (JSON Schema), run(client, args) }` for: `search_tenders` (→`/api/open-calls`), `get_tender` (→`/api/open-calls/{compraId}`), `get_tender_summary`, `get_tender_benchmarks`, `list_contracts` (→`/api/contracts`), `get_contract`, `get_supplier`, `get_buyer`, `list_anomalies`, `get_provider_anomalies`, `get_category_distribution`, `list_my_watches` (→`/api/watches`, needs write key for account), `create_watch`, `list_saved_calls`, `get_calendar`.
- [ ] **Step 2: `index.ts`** — stdio `Server` from the SDK; register `ListTools` + `CallTool` handlers delegating to `tools.ts`; construct `GastosClient` from env; on a tool error return an MCP error with the message. Shebang `#!/usr/bin/env node`.
- [ ] **Step 3: `README.md`** — install, `GASTOS_GUB_API_KEY`, and a Claude Desktop `mcpServers` config snippet; note read vs write scope.
- [ ] **Step 4:** `npm run build`; smoke: run the server, send an MCP `list_tools`/`call_tool` (search_tenders) via a quick stdio script or `mcp` inspector; `git commit` (`feat(mcp): tools + stdio server`).

---

## Self-Review

**Spec coverage:** §5 keys/auth → Tasks 1.1–1.8. §6 docs → 2.1–2.4. §7 curated surface → documented in 2.2. §8 polling → 3.1–3.3. §9 webhooks → 4.1–4.5. §10 MCP → 5.1–5.2. §11 security → constant-time (1.1), `requireWrite` scope (1.3), SSRF (4.1), rate tiers (1.5). §12 testing → assertion scripts (1.1,2.4,3.1,4.1) + typecheck/curl per task. §13 ops (ensure-indexes, cronserver, feature-flag, env) → 1.2/3.2/4.2/4.4 + constraints. **No gap.**

**Placeholder scan:** security-critical code is spelled out (1.1,1.3,1.4,4.1); UI/doc/handler tasks give exact files, patterns to mirror (`cuenta.vue`, `watches/index.post.ts`), field lists, and verify commands. Read-the-file directions are explicit where copying a full existing file into the plan would duplicate the codebase.

**Type consistency:** `IApiKey`/`ApiKeyScope`/`ApiKeyContext`/`requireWrite`/`generateApiKey`/`parsePrefix`/`verifyToken`/`hashToken`/`encodeCursor`/`decodeCursor`/`signPayload`/`assertSafeWebhookUrl` names are used identically across producing and consuming tasks. `event.context.apiKey` shape (`{ id, userId, scopes }`) is consistent in 1.4/1.5/1.3.
