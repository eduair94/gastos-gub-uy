# Anticipación de llamados — Fase 2 (alertas anticipadas) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Prerequisite: Fase 1 plan is fully implemented and merged** (`tender_forecast` collection populated, `shared/forecast/*` present).

**Goal:** Turn recurrence forecasts into opt-in, per-watch "próximo llamado probable" alerts delivered through the existing multichannel fan-out (in-app inbox, push, Telegram), plus a personalized "Próximos para vos" section in the calendar.

**Architecture:** A new `anticipado` notification event type reuses the exact per-channel outbox + dispatchers of the reactive alert system. The forecast job, after writing `tender_forecast`, matches each above-threshold forecast against watches that opted in (`anticipatedAlerts`) using the existing pure `watchMatchesCall` fed a *synthetic* `OpenCallMatchView`, and enqueues idempotent `notifications` rows keyed by forecast (not `compraId`). Dispatchers gain a small `type === 'anticipado'` branch that renders from a forecast instead of an open call.

**Tech Stack:** TypeScript, Mongoose, Nuxt 3 / Nitro, Vue 3 + Vuetify 3, `tsx` (verification). Spec §U3: `docs/superpowers/specs/2026-07-19-tender-anticipation-design.md`.

## Global Constraints

- **No unit-test runner.** "Tests" = `tsx` assertion scripts under `scripts/verify/` that `throw` on failure. Run `npx tsx scripts/verify/<name>.ts`.
- **Anti-fatigue rule (locked):** in-app inbox gets every watch-matched forecast in the collection (all are ≥`DISPLAY_THRESHOLD`); **external channels (push/telegram) only for `confidence ≥ ALERT_THRESHOLD = 0.60`**. Email is **deferred** (see Task 8 note) — it needs bundled-template work; it is out of Fase 2 MVP scope.
- **Opt-in is off by default:** a watch alerts on anticipation only when `anticipatedAlerts === true`. No existing subscriber is opted in silently.
- **Reuse, don't fork:** the matcher (`watchMatchesCall`), `resolveChannels`, the four connection gates, the outbox `notifications`, and the dispatchers are reused verbatim except for the documented branches. Dedupe stays idempotent.
- **`dedupeKey` for anticipado:** `anticipado:{channel}:{uid}:{buyerId}:{rubroNodeId}:{expectedWindow.start ISO}` — re-running the monthly job never double-enqueues the same window.
- **Autoindex OFF** — any new index added to `notifications` must also be added to `scripts/ensure-indexes.ts`.

## File Structure

**Create:**
- `shared/forecast/synthetic-view.ts` — PURE forecast → `OpenCallMatchView`.
- `src/jobs/matching/anticipated.ts` — the anticipated fan-out (mirror of `matching/run.ts`).
- `app/server/api/app/anticipacion/mine.get.ts` — gated personalized endpoint.
- `scripts/verify/verify-synthetic-view.ts`, `scripts/verify/verify-anticipated-card.ts`, `scripts/verify/verify-anticipated-fanout.ts`.

**Modify:**
- `shared/types/monitor.ts` — `NotificationType += 'anticipado'`; `INotification.compraId` optional + `forecastId?`; `IWatch.anticipatedAlerts?`.
- `shared/models/notification.ts` — type enum, conditional `compraId`, `forecastId`.
- `shared/models/watch.ts` — `anticipatedAlerts` field.
- `shared/alerts/build-alert-content.ts` — `AlertCard.anticipated?/expectedWindow?`, `buildAnticipatedCard`, renderer branches.
- `src/jobs/refresh-tender-forecast.ts` — call `runAnticipatedMatching()` after the swap.
- `src/jobs/alerts/dispatch-push.ts`, `dispatch-telegram.ts` — drain filter + `anticipado` branch.
- The in-app inbox read endpoint/component — render `anticipado` rows (Task 7).
- `app/pages/app/calendario.vue` — "Próximos para vos" section.
- The watch create/edit API + form — persist + toggle `anticipatedAlerts` (Task 9).

---

### Task 1: `anticipatedAlerts` flag on watches

**Files:**
- Modify: `shared/types/monitor.ts` (add to `IWatch`)
- Modify: `shared/models/watch.ts` (add schema field)
- Test: `scripts/verify/verify-watch-flag.ts`

**Interfaces:**
- Produces: `IWatch.anticipatedAlerts?: boolean` (schema default `false`).

- [ ] **Step 1: Write the failing assertion**

Create `scripts/verify/verify-watch-flag.ts`:

```ts
#!/usr/bin/env tsx
import { WatchModel } from '../../shared/models'
function assert(c: unknown, m: string) { if (!c) throw new Error(`FAIL: ${m}`) }
const path = WatchModel.schema.path('anticipatedAlerts')
assert(path, 'anticipatedAlerts path exists on Watch schema')
assert((path as any).options.default === false, 'anticipatedAlerts defaults to false')
console.log('OK verify-watch-flag')
```

- [ ] **Step 2: Run, verify it fails**

Run: `npx tsx scripts/verify/verify-watch-flag.ts`
Expected: FAIL — `anticipatedAlerts path exists`.

- [ ] **Step 3: Add the interface field**

In `shared/types/monitor.ts`, in `interface IWatch` (after `procurementMethods?`), add:

```ts
  // Opt-in: also deliver PREDICTIVE "próximo llamado probable" alerts (Fase 2).
  // Off by default so anticipation never reaches a subscriber who didn't ask.
  anticipatedAlerts?: boolean | undefined
```

- [ ] **Step 4: Add the schema field**

In `shared/models/watch.ts`, in `WatchSchema` (after `procurementMethods`), add:

```ts
    anticipatedAlerts: { type: Boolean, default: false },
```

- [ ] **Step 5: Run, verify it passes**

Run: `npx tsx scripts/verify/verify-watch-flag.ts`
Expected: `OK verify-watch-flag`

- [ ] **Step 6: Commit**

```bash
git add shared/types/monitor.ts shared/models/watch.ts scripts/verify/verify-watch-flag.ts
git commit -m "feat(anticipacion): anticipatedAlerts opt-in flag on watches"
```

---

### Task 2: `anticipado` notification type + `forecastId`

**Files:**
- Modify: `shared/types/monitor.ts` (`NotificationType`, `INotification`)
- Modify: `shared/models/notification.ts` (enum, conditional `compraId`, `forecastId`)
- Test: `scripts/verify/verify-notification-anticipado.ts`

**Interfaces:**
- Produces: `NotificationType` includes `'anticipado'`; `INotification.compraId?: string`, `INotification.forecastId?: string`.

- [ ] **Step 1: Write the failing assertion**

Create `scripts/verify/verify-notification-anticipado.ts`:

```ts
#!/usr/bin/env tsx
import { NotificationModel } from '../../shared/models'
function assert(c: unknown, m: string) { if (!c) throw new Error(`FAIL: ${m}`) }

const typeEnum = (NotificationModel.schema.path('type') as any).enumValues
assert(typeEnum.includes('anticipado'), `type enum includes anticipado (got ${typeEnum})`)
assert(NotificationModel.schema.path('forecastId'), 'forecastId path exists')

// An anticipado doc without compraId must validate; an alert without compraId must NOT.
const ok = new NotificationModel({
  type: 'anticipado', userId: 'u', forecastId: 'f1', dedupeKey: 'k1', channel: 'inapp', status: 'sent',
})
const okErr = ok.validateSync()
assert(!okErr, `anticipado without compraId validates (err: ${okErr?.message})`)

const bad = new NotificationModel({ type: 'alert', userId: 'u', dedupeKey: 'k2', channel: 'email', status: 'pending' })
const badErr = bad.validateSync()
assert(badErr && /compraId/.test(badErr.message), 'alert without compraId still fails validation')
console.log('OK verify-notification-anticipado')
```

- [ ] **Step 2: Run, verify it fails**

Run: `npx tsx scripts/verify/verify-notification-anticipado.ts`
Expected: FAIL — enum lacks `anticipado`.

- [ ] **Step 3: Update the interface**

In `shared/types/monitor.ts`:

```ts
export type NotificationType = 'alert' | 'reminder' | 'award' | 'anticipado'
```

In `interface INotification`, change `compraId` to optional and add `forecastId`:

```ts
  // Present for alert/reminder/award; ABSENT for anticipado (no llamado exists yet).
  compraId?: string | undefined
  // Present ONLY for type 'anticipado' — the tender_forecast _id the alert renders from.
  forecastId?: string | undefined
```

- [ ] **Step 4: Update the schema**

In `shared/models/notification.ts`:

```ts
    type: { type: String, required: true, enum: ["alert", "reminder", "award", "anticipado"] },
    userId: { type: String, required: true },
    // Required for every type except anticipado (which has no compraId yet).
    compraId: { type: String, required: function (this: { type?: string }) { return this.type !== "anticipado" } },
    // Set only on anticipado rows.
    forecastId: { type: String },
```

- [ ] **Step 5: Run, verify it passes**

Run: `npx tsx scripts/verify/verify-notification-anticipado.ts`
Expected: `OK verify-notification-anticipado`

- [ ] **Step 6: Commit**

```bash
git add shared/types/monitor.ts shared/models/notification.ts scripts/verify/verify-notification-anticipado.ts
git commit -m "feat(anticipacion): anticipado notification type + forecastId (compraId now conditional)"
```

---

### Task 3: Pure synthetic match-view (`shared/forecast/synthetic-view.ts`)

**Files:**
- Create: `shared/forecast/synthetic-view.ts`
- Test: `scripts/verify/verify-synthetic-view.ts`

**Interfaces:**
- Consumes: `OpenCallMatchView` from `shared/matching/match`; `normalizeText` from `shared/utils/text`.
- Produces: `forecastToMatchView(f: ForecastMatchInput): OpenCallMatchView` where `ForecastMatchInput = { rubroAncestors: string[]; rubroLabel: string; evidenceItems: { classificationId: string; label: string }[]; buyerId: string; expectedAmount?: { p50: number } | undefined }`.

- [ ] **Step 1: Write the failing assertion**

Create `scripts/verify/verify-synthetic-view.ts`:

```ts
#!/usr/bin/env tsx
import { forecastToMatchView } from '../../shared/forecast/synthetic-view'
import { watchMatchesCall } from '../../shared/matching/match'

function assert(c: unknown, m: string) { if (!c) throw new Error(`FAIL: ${m}`) }
const f = {
  rubroAncestors: ['C2.6.5', 'SF2.6', '28267'], rubroLabel: 'Papelería',
  evidenceItems: [{ classificationId: '28267', label: 'Papel A4' }],
  buyerId: '80-1', expectedAmount: { p50: 1000 },
}
const view = forecastToMatchView(f)
assert(view.classificationSet.includes('C2.6.5') && view.classificationSet.includes('28267'), 'view carries node + leaf codes')
assert(view.buyerId === '80-1', 'view carries buyerId')

// A watch subscribed to the rubro node matches; a foreign-category watch does not.
const wMatch = { categories: ['C2.6.5'], keywords: [], keywordMode: 'any' as const, buyers: [] }
const wNo = { categories: ['C9.9.9'], keywords: [], keywordMode: 'any' as const, buyers: [] }
assert(watchMatchesCall(wMatch, view), 'node-subscribed watch matches synthetic view')
assert(!watchMatchesCall(wNo, view), 'foreign-category watch does not match')

// Keyword watch matches on the rubro label / evidence label.
const wKw = { categories: [], keywords: ['papel'], keywordMode: 'any' as const, buyers: [] }
assert(watchMatchesCall(wKw, view), 'keyword watch matches on label text')

// Buyer refinement excludes other buyers.
const wBuyerNo = { categories: ['C2.6.5'], keywords: [], keywordMode: 'any' as const, buyers: ['81-1'] }
assert(!watchMatchesCall(wBuyerNo, view), 'buyer refinement excludes non-matching buyer')
console.log('OK verify-synthetic-view')
```

- [ ] **Step 2: Run, verify it fails**

Run: `npx tsx scripts/verify/verify-synthetic-view.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the builder**

Create `shared/forecast/synthetic-view.ts`:

```ts
import { normalizeText } from "../utils/text";
import type { OpenCallMatchView } from "../matching/match";

export interface ForecastMatchInput {
  rubroAncestors: string[];
  rubroLabel: string;
  evidenceItems: { classificationId: string; label: string }[];
  buyerId: string;
  expectedAmount?: { p50: number } | undefined;
}

/**
 * Build a synthetic OpenCallMatchView from a forecast so the EXISTING pure
 * watchMatchesCall can decide relevance unchanged. classificationSet carries the
 * rubro node + ancestor tokens + evidence leaf codes (so both node- and
 * article-subscribed watches match); searchText carries the rubro + item labels
 * (for keyword watches). buyerId enables the buyer refinement.
 */
export function forecastToMatchView(f: ForecastMatchInput): OpenCallMatchView {
  return {
    classificationSet: [...new Set([...f.rubroAncestors, ...f.evidenceItems.map(e => e.classificationId)])],
    searchText: normalizeText([f.rubroLabel, ...f.evidenceItems.map(e => e.label)].join(" ")),
    buyerId: f.buyerId,
    estimatedValue: f.expectedAmount?.p50,
    procurementMethodDetails: undefined,
  };
}
```

- [ ] **Step 4: Run, verify it passes**

Run: `npx tsx scripts/verify/verify-synthetic-view.ts`
Expected: `OK verify-synthetic-view`

- [ ] **Step 5: Commit**

```bash
git add shared/forecast/synthetic-view.ts scripts/verify/verify-synthetic-view.ts
git commit -m "feat(anticipacion): pure forecast→OpenCallMatchView for watch matching"
```

---

### Task 4: `AlertCard` anticipated variant + renderer branches

**Files:**
- Modify: `shared/alerts/build-alert-content.ts`
- Test: `scripts/verify/verify-anticipated-card.ts`

**Interfaces:**
- Consumes: existing `AlertCard`, `formatMoney`, `cardMetaLine`, `renderPushPayload`, `renderTelegramHtml`.
- Produces: `AlertCard.anticipated?: boolean`, `AlertCard.expectedWindow?: { start: Date; end: Date } | null`; `buildAnticipatedCard(f: AnticipatedCardInput, opts: { appBaseUrl: string; locale?: Locale }): AlertCard` where `AnticipatedCardInput = { forecastId: string; buyerId: string; buyerName?: string; rubroNodeId: string; rubroLabel: string; expectedWindow: { start: Date; end: Date }; confidence: number; incumbentSupplier?: { name?: string }; expectedAmount?: { currency: string; p50: number } }`.

- [ ] **Step 1: Write the failing assertion**

Create `scripts/verify/verify-anticipated-card.ts`:

```ts
#!/usr/bin/env tsx
import { buildAnticipatedCard, renderPushPayload, renderTelegramHtml, cardMetaLine } from '../../shared/alerts/build-alert-content'

function assert(c: unknown, m: string) { if (!c) throw new Error(`FAIL: ${m}`) }
const f = {
  forecastId: 'f1', buyerId: '80-1', buyerName: 'Intendencia X', rubroNodeId: 'C2.6.5',
  rubroLabel: 'Papelería', expectedWindow: { start: new Date(Date.UTC(2026, 7, 1)), end: new Date(Date.UTC(2026, 9, 1)) },
  confidence: 0.72, incumbentSupplier: { name: 'ACME' }, expectedAmount: { currency: 'UYU', p50: 50000 },
}
const card = buildAnticipatedCard(f, { appBaseUrl: 'https://x.uy' })
assert(card.anticipated === true, 'card flagged anticipated')
assert(card.expectedWindow && card.expectedWindow.start, 'card carries expectedWindow')
assert(card.deadline.date === null, 'no deadline on anticipated card')
assert(/analytics\/anticipacion/.test(card.url), 'url deep-links to anticipacion page')
assert(/80-1/.test(card.url) && /C2\.6\.5/.test(card.url), 'url carries buyer + rubro filters')

const meta = cardMetaLine(card, 'es')
assert(/esperado|ago|oct|2026/i.test(meta), `meta line mentions expected window, not "cierra" (got: ${meta})`)
assert(!/cierra/i.test(meta), 'meta line does not say "cierra" for anticipated')

const push = renderPushPayload(card, 'es')
assert(/probable|anticip|próximo|proximo/i.test(push.title + push.body), 'push copy signals anticipation')
const tg = renderTelegramHtml(card, 'es')
assert(/esperado|probable/i.test(tg), 'telegram copy signals anticipation')
console.log('OK verify-anticipated-card')
```

- [ ] **Step 2: Run, verify it fails**

Run: `npx tsx scripts/verify/verify-anticipated-card.ts`
Expected: FAIL — `buildAnticipatedCard` not exported.

- [ ] **Step 3: Extend `AlertCard` + add builder + branch the renderers**

In `shared/alerts/build-alert-content.ts`:

a) Add two optional fields to `interface AlertCard` (after `estimateUrl`):

```ts
  /** True for a predictive "próximo llamado probable" card (Fase 2). */
  anticipated?: boolean;
  /** Expected publication window for an anticipated card (else absent). */
  expectedWindow?: { start: Date; end: Date } | null;
```

b) Add anticipation strings to both locale blocks in `STR`:

```ts
  // in STR.es:
    anticipated: "Próximo llamado probable",
    expectedIn: "esperado",
    notPublished: "aún no publicado — estimación por patrón histórico",
  // in STR.en:
    anticipated: "Likely upcoming tender",
    expectedIn: "expected",
    notPublished: "not published yet — estimate from historical pattern",
```

c) Add a window formatter + the builder (place after `buildAlertCard`):

```ts
function windowLabel(w: { start: Date; end: Date }, locale: Locale): string {
  const loc = locale === "en" ? "en-GB" : "es-UY";
  const fmt = (d: Date) => d.toLocaleDateString(loc, { month: "short", year: "numeric" });
  const a = fmt(w.start), b = fmt(w.end);
  return a === b ? a : `${a} – ${b}`;
}

export interface AnticipatedCardInput {
  forecastId: string;
  buyerId: string;
  buyerName?: string | undefined;
  rubroNodeId: string;
  rubroLabel: string;
  expectedWindow: { start: Date; end: Date };
  confidence: number;
  incumbentSupplier?: { name?: string | undefined } | undefined;
  expectedAmount?: { currency: string; p50: number } | undefined;
}

/** Build an AlertCard for a predictive forecast (no live open call exists). */
export function buildAnticipatedCard(f: AnticipatedCardInput, opts: { appBaseUrl: string; locale?: Locale }): AlertCard {
  const base = opts.appBaseUrl.replace(/\/+$/, "");
  const url = `${base}/analytics/anticipacion?buyer=${encodeURIComponent(f.buyerId)}&rubro=${encodeURIComponent(f.rubroNodeId)}`;
  return {
    compraId: f.forecastId, // synthetic — never used as a llamado link for anticipated cards
    objeto: f.rubroLabel,
    organismo: f.buyerName ?? f.buyerId,
    presupuesto: formatMoney(f.expectedAmount?.p50 ?? null, f.expectedAmount?.currency ?? null),
    deadline: { date: null, closesInDays: null },
    rubros: [f.rubroLabel],
    modalidad: null,
    pliegoUrl: null,
    aiObjeto: null,
    matchedOn: { categories: [], keywords: [] },
    url,
    estimateUrl: url,
    anticipated: true,
    expectedWindow: f.expectedWindow,
  };
}
```

d) Branch `cardMetaLine` — replace the deadline segment when anticipated. Change the deadline push to:

```ts
  if (card.anticipated && card.expectedWindow) {
    bits.push(`${STR[locale].expectedIn} ${windowLabel(card.expectedWindow, locale)}`);
  } else {
    bits.push(card.deadline.closesInDays != null ? s.closesIn(card.deadline.closesInDays) : s.noDeadline);
  }
```

e) Branch `renderPushPayload` title so anticipated cards read as predictions:

```ts
export function renderPushPayload(card: AlertCard, locale: Locale = "es"): PushPayload {
  const s = STR[locale];
  const title = card.anticipated
    ? `${s.anticipated}: ${card.objeto}`.slice(0, 80)
    : (card.objeto.length > 80 ? card.objeto.slice(0, 77) + "…" : card.objeto);
  return { title, body: cardMetaLine(card, locale), url: card.url, compraId: card.compraId };
}
```

f) Branch `renderTelegramHtml` — prepend an anticipation banner + swap the deadline line:

```ts
  if (card.anticipated) {
    lines.length = 0;
    lines.push(`<b>🔮 ${esc(STR[locale].anticipated)}: ${esc(card.objeto)}</b>`);
    if (card.organismo) lines.push(esc(card.organismo));
    if (card.presupuesto.formatted) lines.push(`${STR[locale].budget}: ${esc(card.presupuesto.formatted)}`);
    if (card.expectedWindow) lines.push(`🗓️ ${STR[locale].expectedIn} ${esc(windowLabel(card.expectedWindow, locale))}`);
    lines.push(`<i>${esc(STR[locale].notPublished)}</i>`);
    return lines.join("\n");
  }
```

(Insert this block at the top of `renderTelegramHtml`, right after `const s = STR[locale];` and `const lines: string[] = [];`, returning early for anticipated cards.)

- [ ] **Step 4: Run, verify it passes**

Run: `npx tsx scripts/verify/verify-anticipated-card.ts`
Expected: `OK verify-anticipated-card`

- [ ] **Step 5: Commit**

```bash
git add shared/alerts/build-alert-content.ts scripts/verify/verify-anticipated-card.ts
git commit -m "feat(anticipacion): anticipated AlertCard variant + push/telegram renderers"
```

---

### Task 5: Anticipated fan-out (`src/jobs/matching/anticipated.ts`)

**Files:**
- Create: `src/jobs/matching/anticipated.ts`
- Modify: `src/jobs/refresh-tender-forecast.ts` (call it after the swap)
- Test: `scripts/verify/verify-anticipated-fanout.ts`

**Interfaces:**
- Consumes: `TenderForecastModel`, `WatchModel`, `UserModel`, `NotificationModel`, `PushSubscriptionModel`; `resolveChannels`; `watchMatchesCall`; `forecastToMatchView` (Task 3); `ALERT_THRESHOLD` (Fase 1 constants).
- Produces: `runAnticipatedMatching(log?: (m: string) => void): Promise<{ enqueued: number }>`.

- [ ] **Step 1: Write the failing assertion (idempotency + gating)**

Create `scripts/verify/verify-anticipated-fanout.ts`:

```ts
#!/usr/bin/env tsx
import { connectToDatabase } from '../../shared/connection/database'
import { NotificationModel } from '../../shared/models'
import { runAnticipatedMatching } from '../../src/jobs/matching/anticipated'

function assert(c: unknown, m: string) { if (!c) throw new Error(`FAIL: ${m}`) }
async function main() {
  await connectToDatabase()
  const r1 = await runAnticipatedMatching()
  const count1 = await NotificationModel.countDocuments({ type: 'anticipado' })
  const r2 = await runAnticipatedMatching() // second run must not duplicate
  const count2 = await NotificationModel.countDocuments({ type: 'anticipado' })
  assert(count2 === count1, `idempotent: no new rows on re-run (${count1} → ${count2})`)

  // Every anticipado row has forecastId, no compraId, a well-formed dedupeKey, valid channel.
  const rows = await NotificationModel.find({ type: 'anticipado' }).limit(20).lean()
  for (const n of rows) {
    assert(n.forecastId, `row has forecastId (${n._id})`)
    assert(!n.compraId, `row has no compraId (${n._id})`)
    assert(/^anticipado:(inapp|push|telegram):/.test(n.dedupeKey), `dedupeKey format (${n.dedupeKey})`)
  }
  console.log(`OK verify-anticipated-fanout — ${count1} rows, r1.enqueued=${r1.enqueued}, r2.enqueued=${r2.enqueued}`)
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
```

- [ ] **Step 2: Run, verify it fails**

Run: `npx tsx scripts/verify/verify-anticipated-fanout.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the fan-out (mirrors `matching/run.ts`)**

Create `src/jobs/matching/anticipated.ts`:

```ts
/**
 * Anticipated-alert fan-out. Mirrors src/jobs/matching/run.ts but keyed by forecast
 * instead of open call. For each tender_forecast, tests it against every watch that
 * opted in (anticipatedAlerts:true) via the SAME pure watchMatchesCall fed a
 * synthetic view, then enqueues idempotent notifications rows.
 *
 * Anti-fatigue: in-app inbox gets every matched forecast; external channels
 * (push/telegram) only for confidence >= ALERT_THRESHOLD. Email is intentionally
 * excluded here (bundled-template work, deferred).
 */
import { NotificationModel } from "../../../shared/models/notification";
import { PushSubscriptionModel } from "../../../shared/models/push_subscription";
import { TenderForecastModel } from "../../../shared/models/tender_forecast";
import { UserModel } from "../../../shared/models/user";
import { WatchModel } from "../../../shared/models/watch";
import type { NotificationChannel } from "../../../shared/types/monitor";
import { resolveChannels } from "../../../shared/alerts/channels";
import { forecastToMatchView } from "../../../shared/forecast/synthetic-view";
import { watchMatchesCall } from "./match";
import type { WatchInput } from "./match";
import { ALERT_THRESHOLD } from "../../../shared/forecast/constants";

const EXTERNAL: NotificationChannel[] = ["push", "telegram"]; // email deferred

export async function runAnticipatedMatching(log: (m: string) => void = () => {}): Promise<{ enqueued: number }> {
  const forecasts = await TenderForecastModel.find({}).lean();
  const watches = await WatchModel.find({ active: true, anticipatedAlerts: true }).lean();
  if (!forecasts.length || !watches.length) {
    log(`[anticipated] nothing to do (forecasts=${forecasts.length}, opted-in watches=${watches.length})`);
    return { enqueued: 0 };
  }

  interface Pair { userId: string; forecast: (typeof forecasts)[number] }
  const pairs: Pair[] = [];
  for (const f of forecasts) {
    const view = forecastToMatchView({
      rubroAncestors: f.rubroAncestors,
      rubroLabel: f.rubroLabel,
      evidenceItems: f.evidenceItems,
      buyerId: f.buyerId,
      expectedAmount: f.expectedAmount ? { p50: f.expectedAmount.p50 } : undefined,
    });
    const seen = new Set<string>(); // one pair per (user, forecast)
    for (const w of watches) {
      if (seen.has(w.userId)) continue;
      if (watchMatchesCall(w as unknown as WatchInput, view)) {
        seen.add(w.userId);
        pairs.push({ userId: w.userId, forecast: f });
      }
    }
  }
  if (!pairs.length) { log("[anticipated] no watch matches"); return { enqueued: 0 }; }

  const userIds = [...new Set(pairs.map(p => p.userId))];
  const users = await UserModel.find({ uid: { $in: userIds } }).lean();
  const userMap = new Map(users.map(u => [u.uid, u]));
  const pushUserIds = new Set(await PushSubscriptionModel.distinct("userId", { userId: { $in: userIds }, active: true }));

  const now = new Date();
  const ops: any[] = [];
  for (const p of pairs) {
    const u = userMap.get(p.userId);
    if (!u || u.status !== "active" || !u.notificationPrefs?.enabled) continue;
    const prefs = resolveChannels(u);
    const f = p.forecast;
    const windowIso = new Date(f.expectedWindow.start).toISOString();
    const external = f.confidence >= ALERT_THRESHOLD;

    const deliver: Record<NotificationChannel, boolean> = {
      inapp: prefs.inapp, // inbox always (if opted in), any confidence in the collection
      email: false,       // deferred
      push: external && prefs.push && pushUserIds.has(p.userId),
      telegram: external && prefs.telegram && !!u.telegram?.active,
    };

    for (const channel of ["inapp", ...EXTERNAL] as NotificationChannel[]) {
      if (!deliver[channel]) continue;
      const dedupeKey = `anticipado:${channel}:${p.userId}:${f.buyerId}:${f.rubroNodeId}:${windowIso}`;
      const delivered = channel === "inapp";
      ops.push({
        updateOne: {
          filter: { dedupeKey },
          update: {
            $setOnInsert: {
              type: "anticipado",
              userId: p.userId,
              forecastId: String(f._id),
              dedupeKey,
              channel,
              status: delivered ? "sent" : "pending",
              attempts: 0,
              ...(delivered ? { sentAt: now } : {}),
            },
          },
          upsert: true,
        },
      });
    }
  }

  let enqueued = 0;
  if (ops.length) {
    const res = await NotificationModel.bulkWrite(ops, { ordered: false });
    enqueued = res.upsertedCount ?? 0;
  }
  log(`[anticipated] enqueued ${enqueued} new notification rows (${pairs.length} matches)`);
  return { enqueued };
}
```

- [ ] **Step 4: Invoke it from the forecast job**

In `src/jobs/refresh-tender-forecast.ts`, after the `deleteMany` swep line and before the final `console.log`, add:

```ts
  const { runAnticipatedMatching } = await import("./matching/anticipated");
  const fan = await runAnticipatedMatching((m) => console.log(m));
  console.log(`[tender-forecast] anticipated fan-out enqueued ${fan.enqueued} rows.`);
```

- [ ] **Step 5: Run the job, then the assertion**

Run: `npm run refresh-tender-forecast` (re-runs forecast + fan-out).
Then: `npx tsx scripts/verify/verify-anticipated-fanout.ts`
Expected: `OK verify-anticipated-fanout — N rows, ...`. Note: N may be 0 if no watch has `anticipatedAlerts:true` yet — in that case create one test watch (see Task 9 manual step) or temporarily flip one via a throwaway `tsx` update, then re-run. Document the count.

- [ ] **Step 6: Commit**

```bash
git add src/jobs/matching/anticipated.ts src/jobs/refresh-tender-forecast.ts scripts/verify/verify-anticipated-fanout.ts
git commit -m "feat(anticipacion): anticipated fan-out enqueues opt-in per-watch notifications"
```

---

### Task 6: Dispatcher branches (push + telegram)

**Files:**
- Modify: `src/jobs/alerts/dispatch-push.ts`
- Modify: `src/jobs/alerts/dispatch-telegram.ts`

**Interfaces:**
- Consumes: `TenderForecastModel`; `buildAnticipatedCard` (Task 4).

- [ ] **Step 1: Broaden the push drain filter + add the branch**

In `src/jobs/alerts/dispatch-push.ts`:

a) Change the drain query to include anticipado:

```ts
const pending = await NotificationModel.find({ type: { $in: ["alert", "anticipado"] }, channel: "push", status: "pending" }).lean();
```

b) Before the per-notification loop, pre-load forecasts for the anticipado rows (alongside the existing `callMap`):

```ts
import { TenderForecastModel } from "../../../shared/models/tender_forecast";
import { buildAnticipatedCard } from "../../../shared/alerts/build-alert-content";
// …after callMap is built:
const forecastIds = notifs.filter(n => n.type === "anticipado").map(n => n.forecastId).filter(Boolean) as string[];
const forecasts = forecastIds.length ? await TenderForecastModel.find({ _id: { $in: forecastIds } }).lean() : [];
const forecastMap = new Map(forecasts.map(f => [String(f._id), f]));
```

c) In the per-`n` loop, replace the single `buildAlertCard(...)` with a type branch. Where the code currently does `const card = buildAlertCard(call, { appBaseUrl: appBaseUrl(), matchedOn: n.matchedOn })`, use:

```ts
let card;
if (n.type === "anticipado") {
  const f = forecastMap.get(String(n.forecastId));
  if (!f) { await NotificationModel.updateOne({ _id: n._id }, { $set: { status: "skipped", lastError: "forecast not found" } }); continue; }
  card = buildAnticipatedCard({
    forecastId: String(f._id), buyerId: f.buyerId, buyerName: f.buyerName,
    rubroNodeId: f.rubroNodeId, rubroLabel: f.rubroLabel, expectedWindow: f.expectedWindow,
    confidence: f.confidence, incumbentSupplier: f.incumbentSupplier, expectedAmount: f.expectedAmount,
  }, { appBaseUrl: appBaseUrl(), locale });
} else {
  const call = callMap.get(n.compraId!);
  if (!call) { await NotificationModel.updateOne({ _id: n._id }, { $set: { status: "skipped", lastError: "call not found" } }); continue; }
  card = buildAlertCard(call, { appBaseUrl: appBaseUrl(), matchedOn: n.matchedOn });
}
```

(The `compraIds` array built from `notifs.map(n => n.compraId)` will contain `undefined` for anticipado rows — harmless in an `$in`, but you can filter with `.filter(Boolean)` for cleanliness.)

- [ ] **Step 2: Same branch for telegram**

In `src/jobs/alerts/dispatch-telegram.ts`, apply the identical three changes: broaden the drain filter to `{ type: { $in: ["alert","anticipado"] }, channel: "telegram", status: "pending" }`; pre-load `forecastMap`; branch the `buildAlertCard` call the same way. For anticipated cards there is no `pliegoUrl`, so the button list is just `[{ text: viewCall(locale), url: card.url }]` (the existing `if (card.pliegoUrl)` guard already handles this — no change needed).

- [ ] **Step 3: Verify end-to-end delivery**

Preconditions: a test user with `notificationPrefs.enabled`, a linked Telegram chat (or an active push subscription), and a watch with `anticipatedAlerts:true` matching a high-confidence (`≥0.60`) forecast. Run `npm run refresh-tender-forecast` (enqueues), then invoke the dispatchers the way the sync pipeline does — either run the `jobs/sync-open-calls` job or call the dispatcher directly via a throwaway `tsx` script:

```ts
// scratch: run the push dispatcher once
import { dispatchPush } from '../../src/jobs/alerts/dispatch-push'
dispatchPush({ log: console.log }).then(r => { console.log(r); process.exit(0) })
```

Expected: the pending anticipado push/telegram rows flip to `sent`, and the device/chat receives a card headed "🔮 Próximo llamado probable" with the expected window and the "aún no publicado" note. Verify with a live `tsx` count that `status:'sent'` rows for `type:'anticipado'` increased.

- [ ] **Step 4: Commit**

```bash
git add src/jobs/alerts/dispatch-push.ts src/jobs/alerts/dispatch-telegram.ts
git commit -m "feat(anticipacion): push + telegram dispatchers render anticipado forecasts"
```

---

### Task 7: In-app inbox rendering of `anticipado` rows

**Files:**
- Modify: the inbox read endpoint (locate) + its client card renderer.

**Interfaces:**
- Consumes: `TenderForecastModel`; `buildAnticipatedCard`.

- [ ] **Step 1: Locate the inbox surface**

Run: `grep -rn "channel.*inapp\|type.*alert" app/server/api app/pages app/components | grep -i notif` (and inspect `app/server/api/notifications*` / any `Inbox`/`AlertCard.vue` component). Identify: (a) the endpoint that lists a user's `channel:'inapp'` notifications, and (b) how each row is turned into a card (server-side `buildAlertCard` from the open call, or client-side).

- [ ] **Step 2: Add the anticipado branch at the inbox card build site**

Wherever the inbox builds a card from a notification (mirror of the dispatcher branch in Task 6): for `n.type === 'anticipado'`, load `TenderForecastModel.findById(n.forecastId)` and use `buildAnticipatedCard(...)` (same argument mapping as Task 6 Step 1c) instead of loading an open call. If the inbox currently only queries `OpenCallModel` by `compraId`, add a parallel forecast lookup for the anticipado rows and merge. Preserve the existing read-state (`readAt`) handling.

- [ ] **Step 3: Verify**

With a test user that has an in-app anticipado row (created by Task 5), fetch the inbox endpoint (`curl` with the session, or open the inbox UI at `localhost:3600`). Expect the anticipated card to render with the "próximo llamado probable" wording, the expected window, and a link to `/analytics/anticipacion?...` — not a broken `/llamados/<forecastId>` link.

- [ ] **Step 4: Commit**

```bash
git add <inbox endpoint + component paths>
git commit -m "feat(anticipacion): in-app inbox renders anticipado forecast cards"
```

---

### Task 8: Personalized endpoint + "Próximos para vos" in calendario

**Files:**
- Create: `app/server/api/app/anticipacion/mine.get.ts`
- Modify: `app/pages/app/calendario.vue`

**Interfaces:**
- Consumes: `requireUser` (`app/server/utils/auth`); `WatchModel`, `TenderForecastModel`; `watchMatchesCall`, `forecastToMatchView`.
- Produces: `GET /api/app/anticipacion/mine` → `{ success: true, data: { items } }` (auth-gated).

- [ ] **Step 1: Write the gated endpoint**

Create `app/server/api/app/anticipacion/mine.get.ts` (mirrors `calendar/index.get.ts` auth + shape):

```ts
import { defineEventHandler } from 'h3'
import { requireUser } from '../../../utils/auth'
import { connectToDatabase } from '../../../utils/database'
import { WatchModel, TenderForecastModel } from '../../../utils/models'
import { watchMatchesCall } from '../../../../../shared/matching/match'
import type { WatchInput } from '../../../../../shared/matching/match'
import { forecastToMatchView } from '../../../../../shared/forecast/synthetic-view'

export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  await connectToDatabase()
  const watches = await WatchModel.find({ userId: user.uid, active: true }).lean()
  if (!watches.length) return { success: true, data: { items: [] } }

  const forecasts = await TenderForecastModel.find({}).sort({ 'expectedWindow.start': 1 }).lean()
  const items = forecasts.filter((f) => {
    const view = forecastToMatchView({
      rubroAncestors: f.rubroAncestors, rubroLabel: f.rubroLabel, evidenceItems: f.evidenceItems,
      buyerId: f.buyerId, expectedAmount: f.expectedAmount ? { p50: f.expectedAmount.p50 } : undefined,
    })
    return watches.some((w) => watchMatchesCall(w as unknown as WatchInput, view))
  })
  return { success: true, data: { items } }
})
```

(Verify the `../` depth for the `shared/...` imports from `app/server/api/app/anticipacion/` — grep a sibling `app/server/api/app/**` file for how it imports `shared`, or use the repo's path alias if one exists.)

- [ ] **Step 2: Verify with curl (authenticated)**

Reproduce the auth the calendar endpoint expects (session cookie / bearer, however `server/middleware/auth.ts` reads it). Run `curl` against `localhost:3600/api/app/anticipacion/mine` with a session whose watches match a forecast → expect `{"success":true,"data":{"items":[…]}}`; with no watches → `items: []`; with no session → 401.

- [ ] **Step 3: Add the "Próximos para vos" section to calendario**

In `app/pages/app/calendario.vue`, add a second client-only fetch and render block above the existing `.cal__list`:

```ts
const { data: anticip } = await useFetch<{ data: { items: any[] } }>('/api/app/anticipacion/mine', { server: false })
const anticipItems = computed(() => anticip.value?.data?.items ?? [])
```

```vue
<section v-if="anticipItems.length" class="cal__anticip">
  <h2 class="cal__h2">{{ t('anticipacion.title') }}</h2>
  <ul class="cal__list">
    <li v-for="f in anticipItems" :key="f._id">
      <NuxtLink :to="localePath(`/analytics/anticipacion?buyer=${f.buyerId}&rubro=${f.rubroNodeId}`)" class="cal__card">
        <span class="cal__tag">{{ t('anticipacion.title') }}</span>
        <strong>{{ f.rubroLabel }}</strong> — {{ f.buyerName || f.buyerId }}
        <em>{{ new Date(f.expectedWindow.start).toLocaleDateString('es-UY', { month: 'short', year: 'numeric' }) }}</em>
      </NuxtLink>
    </li>
  </ul>
</section>
```

(Match the existing `calendario.vue` card markup/classes; reuse `t`, `localePath` already in scope. The `anticipacion.*` i18n keys were added in Fase 1 Task 7.)

- [ ] **Step 4: Verify the section renders**

Open `localhost:3600/app/calendario` as a logged-in test user with a matching watch → the "Próximos para vos" section lists the anticipated items above the existing saved/matched calendar.

- [ ] **Step 5: Commit**

```bash
git add app/server/api/app/anticipacion/mine.get.ts app/pages/app/calendario.vue
git commit -m "feat(anticipacion): personalized /api/app/anticipacion/mine + calendario section"
```

**NOTE — email channel deferred:** the anti-fatigue design includes email among external channels, but email alerts are rendered as a *bundled digest* via `renderAlertEmail` (`src/jobs/alerts/dispatch.ts`), which needs a parallel anticipated section/template. That is intentionally **out of scope for Fase 2 MVP** — inbox + push + telegram cover the "alertame" need. Track it as a Fase 2b follow-up.

---

### Task 9: Watch opt-in toggle (persist + UI)

**Files:**
- Modify: the watch create/update API handler(s) (locate under `app/server/api/watches/**`).
- Modify: the watch create/edit form component (locate — a `WatchForm`/`WatchDialog` under `app/components` or `app/pages/app/**`).

**Interfaces:**
- Consumes: `IWatch.anticipatedAlerts` (Task 1).

- [ ] **Step 1: Locate the watch write path + form**

Run: `grep -rn "WatchModel" app/server/api` (find the create/update handlers) and `grep -rln "categories\|keywords" app/components app/pages/app` (find the form). Confirm which fields the write handler currently whitelists from the request body.

- [ ] **Step 2: Persist the flag in the write handler**

In the create and update watch handlers, add `anticipatedAlerts` to the accepted/whitelisted body fields (mirror how `procurementMethods` or `keywordMode` is read), e.g.:

```ts
anticipatedAlerts: Boolean(body.anticipatedAlerts),
```

- [ ] **Step 3: Add the toggle to the form**

In the watch form component, add a Vuetify switch bound to the watch model, near the other alert options:

```vue
<v-switch v-model="form.anticipatedAlerts" color="primary" density="comfortable" hide-details
  :label="t('watches.anticipatedAlerts')"
  :messages="t('watches.anticipatedAlertsHint')" />
```

Add i18n keys `watches.anticipatedAlerts` (e.g. "Avisarme de llamados probables (anticipación)") and `watches.anticipatedAlertsHint` ("Estimación por patrón histórico; puede fallar.") to `es.json` + `en.json`. Ensure `form.anticipatedAlerts` is initialized (default `false`) in the form's reactive state and included in the create/update payload.

- [ ] **Step 4: Verify round-trip**

In the UI: create/edit a watch, enable the toggle, save. Confirm via a `tsx` query that the stored watch has `anticipatedAlerts:true`; reload the form → the switch reflects the saved state. Then re-run `npm run refresh-tender-forecast` → the fan-out (Task 5) now enqueues rows for that watch.

- [ ] **Step 5: Commit**

```bash
git add <watch api + form + i18n paths>
git commit -m "feat(anticipacion): per-watch opt-in toggle for anticipated alerts"
```

---

## Self-Review checklist (run before handoff)

- **Spec coverage (§U3):** opt-in flag (T1, T9), `anticipado` type + `forecastId` (T2), synthetic-view matcher reuse (T3), AlertCard variant + renderers (T4), fan-out with anti-fatigue confidence gate + idempotent dedupeKey (T5), dispatcher branches (T6), inbox (T7), personalized endpoint + calendario (T8). Email deferred with explicit note (T8).
- **Placeholder scan:** the only "locate" steps (T7 Step 1, T9 Step 1) are grep-first tasks whose transformation is fully specified; no code placeholder ships.
- **Type consistency:** `buildAnticipatedCard`'s `AnticipatedCardInput` (T4) matches the argument mapping used in the fan-out-adjacent dispatchers (T6) and inbox (T7). `forecastToMatchView`'s `ForecastMatchInput` (T3) matches the fields read in T5 and T8. `dedupeKey` format is identical in T5 (producer) and T5's assertion regex + the drain filters in T6.
- **Idempotency:** dedupeKey includes `expectedWindow.start`, so a monthly re-run with an unchanged window is a no-op (verified in T5).
- **Anti-fatigue honored:** external channels gated on `ALERT_THRESHOLD` in T5; inbox ungated (all collection rows are ≥`DISPLAY_THRESHOLD`).
