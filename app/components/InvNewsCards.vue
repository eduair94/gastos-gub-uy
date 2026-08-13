<script setup lang="ts">
/**
 * The press cases behind a piece: the figure the outlet published, what it
 * said, and the link out.
 *
 * `intendencia-montevideo` and `tv-ciudad` shipped the same grid, the same card
 * and the same forty lines of scoped CSS, twice.
 *
 *   <InvNewsCards
 *     :items="IM_NEWS.map(n => ({ ...n, text: c.casos[n.key] }))"
 *     :note="c.casos.note"
 *   />
 *
 * The amount is deliberately NOT a `<MoneyAmount>`: these are figures reported
 * by the press, not derived from this data, and gold means "we computed this".
 */
defineProps<{
  items: readonly { url: string, amountText: string, text: string, source: string, date: string }[]
  /** The caveat under the grid — where these figures come from. */
  note?: string
}>()
</script>

<template>
  <div>
    <div class="invnews">
      <a
        v-for="n in items"
        :key="n.url"
        :href="n.url"
        target="_blank"
        rel="noopener"
        class="invnews__card"
      >
        <div class="invnews__amt u-mono">
          {{ n.amountText }}
        </div>
        <p class="invnews__txt">
          {{ n.text }}
        </p>
        <div class="invnews__src u-mono">
          {{ n.source }} · {{ n.date }} →
        </div>
      </a>
    </div>
    <p
      v-if="note"
      class="invnews__note"
    >
      {{ note }}
    </p>
  </div>
</template>

<style scoped>
.invnews {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--s-4);
}

.invnews__card {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  padding: var(--s-5);
  border: 1px solid var(--rule);
  border-left: 3px solid var(--alerta);
  border-radius: var(--r-lg);
  background: var(--surface);
  color: inherit;
  text-decoration: none;
  transition: border-color var(--dur) var(--ease);
}

.invnews__card:hover { border-color: var(--rule-strong); border-left-color: var(--alerta); }

.invnews__amt {
  font-size: var(--t-xl);
  font-weight: 700;
  color: var(--alerta);
}

.invnews__txt {
  margin: 0;
  font-size: var(--t-sm);
  line-height: 1.55;
  color: var(--text);
}

.invnews__src {
  font-size: var(--t-xs);
  color: var(--text-muted);
}

.invnews__note {
  margin: var(--s-4) 0 0;
  max-width: 82ch;
  font-size: var(--t-xs);
  line-height: 1.55;
  color: var(--text-muted);
}

@media (max-width: 720px) {
  .invnews { grid-template-columns: minmax(0, 1fr); }
}
</style>
