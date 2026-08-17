<script setup lang="ts">
/**
 * The one pager.
 *
 * Every list on the site repeated the same prev / "page X of Y" / next
 * markup, and none of them moved the viewport on a page change — so on a
 * phone you tapped "next" at the bottom of the list and stayed pinned to
 * the bottom, reading the last rows of a page you'd never seen the top of.
 *
 * This owns that behaviour in one place: changing the page scrolls back
 * to the top of the results (the `scrollTargetId` anchor, or the window
 * top as a fallback), respecting reduced-motion. It scrolls to a
 * coordinate measured before the page changes, and holds that coordinate
 * while the new rows load — the anchor itself is usually unmounted in
 * between, and the shrunken document clamps the scroll. The same component,
 * passed `sticky`, renders a compact bar that pins under the app header
 * so the reader can page without hunting for the control at the foot of a
 * long list.
 *
 * Bind it `v-model:page`; it clamps to [1, totalPages] itself, so callers
 * can pass a raw or a clamped page and never emit an out-of-range value.
 */
const props = withDefaults(defineProps<{
  page: number
  totalPages: number
  /** Render as a compact bar that sticks below the app header. */
  sticky?: boolean
  /** Id of the element to bring to the top of the viewport on a page change. */
  scrollTargetId?: string
  /**
   * Query key that carries the page number in the URL. Default `'page'`.
   *
   * Pass `null` ONLY when the host page keeps `page` in local state and never
   * reads it back from the query string. Both controls then fall back to plain
   * buttons. Getting this wrong is a soft-404 generator: the link would promise
   * `?page=2` and a cold load of that URL would render page 1.
   * The two opt-outs today are `investigaciones/casos/index.vue` and
   * `investigaciones/temas/[tema].vue`.
   */
  pageQueryKey?: string | null
}>(), {
  sticky: false,
  scrollTargetId: undefined,
  pageQueryKey: 'page',
})

const emit = defineEmits<{ 'update:page': [value: number] }>()

/** A reader gesture cancels the pending landing. */
const GESTURES = ['wheel', 'touchstart', 'keydown'] as const

const { t } = useI18n()
const { track } = useAnalytics()
const route = useRoute()
const router = useRouter()

/**
 * WARNING: this pager used to be two `<button>`s and nothing else. Googlebot
 * does not click buttons, so every directory on the site was crawlable at page
 * one and no further — 43k suppliers and 46k products sat behind a control no
 * crawler could operate. They were in the sitemap, so they got indexed, but no
 * internal link ever pointed at them and none of the site's authority reached
 * them.
 *
 * The controls are real `<a href>` now. The href is the same URL the JS
 * produces, so a crawler, a middle-click and a right-click "open in new tab"
 * all land on a page that renders exactly what the link promised. A plain left
 * click still runs `go()` — the scroll-restore behaviour below is unchanged.
 *
 * These are plain `<a>`, NOT `<NuxtLink>`, on purpose: NuxtLink prefetches on
 * interaction, and prefetching the next page of a 40k-row directory on every
 * hover is a lot of wasted transfer for a control the reader may never use.
 */
function hrefFor(target: number): string | undefined {
  if (!props.pageQueryKey) return undefined
  const n = Math.min(props.totalPages, Math.max(1, target))
  const key = props.pageQueryKey
  // Page one is the bare URL. Emitting `?page=1` would advertise a second URL
  // for content the canonical already covers, so the key is dropped rather than
  // set — rebuilt by filter, because `delete` on a computed key is banned here.
  const query: Record<string, unknown> = Object.fromEntries(
    Object.entries(route.query).filter(([k]) => k !== key),
  )
  if (n > 1) query[key] = String(n)
  return router.resolve({ path: route.path, query }).fullPath
}

/** True for a click the browser should handle itself (new tab, new window, download). */
function isModified(e: MouseEvent): boolean {
  return e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0
}

function onNavigate(e: MouseEvent, target: number) {
  if (isModified(e)) return
  e.preventDefault()
  go(target)
}

function go(to: number) {
  const next = Math.min(props.totalPages, Math.max(1, to))
  if (next === props.page) return
  // Every paginated list on the site pages through here (PaginatedList renders
  // two of these), so the measurement lives at the choke point rather than
  // being re-wired — and differently — on each page.
  track('list_paginate', {
    surface: route.path,
    page: next,
    direction: next > props.page ? 'next' : 'prev',
  })
  // Measure BEFORE the emit. Most pages swap the results block for a loading
  // indicator on a page change, so the anchor is gone by the time the emit has
  // propagated: a lookup after it finds nothing and the reader is thrown to the
  // top of the DOCUMENT instead of the top of the list. A coordinate survives
  // the swap; an element reference does not.
  const y = anchorTop()
  emit('update:page', next)
  nextTick(() => land(y))
}

/**
 * Document Y of the results anchor, already clear of the sticky header.
 * `null` when there is no anchor — the caller then falls back to the page top.
 */
function anchorTop(): number | null {
  if (typeof window === 'undefined') return null
  const el = props.scrollTargetId ? document.getElementById(props.scrollTargetId) : null
  if (!el) return null
  // Honour the anchor's own scroll-margin when it sets one (PaginatedList does).
  // Otherwise clear the header here, so a page that only passes an id still
  // lands on the first row instead of under the bar.
  const own = Number.parseFloat(getComputedStyle(el).scrollMarginTop) || 0
  const offset = own || headerClearance()
  return Math.max(0, el.getBoundingClientRect().top + window.scrollY - offset)
}

function headerClearance(): number {
  const root = getComputedStyle(document.documentElement)
  const h = Number.parseFloat(root.getPropertyValue('--header-h')) || 0
  const gap = Number.parseFloat(root.getPropertyValue('--s-3')) || 12
  return h + gap
}

function maxScroll(): number {
  return Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
}

/** Bring `y` to the top of the viewport, and hold it while the rows load. */
function land(y: number | null) {
  if (typeof window === 'undefined') return
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  const target = y ?? 0
  window.scrollTo({ top: target, behavior: reduce ? 'auto' : 'smooth' })
  if (target === 0) return

  // While the rows load, the document can be shorter than `target` — a 50-row
  // table becomes a 4px progress bar. The browser clamps the scroll and the
  // reader still lands above the list. So keep the target until the new rows
  // restore the height, then close the gap. Any touch, wheel or key hands
  // control back to the reader at once.
  const deadline = performance.now() + 1500
  let raf = 0
  let last = -1
  let still = 0

  const stop = () => {
    cancelAnimationFrame(raf)
    for (const ev of GESTURES) window.removeEventListener(ev, stop)
  }

  const step = (now: number) => {
    if (now > deadline) return stop()
    const at = Math.round(window.scrollY)
    still = at === last ? still + 1 : 0
    last = at
    // Two identical frames mean the smooth scroll ended or hit the clamp.
    if (still >= 2 && Math.abs(at - target) > 2 && maxScroll() >= target - 1) {
      window.scrollTo({ top: target, behavior: 'auto' })
    }
    raf = requestAnimationFrame(step)
  }

  for (const ev of GESTURES) window.addEventListener(ev, stop, { passive: true })
  raf = requestAnimationFrame(step)
}
</script>

<template>
  <nav
    class="pager"
    :class="{ 'pager--sticky': sticky }"
    :aria-label="t('common.page')"
  >
    <a
      v-if="pageQueryKey && page > 1"
      class="pager__b"
      rel="prev"
      :href="hrefFor(page - 1)"
      @click="onNavigate($event, page - 1)"
    >
      <v-icon size="16">
        mdi-chevron-left
      </v-icon>
      <span class="pager__bt">{{ t('common.previous') }}</span>
    </a>
    <button
      v-else
      class="pager__b"
      type="button"
      :disabled="page <= 1"
      @click="go(page - 1)"
    >
      <v-icon size="16">
        mdi-chevron-left
      </v-icon>
      <span class="pager__bt">{{ t('common.previous') }}</span>
    </button>

    <span class="pager__n">
      {{ t('common.page') }} <strong>{{ formatNumber(page) }}</strong> {{ t('common.of') }} {{ formatNumber(totalPages) }}
    </span>

    <a
      v-if="pageQueryKey && page < totalPages"
      class="pager__b"
      rel="next"
      :href="hrefFor(page + 1)"
      @click="onNavigate($event, page + 1)"
    >
      <span class="pager__bt">{{ t('common.next') }}</span>
      <v-icon size="16">
        mdi-chevron-right
      </v-icon>
    </a>
    <button
      v-else
      class="pager__b"
      type="button"
      :disabled="page >= totalPages"
      @click="go(page + 1)"
    >
      <span class="pager__bt">{{ t('common.next') }}</span>
      <v-icon size="16">
        mdi-chevron-right
      </v-icon>
    </button>
  </nav>
</template>

<style scoped>
.pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--s-4);
}

.pager__b {
  display: inline-flex;
  align-items: center;
  gap: var(--s-1);
  padding: var(--s-2) var(--s-4);
  border: 1px solid var(--rule-strong);
  border-radius: var(--r-md);
  background: var(--surface);
  color: var(--text);
  font-family: var(--font-body);
  font-size: var(--t-sm);
  font-weight: 600;
  cursor: pointer;
  transition: background var(--dur) var(--ease);
  /* The navigable controls are <a> now (see hrefFor). Without this they pick up
     the global link underline and colour and stop reading as buttons. */
  text-decoration: none;
}

.pager__b:disabled { opacity: 0.4; cursor: not-allowed; }
.pager__b:not(:disabled):hover { background: var(--surface-sunken); }

.pager__n {
  font-family: var(--font-mono);
  font-size: var(--t-sm);
  color: var(--text-muted);
  white-space: nowrap;
}

/* ---- Sticky top variant ---- */
.pager--sticky {
  position: sticky;
  top: var(--header-h);
  z-index: 20;
  justify-content: space-between;
  gap: var(--s-3);
  margin-bottom: var(--s-4);
  padding: var(--s-2) var(--s-3);
  border: 1px solid var(--rule);
  border-radius: var(--r-md);
  background: color-mix(in srgb, var(--surface) 90%, transparent);
  backdrop-filter: blur(8px);
  box-shadow: var(--shadow-1);
}

.pager--sticky .pager__n {
  font-size: var(--t-xs);
}

/* On a phone the labels crowd the bar; the chevrons carry the meaning. */
@media (max-width: 560px) {
  .pager--sticky .pager__bt {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
  }

  .pager--sticky .pager__b {
    padding: var(--s-2);
  }
}
</style>
