# PWA + Multi-Channel Llamado Alerts — Design

Status: APPROVED (2026-07-19)
Supersedes nothing. Builds on `2026-07-18-auth-monitor-llamados-design.md` (the watch/alert/email system that already exists).

## Goal

1. Make the dashboard an installable **PWA**.
2. Deliver llamado (open-call) alerts as **app/push notifications** (VAPID Web Push).
3. Add one more common channel: **Telegram bot**.
4. Add a persistent **in-app notification inbox** (bell + list + mark-read).
5. **Enrich alert content** across every channel so a company can decide fast whether to bid.

Decisions locked with the user: Telegram (not WhatsApp/SMS); VAPID web-push (not FCM); yes to an in-app inbox; manifest brand "Con la tuya, contribuyente"; `start_url` = `/app`; per-channel notification rows (Option A).

## Current state (what already exists — do not rebuild)

- **Watches** = alert definitions: `shared/models/watch.ts`, UI `app/pages/app/alertas.vue`.
- **Matcher** (pure): `src/jobs/matching/match.ts` → `watchMatchesCall`.
- **Matching driver**: `src/jobs/matching/run.ts` → enqueues idempotent `alert` rows into `notifications`.
- **Email** (Resend): `src/services/mailer.ts` (Noop when no key), templates `src/emails/templates.ts`, dispatcher `src/jobs/alerts/dispatch.ts` (per-user bundle, instant/daily).
- **Outbox** `shared/models/notification.ts`: `channel` enum is **only `["email"]`**, unique `dedupeKey`.
- **User** `shared/models/user.ts`: `notificationPrefs {enabled, frequency}` — **no per-channel toggle**.
- **Pipeline** `src/jobs/sync-open-calls.ts` `main()`: `syncOpenCalls → runMatching → dispatchAlerts('instant') → eagerSummaries`. Spawned hourly (`:20`) by `src/cronserver.ts` `runOpenCallsJob()` via `runJobProcess('jobs/sync-open-calls')`.
- **Indexes**: `autoIndex` off globally; side-collection indexes are ensured in `scripts/ensure-indexes.ts`.
- **PWA / web-push / inbox**: none exist. `app/public/` has only `favicon.svg`; `apple-touch-icon.png` in the head is a dangling 404.

## Architecture: channel-agnostic match event + per-channel fan-out

Keep the proven idempotent outbox; generalize it from email-only to N channels.

- `notification.channel` enum: `email → ['email','push','telegram','inapp']`.
- `notification.dedupeKey`: `alert:{channel}:{uid}:{compraId}` (was `alert:{uid}:{compraId}`). Still unique → idempotent per channel.
- Add `notification.readAt?: Date` (inbox read-state, only meaningful on `inapp`).
- `runMatching` enqueues, per matched `(user, call)`:
  - **always** one `inapp` row (the inbox item) — for any `active` + `notificationPrefs.enabled` user.
  - one `email` row if `channels.email` && `emailVerified`.
  - one `push` row if `channels.push` && the user has ≥1 active push subscription.
  - one `telegram` row if `channels.telegram` && the user has a linked, active chat.
- One dispatcher per external channel, all driven by the existing hourly tick:
  - `email` → existing `dispatchAlerts` + a `channel:'email'` filter (keeps bundling + daily digest).
  - `push` → `src/jobs/alerts/dispatch-push.ts` (instant).
  - `telegram` → `src/jobs/alerts/dispatch-telegram.ts` (instant).
  - `inapp` → no sender; rows are the inbox. Enqueue = delivered (`status:'sent'`, `sentAt=now`).
- Retry/failure mirror email: `attempts`, `MAX_ATTEMPTS`, `lastError`. Push `404/410` → deactivate that subscription. Telegram `403` (blocked) → deactivate the link.
- `frequency` keeps its current meaning: it batches **email** only (instant vs daily digest). Push/telegram/inapp are always instant.

## Data model changes

`shared/types/monitor.ts` + `shared/models/*`:

- `INotification.channel`: widen union; add `readAt?: Date | undefined`.
- `IUser.notificationPrefs`: add `channels: { email: boolean, push: boolean, telegram: boolean, inapp: boolean }`; add `telegram?: { chatId: string, username?: string, linkedAt: Date, active: boolean }`.
  Backward compat: absent `channels` is treated as `{ email:true, push:false, telegram:false, inapp:true }` gated by the master `enabled`.
- New `shared/models/push_subscription.ts` (collection `push_subscriptions`): `userId`, `endpoint` (unique), `keys{p256dh,auth}`, `userAgent?`, `active`, `failureCount`, `lastSuccessAt?`. One per device.
- Telegram link token: **stateless HMAC** (`uid.exp.sig`) — no storage. Verified in the bot webhook; on success the `chatId` is written to `user.telegram`.

`scripts/ensure-indexes.ts`: add
- `push_subscriptions`: `{endpoint:1}` unique, `{userId:1}`.
- `notifications`: `{userId:1, channel:1, readAt:1, createdAt:-1}` (inbox list + unread badge).

## AlertCard — one rich content model, rendered per channel

`shared/alerts/build-alert-content.ts` → `buildAlertCard(call, opts)` returns:
`compraId, objeto, organismo, presupuesto {value,currency,formatted|null}, deadline {date, closesInDays}, rubros[], modalidad, pliegoUrl?, aiObjeto?, matchedOn {categories,keywords}, url, estimateUrl`.

- Peso formatting follows `app/DESIGN.md` (gold-is-money is a *visual* rule; the value + currency go in the payload, the channel renderer decides styling).
- The "cuánto ofertar para ganar" bid estimate is **not computed in the dispatch path** (it needs the app-side aggregation). Instead the card carries a prominent `estimateUrl`/`url` deep link to the llamado page, which already renders the estimate + benchmarks. The inbox (app-side) MAY fetch it live.

Renderers:
- **Email**: extend `src/emails/templates.ts` `EmailCall`/`callBlock` to show organismo · modalidad · presupuesto · cierra-en · rubro + "Ver llamado". (Note the existing template comment "emails carry no peso figures" — this design intentionally revises that: budget is exactly the decide-to-bid signal, so pesos are now included, formatted per DESIGN.md.)
- **Telegram**: HTML message + inline buttons "Ver llamado" / "Ver pliego".
- **Push**: compact — title = objeto; body = `organismo · $presupuesto · cierra en Nd`; `data.url` deep link.
- **Inbox**: `NotificationCard.vue` renders the full card.

## App-side APIs (Nitro, `app/server/api`)

- `push/subscribe.post.ts`, `push/unsubscribe.post.ts` (auth; upsert/deactivate by endpoint).
- `push/vapid-key.get.ts` — returns the public VAPID key (or `null` when unset → client hides push UI). (Also exposed via `runtimeConfig.public` for SSR.)
- `telegram/link.post.ts` — issues the `t.me/<bot>?start=<token>` deep link (auth).
- `telegram/unlink.post.ts` — clears `user.telegram` (auth).
- `telegram/webhook.post.ts` — Telegram update webhook; validates `X-Telegram-Bot-Api-Secret-Token`; handles `/start <token>` (link) and `/stop` (unlink).
- `notifications/index.get.ts` — the inbox: user's rows (default `channel:'inapp'`) joined to a projected open_call summary, newest first, paginated, with `unread` count.
- `notifications/[id]/read.post.ts`, `notifications/read-all.post.ts`.
- `account/preferences.put.ts` — extend to accept `channels`.
- `account/preferences.get.ts` — already returns `notificationPrefs`; also surface telegram-linked + push-capable state (or read separately).

## Client (app/)

- `@vite-pwa/nuxt` module, `strategies:'injectManifest'`, custom SW `app/service-worker/sw.ts` (workbox precache + `push` + `notificationclick`), `registerType:'autoUpdate'`. Runtime caching: **NetworkOnly/NetworkFirst for `/api/**`** and SSR docs (avoid the stale-200 trap), precache static build assets only.
- `manifest.webmanifest`: name "Con la tuya, contribuyente", short_name "Con la tuya", `theme_color:#0f2233`, `background_color`, `display:standalone`, `start_url:/app`, icons.
- Icons via `@vite-pwa/assets-generator` (`pwaAssets`) from `public/favicon.svg` → 64/192/512/maskable/apple-touch-icon (fixes the dangling apple-touch-icon).
- `composables/useWebPush.ts` — support check, permission, subscribe/unsubscribe, POST to the API.
- Header **bell** (`components/NotificationBell.vue`): unread badge + dropdown of recent `NotificationCard`s + "ver todas" → new page `app/pages/app/notificaciones.vue`. Only for logged-in users.
- `cuenta.vue`: per-channel toggles (email/push/telegram/inapp) + push permission button + telegram link/unlink button + connection state.
- `useMonitorApi.ts`: add `notifications`, `push`, `telegram` helper groups; extend `account.updatePrefs` with `channels`.

## Services (root `src/`), Noop-degrading like the mailer

- `src/services/webpush.ts` — `web-push` behind an interface; Noop when VAPID env absent.
- `src/services/telegram.ts` — Bot API `sendMessage` behind an interface; Noop when `TELEGRAM_BOT_TOKEN` absent.
- Wire push+telegram dispatch into `src/jobs/sync-open-calls.ts` `main()` (instant). Add npm scripts `dispatch-push`, `dispatch-telegram` for manual/standalone runs (optional).

## Env (add to `.env.example`)

`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (mailto:), `NUXT_PUBLIC_VAPID_PUBLIC_KEY` (client), `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_LINK_SECRET` (HMAC). All optional → the corresponding channel degrades to Noop / hidden UI.

## Testing / verification (test-light repo)

- Unit (tsx assertion scripts under `tests/`): `buildAlertCard` field mapping; per-channel fan-out enqueues the right rows per prefs + connection state; telegram link-token sign/verify roundtrip.
- Integration: push subscribe/unsubscribe; `/api/notifications` list + mark-read; telegram webhook `/start`.
- Manual: targeted `tsc` on touched shared/root files; dev-server curl for new endpoints; Lighthouse PWA audit (installability) via chrome-devtools; one real push + one real telegram end-to-end.

## Scope / YAGNI

- No WhatsApp / SMS / FCM. No push/telegram digest (instant only). Webhooks untouched. Award-email path untouched. Bid estimate stays a deep link, not inlined into dispatch.

## Rollout

1. Models + indexes (ensure-indexes) + prefs migration-by-default.
2. AlertCard + fan-out + dispatchers (behind Noop until env set).
3. App APIs.
4. PWA + push client.
5. UI (bell/inbox/cuenta).
6. Env on server, `ensure-indexes`, `setWebhook` for Telegram, verify.
