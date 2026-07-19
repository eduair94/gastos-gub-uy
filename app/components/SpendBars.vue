<script setup lang="ts">
/**
 * Ranked spend bars — the mobile-friendly counterpart to <TreemapChart>. Where a
 * treemap encodes money as area (great on a wide screen, cramped on a phone),
 * this lays the same figures out as a plain ranked list: one row per item, a
 * proportional bar for magnitude, the compact peso figure at the end. It renders
 * as real HTML (no SVG, no canvas), so it reads and taps cleanly at 360px and
 * stays crawlable.
 *
 * Rows with an `href` are links (a body's profile); rows without emit `select`
 * (used to drill from the "all groups" view into one group). The bar is a chart
 * mark, not a money rule — coloured, never gold — so it doesn't collide with the
 * gold magnitude rule that <MoneyAmount> carries.
 */
const props = withDefaults(defineProps<{
  items: { label: string, value: number, href?: string, color?: string, sub?: string }[]
  /** Shared denominator so bars compare on one scale; defaults to the largest value. */
  max?: number
}>(), {})

const emit = defineEmits<{ select: [index: number] }>()

// Resolve to the component object (never a bare "NuxtLink" string — a string
// `:is` silently degrades to a plain <a> here and breaks SPA nav).
const NuxtLink = resolveComponent('NuxtLink')

const scaleMax = computed(() =>
  props.max ?? Math.max(1, ...props.items.map(i => Math.max(0, i.value))))

// Fixed precision keeps the SSR markup and the hydrated style identical (a raw
// float round-trips differently through each), same reason <MoneyAmount> pins --mag.
function widthOf(v: number): string {
  return `${((Math.max(0, v) / scaleMax.value) * 100).toFixed(2)}%`
}
</script>

<template>
  <ul class="sb">
    <li
      v-for="(it, i) in items"
      :key="i"
      class="sb__item"
    >
      <component
        :is="it.href ? NuxtLink : 'button'"
        :to="it.href || undefined"
        :type="it.href ? undefined : 'button'"
        class="sb__row"
        @click="!it.href && emit('select', i)"
      >
        <span class="sb__head">
          <span class="sb__label">{{ it.label }}</span>
          <MoneyAmount
            :amount="it.value"
            compact
            size="sm"
            :rule="false"
          />
        </span>
        <span
          class="sb__track"
          aria-hidden="true"
        >
          <span
            class="sb__bar"
            :style="{ 'width': widthOf(it.value), '--sb-color': it.color || 'var(--celeste)' }"
          />
        </span>
        <span
          v-if="it.sub"
          class="sb__sub"
        >{{ it.sub }}</span>
      </component>
    </li>
  </ul>
</template>

<style scoped>
.sb {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  padding: 0;
  margin: 0;
}

.sb__row {
  display: block;
  width: 100%;
  text-align: left;
  padding: var(--s-3);
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-md);
  color: inherit;
  text-decoration: none;
  cursor: pointer;
  transition: border-color var(--dur) var(--ease), background var(--dur) var(--ease);
}

.sb__row:hover { border-color: var(--rule-strong); }

.sb__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--s-3);
}

.sb__label {
  min-width: 0;
  font-size: var(--t-sm);
  font-weight: 600;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sb__track {
  display: block;
  margin-top: var(--s-2);
  height: 6px;
  border-radius: 3px;
  background: var(--surface-sunken);
  overflow: hidden;
}

.sb__bar {
  display: block;
  height: 100%;
  min-width: 3px;
  border-radius: 3px;
  background: var(--sb-color, var(--celeste));
}

.sb__sub {
  display: block;
  margin-top: var(--s-1);
  font-size: var(--t-xs);
  color: var(--text-muted);
}
</style>
