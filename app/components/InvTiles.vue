<script setup lang="ts">
/**
 * The headline row of an investigation: four (or two) figures with a label and
 * a caveat under each.
 *
 * Forty of these tiles were hand-built across eleven pages, and the money ones
 * repeated the same five `<MoneyAmount>` attributes every time — one page
 * forgetting `compact`, another forgetting `:rule="false"`, so the same kind of
 * figure came out at two different sizes on two pages of the same series. Pass
 * `amount` and the tile decides; pass `value` for anything that is not pesos.
 *
 *   <InvTiles
 *     :items="[
 *       { amount: STATS.total, label: c.tTotal, sub: c.tTotalSub },
 *       { value: `${STATS.pct}%`, label: c.tShare, tone: 'alerta' },
 *     ]"
 *   />
 *
 * `tone` is for the tile's own reading, never for money: a peso figure is gold
 * by way of `<MoneyAmount>` and nothing else on the site may be.
 * A figure that needs richer markup than a string takes the `value:<key>` slot,
 * the same convention `<DataTable>` uses for cells.
 */
export interface InvTileItem {
  /** Money figure — rendered through MoneyAmount, so it carries the gold rule. */
  amount?: number | null
  currency?: string
  /** Any non-money figure: a count, a percentage, a multiplier. */
  value?: string | number
  label: string
  /** The caveat line: what the figure excludes, or where it comes from. */
  sub?: string
  /** Reading of a NON-money figure. Money is never tinted. */
  tone?: 'alerta' | 'verde'
  /** Key for the `value:<key>` slot. */
  key?: string
  /** Money size override — the median-contract tile is deliberately quieter. */
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** Money shortening (12,3 M). On by default; off for a figure read in full. */
  compact?: boolean
}

withDefaults(defineProps<{
  items: InvTileItem[]
  /** Track count on desktop. Two for a hero pairing, four for a headline row. */
  columns?: 2 | 4
  /** The full section beat above, for a row that follows a chart or table. */
  spaced?: boolean
}>(), {
  columns: 4,
  spaced: false,
})
</script>

<template>
  <div
    class="inv-tiles"
    :class="{ 'inv-tiles--2': columns === 2, 'inv-tiles--spaced': spaced }"
  >
    <div
      v-for="(t, i) in items"
      :key="t.key ?? t.label ?? i"
      class="inv-tile"
    >
      <slot
        :name="`value:${t.key}`"
        :item="t"
      >
        <MoneyAmount
          v-if="t.amount !== undefined"
          :amount="t.amount"
          :currency="t.currency ?? 'UYU'"
          :size="t.size ?? 'lg'"
          align="start"
          :rule="false"
          :compact="t.compact ?? true"
        />
        <div
          v-else
          class="inv-tile__n"
          :class="t.tone ? `inv-tile__n--${t.tone}` : undefined"
        >
          {{ t.value }}
        </div>
      </slot>

      <div class="inv-tile__l">
        {{ t.label }}
      </div>
      <div
        v-if="t.sub"
        class="inv-tile__s"
      >
        {{ t.sub }}
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Was an inline style: a tile row that answers the chart above it needs the
   section beat, not a paragraph gap. */
.inv-tiles--spaced { margin-top: var(--s-6); }
</style>
