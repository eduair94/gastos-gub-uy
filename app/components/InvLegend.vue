<script setup lang="ts">
/**
 * The key under a chart: which colour means what.
 *
 * Written by hand in `casinos` and `casinos-cortesia`, each with its own inline
 * `style="background: var(--verde)"` swatches and one with a hand-tuned inline
 * override to turn a dot into a median rule.
 *
 *   <ChartBlock framed :title="…">
 *     <InvHBars … />
 *     <template #meta>
 *       <InvLegend :items="[
 *         { label: c.cat.competitivo, color: 'var(--verde)' },
 *         { label: c.chart.median, color: 'var(--celeste)', shape: 'line' },
 *       ]" />
 *     </template>
 *   </ChartBlock>
 *
 * The root is a `<span>` on purpose: a legend belongs to its chart's footnote,
 * and that footnote is a paragraph — a `<div>` inside it would be invalid.
 */
defineProps<{
  items: readonly { label: string, color: string, shape?: 'dot' | 'line' }[]
}>()
</script>

<template>
  <span class="invleg">
    <span
      v-for="it in items"
      :key="it.label"
      class="invleg__k"
    >
      <i
        aria-hidden="true"
        :class="it.shape === 'line' ? 'is-line' : undefined"
        :style="{ background: it.color }"
      />
      {{ it.label }}
    </span>
  </span>
</template>

<style scoped>
.invleg {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2) var(--s-4);
  font-family: var(--font-mono);
  font-size: 0.78rem;
  color: var(--text-muted);
}

.invleg__k {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.invleg i {
  display: inline-block;
  width: 11px;
  height: 11px;
  border-radius: 3px;
}

/* A median is a rule across the chart, not a series: its key is a rule too. */
.invleg i.is-line {
  width: 16px;
  height: 3px;
  border-radius: 0;
}
</style>
