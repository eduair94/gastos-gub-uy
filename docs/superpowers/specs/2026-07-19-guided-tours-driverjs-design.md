# Guided Tours (driver.js) — Design

**Date:** 2026-07-19
**Status:** Approved, implementing
**Author:** Eduardo + Claude

## Goal

Add friendly, complete, cross-page guided tours to the gastos-gub dashboard using
[driver.js](https://driverjs.com) (v1.8.0), following product-tour best practice. Two
audiences, two tours:

1. **Explore spending** (public) — help a citizen see *where the money goes*.
2. **Get tender alerts** (auth-gated) — help a user *subscribe to llamados and receive
   email notifications*.

## Decisions (locked with user)

- **Trigger:** auto-start once on first visit (a welcome chooser), *plus* a permanent
  "?" help button in the header + drawer to replay any tour. A `cltc-tour-seen`
  localStorage flag prevents re-nagging.
- **Auth handling (Tour B):** *adaptive* — run the public part for everyone; at the
  account steps, logged-out users get a friendly "create a free account to finish" step
  with an **Ingresar** button; logged-in users walk the real WatchForm + email settings.
  If Firebase auth is disabled (`useAuthEnabled() === false`), Tour B degrades to the
  public part and hides its account steps entirely.
- **Scope:** cross-page journeys that navigate real pages and **resume** after each route
  change (progress persisted in `sessionStorage`).

## Architecture

driver.js is single-page; the tours cross routes. A thin engine sits on top.

### `app/composables/useTour.ts` — the engine

Global reactive state via `useState('tour:state', () => ({ tourId: null, stepIndex: 0 }))`
(SSR-friendly singleton, mirrors `useAuth`). A module-scoped `activeDriver` holds the live
driver.js instance (client only). Persistence:

- `sessionStorage['cltc-tour:v1']` — active `{ tourId, stepIndex }`, so an in-progress
  tour survives navigation but not a new tab/session.
- `localStorage['cltc-tour-seen']` — welcome dismissed / a tour started, so the auto-popup
  fires at most once.

API: `startTour(id)`, `endTour(markSeen)`, `resume()`, `openPicker()`, `closePicker()`,
`pickerOpen` (ref), plus internal `goToStep(globalIndex)`.

**Cross-page mechanics.** A tour is a flat, ordered list of steps, each tagged with the
locale-agnostic `route` it belongs to (each route appears as one contiguous block).
`resume()` runs on the current route: it slices the contiguous run of steps whose
`localePath(step.route) === route.path`, builds a driver.js instance for *just that
segment*, and `drive()`s from the right index. Navigation rides on driver.js's
`onNextClick` / `onPrevClick` hooks — defining them suppresses auto-advance, so the engine
decides: mid-segment → `moveNext()`/`movePrevious()`; at a segment boundary → persist the
new global index, `destroy()` (guarded by a `navigating` flag so it isn't treated as a
user-dismiss), and `router.push(localePath(nextStep.nav ?? nextStep.route))`. The
destination page's mount fires `resume()` again. A `waitForEl(selector)` poll (≤2.5s)
handles elements not yet mounted after navigation; `skipMissingElement: true` degrades
gracefully when an anchor is absent (e.g. the desktop filter rail on mobile).

Dismissal (X, ESC, overlay) → `onDestroyStarted` (when not `navigating`) → `endTour(true)`.

### `app/utils/tours.ts` — definitions

`buildTours({ t, user, authEnabled, localePath })` returns the two `TourDef`s. Each step:
`{ route, nav?, element?, title, description, side?, align?, showIf?, onBefore? }`.
Copy comes from i18n (`t('tour.…')`). Step visibility (`showIf`) branches Tour B on auth.

### Components

- `app/components/TourHost.vue` — mounted once in the layout (next to `<DonationCard/>`).
  Holds: (a) the route watcher that calls `resume()` after each navigation + on mount;
  (b) the first-visit auto-start; (c) the picker/welcome `v-dialog` (two big choices +
  "Ahora no"). Client-only work guarded by `import.meta.client`/`onMounted`.
- `app/components/TourLauncher.vue` — the "?" trigger. `variant="icon"` renders an
  `.iconbtn` (header, next to the theme toggle); `variant="drawer"` renders a
  `.drawer__pref` (mobile drawer). Both call `useTour().openPicker()`.

### Styling — `app/assets/scss/_tour.scss`

driver.css is loaded via `nuxt.config` `css`. `_tour.scss` (imported by `main.scss`)
restyles `.driver-popover` to the token system (surface, text, rule, radius, shadow) and
themes dark via `[data-theme="dark"]` (set on `<html>`, so it reaches the body-teleported
popover). A subtle `--sol` (money-gold) accent on Tour A's popovers; neutral celeste on
Tour B. Respects `prefers-reduced-motion`.

## Tours

### Tour A — "explore" (public, ~6 steps)
1. `/` — hero search (`[data-tour="hero-search"]`): search anything.
2. `/` — centered: "te llevo al explorador" → navigates to `/contracts`.
3. `/contracts` — filter rail (`[data-tour="explorer-filters"]`).
4. `/contracts` — KPI strip (`[data-tour="explorer-kpis"]`): totals / typical.
5. `/contracts` — results table (`[data-tour="explorer-table"]`): click a row for detail.
6. `/contracts` — centered wrap-up: pointers to anomalies / suppliers / buyers. Done.

### Tour B — "alerts" (adaptive, ~3 public + up to 10 account steps)
Public (`/llamados`): search (`[data-tour="llamados-search"]`) → first card
(`[data-tour="llamados-card"]`) → "Crear alerta" CTA (`[data-tour="llamados-cta"]`).

- **Logged out** (`showIf: !user`): centered "creá una cuenta gratis" step with an injected
  **Ingresar** link (`onBefore`/`onPopoverRender`) → `/login?redirect=/app/alertas`. Ends.
- **Logged in** (`showIf: !!user`): navigate `/app/alertas?new=1` → WatchForm walk (name →
  products/rubros → keywords → refine → live preview → save) → navigate `/app/cuenta` →
  email row ("verificá tu email") → enable toggle → frequency → save. Done.

## Anchors to add (`data-tour`)

- `layouts/default.vue`: `hero`/nav search already have ids; add nothing for nav (overflow
  menu makes nav-link targeting unreliable — tours target search + page landmarks instead).
- `pages/index.vue`: `hero-search` on the hero search wrapper.
- `pages/contracts/index.vue`: `explorer-filters` (rail), `explorer-kpis` (`.strip`),
  `explorer-table` (`.ctable`).
- `pages/llamados/index.vue`: `llamados-search` (`.llamados__search`), `llamados-cta`
  (`.llamados__cta`); `OpenCallCard.vue`: `llamados-card` on the first card via
  `:data-tour` on the list, or card root gets the attr and tour targets `:first-child`.
- `pages/app/alertas.vue`: `alert-new`; `WatchForm.vue`: `alert-name`, `alert-products`
  (`.wform__cat`), `alert-keywords`, `alert-refine` (`.wform__refine`), `alert-preview`
  (`.wform__preview`), `alert-save`.
- `pages/app/cuenta.vue`: `account-email`, `notif-enabled`, `notif-frequency`, `notif-save`.

## i18n

A `tour.*` namespace added to **both** `app/i18n/locales/es.json` and `en.json`
(Spanish authored first): button labels (`next`/`prev`/`done`/`close`/`progress`), the
welcome/picker copy, and every step's `title` + `body`. driver.js button/progress config is
fed from these keys per driver instance.

## Files

**New:** `composables/useTour.ts`, `utils/tours.ts`, `components/TourHost.vue`,
`components/TourLauncher.vue`, `assets/scss/_tour.scss`.
**Edited:** `nuxt.config.ts` (css), `layouts/default.vue` (help button ×2, `<TourHost/>`),
`pages/index.vue`, `pages/contracts/index.vue`, `components/FilterRail.vue`,
`pages/llamados/index.vue`, `components/OpenCallCard.vue`, `pages/app/alertas.vue`,
`components/WatchForm.vue`, `pages/app/cuenta.vue`, both locale JSONs, `assets/scss/main.scss`.

## Verification

Test-less repo. Verify with: targeted `nuxt typecheck` (or `tsc`) on touched files; run the
dev server and **drive both tours end-to-end in a real browser via Playwright MCP** —
logged-out and logged-in, light and dark theme, desktop and a narrow viewport — confirming
navigation + resume across routes works and no anchor is missing.

## Non-goals / YAGNI

- No per-llamado bookmark tour (yields only deadline reminders, not match alerts).
- No analytics/telemetry on tour completion (can add later).
- No driver.js "hints" module.
- Nav-link highlighting (overflow menu makes it unreliable).
