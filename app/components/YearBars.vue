<script setup lang="ts">
/**
 * Spending by year. Bars are gold because they are money — the same
 * rule the magnitude scale follows.
 *
 * Deliberately not chart.js: this is one series of ~24 bars, and a
 * canvas chart would ship 60kb, render nothing server-side, and be
 * invisible to a screen reader. Plain elements are lighter, SSR fine,
 * and keyboard reachable.
 */
const props = withDefaults(defineProps<{
  data: { year: number, value: number, count?: number }[]
  height?: number
  /** Called when a bar is activated. Omit to render a non-interactive chart. */
  hrefFor?: (year: number) => string | undefined
}>(), { height: 150 })

const { t } = useI18n()

// Linear here, unlike the magnitude rule: within one series the reader
// is comparing years to each other, and a log axis would flatten real
// differences in annual spend.
const max = computed(() => Math.max(...props.data.map(d => d.value), 1))

const bars = computed(() =>
  props.data.map(d => ({
    ...d,
    pct: Math.max((d.value / max.value) * 100, 0.8),
  })),
)
</script>

<template>
  <div class="yb">
    <ol
      class="yb__plot"
      :style="{ '--h': `${height}px` }"
    >
      <li
        v-for="b in bars"
        :key="b.year"
        class="yb__col"
      >
        <component
          :is="hrefFor?.(b.year) ? 'NuxtLink' : 'div'"
          :to="hrefFor?.(b.year)"
          class="yb__hit"
          :title="`${b.year}: ${formatMoney(b.value, 'UYU', { compact: true })}${b.count ? ` · ${formatNumber(b.count)} ${t('common.contracts').toLowerCase()}` : ''}`"
        >
          <span class="yb__track">
            <span
              class="yb__bar"
              :style="{ height: `${b.pct}%` }"
            />
          </span>
          <span class="yb__year">{{ String(b.year).slice(2) }}</span>
        </component>
      </li>
    </ol>
  </div>
</template>

<style scoped>
.yb {
  width: 100%;
}

.yb__plot {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.yb__col {
  flex: 1 1 0;
  min-width: 0;
}

.yb__hit {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--s-2);
  text-decoration: none;
  color: inherit;
  border-radius: var(--r-sm);
}

.yb__track {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  width: 100%;
  height: var(--h);
  background: linear-gradient(var(--surface-sunken), var(--surface-sunken)) bottom / 100% 1px no-repeat;
}

.yb__bar {
  width: 100%;
  max-width: 22px;
  background: var(--money-rule);
  border-radius: 2px 2px 0 0;
  transition: opacity var(--dur) var(--ease);
}

.yb__year {
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

a.yb__hit:hover .yb__bar { opacity: 0.72; }
a.yb__hit:hover .yb__year { color: var(--text); }
</style>
