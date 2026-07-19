// Guided-tour definitions. Each tour is a flat, ordered list of steps; the engine
// (composables/useTour.ts) slices the steps by `route` and drives one driver.js
// instance per page, navigating + resuming across route boundaries.
//
// Copy lives in i18n (`tour.*`) — see i18n/locales/{es,en}.json. Steps are built fresh
// on every resume, so `loggedIn` / `authEnabled` reflect the current auth state and the
// alerts tour adapts (public part for everyone; account walkthrough only when logged in).
import type { Alignment, Side } from 'driver.js'

export type TourId = 'explore' | 'alerts'

export interface TourStep {
  /** Locale-agnostic path this step belongs to (matched against the current route). */
  route: string
  /** Query to attach when navigating to this step's page (e.g. `{ new: '1' }` to open a form). */
  query?: Record<string, string>
  /** CSS selector to highlight. Omit for a centered modal step. */
  element?: string
  title: string
  body: string
  side?: Side
  align?: Alignment
  /** Special popover behaviour, e.g. inject a "sign in" button on the login step. */
  action?: 'login'
}

export interface TourCtx {
  t: (key: string) => string
  loggedIn: boolean
  authEnabled: boolean
}

export function buildTour(id: TourId, ctx: TourCtx): TourStep[] {
  const { t, loggedIn, authEnabled } = ctx

  if (id === 'explore') {
    return [
      {
        route: '/',
        element: '[data-tour="hero-search"]',
        title: t('tour.explore.heroTitle'),
        body: t('tour.explore.heroBody'),
        side: 'bottom',
        align: 'center',
      },
      {
        route: '/',
        title: t('tour.explore.bridgeTitle'),
        body: t('tour.explore.bridgeBody'),
      },
      {
        route: '/contracts',
        element: '[data-tour="explorer-filters"]',
        title: t('tour.explore.filtersTitle'),
        body: t('tour.explore.filtersBody'),
        side: 'right',
        align: 'start',
      },
      {
        route: '/contracts',
        element: '[data-tour="explorer-kpis"]',
        title: t('tour.explore.kpisTitle'),
        body: t('tour.explore.kpisBody'),
        side: 'bottom',
        align: 'start',
      },
      {
        route: '/contracts',
        element: '[data-tour="explorer-table"]',
        title: t('tour.explore.tableTitle'),
        body: t('tour.explore.tableBody'),
        side: 'top',
        align: 'center',
      },
      {
        route: '/contracts',
        title: t('tour.explore.doneTitle'),
        body: t('tour.explore.doneBody'),
      },
    ]
  }

  // id === 'alerts' — public part shown to everyone.
  const steps: TourStep[] = [
    {
      route: '/llamados',
      element: '[data-tour="llamados-search"]',
      title: t('tour.alerts.searchTitle'),
      body: t('tour.alerts.searchBody'),
      side: 'bottom',
      align: 'start',
    },
    {
      route: '/llamados',
      element: '[data-tour="llamados-grid"] .occard',
      title: t('tour.alerts.cardTitle'),
      body: t('tour.alerts.cardBody'),
      side: 'top',
      align: 'center',
    },
    {
      route: '/llamados',
      element: '[data-tour="llamados-cta"]',
      title: t('tour.alerts.ctaTitle'),
      body: t('tour.alerts.ctaBody'),
      side: 'bottom',
      align: 'end',
    },
  ]

  if (loggedIn) {
    // The real walkthrough: create a saved-search alert, then turn on email.
    steps.push(
      {
        route: '/app/alertas',
        query: { new: '1' },
        element: '[data-tour="alert-name"]',
        title: t('tour.alerts.nameTitle'),
        body: t('tour.alerts.nameBody'),
        side: 'bottom',
        align: 'start',
      },
      {
        route: '/app/alertas',
        element: '[data-tour="alert-products"]',
        title: t('tour.alerts.productsTitle'),
        body: t('tour.alerts.productsBody'),
        side: 'top',
        align: 'start',
      },
      {
        route: '/app/alertas',
        element: '[data-tour="alert-keywords"]',
        title: t('tour.alerts.keywordsTitle'),
        body: t('tour.alerts.keywordsBody'),
        side: 'top',
        align: 'start',
      },
      {
        route: '/app/alertas',
        element: '[data-tour="alert-refine"]',
        title: t('tour.alerts.refineTitle'),
        body: t('tour.alerts.refineBody'),
        side: 'top',
        align: 'start',
      },
      {
        route: '/app/alertas',
        element: '[data-tour="alert-preview"]',
        title: t('tour.alerts.previewTitle'),
        body: t('tour.alerts.previewBody'),
        side: 'top',
        align: 'start',
      },
      {
        route: '/app/alertas',
        element: '[data-tour="alert-save"]',
        title: t('tour.alerts.saveTitle'),
        body: t('tour.alerts.saveBody'),
        side: 'top',
        align: 'center',
      },
      {
        route: '/app/cuenta',
        element: '[data-tour="account-email"]',
        title: t('tour.alerts.emailTitle'),
        body: t('tour.alerts.emailBody'),
        side: 'bottom',
        align: 'start',
      },
      {
        route: '/app/cuenta',
        element: '[data-tour="notif-enabled"]',
        title: t('tour.alerts.enableTitle'),
        body: t('tour.alerts.enableBody'),
        side: 'bottom',
        align: 'start',
      },
      {
        route: '/app/cuenta',
        element: '[data-tour="notif-frequency"]',
        title: t('tour.alerts.freqTitle'),
        body: t('tour.alerts.freqBody'),
        side: 'bottom',
        align: 'start',
      },
      {
        route: '/app/cuenta',
        element: '[data-tour="notif-save"]',
        title: t('tour.alerts.finishTitle'),
        body: t('tour.alerts.finishBody'),
        side: 'top',
        align: 'center',
      },
    )
  }
  else if (authEnabled) {
    // Logged out but accounts exist: explain the free account and offer sign-in.
    steps.push({
      route: '/llamados',
      title: t('tour.alerts.loginTitle'),
      body: t('tour.alerts.loginBody'),
      action: 'login',
    })
  }
  // authEnabled === false: no accounts on this deployment — the tour simply ends
  // after the public CTA step.

  return steps
}
