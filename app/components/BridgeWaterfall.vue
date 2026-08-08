<script setup lang="ts">
/**
 * The year-over-year bridge, as a waterfall.
 *
 * Plain HTML and CSS rather than a canvas, for three reasons that matter more
 * here than anywhere else on the site: the six steps ARE the argument of the
 * page (so they must be crawlable and readable without JS), a floating-bar
 * waterfall in Chart.js needs `[start, end]` tuples that no tooltip explains
 * well, and rows survive a 360px screen where six vertical columns do not.
 *
 * Each step gets a bar that starts where the previous one ended, so the eye
 * follows the running total from last year's spend to this year's. The two
 * endpoints (base and total) are drawn from zero and marked as totals.
 *
 * Colour carries meaning and never uses gold — gold is reserved for money
 * figures, which here are rendered by <MoneyAmount>, not by the bars:
 *   - inflation   the change that is only the price level (washed, dashed)
 *   - coverage    bodies entering or leaving the feed (slate)
 *   - real        what the comparable panel actually changed (celeste)
 *   - endpoints   the two totals (ink)
 */
export interface BridgeStep {
  key: string
  label: string
  value: number
  /** Endpoints are drawn from zero; increments float on the running total. */
  kind: 'total' | 'inflation' | 'coverage' | 'real'
  /** One line under the label — what this step means. */
  help?: string
}

const props = defineProps<{
  steps: BridgeStep[]
}>()

/** Running geometry: every increment starts where the previous step ended. */
const laid = computed(() => {
  let running = 0
  const rows = props.steps.map((s) => {
    const start = s.kind === 'total' ? 0 : running
    const end = s.kind === 'total' ? s.value : running + s.value
    running = end
    return { ...s, start, end, low: Math.min(start, end), high: Math.max(start, end) }
  })
  const max = Math.max(1, ...rows.map(r => r.high))
  // The bar has a 2px floor so a near-zero step still reads as a mark; clamp
  // `left` so that floor cannot push the mark past the right edge of its track.
  const MIN_PCT = 0.4
  return rows.map((r) => {
    const width = Math.max(MIN_PCT, ((r.high - r.low) / max) * 100)
    const left = Math.min(((r.low / max) * 100), 100 - width)
    return {
      ...r,
      leftPct: `${Math.max(0, left).toFixed(2)}%`,
      widthPct: `${width.toFixed(2)}%`,
    }
  })
})
</script>

<template>
  <ol class="wf">
    <li
      v-for="row in laid"
      :key="row.key"
      class="wf__row"
      :class="[`wf__row--${row.kind}`, { 'is-neg': row.value < 0 }]"
    >
      <div class="wf__id">
        <span class="wf__label">{{ row.label }}</span>
        <span
          v-if="row.help"
          class="wf__help"
        >{{ row.help }}</span>
      </div>
      <div class="wf__track">
        <span
          class="wf__bar"
          :style="{ left: row.leftPct, width: row.widthPct }"
        />
      </div>
      <div class="wf__val">
        <!-- The sign is rendered outside <MoneyAmount>: its magnitude rule is
             defined on a positive logarithmic domain, so a negative figure would
             collapse the bar rather than mirror it. -->
        <span
          v-if="row.kind !== 'total'"
          class="wf__sign"
          aria-hidden="true"
        >{{ row.value >= 0 ? '+' : '−' }}</span>
        <MoneyAmount
          :amount="row.kind === 'total' ? row.value : Math.abs(row.value)"
          currency="UYU"
          compact
          :rule="row.kind === 'total'"
        />
      </div>
    </li>
  </ol>
</template>

<style scoped>
.wf {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--s-2);
  min-width: 0;
}

.wf__row {
  display: grid;
  grid-template-columns: minmax(0, 13rem) minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--s-3);
  min-width: 0;
}

.wf__id { min-width: 0; display: grid; gap: 2px; }

.wf__label {
  font-size: var(--t-sm);
  line-height: 1.25;
  overflow-wrap: break-word;
}

.wf__help {
  font-size: var(--t-xs);
  line-height: 1.3;
  color: var(--text-muted);
}

.wf__track {
  position: relative;
  height: 1.4rem;
  min-width: 0;
  background: var(--surface-sunken);
  border-radius: var(--r-sm);
}

.wf__bar {
  position: absolute;
  top: 0;
  bottom: 0;
  border-radius: var(--r-sm);
  background: var(--celeste-deep);
  /* A one-pixel floor so a step worth ~0 still reads as a mark, not a gap. */
  min-width: 2px;
}

.wf__row--total .wf__bar { background: var(--ink); }
.wf__row--coverage .wf__bar { background: var(--text-muted); }
.wf__row--inflation .wf__bar {
  background: var(--celeste-wash);
  border: 1px dashed var(--celeste-deep);
}
.wf__row.is-neg .wf__bar { opacity: 0.72; }

.wf__val {
  display: flex;
  align-items: baseline;
  justify-content: flex-end;
  gap: 2px;
  font-family: var(--font-mono);
  font-size: var(--t-sm);
  font-variant-numeric: tabular-nums;
  text-align: right;
  white-space: nowrap;
}

.wf__sign { color: var(--text-muted); }

@media (max-width: 720px) {
  .wf__row {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      "id val"
      "track track";
    gap: var(--s-1) var(--s-3);
  }
  .wf__id { grid-area: id; }
  .wf__val { grid-area: val; }
  .wf__track { grid-area: track; height: 1.1rem; }
}
</style>
