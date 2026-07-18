# Anomaly feedback: upvote / downvote + optional comment

Date: 2026-07-18
Branch: feat/sice-catalog-integration
Status: approved (autonomy mode — see working-style memory; no interactive gate)

## Goal

Let **logged-in users** give feedback on individual price-anomaly flags so the human
signal can be used later to **improve detection quality**. Each user can:

- Cast one vote per anomaly: **valid anomaly (👍 up)** or **false positive (👎 down)**.
- Optionally attach a short **comment** justifying the vote.
- Change or retract the vote.

All feedback is stored in MongoDB.

### Vote semantics (the point of the feature)

The axis is **true-positive vs false-positive**, because that is what feeds back
into detector/AI-triage quality:

- `vote = 1` (up) → "this is a real anomaly / worth flagging".
- `vote = -1` (down) → "this is a false positive / has a legitimate explanation".

This mirrors the second-stage AI triage (`aiVerdict.explainable`), giving a human
counterpart to the machine verdict.

## What a user votes on

The atomic **anomaly flag** document in the `anomalies` collection, keyed by its
Mongo `_id` string. That is the one-per-row unit rendered on
`/analytics/anomalies` (`app/pages/analytics/anomalies.vue`) and fetched singly by
`app/server/api/analytics/anomalies/[id].get.ts`. The provider cross-reference page
operates on aggregates (one row = one provider) and is explicitly **out of scope**.

## Data model

New collection **`anomaly_feedback`**, one document per `(userId, anomalyId)`
(upsert semantics identical to `saved_calls`).

`shared/models/anomaly_feedback.ts` (HMR-safe singleton, matches `saved_call.ts`):

| field          | type                | notes                                                        |
|----------------|---------------------|--------------------------------------------------------------|
| `userId`       | String, required    | Firebase `uid` (join key, same as every user-owned model).   |
| `anomalyId`    | String, required    | Anomaly `_id` as string.                                     |
| `vote`         | Number, required    | enum `1` \| `-1`. `1` = valid, `-1` = false positive.        |
| `comment`      | String, optional    | Trimmed, capped at 1000 chars. Empty string → unset.         |
| `anomalyType`  | String, optional    | Snapshot for offline analysis (`$setOnInsert`).             |
| `releaseId`    | String, optional    | Snapshot (contract FK) for offline analysis.                |
| `supplierName` | String, optional    | Snapshot (`metadata.supplierName`) for offline analysis.    |
| `createdAt`/`updatedAt` | Date       | `timestamps: true`.                                          |

The three snapshot fields let a maintainer analyse feedback ("which suppliers /
types get the most false-positive votes") without a join back to `anomalies`.
They are written once on insert; the anomaly fields they copy are stable.

Type `IAnomalyFeedback` added to `shared/types/monitor.ts` (extends `Document`,
optional props declared `?: T | undefined` per `exactOptionalPropertyTypes`).
Model re-exported from `shared/models/index.ts`.

### Indexes (declared in-file AND in `scripts/ensure-indexes.ts` — autoIndex is off)

- `{ userId: 1, anomalyId: 1 }` **unique** — one vote per user per anomaly; the upsert key.
- `{ anomalyId: 1 }` — aggregate up/down counts for a page of anomalies.
- `{ userId: 1, createdAt: -1 }` — "my feedback" listing (consistency with other user models).

A matching `--dry-run` plan line is added to the `else` branch of `ensure-indexes.ts`.

## Endpoints

Under the existing `app/server/api/analytics/anomalies/[id]/` folder.

### `POST /api/analytics/anomalies/[id]/feedback` — cast / update a vote

- `requireWrite(event)` (auth + CSRF/scope, returns `user.uid`).
- Body `{ vote: 1 | -1, comment?: string }`. Reject if `vote ∉ {1,-1}` → 400.
- `AnomalyModel.findById(id).select('type releaseId metadata.supplierName').lean()`;
  404 if missing.
- Comment: `typeof comment === 'string'` → `comment.trim().slice(0, 1000)`; empty → `$unset`.
- Upsert on `{ userId, anomalyId }` with `$set: { vote, comment? }` and
  `$setOnInsert: { userId, anomalyId, anomalyType, releaseId, supplierName }`.
- Recompute counts, return `{ success: true, data: { feedback, counts: { up, down } } }`.

### `DELETE /api/analytics/anomalies/[id]/feedback` — retract a vote

- `requireWrite(event)`. `deleteOne({ userId, anomalyId })`.
- Return `{ success: true, data: { counts: { up, down } } }`.

### Read path — augment existing GETs (no standalone GET endpoint)

Both endpoints attach a `feedback` object per anomaly using `getUser(event)`
(nullable — counts are public, the current user's own vote/comment ride along when
authed):

```
feedback: { up: number, down: number, myVote: 1 | -1 | null, myComment: string | null }
```

- `anomalies.get.ts` (list): after the page query, collect `ids = anomalies.map(_id)`,
  run one aggregate `{$match:{anomalyId:{$in:ids}}}` grouped by `{anomalyId, vote}`
  for counts, and (if a user is present) one `find({ userId, anomalyId: {$in: ids} })`
  for their votes/comments; merge onto each row. Empty ids → skip both queries.
- `[id].get.ts` (detail): the same for the single anomaly.

Counts are public; `myComment` is returned **only** for the requesting user's own
vote. Other users' comments are never exposed through the API.

## Client

### `app/components/AnomalyFeedback.vue`

Props: `anomalyId: string`, `up: number`, `down: number`,
`myVote: 1 | -1 | null`, `myComment: string | null`.

- Renders two pill buttons: 👍 with `up` count, 👎 with `down` count. The active
  one (`myVote`) is highlighted. Clicking the active vote again **retracts** it
  (DELETE); clicking the other switches.
- Optional comment: once a vote exists, reveal a compact textarea
  ("Justificá tu voto (opcional)") + save; prefilled with `myComment`.
- Optimistic local state for counts + `myVote`, reconciled from the endpoint's
  returned `counts`. On error, roll back and surface a small inline message.
- Gating (mirrors `llamados/[compraId].vue`):
  - `useAuth()` → show interactive buttons only when `isAuthed`.
  - not authed but `useAuthEnabled()` → a `/login` link ("Iniciá sesión para votar").
  - `!useAuthEnabled()` → render **read-only counts only** (or nothing) — never a dead control.

### Wiring

- `app/pages/analytics/anomalies.vue`: place `<AnomalyFeedback>` inside the
  `<li class="flags__row">` but **outside** the `<NuxtLink>` (next to the `.aidet`
  panel, ~line 621), so a click never navigates to the contract. Pass
  `a.feedback.{up,down,myVote,myComment}` (default to zeros when absent).
- `useMonitorApi()`: add a `feedback` group:
  - `save(anomalyId, { vote, comment? })` → POST
  - `remove(anomalyId)` → DELETE
- i18n: add `anomalies.feedback.*` keys to `es.json` and `en.json`.

## Out of scope (YAGNI)

- No admin UI for reading comments (a DB query serves the analysis need now).
- No public comment threads / replies / moderation — comments are private justification.
- No standalone feedback GET endpoint (counts ride on list/detail responses).
- No notification, reputation weighting, or webhook on vote.
- Provider-aggregate page voting.

## Files touched

New:
- `shared/models/anomaly_feedback.ts`
- `app/server/api/analytics/anomalies/[id]/feedback.post.ts`
- `app/server/api/analytics/anomalies/[id]/feedback.delete.ts`
- `app/components/AnomalyFeedback.vue`

Edited:
- `shared/types/monitor.ts` (add `IAnomalyFeedback`)
- `shared/models/index.ts` (export)
- `scripts/ensure-indexes.ts` (index block + dry-run line)
- `app/server/api/analytics/anomalies.get.ts` (attach feedback summary)
- `app/server/api/analytics/anomalies/[id].get.ts` (attach feedback summary)
- `app/composables/useMonitorApi.ts` (feedback methods)
- `app/pages/analytics/anomalies.vue` (mount component)
- `app/i18n/locales/es.json`, `app/i18n/locales/en.json` (strings)

## Verification

- `npx tsc`/nuxt typecheck clean on touched files.
- Manual: as a logged-in user, up/down a flag on `/analytics/anomalies`, add a
  comment, reload → state persists; retract → count drops; second account's vote
  increments count but its comment is never returned to the first account.
- Adversarial multi-agent review of the diff before declaring done.
