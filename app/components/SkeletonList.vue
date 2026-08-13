<script setup lang="ts">
/**
 * The shimmer placeholder a directory shows while its first page is in flight.
 *
 * Eight files had built this by hand and it had split three ways: six identical
 * bordered rails of 52px rows, two loose stacks of 130–150px cards, and
 * `contactos/index.vue`, which used the class names without ever declaring the
 * CSS — so its loading state was a column of invisible empty divs and the page
 * looked broken until the data landed. (Its error state had the same hole; see
 * <StatePanel>.)
 *
 * `aria-hidden` and `role="presentation"`: this is a picture of content that is
 * not there yet. A screen reader announcing eight empty rows is worse than
 * silence, and the live region that will announce the real result belongs to
 * the list, not to its placeholder.
 *
 *   <SkeletonList v-else-if="pending && !rows.length" :rows="8" />
 */
withDefaults(defineProps<{
  /** How many placeholder rows. Match the page size so the layout does not jump. */
  rows?: number
  /**
   * `list` is the bordered rail of table rows; `cards` is the looser stack the
   * analytics pages use, where each unit is a panel rather than a row.
   */
  variant?: 'list' | 'cards'
  /** Row height for `cards`, where the real unit is taller than a table row. */
  cardHeight?: number
}>(), {
  rows: 8,
  variant: 'list',
  cardHeight: 140,
})
</script>

<template>
  <div
    class="sk"
    :class="`sk--${variant}`"
    role="presentation"
    aria-hidden="true"
  >
    <div
      v-for="i in rows"
      :key="i"
      class="sk__row"
      :style="variant === 'cards' ? { height: `${cardHeight}px` } : undefined"
    />
  </div>
</template>

<style scoped>
.sk { display: flex; flex-direction: column; }

/* 1px gaps over a bordered, clipped rail: the rows read as one table being
   drawn, which is what is actually loading. */
.sk--list {
  gap: 1px;
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
  overflow: hidden;
}

.sk--cards { gap: var(--s-3); }

.sk__row {
  height: 52px;
  background: linear-gradient(90deg, var(--surface) 25%, var(--surface-sunken) 37%, var(--surface) 63%);
  background-size: 400% 100%;
  animation: sk-shimmer 1.4s ease infinite;
}

.sk--cards .sk__row { border-radius: var(--r-lg); }

/* The one place that still moves under `prefers-reduced-motion` would be a
   loop the reader cannot dismiss, so it holds still and keeps the tone. */
@media (prefers-reduced-motion: reduce) {
  .sk__row { animation: none; background-position: 50% 50%; }
}

@keyframes sk-shimmer {
  0% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}
</style>
