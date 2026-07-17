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
 * top as a fallback), respecting reduced-motion. The same component,
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
}>(), {
  sticky: false,
  scrollTargetId: undefined,
})

const emit = defineEmits<{ 'update:page': [value: number] }>()

const { t } = useI18n()

function go(to: number) {
  const next = Math.min(props.totalPages, Math.max(1, to))
  if (next === props.page) return
  emit('update:page', next)
  // Wait for the page value to propagate before moving the viewport; the
  // anchor sits above the list so its position is stable even before the
  // new rows have loaded.
  nextTick(scrollToTop)
}

function scrollToTop() {
  if (typeof window === 'undefined') return
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  const behavior: ScrollBehavior = reduce ? 'auto' : 'smooth'
  const el = props.scrollTargetId ? document.getElementById(props.scrollTargetId) : null
  if (el) el.scrollIntoView({ behavior, block: 'start' })
  else window.scrollTo({ top: 0, behavior })
}
</script>

<template>
  <nav
    class="pager"
    :class="{ 'pager--sticky': sticky }"
    :aria-label="t('common.page')"
  >
    <button
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

    <button
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
