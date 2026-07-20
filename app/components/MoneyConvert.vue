<script setup lang="ts">
/**
 * A price you can click to see it converted.
 *
 * The open data reports a line's price in its own currency and moment — a
 * US$ 600 in 2024, a $ 500 in 2011. This wraps a MoneyAmount so a click reveals
 * the same two conversions the site uses everywhere else: the amount in UYU at
 * the BCU rate of the contract's OWN month, and in today's pesos (deflated by
 * the Unidad Indexada). Both are the shared pure functions fed the monthly rate
 * table the page loaded once from /api/rates.
 *
 * It only becomes interactive when there is actually something to show (a
 * foreign amount to convert, or a today's-pesos value that the rate table can
 * produce); otherwise it renders a plain, non-clickable MoneyAmount.
 */
import { monthKey, toNominalUyu, toTodayUyu } from '#shared/utils/real-value'
import type { RateTable } from '#shared/utils/real-value'

const props = withDefaults(defineProps<{
  amount?: number | null
  currency?: string
  /** The contract's date — the moment whose BCU rate the amount is read at. */
  date?: string | Date | null
  rateTable?: RateTable | null
  size?: 'sm' | 'md' | 'lg' | 'xl'
  decimals?: boolean
  rule?: boolean
}>(), {
  currency: 'UYU',
  size: 'sm',
  decimals: false,
  rule: false,
})

const { t } = useI18n()
const { track } = useAnalytics()
const open = ref(false)
watch(open, (v) => {
  if (v) track('money_convert_open')
})

const conv = computed(() => {
  const a = props.amount
  if (typeof a !== 'number' || !Number.isFinite(a) || a <= 0 || !props.rateTable) return null
  const cur = (props.currency || 'UYU').toUpperCase()
  const month = monthKey(props.date)
  const isForeign = cur !== 'UYU'
  const historic = isForeign ? toNominalUyu(a, cur, month, props.rateTable) : null
  const today = toTodayUyu(a, cur, props.date, props.rateTable)
  if (historic === null && today === null) return null
  // "08/2024" — the day isn't in the monthly table, so the month is the honest unit.
  const monthLabel = month ? `${month.slice(5)}/${month.slice(0, 4)}` : ''
  return { historic, today, monthLabel, isForeign }
})
</script>

<template>
  <v-menu
    v-if="conv"
    v-model="open"
    :close-on-content-click="false"
    location="top center"
    origin="auto"
    offset="6"
  >
    <template #activator="{ props: menuProps }">
      <button
        v-bind="menuProps"
        type="button"
        class="mconv"
        :class="{ 'mconv--open': open }"
        :aria-label="t('preview.convertAria')"
        @click.stop
      >
        <MoneyAmount
          :amount="amount"
          :currency="currency"
          :size="size"
          :decimals="decimals"
          :rule="rule"
          align="end"
        />
      </button>
    </template>
    <div class="mconv__pop">
      <p class="mconv__pophead u-mono">
        {{ t('preview.convertTitle') }}
      </p>
      <div
        v-if="conv.isForeign && conv.historic !== null"
        class="mconv__row"
      >
        <span class="mconv__label">{{ t('preview.atBcu', { month: conv.monthLabel }) }}</span>
        <MoneyAmount
          :amount="conv.historic"
          currency="UYU"
          size="sm"
          :rule="false"
        />
      </div>
      <div
        v-if="conv.today !== null"
        class="mconv__row mconv__row--today"
      >
        <span
          class="mconv__label"
          :title="t('money.todayHelp')"
        >{{ t('money.today') }}</span>
        <MoneyAmount
          :amount="conv.today"
          currency="UYU"
          size="sm"
          :rule="false"
        />
      </div>
    </div>
  </v-menu>
  <MoneyAmount
    v-else
    :amount="amount"
    :currency="currency"
    :size="size"
    :decimals="decimals"
    :rule="rule"
    align="end"
  />
</template>

<style scoped>
.mconv {
  display: inline-flex;
  align-items: center;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
  /* A dotted underline hints "there is more here" without shouting. */
  border-bottom: 1px dashed color-mix(in srgb, var(--celeste-deep) 55%, transparent);
  line-height: 1.1;
  color: inherit;
  font: inherit;
}
.mconv:hover,
.mconv--open { border-bottom-color: var(--celeste-deep); }

.mconv__pop {
  min-width: 200px;
  padding: var(--s-3) var(--s-4);
  background: var(--surface);
  border: 1px solid var(--rule-strong);
  border-radius: var(--r-md);
  box-shadow: var(--shadow-2, 0 6px 24px rgba(0, 0, 0, 0.18));
}
.mconv__pophead {
  margin: 0 0 var(--s-2);
  font-size: var(--t-xs);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.mconv__row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--s-4);
  padding: 3px 0;
}
.mconv__label { font-size: var(--t-xs); color: var(--text-muted); }
.mconv__row--today .mconv__label { color: var(--celeste-deep); cursor: help; }
</style>
