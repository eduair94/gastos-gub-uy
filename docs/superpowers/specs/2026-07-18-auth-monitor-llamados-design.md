# Auth + Monitor de Llamados — Design Spec

**Status:** IMPLEMENTED (branch `feat/auth-monitor-llamados`). Verified: Nuxt build exit 0, 44 unit assertions pass, live-DB integration (667 llamados projected into `open_calls`), runtime smoke test (public API serves 648 open calls; auth middleware returns guest with no session). Pending user-provided secrets: Firebase (auth), Resend (email). See §18.
**Date:** 2026-07-18
**Scope:** Add a full Firebase authentication system and a ProveedorUY-style tender-monitoring product ("alertas de licitaciones") on top of the existing gastos-gub codebase.
**Author:** design session (brainstorming → spec)

---

## 0. Summary

gastos-gub today is a **public, read-only transparency site**: it ingests Uruguay's OCDS procurement stream (2.17M `releases`, award-heavy), computes analytics/anomalies, and renders a Nuxt 3 + Vuetify 3 SSR frontend. There is **no auth, no user model, no email, no job queue.**

This spec adds two subsystems:

1. **Auth platform** — Firebase Auth (email/password, Google, magic link) with MongoDB as the system of record. Firebase is used **for authentication only**; all product data (users, watches, calls, notifications) lives in MongoDB alongside the existing collections.
2. **Monitor de Llamados** — a subscriber product that alerts businesses by email when a new open tender call (`llamado`) matching their rubro is published, lets them browse open calls, summarizes pliegos with AI, tracks deadlines, and benchmarks historical award prices.

### The key enabling fact

The **open-calls data source already exists and is the same feed the scraper reads.** The live OCDS RSS (`https://www.comprasestatales.gub.uy/ocds/rss/{YYYY}/{MM}`) returns the **500 most-recent releases by publish date** and emits, alongside `adjudicacion-*` (awards), the open-call release types:

| release_id prefix | meaning | role here |
|---|---|---|
| `llamado-{idcompra}` | **open tender call** | the opportunity to alert on |
| `aclar_llamado-{idcompra}-{n}` | clarification to a call | spec/deadline change |
| `ajuste_llamado-{idcompra}` | amendment to a call | spec/deadline change |
| `adjudicacion-{idcompra}` | award (existing data) | historical benchmark + "te adjudicaron" |
| `ajuste_adjudicacion-{idcompra}` | award update | award change |

A `llamado-*` release carries the OCDS `tender` object (`tenderPeriod.endDate` = reception deadline, `tender.items[]` with classification codes = the rubro, `tender.documents[]` = pliegos). The `/ocds/record/{idcompra}` endpoint **merges a compra's whole lifecycle** into one record — the canonical way to assemble a call's current state (base llamado + all aclaraciones/ajustes + eventual adjudicación).

So the product is buildable on the **existing pipeline + source**: ingest and surface the `llamado-*` releases, match them to user rubros, email on new matches. Gemini is already wired for the pliego summaries.

### Decisions locked in brainstorming

| Decision | Choice |
|---|---|
| Features in v1 | All four: email alerts (core), open-calls browser, AI pliego summary, calendar + benchmarks — **phased** |
| Business model | Free / accounts-only (no billing in v1) |
| Matching model | Hybrid: catalogue categories + keywords + organismo filter |
| Firebase scope | **Auth only**; MongoDB is the single system of record |
| Architecture | **Approach 1** — in-place, dedicated `open_calls` collection fed by the existing RSS fetcher |
| Email provider | **Resend** (behind a `Mailer` interface) |
| Alert timing | **Instant, batched** per ingest cycle (one email/user bundling all new matches); daily digest is a Phase-3 option |
| Llamados browser | **Public** (SEO + signup funnel); watches/alerts/calendar/save gated |
| Free-tier watch cap | ~10 per user (bounds matching cost) |

### Spike results (2026-07-18, verified against live DB + VIG listing)

Two pre-build spikes were run and **resolved**; they simplify ingestion.

**Spike 1 — are `llamado-*` already in `releases`?** Yes, massively:

| query | result |
|---|---|
| `releases` total | 2,172,657 |
| `id ^llamado-` | ≥200,000 (counter capped) |
| `id ^aclar_llamado-` | ≥200,000 (capped) |
| `id ^ajuste_llamado-` | 11,360 |
| `tag = "tender"` | ≥200,000 (capped) |
| `tender.status` non-null | **only `active` (179,866) and `cancelled` (3,578)** — never planning/enquiry |
| `tenderPeriod.endDate ≥ now` (any release) | 827 |
| **`llamado-*` with `endDate ≥ now`** | **667 (currently-open llamados already in DB)** |

Sample open call `llamado-1357112`: `ocid ocds-yfs5dr-1357112`, `tag:["tender"]`, `tender.status:"active"`, `tenderPeriod.endDate: 2026-07-28T12:00:00Z` (future), `procurementMethodDetails:"Compra Directa"`, 2 `tender.items[]` each with `classification.{id,description}`, 1 `tender.documents[]`. **This is exactly the `open_calls` shape — the full tender object is already inline in `releases`.**

**Spike 2 — does the DB cover currently-open calls?** The public "Llamados vigentes" listing (`/consultas/`) reports **915 open calls** right now; the DB already holds **667** open llamados by deadline (~73%). The gap (recently-published not-yet-synced, calls with null/other-format `endDate`, or non-`llamado` tender variants) is modest and closeable by an optional supplement pass; not a launch blocker.

**Consequences for the design (folded into §5):**
- **Ingestion sources from `releases`, not from re-fetching RSS/record.** The existing hourly release ingest already upserts `llamado-*`/`aclar_llamado-*`/`ajuste_llamado-*` into `releases` with the full tender object. `sync-open-calls` therefore **projects** the relevant `releases` docs into the `open_calls` view — no extra network calls. `/ocds/record/{idcompra}` becomes an **optional enrichment fallback** only when the projected doc is missing items/documents.
- **Backfill is a single query** over `releases` (`id ^llamado-` AND `tenderPeriod.endDate ≥ now`), not a K-month RSS crawl.
- **Status derivation simplifies** (§5.2): the only `tender.status` values that occur are `active` and `cancelled`; everything else is derived from `tenderPeriod.endDate` and the presence of an award.

---

## 1. Goals & non-goals

### Goals
- Businesses register (email/pass, Google, magic link) and manage rubro subscriptions ("watches").
- When a new matching `llamado` is published, the user gets one batched email within the hour.
- Users browse/filter open calls; each call page shows OCDS data, an AI pliego summary, pliego documents, historical price benchmarks, and a link to the official source.
- Users save calls, see a deadline calendar, and get N-days-before reminders.
- Everything follows `app/DESIGN.md` (tokens, `MoneyAmount`, gold=money, `t(...)` both locales, `useSeo`, SSR `useFetch`) and the existing MongoDB/Mongoose conventions.

### Non-goals (v1)
- Billing / paid tiers / payment gateway (design leaves room; not built).
- Normativa chatbot (TOCAF/RUPE assistant), offer-preparation assistant (later phases, not in this spec's build).
- WhatsApp/Telegram/push channels (email only; `Mailer`/channel abstraction leaves room).
- Firestore or any second datastore. Mobile app. Multi-tenant org accounts / team seats.
- Rewriting the legacy Express API in `src/api/` (dead code; untouched).

### Success criteria
- A user can sign up, create a watch (categoría + keyword + organismo), and receive a correct alert email for a real new `llamado` that matches — with no duplicate emails for the same call.
- The open-calls browser is populated at launch (backfill) and stays current (hourly sync).
- Auth works under SSR: `event.context.user` is available in server routes and pages hydrate the session without a flash of logged-out UI.
- All new UI passes the DESIGN.md quality floor (responsive to 360px, keyboard focus, `useSeo`, i18n both locales).

---

## 2. System context

Two repos/processes already exist and are reused as-is:

```
gastos-gub/
├─ src/                     # scraper + cron server (PM2: gastos-gub-cronserver)
│  ├─ cronserver.ts         # node-cron scheduler, busyWith() locks, forks heavy jobs
│  ├─ services/
│  │  └─ release-rss-fetcher.ts   # REUSED for open-calls sync
│  ├─ jobs/
│  │  ├─ ai/gemini-client.ts      # REUSED for pliego summaries
│  │  └─ ...
│  └─ ...
├─ app/                     # Nuxt 3 + Vuetify 3 SSR (PM2: gastos-gub-dashboard)
│  ├─ server/api/           # Nitro API (the live public API)
│  ├─ server/middleware/    # rateLimit.ts, cache.ts  (+ NEW auth.ts)
│  ├─ pages/  composables/  stores/  plugins/  i18n/locales/
│  └─ ...
├─ shared/                  # shared Mongoose models + connection (used by both)
│  ├─ models/  types/database.ts  connection/database.ts
└─ ...
```

**New responsibilities map onto existing homes — no new process:**

| Concern | Home | Why |
|---|---|---|
| Auth session, user/watch/saved-call CRUD, open-calls read API, on-demand AI summary | Nuxt Nitro `app/server/api/*` | request-scoped, needs the session cookie |
| Open-calls ingest, matching, alert dispatch, reminders, eager summaries, backfill | Cron server `src/jobs/*` + wired in `src/cronserver.ts` | scheduled/background, reuses RSS fetcher + Gemini client |
| New Mongoose models | `shared/models/*` + `shared/types/database.ts` | shared by both processes |
| Email delivery | `src/services/mailer.ts` (+ templates) | new; used by cron jobs |
| Firebase Admin (verify tokens, mint session cookies) | `app/server/utils/firebase-admin.ts` | server-only secret, used by Nitro |
| Firebase Web SDK (sign-in flows) | `app/plugins/firebase.client.ts` | client-only |

**Model conventions to follow** (from `shared/models/anomaly.ts`): `new Schema<IX>(...)` with the interface declared in `shared/types/database.ts`; `import { mongoose } from "../connection/database"`; explicit `collection` name; `timestamps: true` where useful; indexes declared with `Schema.index(...)`; export a singleton `mongoose.model<IX>("Name", Schema)`; add the file to `shared/models/index.ts`. `autoIndex: false` is set globally — **indexes are built by a script, never on boot** (extend `scripts/ensure-indexes.ts`).

---

## 3. Data model — five new collections

All interfaces go in `shared/types/database.ts`; all schemas in `shared/models/`; all added to `shared/models/index.ts`; all indexes added to `scripts/ensure-indexes.ts` (idempotent, background).

### 3.1 `users` — `shared/models/user.ts`

Keyed by Firebase `uid`. Created/updated on session mint (upsert).

```ts
interface IUser {
  uid: string;                 // Firebase uid — unique
  email: string;               // unique (lowercased)
  emailVerified: boolean;
  displayName?: string;
  photoURL?: string;
  providers: string[];         // 'password' | 'google.com' | 'emailLink'
  role: 'user' | 'admin';      // default 'user'
  locale: 'es' | 'en';         // default 'es'
  status: 'active' | 'disabled';
  notificationPrefs: {
    enabled: boolean;          // master switch (unsubscribe sets false)
    frequency: 'instant' | 'daily';   // default 'instant'
    // channel reserved for future: 'email' only in v1
  };
  unsubscribeToken: string;    // opaque, for one-click List-Unsubscribe links
  watchCount: number;          // denormalized, enforced against cap
  lastLoginAt?: Date;
  createdAt: Date;             // timestamps:true
  updatedAt: Date;
}
```
Indexes: `{ uid: 1 }` unique · `{ email: 1 }` unique · `{ unsubscribeToken: 1 }` unique.

### 3.2 `watches` — `shared/models/watch.ts`

A rubro subscription / saved search. The unit the matcher evaluates.

```ts
interface IWatch {
  userId: string;              // ref users.uid
  name: string;                // user label ("Toner y cartuchos")
  active: boolean;             // default true
  categories: string[];        // OCDS classification ids (catalogue codes)
  keywords: string[];          // normalized lowercased tokens/phrases
  keywordMode: 'any' | 'all';  // default 'any'
  buyers: string[];            // buyer ids — REFINEMENT filter, not a sole trigger
  minValue?: number;           // UYU
  maxValue?: number;           // UYU
  procurementMethods?: string[];   // procurementMethodDetails values (Spanish names)
  lastMatchedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
```
Indexes: `{ userId: 1 }` · `{ active: 1, categories: 1 }` · `{ active: 1 }`.
Validation: a watch must have at least one of `categories` or `keywords` (a watch with only a buyer filter would match everything from that organismo — allowed but warned in UI). Enforce `keywords` normalized (lowercase, trimmed, deaccented — same normalization as `open_calls.searchText`, see §5).

### 3.3 `open_calls` — `shared/models/open_call.ts`

The merged live tender. Keyed by `compraId` (= `id_compra`). Small, hot, indexed for matching + deadline + organismo. **Never** replaces `releases` — `releases` stays the historical/benchmark source.

```ts
interface IOpenCall {
  compraId: string;            // id_compra — unique
  ocid: string;                // for govSourceUrl(ocid) — see DESIGN.md ocid-vs-id trap
  latestReleaseId: string;     // most recent source release id
  sourceReleaseIds: string[];  // llamado + aclaraciones + ajustes (+ adjudicacion) seen

  title: string;
  description?: string;
  buyer: { id?: string; name?: string };
  procuringEntity: { id?: string; name?: string };
  procurementMethod?: string;          // OCDS enum — internal only, not shown (DESIGN.md)
  procurementMethodDetails?: string;   // Spanish name — the one to display

  status: 'open' | 'clarification' | 'amended' | 'closed' | 'awarded' | 'cancelled';
  publishDate?: Date;
  tenderPeriod?: { startDate?: Date; endDate?: Date };   // endDate = reception deadline
  enquiryPeriod?: { startDate?: Date; endDate?: Date };

  items: Array<{
    description?: string;
    classificationId?: string;
    classificationLabel?: string;
    quantity?: number;
    unit?: { id?: string; name?: string };
  }>;
  classificationSet: string[];         // deduped classification ids — the match key (multikey index)
  searchText: string;                  // normalized concat(title, desc, item descriptions) for keyword match
  estimatedValue?: number;             // UYU when derivable
  currency?: string;

  documents: Array<{                   // pliegos
    title?: string;
    url: string;
    format?: string;
    datePublished?: Date;
    documentType?: string;             // OCDS documentType e.g. 'biddingDocuments'
  }>;

  aiSummary?: IPliegoSummary;          // embedded, see §7
  awardRef?: { releaseId: string; ocid: string; awardedAt?: Date };  // set when adjudicacion appears

  firstSeenAt: Date;                   // $setOnInsert — "is this NEW?" (drives alerts)
  lastSyncedAt: Date;                  // restamped every sync — "still current?"
  createdAt: Date;
  updatedAt: Date;
}
```
Indexes: `{ compraId: 1 }` unique · `{ classificationSet: 1 }` multikey · `{ 'tenderPeriod.endDate': 1 }` · `{ 'buyer.id': 1 }` · `{ status: 1, 'tenderPeriod.endDate': 1 }` · `{ firstSeenAt: -1 }` · text index on `searchText` (`default_language: 'none'` for exact/substring, mirroring the `releases` exact-search convention — note: a **separate collection**, so no conflict with the `releases` text index).

**`firstSeenAt` vs `lastSyncedAt`** is the same discipline as `anomaly.firstDetectedAt` vs `detectedAt`: write `firstSeenAt` via `$setOnInsert` and never update it, so "newly-opened calls" means genuinely new — a resync must not re-alert everyone.

### 3.4 `notifications` — `shared/models/notification.ts`

Unified outbox for all transactional emails (alerts, reminders, awards). Idempotency via unique `dedupeKey`.

```ts
interface INotification {
  type: 'alert' | 'reminder' | 'award';
  userId: string;
  compraId: string;
  watchIds: string[];                  // which watches matched (alert type)
  matchedOn?: { categories?: string[]; keywords?: string[] };
  dedupeKey: string;                   // unique: `${type}:${userId}:${compraId}` (+ maybe :reminderDays)
  channel: 'email';
  status: 'pending' | 'sent' | 'failed' | 'skipped';
  batchId?: string;                    // groups the calls that went in one email
  attempts: number;                    // retry count
  lastError?: string;
  scheduledFor?: Date;                 // reminders: the day to send
  sentAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
```
Indexes: `{ dedupeKey: 1 }` unique · `{ status: 1, type: 1 }` · `{ userId: 1, createdAt: -1 }` · `{ status: 1, scheduledFor: 1 }` (reminders/digest).

One `alert` row per **(user, call)** regardless of how many of the user's watches match — prevents double-emailing one call. The matched watches are recorded in `watchIds`/`matchedOn` for the email body ("coincide con tu alerta: Toner, Obra vial").

### 3.5 `saved_calls` — `shared/models/saved_call.ts`

Bookmarks for the calendar and reminders.

```ts
interface ISavedCall {
  userId: string;
  compraId: string;
  note?: string;
  reminderDaysBefore?: number;         // e.g. 3 → remind 3 days before endDate; null = no reminder
  reminderSentAt?: Date;               // guard against re-sending
  createdAt: Date;
  updatedAt: Date;
}
```
Indexes: `{ userId: 1, compraId: 1 }` unique · `{ userId: 1, createdAt: -1 }`.

---

## 4. Auth architecture — Firebase Auth-only under SSR

Firebase issues identities; **MongoDB `users` is the record.** SSR needs a server-verifiable session, so we use Firebase Admin **session cookies** (not client-held ID tokens).

### 4.1 Server: Firebase Admin — `app/server/utils/firebase-admin.ts`
- Init `firebase-admin` once (singleton, guarded against Nitro re-eval) from env `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` (private key: replace `\n` escapes).
- Expose helpers: `verifyIdToken(idToken)`, `createSessionCookie(idToken, { expiresIn })`, `verifySessionCookie(cookie, checkRevoked)`, `revokeRefreshTokens(uid)`.

### 4.2 Client: Firebase Web SDK — `app/plugins/firebase.client.ts`
- Init web app from public runtime config `NUXT_PUBLIC_FIREBASE_{API_KEY,AUTH_DOMAIN,PROJECT_ID,APP_ID}`.
- Provide `$firebaseAuth`. Sign-in methods used by `useAuth`:
  - Email/password: `createUserWithEmailAndPassword`, `signInWithEmailAndPassword`, `sendEmailVerification`, `sendPasswordResetEmail`.
  - Google: `signInWithPopup` (desktop) / `signInWithRedirect` (fallback), `GoogleAuthProvider`.
  - Magic link: `sendSignInLinkToEmail` (continue URL → `${APP_BASE_URL}/auth/callback`), `isSignInWithEmailLink`, `signInWithEmailLink`. Persist the pending email in `localStorage` per Firebase's flow.

### 4.3 Session lifecycle
```
Client sign-in (any provider)
  → getIdToken()
  → POST /api/auth/session { idToken }
      server: verifyIdToken → createSessionCookie(idToken, 14d)
              upsert users doc (uid,email,providers,emailVerified,displayName,photoURL,locale)
              Set-Cookie __session = <sessionCookie>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=14d
  → client: firebase signOut() locally is OPTIONAL (session cookie is the source of truth for SSR)
```
- **Nitro middleware `app/server/middleware/auth.ts`** (runs before route handlers): read `__session` → `verifySessionCookie(cookie, true)` → load Mongo `users` doc → set `event.context.user` (or `null`). Never throws; unauthenticated requests simply have `context.user = null`.
- **`requireUser(event)`** util (`app/server/utils/auth.ts`): returns `context.user` or throws `createError({ statusCode: 401 })`. Used by every gated endpoint.
- **Logout** `POST /api/auth/logout`: clear `__session`, `revokeRefreshTokens(uid)`.
- **Re-auth on expiry:** client `onIdTokenChanged` refreshes the session cookie by re-POSTing when the cookie nears expiry (silent).

### 4.4 Client state
- `useAuthStore` (Pinia): `user` (Mongo shape from `/api/auth/me`), `status: 'loading'|'authed'|'guest'`, actions `hydrate()`, `login*()`, `logout()`.
- `useAuth()` composable wraps the store + Firebase SDK sign-in methods and the session POST.
- **SSR hydration:** on first render, a server plugin reads `event.context.user` into `useState('auth.user')` so pages render authed without a flash. `/api/auth/me` re-confirms on the client.
- Route middleware `app/middleware/auth.ts` (protects `/app/**`, redirects guests to `/login?redirect=`), `app/middleware/guest.ts` (redirects authed users away from `/login`, `/registro`).

### 4.5 CSRF / cookie safety
- `__session` is HttpOnly, Secure, SameSite=Lax. SameSite=Lax blocks cross-site POST cookies. Additionally, an **origin/referer check** on all mutating endpoints (POST/PUT/DELETE) in a small helper (reject when `Origin` is present and not same-site). No separate CSRF token needed for v1 given Lax + origin check.

---

## 5. Ingestion — `src/jobs/sync-open-calls.ts` (hourly)

**Source: project from the already-ingested `releases` collection** (spike-confirmed: `llamado-*` are already upserted there hourly with the full tender object inline). No RSS/record round-trip in the common path; `/ocds/record/{idcompra}` is an **optional enrichment fallback** only when a projected doc lacks items/documents. Runs in the cron server, chained after the existing `:05` release ingest, guarded by a `busyWith()` lock.

### 5.1 Algorithm
1. Query `releases` for tender-phase docs updated since the last sync watermark **or** still live: `id` matching `^(llamado|aclar_llamado|ajuste_llamado)-` AND (`updatedAt/date ≥ lastSyncAt` OR `tender.tenderPeriod.endDate ≥ now`). Persist the watermark in a tiny `sync_state` doc (or reuse the notifications/meta pattern). Also pull `adjudicacion-*`/`ajuste_adjudicacion-*` for `compraId`s already tracked in `open_calls` (to set `awardRef`).
2. Group by `compraId` (= the numeric part of the id / `id_compra`). For each compra, pick the **base tender doc** (the `llamado-*` release) and overlay the **latest** `aclar_llamado-*`/`ajuste_llamado-*` tender fields (updated `tenderPeriod`, `documents`) by release date. This reproduces the record-merge cheaply from data already in Mongo.
3. Build the `OpenCall` view from the merged tender:
   - `title/description` from the tender object; fall back to item descriptions.
   - `tenderPeriod`, `enquiryPeriod`, `procurementMethodDetails` from the tender.
   - `items[]` → `classificationSet` (dedupe `classification.id`), `searchText` (normalized concat of title + description + item descriptions + classification labels).
   - `documents[]` from tender documents (pliegos).
   - `ocid` from the release (used for `govSourceUrl(ocid)` — **derive the source link from ocid, never id**, per the DESIGN.md trap; the sample confirms `ajuste_llamado` ids diverge from ocid).
   - `awardRef` if an `adjudicacion-*` release exists for the compra.
   - **Enrichment fallback:** if `items` or `documents` are empty, fetch `/ocds/record/{compraId}` once and merge; cache-guarded, throttled.
4. Derive `status` (§5.2). Upsert on `compraId` with `$setOnInsert: { firstSeenAt }`, `$set: { ...fields, lastSyncedAt: now }`, `$addToSet: { sourceReleaseIds }`.
5. Emit the set of `compraId`s that were **inserted this run (new `firstSeenAt`) with status ∈ {open, clarification, amended}** → hand to the matcher (§6). Updates to already-seen calls do not re-alert.
6. Any network fallback throttles like existing jobs (batch ≤200, concurrency ≤20, `delay(1000)`/`delay(2000)`, 30s timeouts, browser-like UA, handle RSS `406`).

### 5.2 Status derivation (spike-simplified — only `active`/`cancelled` occur)
- `cancelled` if `tender.status == "cancelled"` or a `tenderCancellation` tag is present.
- `awarded` if `awardRef` set (an `adjudicacion-*` exists for the compra).
- `closed` if `tenderPeriod.endDate` < now.
- `amended` if the latest tender event for the compra is an `ajuste_llamado-*` and it is still open.
- `clarification` if the latest tender event is an `aclar_llamado-*` and still open.
- else `open` (base case; `tender.status == "active"` with a future/absent deadline).
Only `open|clarification|amended` are "alertable/live" and shown in the browser's default (open) filter.

### 5.3 Backfill — `src/jobs/backfill-open-calls.ts` (one-time, idempotent)
So the browser isn't empty on day 1 and existing open calls can be matched. Spike-confirmed there are **~667 currently-open `llamado-*` already in `releases`**:
- Single query: `releases.find({ id: /^llamado-/, "tender.tenderPeriod.endDate": { $gte: now } })` → project → upsert into `open_calls`. Also fold in the latest `aclar_llamado-*`/`ajuste_llamado-*` overlay per compra (§5.1 step 2). **Suppress alerts during backfill** (set `firstSeenAt` but do not enqueue notifications — only forward-going new calls alert). Log a summary (open calls loaded).
- **Optional supplement** (to close the ~248-call gap vs the VIG count of 915): scrape the compra ids from `/consultas/` VIG listing pages and, for any not present in `open_calls`, fetch `/ocds/record/{compraId}` and upsert. Deferred to a follow-up within Phase 1; not launch-blocking.

### 5.4 Cron wiring (`src/cronserver.ts`)
- New job `runSyncOpenCallsJob()`: sync → match → dispatch (instant users), under a single `busyWith('openCalls')` lock. Schedule hourly at `:20` (after the `:05` release ingest). Manual trigger `POST /cron/open-calls`.
- New daily job `runDeadlineRemindersJob()` at e.g. `05:00` (§8).
- Phase 3: daily digest job `runAlertDigestJob()` at e.g. `08:00`.
- All follow the existing pattern: mutually-exclusive in-process locks, heavy work forkable, non-fatal error handling, status counters for `/health`.

---

## 6. Matching engine — `src/jobs/matching/match.ts` (pure, unit-tested)

Pure function, no I/O, so it is exhaustively unit-testable:

```ts
function watchMatchesCall(watch: IWatch, call: OpenCallMatchView): MatchReason | null
```

A call matches a watch when a **trigger** fires **and** all **refinements** pass:

- **Triggers (OR):**
  - category: `intersect(watch.categories, call.classificationSet)` non-empty, OR
  - keyword: for `keywordMode:'any'` at least one, for `'all'` every `watch.keywords[i]` is found in `call.searchText` (normalized substring/token match). Normalization = lowercase, strip accents, collapse whitespace — applied identically when building `call.searchText` and when saving `watch.keywords`.
- **Refinements (AND, only if set):**
  - `buyers`: `call.buyer.id ∈ watch.buyers`.
  - `minValue`/`maxValue`: `call.estimatedValue` within range (skip when call value unknown — do not exclude, to avoid missing calls with no published estimate; note this in UI).
  - `procurementMethods`: `call.procurementMethodDetails ∈ watch.procurementMethods`.

`MatchReason` records `{ categories: [...], keywords: [...] }` for the email body.

### Driver (`src/jobs/matching/run-matching.ts`)
For each newly-opened `compraId` emitted by the sync job (§5.1, step 5):
1. Load the `OpenCall`.
2. Query candidate watches: `active:true` AND (`categories ∈ call.classificationSet` OR keyword-index hit). Practically: fetch `active` watches whose `categories` intersect (indexed `{active,categories}`), UNION `active` watches with keywords (bounded by watch cap; keyword pre-filter via an in-memory token index or a `$text`-style check). At MVP scale (hundreds–low-thousands of watches, ~500 new calls/day) a full scan of active watches per new call is acceptable; optimize later if needed.
3. Run `watchMatchesCall` per candidate; group results by `userId`.
4. For each (user, call) with ≥1 matching watch and `user.status:'active'` and `user.notificationPrefs.enabled`: upsert a `notifications` doc `{ type:'alert', dedupeKey:'alert:{uid}:{compraId}', status:'pending', watchIds, matchedOn }` (unique index makes this idempotent — a resync never double-creates).
5. Update `watch.lastMatchedAt`.

---

## 7. AI pliego summary — reuse Gemini (Phase 2)

Reuses `src/jobs/ai/gemini-client.ts` (structured output, retries, RPM throttle, cost estimation).

### 7.1 Extraction + prompt — `src/jobs/pliego-summary.ts` / `src/services/pliego-extractor.ts`
- Download pliego PDFs from `open_call.documents[].url`. Extract text with `unpdf` (or `pdf-parse`). Handle non-PDF/zip gracefully (skip with a logged reason).
- Send extracted text to Gemini with a Spanish system prompt ("asistente para PYMES que resume pliegos de compras públicas uruguayas") and a `responseSchema`:

```ts
interface IPliegoSummary {
  objeto: string;                 // qué se licita, en 1–2 frases
  requisitosClave: string[];      // requisitos de admisibilidad
  plazos: {                       // fechas — SOLO informativas; la fuente de verdad es OCDS
    recepcionOfertas?: string;
    aperturaOfertas?: string;
    consultas?: string;
  };
  garantias?: string;             // garantía de mantenimiento/cumplimiento
  criteriosEvaluacion: string[];  // cómo se puntúa/adjudica
  montoReferencia?: string;       // si el pliego lo indica
  observaciones: string[];        // condiciones inusuales/atención
  model: string;
  generatedAt: Date;
  sourceDocs: string[];           // URLs resumidas
  disclaimer: 'Resumen generado por IA. Verificá siempre el pliego oficial.';
}
```
- Cache into `open_call.aiSummary`. **Guardrail:** deadlines shown to the user come from OCDS structured `tenderPeriod`, never from the model; the AI `plazos` are labeled informational. Always render the disclaimer and link the official pliego.

### 7.2 When it runs
- **Eager:** for calls that matched ≥1 watch (so the alert email and call page have it immediately) — enqueued at the tail of the matching driver, throttled by `AI_TRIAGE_RPM`.
- **Lazy + cache:** otherwise, generated on first request of `GET /api/open-calls/{compraId}/summary` and cached. A "generando resumen…" state on the client while it runs.

---

## 8. Alerts, calendar, reminders, benchmarks

### 8.1 Alert dispatch — `src/jobs/dispatch-alerts.ts`
Runs at the tail of the hourly sync job for `frequency:'instant'` users:
1. Load `pending` `alert` notifications; group by `userId`; keep only users with `notificationPrefs.enabled` and `frequency:'instant'`.
2. For each user, load the matched `OpenCall`s, render **one email** bundling all new matches (title, organismo, deadline via structured `tenderPeriod.endDate`, matched watch names, link to the call page, AI summary teaser when present).
3. Send via `mailer` (Resend). On success: mark those notifications `sent`, stamp `sentAt`, set a shared `batchId`. On failure: increment `attempts`, store `lastError`, leave `pending` (retry next tick; give up + mark `failed` after N attempts).
4. Respect a per-user max per tick; overall concurrency limit like the Gemini throttle.

### 8.2 Email service — `src/services/mailer.ts`
- Interface `Mailer { send(msg: { to, subject, html, text, headers? }): Promise<Result> }`.
- Resend implementation (`RESEND_API_KEY`, `ALERTS_FROM_EMAIL`). Every email includes `List-Unsubscribe` + `List-Unsubscribe-Post` headers and a footer link to `${APP_BASE_URL}/unsubscribe?token={user.unsubscribeToken}` which sets `notificationPrefs.enabled=false`.
- Templates in `src/emails/` — plain, DESIGN.md-toned HTML (Public Sans-ish web-safe stack, celeste structure, **gold only for peso figures**), Spanish source + English mirror. Money formatted with the same rules as the site (`formatMoney` es-UY); no hand-formatted amounts.

### 8.3 Deadline reminders (Phase 2) — `src/jobs/deadline-reminders.ts` (daily)
For each `saved_call` with `reminderDaysBefore` set and `reminderSentAt` null: if `endDate - now` (day granularity) ≤ `reminderDaysBefore` and the call is still live → create `notifications { type:'reminder', dedupeKey:'reminder:{uid}:{compraId}' }` and email; stamp `reminderSentAt`.

### 8.4 Calendar (Phase 2)
- `GET /api/calendar` (auth): returns the user's upcoming deadlines — union of `saved_calls` and (optionally) calls matching the user's active watches — sorted by `endDate`, with status. Frontend renders a list + month view.

### 8.5 Benchmarks (Phase 3) — pure reuse of existing analytics
- `GET /api/open-calls/{compraId}/benchmarks` (public): for each `classificationId` in the call, read existing `item_price_baselines` (log-space median/percentiles per `{classificationId,currency,unitName}`) and/or `product_analytics` (per catalogue code) to answer "a cuánto se adjudicó históricamente". Rendered with `MoneyAmount` on the call page. No new computation — a read-side join over collections that already exist.

### 8.6 "Te adjudicaron" (Phase 3)
When `sync-open-calls` sets `awardRef` on a call, notify any user who saved/watched it: `notifications { type:'award' }` → email. Idempotent on `dedupeKey:'award:{uid}:{compraId}'`.

---

## 9. Frontend

Strict `app/DESIGN.md`: CSS tokens (no hardcoded hex), `<MoneyAmount>` for every peso figure (gold=money only), `t('...')` with keys added to **both** `es.json`/`en.json` in the same order, `useSeo({title,description,path})` on every page, SSR `useFetch`, Vuetify defaults from `plugins/vuetify.ts`, responsive to 360px, restrained motion.

### 9.1 Plugins / composables / stores / middleware
- `app/plugins/firebase.client.ts` — Web SDK init.
- `app/plugins/auth.server.ts` — seed `useState('auth.user')` from `event.context.user` (no logged-out flash).
- `app/composables/useAuth.ts` — sign-in/out flows + session POST + store glue.
- `app/stores/auth.ts` — `useAuthStore` (user, status, actions).
- `app/composables/useWatches.ts`, `useOpenCalls.ts`, `useCalendar.ts` — typed clients (extend the `ApiClient` pattern in `app/composables/useApi.ts`).
- `app/middleware/auth.ts` (gate `/app/**`), `app/middleware/guest.ts` (bounce authed off `/login`).

### 9.2 Pages
**Public** (SEO + funnel):
- `/llamados` — open-calls browser: filter rail (categoría, keyword, organismo, estado, cierra-antes-de) + paginated results + a "creá una alerta para esto" CTA (→ signup with the current filters prefilled). Mirrors the existing `/contracts` explorer structure.
- `/llamados/[compraId]` — call detail: OCDS data, `procurementMethodDetails`, deadline, items, pliego documents, **AI summary** (teaser for guests, full for authed), **benchmarks** (Phase 3), official-source link via `govSourceUrl(ocid)`, save/remind actions (gated). JSON-LD.

**Auth:**
- `/login`, `/registro` — email/pass + Google + "enviarme un enlace mágico". `/auth/callback` — magic-link completion. `/recuperar` — password reset. `/unsubscribe` — token-based opt-out (public, no login).

**Gated (`/app/**`):**
- `/app` — dashboard: my active alerts summary, newest matching calls, upcoming deadlines.
- `/app/alertas` — watches CRUD: builder (categorías from `/api/categories`, keyword chips, organismo autocomplete, value range, method), a live **"coincide con N llamados abiertos"** preview (`/api/watches/{id}/test` or a dry-run endpoint), enable/disable, delete. Enforce the watch cap with a clear message.
- `/app/calendario` — deadline calendar (Phase 2).
- `/app/cuenta` — profile, linked providers, notification prefs (enabled, instant/daily), locale, delete account.

### 9.3 Navigation & i18n
- Public nav (`app/layouts/default.vue` `nav` array): add **"Llamados"** (`nav.llamados`).
- Header actions: when guest → "Ingresar" button; when authed → avatar menu (Alertas, Calendario, Cuenta, Salir). Mobile drawer mirrors it.
- New i18n namespaces in both locales: `auth.*`, `alerts.*` (watches), `openCalls.*`, `calendar.*`, `account.*`, plus `nav.llamados`. Spanish is source of truth; English mirrors 1:1, same key order.

---

## 10. API surface (new Nitro routes under `app/server/api`)

Auth column: **P**=public, **A**=requires `requireUser`. All mutations get the origin check.

| Method | Route | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/session` | P | verify ID token → mint `__session`, upsert user |
| POST | `/api/auth/logout` | A | clear cookie, revoke refresh tokens |
| GET | `/api/auth/me` | P | current user (Mongo shape) or null |
| GET | `/api/watches` | A | list my watches |
| POST | `/api/watches` | A | create (enforces cap) |
| GET | `/api/watches/{id}` | A | one watch |
| PUT | `/api/watches/{id}` | A | update |
| DELETE | `/api/watches/{id}` | A | delete |
| POST | `/api/watches/test` | A | dry-run: count/sample current open calls matching a draft watch |
| GET | `/api/open-calls` | P | list/filter (category, keyword, buyer, status, endsBefore, pagination) |
| GET | `/api/open-calls/{compraId}` | P | call detail |
| GET | `/api/open-calls/{compraId}/summary` | P | AI summary (lazy-generate + cache) |
| GET | `/api/open-calls/{compraId}/benchmarks` | P | historical award prices for the call's rubros (Phase 3) |
| GET | `/api/saved-calls` | A | my saved calls |
| POST | `/api/saved-calls` | A | save a call (+ optional reminderDaysBefore) |
| DELETE | `/api/saved-calls/{compraId}` | A | unsave |
| GET | `/api/calendar` | A | upcoming deadlines (Phase 2) |
| GET | `/api/account/preferences` | A | notification prefs |
| PUT | `/api/account/preferences` | A | update prefs |
| GET | `/api/categories` | P | catalogue taxonomy for the watch builder (from `filter_data`/`product_analytics`) |
| POST | `/api/unsubscribe` | P | token-based opt-out |

Reuse the existing `rateLimit`/`cache` middleware; auth endpoints get stricter limits.

---

## 11. Configuration & secrets

Add to `.env` (root, for cron) and `app/.env` (for Nitro) — note the DESIGN.md truth that the dev server reads `app/.env`. Document all in `.env.example`.

Server-only (secret):
```
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=       # \n-escaped
RESEND_API_KEY=
ALERTS_FROM_EMAIL=alertas@<verified-domain>
ALERTS_REPLY_TO=
APP_BASE_URL=https://<site>
OPEN_CALLS_BACKFILL_MONTHS=3
WATCH_CAP_FREE=10
# reuse: GEMINI_API_KEY, AI_TRIAGE_RPM, MONGODB_URI
```
Public (client):
```
NUXT_PUBLIC_FIREBASE_API_KEY=
NUXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NUXT_PUBLIC_FIREBASE_PROJECT_ID=
NUXT_PUBLIC_FIREBASE_APP_ID=
```
Wire into `app/nuxt.config.ts` `runtimeConfig` (private) and `runtimeConfig.public` (Firebase web + `apiBase`). Firebase Admin `FIREBASE_PRIVATE_KEY` must never be committed.

New dependencies: `firebase` (web SDK, in `app/`), `firebase-admin` (in `app/`), `resend` (root/cron), `unpdf` or `pdf-parse` (root/cron).

---

## 12. Security & abuse

- Session cookie HttpOnly/Secure/SameSite=Lax; origin/referer check on all mutations.
- `requireUser` on every gated endpoint; ownership checks (a user can only read/write their own watches/saved-calls) — filter by `userId` from the session, never trust a body-supplied userId.
- Rate limits (reuse middleware): stricter on `/api/auth/*` and `/api/watches/test`.
- `emailVerified` required to **activate** watches / receive alerts (reduce junk sign-ups). Unverified users can browse and draft.
- Free-tier watch cap (`WATCH_CAP_FREE`, default 10) bounds matching cost; enforced server-side on create.
- Every email carries one-click List-Unsubscribe; opt-out is honored immediately (`notificationPrefs.enabled=false`).
- Never expose the Firebase private key or Resend key to the client. Admin role gated separately (no admin UI in v1; `role` reserved).
- Alerts only ever go to the authenticated user's own verified email — no arbitrary-recipient path.

---

## 13. Phasing & task breakdown

Each phase is independently shippable and becomes its own implementation plan.

### Phase 1 — MVP core (auth + alerts loop)
Backend/shared:
1. Models: `users`, `watches`, `open_calls`, `notifications` (+ interfaces, barrel, `ensure-indexes`).
2. Firebase Admin util + Nitro `auth` middleware + `requireUser`.
3. Auth endpoints: `session`, `logout`, `me`.
4. `sync-open-calls.ts` (record→OpenCall, status derivation) + `backfill-open-calls.ts` + cron wiring (`:20` hourly, manual trigger).
5. Matching engine (pure) + driver + `notifications` upsert (idempotent).
6. `mailer.ts` (Resend) + alert email template (es/en) + `dispatch-alerts.ts` + unsubscribe endpoint/page.
7. Endpoints: `watches` CRUD + `test`, `open-calls` list/detail, `categories`, `account/preferences`.
Frontend:
8. Firebase client plugin, `useAuth`, `useAuthStore`, SSR seed plugin, route middleware.
9. Pages: `/login`, `/registro`, `/auth/callback`, `/recuperar`, `/unsubscribe`, `/llamados`, `/llamados/[compraId]` (without AI/benchmarks yet), `/app`, `/app/alertas`, `/app/cuenta`.
10. Nav + user menu + i18n namespaces (both locales).
Verification: end-to-end signup → create watch → real matching `llamado` → single correct email; no duplicates on resync.

### Phase 2 — AI summary + calendar + reminders
11. `pliego-extractor.ts` + `pliego-summary.ts` (Gemini structured), eager-on-match + lazy endpoint, `aiSummary` cache; call-page summary UI + disclaimer.
12. `saved-calls` endpoints + save/remind UI on the call page.
13. `deadline-reminders.ts` (daily) + reminder email template.
14. `/api/calendar` + `/app/calendario`.

### Phase 3 — benchmarks + digest + awards
15. `open-calls/{id}/benchmarks` (reuse `item_price_baselines`/`product_analytics`) + call-page UI.
16. Daily digest job for `frequency:'daily'` users + digest template + pref toggle.
17. "Te adjudicaron": `awardRef` detection → `award` notifications + email.

---

## 14. Testing strategy

Follow the existing `tests/` layout (`unit/`, `integration/`, `performance/`).

- **Unit (pure, high value):**
  - `watchMatchesCall`: category-only, keyword any/all, buyer/value/method refinements, no-value-does-not-exclude, accent/case normalization parity between `searchText` and `keywords`.
  - status derivation from tag/period combinations (open/clarification/amended/closed/awarded/cancelled).
  - OCDS `record` → `OpenCall` mapping from real fixture JSON (classificationSet dedupe, documents, ocid).
  - `dedupeKey` idempotency (resync doesn't double-enqueue).
  - email render (alert/reminder/digest) snapshot, unsubscribe link/token, money formatting.
- **Integration (Firebase Auth emulator):**
  - session mint/verify round-trip; `requireUser` 401 for guests; ownership enforcement on watches/saved-calls.
  - `sync-open-calls` against a fixtured `/ocds/record` sample writes the expected `OpenCall`.
  - dispatch idempotency: two ticks → one email; failure → retry then `failed`.
- **Fixtures:** capture real `/ocds/record/{idcompra}` and `/ocds/rss` samples (a `llamado`, an `aclar_llamado`, an `ajuste_llamado`, an `adjudicacion`) into `tests/fixtures/`.

Verification per phase uses the `verify`/`run` skills to drive the real flow (signup → watch → alert) against the live DB (override `MONGODB_URI` per the DESIGN.md dev-server truth).

---

## 15. Risks & day-1 spikes

1. **Firebase session cookies under Nitro/Node runtime** — verify `firebase-admin` init + `createSessionCookie`/`verifySessionCookie` + cookie handling on the deployed Node target and under SSR (no logged-out flash). *Spike before building the rest of auth.*
2. **Currently-open backfill coverage** — ✅ *resolved (2026-07-18).* `llamado-*` are already in `releases` (200k+); **667 open now** vs the VIG's **915** (~73% covered) — backfill is a single `releases` query, gap closeable by the optional VIG supplement (§5.3). No RSS crawl needed.
3. **Feed volume / freshness** — ✅ *largely moot.* `sync-open-calls` projects from `releases`, so feed-volume/500-item concerns are owned by the existing hourly release ingest, not this job. Residual: a call published in the last hour is only as fresh as the last release ingest — acceptable (deadlines are days out).
4. **Pliego PDF variability** — some documents are non-PDF, zipped, scanned images, or very large. Extraction must degrade gracefully; cap Gemini input; cache aggressively; skip-with-reason when unextractable.
5. **Email deliverability** — Resend domain verification (SPF/DKIM/DMARC) and `ALERTS_FROM_EMAIL` on a verified domain **before** real sends; warm up gradually.
6. **Matching cost at scale** — full active-watch scan per new call is fine at MVP scale; revisit with an inverted index (category → watch, keyword → watch) if watch count grows large.

---

## 16. Open questions (non-blocking; resolve during Phase 1)
- Exact watch cap and whether `emailVerified` gating is required at signup or only to activate alerts (default: required to activate).
- Whether `/llamados` detail AI summary is fully public or teaser-for-guests (default: teaser for guests, full for authed — drives signups).
- Digest send hour and instant-batch max-per-email (defaults: 08:00 America/Montevideo; no hard cap, but paginate the email if a user matches many at once).

---

## 17. What shipped (file map)

- **Models** (`shared/models/`): `user`, `watch`, `open_call`, `notification`, `saved_call` (+ `shared/types/monitor.ts`, barrel, `scripts/ensure-indexes.ts`).
- **Shared logic**: `shared/utils/text.ts` (normalize/phrase), `shared/utils/ocid.ts`, `shared/matching/match.ts` (pure matcher).
- **Cron/jobs** (`src/`): `jobs/open-calls/{project,sync}.ts`, `jobs/matching/run.ts`, `jobs/alerts/dispatch.ts`, `jobs/pliego/summarize.ts`, entries `jobs/{sync-open-calls,backfill-open-calls,deadline-reminders,alert-digest,pliego-summary}.ts`, `services/{mailer,pliego-extractor}.ts`, `emails/templates.ts`; wired into `src/cronserver.ts` (hourly `:20` sync, daily `05:00` reminders, `08:00` digest, manual triggers).
- **Nitro API** (`app/server/`): `utils/{firebase-admin,auth,watch-input}.ts`, `middleware/auth.ts`, and routes under `api/{auth,watches,open-calls,saved-calls,calendar,account,categories,unsubscribe}`.
- **Frontend** (`app/`): `plugins/{firebase.client,auth.server}.ts`, `composables/{useAuth,useMonitorApi}.ts`, `middleware/{auth,guest}.ts`, pages `login/registro/recuperar/auth-callback/unsubscribe/llamados(+detail)/app(+alertas,calendario,cuenta)`, components `OpenCallCard/PliegoSummary/WatchForm`, i18n namespaces (es source + en mirror), nav + user menu in `layouts/default.vue`.
- **Tests**: `tests/unit/test-{text-normalize,matcher,open-call-project}.ts` (44 assertions), `tests/integration/test-open-calls-sync.ts`.

## 18. Go-live checklist

1. **Secrets** — fill `.env` (root, for cron) and `app/.env` (for Nitro/dev — remember DESIGN.md: the dev server reads `app/.env`): `FIREBASE_PROJECT_ID/_CLIENT_EMAIL/_PRIVATE_KEY`, `NUXT_PUBLIC_FIREBASE_*`, `RESEND_API_KEY`, `ALERTS_FROM_EMAIL`, `APP_BASE_URL`. All documented in `.env.example`.
2. **Firebase console** — enable Email/Password, Google, and Email-link sign-in providers; add the site domain to Authorized domains; set the email-link continue URL allowance for `${APP_BASE_URL}/auth/callback`.
3. **Resend** — verify the sending domain (SPF/DKIM/DMARC) for `ALERTS_FROM_EMAIL` before real sends.
4. **Indexes** — `npx tsx scripts/ensure-indexes.ts` (idempotent, background; builds the users/watches/open_calls/notifications/saved_calls indexes incl. the `open_calls` text index).
5. **Backfill** — `npm run backfill-open-calls` (alerts suppressed; already run once during verification — 667 open calls loaded, re-runnable).
6. **Cron** — restart the cron server (`npm run cronserver:restart`) to pick up the new hourly `:20` open-calls sync + daily reminder/digest jobs. Verify via `GET /cron/open-calls/status`.
7. **Build + deploy the app** — `cd app && npm run build` then serve `.output/server/index.mjs` (PM2 `gastos-gub-dashboard`).
8. **Smoke test** — sign up, create a watch, confirm the "coincide con N llamados" preview, and (with a matching new llamado) confirm one alert email; confirm no duplicate on the next sync tick.
