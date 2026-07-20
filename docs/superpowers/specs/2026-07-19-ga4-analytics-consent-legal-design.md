# GA4 analytics, cookie consent and the legal surface

**Date:** 2026-07-19
**Status:** approved, implemented
**Tag:** `G-E3V3E1LLC0`

## Why

The site has shipped a public API, a tender-alert product, a PWA, push and
Telegram delivery, a guided tour and a cold-email acquisition campaign — and
has measured exactly none of it. There is no analytics stack at all: the only
tracking code in the repo is a `track()` stub in `DonationCard.vue` that checks
for a `gtag` that is never loaded, so it has never fired.

Two consequences, and the second is the expensive one:

1. Nobody knows which surfaces are used.
2. The cold-email campaign has no ROI signal. `/registro?rubro=` pre-creates a
   watch, and there is no way to count how often that actually converts.

Adding a measurement tag also creates an obligation the site does not currently
meet: GA4 writes non-functional cookies, and there is no consent gate, no
privacy policy, no terms, and no published contact for a data subject to
exercise their rights under Ley 18.331.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Library | `nuxt-gtag@^3.0.3` | Purpose-built GA4 module, SSR-safe, Consent Mode v2 support. **v4 requires `@nuxt/kit ^4`; this repo is Nuxt 3.19.3**, so the v3 line is the ceiling. |
| Consent | Consent Mode v2 + banner | Refusing must be as easy as accepting. |
| `user_id` | SHA-256 of the Firebase uid | Cross-device funnels without handing Google an identifier that joins back to our DB. |
| Legal pages | `/privacidad`, `/terminos`, `/cookies` | A banner with nowhere to link is theatre. |
| Publisher | Eduardo Airaudo, personal project | Honest; also an E-E-A-T signal. Contact: `shellixs750@gmail.com`. |

## Consent state machine

Persisted at `localStorage['cltc-consent']` as `{ v: 1, choice, at }`, in the
site's existing `cltc-*` namespace. Bumping `v` re-asks everyone.

| State | gtag.js | Cookies | Banner |
|---|---|---|---|
| `unset` | loaded, `analytics_storage: denied` | none | shown |
| `granted` | loaded, consent updated to granted | `_ga`, `_ga_*` | hidden |
| `denied` | **never loaded**, `ga-disable-<id>` set | none | hidden |

`initMode: 'manual'` keeps the script off the wire until the decision is known,
while `nuxt-gtag` still queues `initCommands` into `dataLayer` first — so the
Consent Mode defaults are always the first thing GA processes.

## Architecture

Four new modules, one rewire:

- **`composables/useConsent.ts`** — the state machine above. Knows nothing
  about GA.
- **`composables/useAnalytics.ts`** — the only door to gtag. Context-free: the
  plugin hands it the gtag function once, so `track()` works from a component
  handler, a composable or a plain util. Enforces GA4's limits (25 params, 100
  chars) and strips PII: parameter names matching
  `email|token|secret|uid|phone|…` are dropped, and email addresses are scrubbed
  out of *values* (a reader can type one into a search box).
- **`utils/analytics-events.ts`** — the closed `AnalyticsEvent` union. A typo is
  a build error rather than a metric that silently never appears. Doubles as the
  documentation of what is measured, and by omission what is not.
- **`plugins/analytics.client.ts`** — owns the four things nothing else should:
  consent application, manual `page_view`, the outbound-link delegate, and
  `user_id`.
- **`components/DonationCard.vue`** — its dead `track()` stub now delegates to
  the real composable; its three call sites are unchanged.

### Two things that are non-obvious

**`send_page_view: false`.** This is SSR with `pageTransition` and i18n prefix
routes. gtag's automatic History listener double-counts and loses the locale, so
the plugin sends `page_view` by hand on `router.afterEach`, one tick late so the
page's own `useSeo()` has settled the title.

**One click delegate, not 45 edits.** External links appear in ~45 places
(gov records, pliego PDFs, investigation sources, GitHub, donations). A single
capture-phase listener on `document` classifies every `<a>`: cross-origin →
`outbound_click`, document extension → `document_open`, `mailto:`/`tel:` →
contact. Per-link tracking is therefore forbidden — it would double-count.

**`/docs` is a blind spot.** It is a Nitro route serving a hand-written HTML
string (Scalar), not a Nuxt page, so the SPA router never sees it. It carries
its own inline snippet that reads the same `cltc-consent` key.

### Dev safety

Measurement runs the full pipeline on `localhost` but logs instead of sending,
so instrumentation is verifiable in dev without polluting the production
property. `?ga_debug=1` sends for real.

## Events

~60 names, wired at chokepoints rather than sprinkled. Six edits cover most of
the surface area: `EntityAutocomplete.onModel`, `FilterRail.patch`, the
contracts explorer's debounced URL writer (one settled filter set = one event),
`DataPager.go`, `useAuth`'s method wrappers, and the click delegate.

Grouped: navigation/chrome · search & filtering · account · **alerts (the core
funnel)** · open calls · delivery channels · install · developer platform ·
engagement & trust. Full list with parameter shapes in
`app/utils/analytics-events.ts`; `KEY_EVENTS` there names the eight worth
marking as conversions in the GA4 UI.

The single most important one is `alert_precreated_from_campaign { rubro }` —
it is the ROI measurement for the cold-email campaign.

**Rules.** Parameters carry shape, never identity: counts, enums, booleans, and
IDs of *public* entities (contract, supplier, rubro). Events fire on the settled
result of a user action — never in a computed, a render, or a poll — and only
after the action succeeds, so a failed `alert_create` is not counted as one.

## Legal surface

- **`/privacidad`** — what is collected for anonymous visitors vs account
  holders; third parties (Google Analytics + Firebase, email provider, Telegram)
  including the honest statement of international transfer to the US; the real
  local-storage inventory; the hashed-`user_id` disclosure; rights under
  Ley 18.331 with the contact address and the URCDP as supervisory authority.
- **`/terminos`** — what the service is and is not (the authoritative source is
  comprasestatales.gub.uy; the data contains the government's own load errors,
  which the site itself publishes at `/analytics/errores-carga`); no warranty;
  acceptable use and API-key terms; accounts; attribution; Uruguayan law.
- **`/cookies`** — a real table of every storage key in use, the three consent
  situations, and a "change my decision" control that calls `reopen()`.
- **`error.vue`** — the site had none, so Nuxt's default page was showing.
- **`.well-known/security.txt`** — RFC 9116 contact.

Every claim in these pages must be checkable against the code. A privacy policy
that overstates is worse than none, so the verification pass cross-reads the
storage inventory and the "refusal means gtag.js never loads" claim against the
actual implementation.

## Verification

No test suite exists in this repo, and `nuxt typecheck`/`build` are
environment-broken here. Verification is therefore: ESLint over every touched
file, both locale files parsed and diffed for key parity, a dev-server smoke run
on :3600, and a browser check that (a) no request reaches
googletagmanager.com before a decision, (b) accepting produces `_ga`, and
(c) refusing produces zero requests.
