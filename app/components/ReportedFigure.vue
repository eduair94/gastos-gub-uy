<script setup lang="ts">
/**
 * The sourced claim, set beside the figures this site computed.
 *
 * It exists because the claim used to be crammed into a `white-space: nowrap`
 * pill. `amountReported` is prose — 44 to 130 characters, sometimes two
 * currencies, sometimes a range, sometimes no figure at all ("sin cifra única
 * reportada") — so the chip measured 442px inside a 375px viewport at best, and
 * was the single biggest cause of sideways scroll on the curro pages. A chip is
 * a token from a fixed vocabulary; this is a hedged, attributed sentence.
 * Different content, different container.
 *
 * It renders as the closing strip of the KPI band, not as its own card: the
 * editorial point of the page is the distance between what was reported and
 * what the data shows, and that comparison is made by ADJACENCY. Deliberately
 * there is no second figure here — the computed total is already the first KPI,
 * two rows up. Reprinting it in gold would say the same number twice and, worse,
 * lend the press claim the authority of the magnitude rule.
 *
 * Which is also why the claim is plain ink and never <MoneyAmount>: gold means
 * "a peso figure this site derived from the data". A quoted number has not
 * earned it. Do not "fix" the pesos inside `claim` by re-typesetting them.
 *
 *   <ReportedFigure
 *     :label="t('curros.reportedLabel')"
 *     :claim="data.amountReported"
 *   />
 */
defineProps<{
  /** Mono caption. Page-owned t() string. */
  label: string
  /** The claim exactly as published. Never reformatted, never parsed. */
  claim: string
  /** Attribution — outlet, date. */
  source?: string
}>()
</script>

<template>
  <div class="rfig">
    <p class="rfig__k">
      {{ label }}
    </p>
    <p class="rfig__v">
      {{ claim }}<cite
        v-if="source"
        class="rfig__src"
      >{{ source }}</cite>
    </p>
  </div>
</template>

<style scoped>
/* Sunken, hairline-topped: it reads as annotation on the KPI band rather than
   as a fourth statistic competing with the three above it. */
.rfig {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--s-2);
  min-width: 0;
  padding: var(--s-4) var(--s-5);
  background: var(--surface-sunken);
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
}

.rfig__k {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.rfig__v {
  margin: 0;
  min-width: 0;
  max-width: 68ch;
  font-size: var(--t-sm);
  line-height: 1.55;
  color: var(--text);
  /* The claims carry long unbroken tokens — "~US$2.143.420", "2012–2016" —
     that must break rather than push the page sideways. */
  overflow-wrap: break-word;
  text-wrap: pretty;
}

.rfig__src {
  display: block;
  margin-top: var(--s-1);
  font-size: var(--t-xs);
  font-style: normal;
  color: var(--text-muted);
}

/* The caption stops being a stacked kicker and becomes a ledger column once
   there is room for one — same left edge as the KPI labels above it. */
@media (min-width: 700px) {
  .rfig {
    /* max-content, not a ch measure: the caption is a fixed phrase and must
       never wrap to two lines beside a one-line claim. */
    grid-template-columns: max-content minmax(0, 1fr);
    gap: var(--s-5);
    align-items: baseline;
  }
  .rfig__k { line-height: 1.55; white-space: nowrap; }
}
</style>
