<script setup lang="ts">
/**
 * The one gold thing on the page.
 *
 * Renders a peso figure plus its magnitude rule — the site-wide
 * logarithmic bar defined in utils/money.ts. Use this for every
 * amount, everywhere. Nothing else on the site may be gold.
 */
const props = withDefaults(defineProps<{
  amount?: number | null
  currency?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** Left-align for headings; default right-aligns for table columns. */
  align?: 'start' | 'end'
  /** Hide the rule where a figure stands alone with no siblings to compare against. */
  rule?: boolean
  compact?: boolean
  decimals?: boolean
}>(), {
  currency: 'UYU',
  size: 'md',
  align: 'end',
  rule: true,
  compact: false,
  decimals: false,
})

const { t } = useI18n()

const hasAmount = computed(
  () => props.amount !== null && props.amount !== undefined && Number.isFinite(props.amount),
)

const figure = computed(() =>
  formatMoney(props.amount, props.currency, { compact: props.compact, decimals: props.decimals }),
)

// Emitted as a fixed-precision string: a raw float round-trips
// differently through SSR markup than through `style.setProperty`, which
// Vue reports as a hydration style mismatch. 4dp is far below one
// device pixel of bar width, and it keeps a 16-digit float out of every
// amount on the page.
const mag = computed(() => magnitude(props.amount).toFixed(4))

// Non-peso amounts are labelled rather than silently converted —
// the source data mixes currencies and we do not hold FX rates.
const isForeign = computed(() => props.currency !== 'UYU')

const title = computed(() =>
  hasAmount.value
    ? `${formatMoney(props.amount, props.currency, { decimals: true })}`
    : t('money.unavailable'),
)
</script>

<template>
  <span
    class="money"
    :class="[
      `money--${size}`,
      align === 'start' && 'money--start',
      !hasAmount && 'money--none',
    ]"
    :style="{ '--mag': mag }"
    :title="title"
  >
    <span class="money__figure">
      {{ hasAmount ? figure : t('money.unavailable') }}
      <span
        v-if="hasAmount && isForeign"
        class="money__fx"
      >{{ currency }}</span>
    </span>
    <span
      v-if="rule && hasAmount"
      class="money__rule"
      aria-hidden="true"
    />
  </span>
</template>
