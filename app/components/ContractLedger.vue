<script setup lang="ts">
/**
 * The ledger: one contract per row, what it was, who was paid, how much.
 *
 * Four surfaces render this exact list — curro detail, caso detail,
 * recopilatorio detail and the home page — and it is the one place where a
 * derived amount sits next to a title, so the two rules that govern it must
 * hold everywhere at once: the amount goes through `<MoneyAmount>` (never a
 * hand-formatted peso figure), and both text lines truncate rather than push
 * the row, because Uruguayan contract objects run to 200 characters and a
 * phone is 360px wide.
 *
 * It is an `<ol>`: the order is the finding. Rows arrive sorted by amount and
 * that ranking is the reason the block exists.
 *
 *   <ContractLedger :items="ledger" :empty-label="t('common.contract')" />
 */
defineProps<{
  items: Array<{
    id?: string | undefined
    title?: string | null
    supplier?: string | null
    buyerName?: string | null
    amount?: number | null
    date?: string | Date | null
  }>
  /** Fallback row title when the record has no object text. */
  emptyLabel: string
}>()

const localePath = useLocalePath()
</script>

<template>
  <ol class="cledger">
    <li
      v-for="(c, idx) in items"
      :key="c.id ?? idx"
      class="cledger__row"
    >
      <NuxtLink
        :to="localePath(`/contracts/${c.id}`)"
        class="cledger__link"
      >
        <span class="cledger__text">
          <span class="cledger__what u-truncate">{{ c.title || emptyLabel }}</span>
          <span class="cledger__who u-truncate">{{ c.supplier || c.buyerName }}<span v-if="c.date"> · {{ formatDate(c.date) }}</span></span>
        </span>
        <MoneyAmount
          :amount="c.amount"
          compact
          size="sm"
        />
      </NuxtLink>
    </li>
  </ol>
</template>

<style scoped>
.cledger {
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
  background: var(--surface);
  overflow: hidden;
}

.cledger__row + .cledger__row { border-top: 1px solid var(--rule); }

.cledger__link {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-4);
  padding: var(--s-3) var(--s-4);
  text-decoration: none;
  color: inherit;
  transition: background var(--dur) var(--ease);
}

.cledger__link:hover { background: var(--surface-sunken); }

/* min-width: 0 so the truncation actually happens: a flex item defaults to
   min-width: auto and would otherwise grow to its longest word and take the
   money column off the screen. */
.cledger__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 1px;
}

.cledger__what { font-size: var(--t-sm); font-weight: 600; }
.cledger__who { font-size: var(--t-xs); color: var(--text-muted); }
</style>
