<script setup lang="ts">
/**
 * "¿Cuánto ofertar para ganar?" — a bid target for this call, built from the
 * call's own line items (cantidad × unidad) priced at the historical AWARD unit
 * price of each item's rubro. Since the baselines are winning prices, the median
 * is roughly the winning offer and the low quartile the aggressive-but-winning
 * one, so the sum gives a competitive → typical range for the whole pliego.
 *
 * All numbers come from /api/open-calls/{compraId}/estimate (quantity × baseline
 * percentiles, unit-matched like-for-like). This component only renders the total,
 * the per-line breakdown, and an honest coverage/uncovered note.
 */
interface EstItem {
  description: string | null
  classificationId: string | null
  quantity: number | null
  unitName: string | null
  matched: boolean
  reason?: 'no-baseline' | 'no-quantity'
  currency?: string
  unitP25?: number
  unitP50?: number
  n?: number
  lineLow?: number
  lineTypical?: number
}
interface Total { currency: string, low: number, typical: number, lines: number }
interface Estimate {
  items: EstItem[]
  totals: Total[]
  coverage: { estimated: number, total: number, noBaseline: number, noQuantity: number }
}

const props = defineProps<{ estimate: Estimate | null }>()
const { t } = useI18n()

const hasEstimate = computed(() => (props.estimate?.totals?.length ?? 0) > 0)
const totals = computed(() => props.estimate?.totals ?? [])
const coverage = computed(() => props.estimate?.coverage)
const matchedItems = computed(() => props.estimate?.items.filter(i => i.matched) ?? [])
const uncovered = computed(() => props.estimate?.coverage?.noBaseline ?? 0)

const qtyLabel = (it: EstItem) => [it.quantity != null ? formatNumber(it.quantity) : null, it.unitName].filter(Boolean).join(' ')
</script>

<template>
  <section
    v-if="hasEstimate"
    class="panel est"
  >
    <h2 class="u-eyebrow est__title">
      {{ t('llamados.estimateTitle') }}
    </h2>
    <p class="est__lead u-muted">
      {{ t('llamados.estimateLead') }}
    </p>

    <!-- Headline target(s) — one per currency present -->
    <div class="est__totals">
      <div
        v-for="tt in totals"
        :key="tt.currency"
        class="est__total"
      >
        <span class="est__totlabel u-mono">{{ t('llamados.estimateTargetLabel') }}</span>
        <div class="est__range">
          <MoneyAmount
            :amount="tt.low"
            :currency="tt.currency"
            :rule="false"
            compact
            size="xl"
            align="start"
          />
          <span
            v-if="Math.round(tt.low) !== Math.round(tt.typical)"
            class="est__dash"
          >–</span>
          <MoneyAmount
            v-if="Math.round(tt.low) !== Math.round(tt.typical)"
            :amount="tt.typical"
            :currency="tt.currency"
            :rule="false"
            compact
            size="xl"
            align="start"
          />
        </div>
        <span class="est__totsub">{{ t('llamados.estimateRangeSub') }}</span>
      </div>
    </div>

    <p
      v-if="coverage"
      class="est__coverage u-muted"
    >
      {{ t('llamados.estimateCoverage', { estimated: coverage.estimated, total: coverage.total }) }}
      <span v-if="uncovered"> · {{ t('llamados.estimateUncovered', { n: uncovered }) }}</span>
    </p>

    <!-- Per-line breakdown (transparency) -->
    <details class="est__details">
      <summary class="est__summary">
        {{ t('llamados.estimateBreakdown') }}
      </summary>
      <div class="est__tablewrap">
        <table class="est__table">
          <thead>
            <tr>
              <th class="est__th">
                {{ t('llamados.estimateColItem') }}
              </th>
              <th class="est__th est__th--num">
                {{ t('llamados.estimateColQty') }}
              </th>
              <th class="est__th est__th--num">
                {{ t('llamados.estimateColUnitPrice') }}
              </th>
              <th class="est__th est__th--num">
                {{ t('llamados.estimateColLine') }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(it, i) in matchedItems"
              :key="`m-${i}`"
            >
              <td class="est__td est__td--item">
                {{ it.description }}
              </td>
              <td
                class="est__td est__td--num u-mono"
                :data-label="t('llamados.estimateColQty')"
              >
                {{ qtyLabel(it) }}
              </td>
              <td
                class="est__td est__td--num"
                :data-label="t('llamados.estimateColUnitPrice')"
              >
                <span class="est__unitrange">
                  <MoneyAmount
                    :amount="it.unitP25"
                    :currency="it.currency"
                    :rule="false"
                    size="sm"
                  />
                  <span class="est__dash">–</span>
                  <MoneyAmount
                    :amount="it.unitP50"
                    :currency="it.currency"
                    :rule="false"
                    size="sm"
                  />
                </span>
              </td>
              <td
                class="est__td est__td--num"
                :data-label="t('llamados.estimateColLine')"
              >
                <MoneyAmount
                  :amount="it.lineTypical"
                  :currency="it.currency"
                  :rule="false"
                  size="sm"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </details>

    <p class="est__disc u-muted">
      {{ t('llamados.estimateDisclaimer') }}
    </p>
  </section>
</template>

<style scoped>
.est { padding: var(--s-5); }
.est__title { margin: 0 0 var(--s-1); }
.est__lead { font-size: var(--t-sm); margin: 0 0 var(--s-4); max-width: 70ch; }

/* ---- Headline target ---- */
.est__totals { display: flex; flex-wrap: wrap; gap: var(--s-5); margin-bottom: var(--s-3); }
.est__total {
  display: flex;
  flex-direction: column;
  gap: var(--s-1);
  padding: var(--s-4) var(--s-5);
  background: var(--surface-sunken);
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
}
.est__totlabel {
  font-size: var(--t-xs);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
}
.est__range { display: flex; align-items: baseline; gap: var(--s-2); flex-wrap: wrap; }
.est__dash { color: var(--text-muted); font-weight: 600; }
.est__totsub { font-size: var(--t-xs); color: var(--text-muted); }

.est__coverage { font-size: var(--t-sm); margin: 0 0 var(--s-3); }

/* ---- Breakdown ---- */
.est__details { border-top: 1px solid var(--rule); padding-top: var(--s-3); }
.est__summary {
  cursor: pointer;
  font-size: var(--t-sm);
  font-weight: 600;
  color: var(--celeste-deep);
  user-select: none;
}
.est__summary:hover { text-decoration: underline; }
.est__tablewrap { overflow-x: auto; margin-top: var(--s-3); }
.est__table { width: 100%; border-collapse: collapse; min-width: 480px; }
.est__th {
  text-align: left;
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
  font-weight: 600;
  padding: var(--s-2) var(--s-3);
  border-bottom: 1px solid var(--rule);
}
.est__th--num { text-align: right; }
.est__td { padding: var(--s-2) var(--s-3); border-bottom: 1px solid var(--rule); font-size: var(--t-sm); vertical-align: top; }
.est__td--item { max-width: 320px; }
.est__td--num { text-align: right; white-space: nowrap; }
.est__unitrange { display: inline-flex; align-items: baseline; gap: var(--s-1); justify-content: flex-end; }

.est__disc { font-size: var(--t-xs); margin: var(--s-4) 0 0; max-width: 78ch; }

/* Mobile: each breakdown row becomes a card — no horizontal scroll. */
@media (max-width: 760px) {
  .est__tablewrap { overflow-x: visible; }
  .est__table { min-width: 0; display: block; }
  .est__table thead {
    position: absolute; width: 1px; height: 1px;
    overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap;
  }
  .est__table tbody { display: flex; flex-direction: column; gap: var(--s-3); }
  .est__table tbody tr {
    display: block;
    padding: var(--s-3) var(--s-4);
    background: var(--surface);
    border: 1px solid var(--rule);
    border-radius: var(--r-md);
  }
  .est__td,
  .est__td--num {
    display: block;
    max-width: none;
    padding: var(--s-2) 0;
    border: 0;
    border-top: 1px solid color-mix(in srgb, var(--rule) 55%, transparent);
    text-align: left;
    white-space: normal;
  }
  .est__td:first-child { border-top: 0; padding-top: 0; }
  .est__td[data-label]::before {
    content: attr(data-label);
    display: block;
    margin-bottom: 3px;
    font-family: var(--font-mono);
    font-size: var(--t-xs);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-muted);
  }
  .est__td--item { font-size: var(--t-base); font-weight: 700; }
  .est__unitrange { justify-content: flex-start; }
}
</style>
