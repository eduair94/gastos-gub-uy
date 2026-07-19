import { driver, type Driver, type DriveStep, type PopoverDOM } from 'driver.js'
import { buildTour, type TourId, type TourStep } from '~/utils/tours'

// ============================================================
// Cross-page guided-tour engine on top of driver.js.
//
// driver.js is single-page; our tours cross routes (/, /contracts, /llamados,
// /app/alertas, /app/cuenta). A tour is a flat, ordered list of steps, each tagged
// with the locale-agnostic `route` it belongs to (each route is one contiguous block).
// `resume()` runs on the current page: it slices the block of steps that live here,
// drives one driver.js instance over them, and — at a block boundary — persists the
// global index and navigates to the next page, where the layout-level <TourHost>
// route watcher calls resume() again.
//
// Progress survives navigation via sessionStorage (dies with the tab). A localStorage
// "seen" flag makes the first-visit welcome fire at most once.
// ============================================================

const SESSION_KEY = 'cltc-tour:v1' // active { tourId, stepIndex }
const SEEN_KEY = 'cltc-tour-seen' // welcome dismissed / a tour started

// Live driver instance + a re-entrancy guard. Client-only; shared singleton across the
// (few) components that call useTour() — only <TourHost> ever drives.
let activeDriver: Driver | null = null
let resuming = false

interface TourState { tourId: TourId | null, stepIndex: number }

/** Poll for an element for up to ~2.7s (survives async page/data mounts after navigation). */
function waitForEl(selector: string, tries = 30, delay = 90): Promise<Element | null> {
  return new Promise((resolve) => {
    let n = 0
    const check = () => {
      const el = document.querySelector(selector)
      if (el || n++ >= tries) return resolve(el)
      setTimeout(check, delay)
    }
    check()
  })
}

export function useTour() {
  const state = useState<TourState>('tour:state', () => ({ tourId: null, stepIndex: 0 }))
  const pickerOpen = useState<boolean>('tour:picker', () => false)
  const pickerWelcome = useState<boolean>('tour:picker-welcome', () => false)

  const { t } = useI18n()
  const localePath = useLocalePath()
  const route = useRoute()
  const router = useRouter()
  const { user } = useAuth()
  const authEnabled = useAuthEnabled()

  const tours: TourId[] = ['explore', 'alerts']

  function buildSteps(id: TourId): TourStep[] {
    return buildTour(id, {
      t: (k: string) => t(k),
      loggedIn: !!user.value,
      authEnabled,
    })
  }

  // ---- persistence ----------------------------------------
  function persist() {
    if (import.meta.client && state.value.tourId) {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(state.value))
    }
  }
  function markSeen() {
    if (import.meta.client) localStorage.setItem(SEEN_KEY, '1')
  }
  function hasSeen(): boolean {
    return import.meta.client && localStorage.getItem(SEEN_KEY) === '1'
  }
  /** Rehydrate an in-progress tour after a full page reload. */
  function rehydrate() {
    if (!import.meta.client || state.value.tourId) return
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return
    try {
      const parsed = JSON.parse(raw) as TourState
      if (parsed?.tourId && tours.includes(parsed.tourId)) state.value = parsed
    }
    catch { /* corrupt payload — ignore */ }
  }

  // ---- teardown -------------------------------------------
  function cleanup(seen: boolean) {
    activeDriver = null
    state.value = { tourId: null, stepIndex: 0 }
    if (import.meta.client) {
      sessionStorage.removeItem(SESSION_KEY)
      if (seen) markSeen()
    }
  }
  /** Programmatic end (last-step done, or an explicit stop). */
  function finish(seen = true) {
    if (activeDriver) activeDriver.destroy() // h(false): no onDestroyStarted
    cleanup(seen)
  }
  function endTour() {
    finish(true)
  }

  // ---- driving one page's block ---------------------------
  function decorate(popover: PopoverDOM, all: TourStep[], segStart: number) {
    const li = activeDriver?.getActiveIndex() ?? 0
    const gi = segStart + li
    // Global progress (driver's own is per-instance, i.e. per page — wrong across pages).
    popover.progress.style.display = 'block'
    popover.progress.innerText = t('tour.progress', { current: gi + 1, total: all.length })

    const step = all[gi]
    if (step?.action === 'login') {
      const cta = document.createElement('div')
      cta.className = 'driver-login-cta'
      const a = document.createElement('a')
      a.href = localePath('/login')
      a.textContent = t('tour.alerts.loginBtn')
      a.addEventListener('click', (e) => {
        e.preventDefault()
        finish(true)
        router.push({ path: localePath('/login'), query: { redirect: localePath('/app/alertas') } })
      })
      cta.appendChild(a)
      popover.description.appendChild(cta)
    }
  }

  function toDriveStep(all: TourStep[], s: TourStep, gi: number): DriveStep {
    const isLast = gi >= all.length - 1
    const hasPrev = gi > 0
    return {
      element: s.element,
      popover: {
        title: s.title,
        description: s.body,
        side: s.side,
        align: s.align,
        // Force "Siguiente" on a block-final step that continues on another page
        // (driver would otherwise show its per-instance "Listo"). Only the true last
        // step of the whole tour shows the done label.
        nextBtnText: isLast ? t('tour.done') : t('tour.next'),
        prevBtnText: t('tour.prev'),
        // Enable Back across page boundaries (driver disables it at a block's first step).
        disableButtons: hasPrev ? [] : ['previous'],
      },
    }
  }

  function goToStep(all: TourStep[], gi: number) {
    const target = all[gi]
    if (!target) { finish(true); return }
    state.value = { tourId: state.value.tourId, stepIndex: gi }
    persist()
    if (activeDriver) { activeDriver.destroy(); activeDriver = null } // h(false)

    const samePage = localePath(target.route) === route.path
    if (samePage && !target.query) {
      resume()
    }
    else {
      // Navigate; <TourHost>'s route watcher resumes on the destination page.
      router.push({ path: localePath(target.route), query: target.query })
    }
  }

  function driveSegment(all: TourStep[], seg: TourStep[], segStart: number) {
    const driveSteps = seg.map((s, li) => toDriveStep(all, s, segStart + li))

    activeDriver = driver({
      steps: driveSteps,
      animate: true,
      smoothScroll: true,
      allowClose: true,
      overlayColor: '#0f2233',
      overlayOpacity: 0.62,
      stagePadding: 6,
      stageRadius: 8,
      popoverOffset: 12,
      waitForElement: 800,
      skipMissingElement: true,
      showProgress: false, // we render global progress ourselves in decorate()
      showButtons: ['next', 'previous', 'close'],
      nextBtnText: t('tour.next'),
      prevBtnText: t('tour.prev'),
      doneBtnText: t('tour.done'),
      popoverClass: `tour-pop tour-pop--${state.value.tourId ?? 'explore'}`,
      // Clicking the dark overlay does nothing — only X / ESC exit, so a stray
      // click never drops the user out of the tour.
      overlayClickBehavior: () => {},
      onPopoverRender: (popover: PopoverDOM) => decorate(popover, all, segStart),
      onHighlighted: () => {
        // Keep the persisted global index current (for reload / dismissal).
        const li = activeDriver?.getActiveIndex() ?? 0
        state.value = { tourId: state.value.tourId, stepIndex: segStart + li }
        persist()
      },
      onNextClick: () => {
        const li = activeDriver?.getActiveIndex() ?? 0
        const gi = segStart + li
        if (li < seg.length - 1) { activeDriver?.moveNext(); return }
        if (gi >= all.length - 1) { finish(true); return } // tour complete
        goToStep(all, gi + 1) // cross to next page
      },
      onPrevClick: () => {
        const li = activeDriver?.getActiveIndex() ?? 0
        const gi = segStart + li
        if (li > 0) { activeDriver?.movePrevious(); return }
        if (gi > 0) goToStep(all, gi - 1) // cross back to previous page
      },
      // X / ESC (overlay is disabled above). Programmatic destroy() never lands here.
      onDestroyStarted: () => {
        if (activeDriver) activeDriver.destroy() // real teardown (h(false))
        cleanup(true)
      },
    })

    activeDriver.drive(0)
  }

  // ---- resume on the current page -------------------------
  async function resume() {
    if (!import.meta.client) return
    if (resuming || activeDriver?.isActive()) return
    const st = state.value
    if (!st.tourId) return

    resuming = true
    try {
      const steps = buildSteps(st.tourId)
      if (!steps.length || st.stepIndex >= steps.length) { cleanup(true); return }

      const cur = steps[st.stepIndex]
      // Not on the page this step belongs to → either we haven't navigated yet, or the
      // user navigated away manually. Either way, don't yank them around: end quietly.
      if (localePath(cur.route) !== route.path) { cleanup(true); return }

      // Collect the contiguous block of steps that live on this page.
      const seg: TourStep[] = []
      for (let i = st.stepIndex; i < steps.length && localePath(steps[i].route) === route.path; i++) {
        seg.push(steps[i])
      }
      const first = seg[0]
      if (first?.element) await waitForEl(first.element)

      // Guard against state/route changing during the await.
      if (state.value.tourId !== st.tourId || state.value.stepIndex !== st.stepIndex) return
      if (localePath(cur.route) !== route.path || activeDriver?.isActive()) return

      driveSegment(steps, seg, st.stepIndex)
    }
    finally {
      resuming = false
    }
  }

  // ---- public entry points --------------------------------
  function startTour(id: TourId) {
    closePicker()
    markSeen()
    const steps = buildSteps(id)
    if (!steps.length) return
    if (activeDriver) { activeDriver.destroy(); activeDriver = null }
    state.value = { tourId: id, stepIndex: 0 }
    persist()
    const first = steps[0]
    if (localePath(first.route) === route.path && !first.query) resume()
    else router.push({ path: localePath(first.route), query: first.query })
  }

  function openPicker(welcome = false) {
    pickerWelcome.value = welcome
    pickerOpen.value = true
  }
  function closePicker() {
    pickerOpen.value = false
  }
  /** Dismiss the picker without starting a tour, but don't nag again. */
  function dismissPicker() {
    markSeen()
    closePicker()
  }

  /** Auto-offer the tours on a visitor's first ever visit. */
  function maybeAutoStart() {
    if (!import.meta.client) return
    if (hasSeen() || state.value.tourId) return
    openPicker(true)
  }

  return {
    tours,
    state,
    pickerOpen,
    pickerWelcome,
    startTour,
    endTour,
    resume,
    rehydrate,
    openPicker,
    closePicker,
    dismissPicker,
    maybeAutoStart,
  }
}
