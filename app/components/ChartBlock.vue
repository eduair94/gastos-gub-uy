<script setup lang="ts">
/**
 * The one titled chart section.
 *
 * Every chart on the site sits in the same box: a heading, an optional line of
 * help, the chart, an optional footnote. That box was being rebuilt per page —
 * `.block__head + .panel.panel--pad + .u-scroll-x` in curros / recopilatorios /
 * products, `.panel__t/.panel__s/.chartscroll` in the analytics pages — and each
 * copy made its own call about overflow. One copy (products/[code]) forgot the
 * scroller entirely and the whole page scrolled sideways on a phone.
 *
 * So overflow is not a decision the caller gets to make:
 *
 *  - `min-width: 0` on the root, the head, the title and the frame, because a
 *    grid/flex item defaults to `min-width: auto` and would otherwise adopt the
 *    chart's floor (`.hb { min-width: 480px }`, `.sc { min-width: 560px }`) as
 *    its own minimum and drag its whole track past the viewport.
 *  - the body is the ONLY scroll container, and it is `.u-scroll-x` (which adds
 *    `overscroll-behavior-x: contain`, so swiping a chart cannot trigger the
 *    browser's back gesture).
 *  - when it does scroll it says so. Data behind an undiscoverable gesture is
 *    data we did not publish: the travelable edge dissolves and the heading
 *    gains a `⇄`. The fade is painted by an overlay on the FRAME, never as a
 *    mask on the scroller itself — a mask would clip that element's own focus
 *    ring, and the scroller is focusable precisely so a keyboard can reach the
 *    rest of the chart.
 *
 * Pass `:scroll="false"` for charts that are already fluid (YearBars,
 * TreemapChart, MapChoropleth) — a scroller would only add a phantom scrollbar.
 *
 *   <ChartBlock
 *     :title="t('curros.suppliersTitle')"
 *     :help="t('curros.suppliersHelp')"
 *   >
 *     <InvHBars :items="supplierBars" format="money" :row-height="30" />
 *   </ChartBlock>
 */
withDefaults(defineProps<{
  title: string
  /** One line under the heading: what the chart measures, or its caveat. */
  help?: string
  /** Footnote under the frame — source, cut-off date, method link. */
  meta?: string
  /** Put the head inside the bordered box (the analytics card shape) instead of above it. */
  framed?: boolean
  /** Wrap the body in the horizontal scroller. Off for charts that are already fluid. */
  scroll?: boolean
  /** Heading rank — follows the document outline, and the size follows the rank. */
  level?: 2 | 3
}>(), {
  framed: false,
  scroll: true,
  level: 2,
})

const viewport = ref<HTMLElement | null>(null)
const overflowing = ref(false)
const atStart = ref(true)
const atEnd = ref(true)
/** Latched: once the region has been given a tab stop it keeps it. A resize
 *  that momentarily clears the overflow would otherwise drop focus to <body>
 *  out from under whoever was scrolling it. */
const focusable = ref(false)

/** 1px of slack: fractional layout widths report a sub-pixel overflow at
 *  non-integer zoom / DPR, which would light the hint on a chart that fits. */
function measure() {
  const el = viewport.value
  if (!el) return
  const max = el.scrollWidth - el.clientWidth
  overflowing.value = max > 1
  if (overflowing.value) focusable.value = true
  atStart.value = el.scrollLeft <= 1
  atEnd.value = el.scrollLeft >= max - 1
}

let ro: ResizeObserver | undefined
let mo: MutationObserver | undefined

/** The content is a moving target: <ClientOnly> swaps its placeholder for the
 *  real chart, and Chart.js then sizes the canvas itself. Observing whatever
 *  child existed at mount is not enough — that node gets detached and the
 *  measurement latches on whatever was true mid-hydration (which showed a
 *  permanent "scrollable" hint on a chart that fits). Re-bind on every swap. */
function observeChildren() {
  const el = viewport.value
  if (!el || !ro) return
  for (const child of el.children) ro.observe(child)
}

let settle: ReturnType<typeof setTimeout> | undefined

onMounted(() => {
  const el = viewport.value
  if (!el) return
  measure()
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(measure)
    ro.observe(el)
    observeChildren()
  }
  if (typeof MutationObserver !== 'undefined') {
    mo = new MutationObserver(() => {
      observeChildren()
      measure()
    })
    mo.observe(el, { childList: true, subtree: true })
  }
  // Belt and braces. The observers cover container- and content-driven changes,
  // but a ResizeObserver that is torn down or throttled would leave a stale
  // "scrollable" hint on a chart that fits — the exact failure this component
  // exists to avoid. A window listener catches every real-world reflow, and one
  // late pass catches Chart.js finishing its 420ms entry animation.
  window.addEventListener('resize', measure, { passive: true })
  settle = setTimeout(measure, 600)
})

onBeforeUnmount(() => {
  ro?.disconnect()
  mo?.disconnect()
  window.removeEventListener('resize', measure)
  if (settle) clearTimeout(settle)
})
</script>

<template>
  <section
    class="cb"
    :class="{ 'cb--framed': framed, 'cb--l3': level === 3 }"
  >
    <div class="cb__head">
      <component
        :is="level === 3 ? 'h3' : 'h2'"
        class="cb__t"
      >
        {{ title }}<span
          v-if="overflowing"
          class="cb__swipe"
          aria-hidden="true"
        >⇄</span>
      </component>
      <div
        v-if="$slots.actions"
        class="cb__actions"
      >
        <slot name="actions" />
      </div>
      <p
        v-if="help"
        class="cb__help"
      >
        {{ help }}
      </p>
    </div>

    <div
      class="cb__frame"
      :class="{ 'is-fade-s': overflowing && !atStart, 'is-fade-e': overflowing && !atEnd }"
    >
      <div
        v-if="scroll"
        ref="viewport"
        class="cb__vp u-scroll-x"
        :role="focusable ? 'region' : undefined"
        :aria-label="focusable ? title : undefined"
        :tabindex="focusable ? 0 : undefined"
        @scroll.passive="measure"
      >
        <slot />
      </div>
      <div
        v-else
        class="cb__vp"
      >
        <slot />
      </div>
    </div>

    <p
      v-if="meta || $slots.meta"
      class="cb__meta"
    >
      <slot name="meta">
        {{ meta }}
      </slot>
    </p>
  </section>
</template>

<style scoped>
/* min-width:0 at every level: the chart's own min-width must never become
   this block's minimum, or the grid track it sits in widens the page. */
.cb { min-width: 0; }

.cb__head {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: var(--s-1) var(--s-4);
  min-width: 0;
}

.cb__t {
  margin: 0;
  min-width: 0;
  font-size: var(--t-xl);
  line-height: 1.06;
  overflow-wrap: break-word;
}
.cb--l3 .cb__t { font-size: var(--t-lg); }

/* The swipe glyph is the whole scroll affordance: it rides the heading, so it
   never covers a data row the way a pill floating over the chart would. */
.cb__swipe {
  margin-left: var(--s-2);
  font-family: var(--font-mono);
  font-size: var(--t-sm);
  font-weight: 400;
  color: var(--text-muted);
  vertical-align: 0.12em;
}

.cb__actions { flex: 0 0 auto; font-size: var(--t-sm); }

/* The help never competes with the heading for width — it takes the full row
   beneath it, same rule as .panel__head in main.scss. */
.cb__help {
  flex: 1 1 100%;
  margin: var(--s-2) 0 0;
  max-width: 70ch;
  font-size: var(--t-sm);
  line-height: 1.5;
  color: var(--text-muted);
}

.cb__frame {
  position: relative;
  min-width: 0;
  margin-top: var(--s-4);
  padding: var(--s-5);
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
}

/* Framed: the box moves out to the root and swallows the head, which is the
   analytics card shape. No second border, no DOM branch. */
.cb--framed {
  padding: var(--s-5);
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
  height: 100%;
}

.cb--framed .cb__frame {
  padding: 0;
  background: none;
  border: 0;
  border-radius: 0;
}

.cb__vp { min-width: 0; }

/* Edge fade — an overlay on the FRAME, not a mask on the scroller, so the
   scroller keeps its own focus ring intact. `pointer-events: none` so it never
   eats a drag on the chart underneath. */
.cb__frame::before,
.cb__frame::after {
  content: "";
  position: absolute;
  top: 1px;
  bottom: 1px;
  width: var(--s-6);
  pointer-events: none;
  opacity: 0;
  transition: opacity var(--dur) var(--ease);
  border-radius: inherit;
}
.cb__frame::before {
  left: 1px;
  background: linear-gradient(90deg, var(--surface), transparent);
}
.cb__frame::after {
  right: 1px;
  background: linear-gradient(270deg, var(--surface), transparent);
}
.cb__frame.is-fade-s::before,
.cb__frame.is-fade-e::after { opacity: 1; }

.cb__meta {
  margin: var(--s-3) 0 0;
  max-width: 80ch;
  font-size: var(--t-xs);
  line-height: 1.5;
  color: var(--text-muted);
}

@media (max-width: 480px) {
  .cb__frame { padding: var(--s-4); }
  .cb--framed { padding: var(--s-4); }
}
</style>
