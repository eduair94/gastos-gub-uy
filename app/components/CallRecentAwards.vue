<script setup lang="ts">
/**
 * "¿Quién ganó esto antes?" — the last awards of each article in this call, with
 * the winner, the unit price they got, and the body that bought it.
 *
 * This is the named-precedent half of the bidder panel. `CallBidEstimate` above
 * answers with a distribution (median, quartiles over the whole history); this
 * answers with five contracts you can open and read. Every row links to the
 * contract, so nothing here has to be taken on trust.
 *
 * Data: /api/open-calls/{compraId}/recent-awards (capped at 8 rubros; the cap is
 * shown, never silent). Unit prices are per-line and carry their own currency —
 * they are never summed, so no cross-currency total is implied.
 */
interface Purchase {
  id: string | null
  ocid: string | null
  compraId: string | null
  date: string | null
  buyerName: string | null
  supplierName: string | null
  supplierId: string | null
  quantity: number | null
  unitName: string | null
  unitAmount: number | null
  currency: string | null
}
interface Article { code: string, label: string, purchases: Purchase[] }
interface Recent { articles: Article[], truncated: { shown: number, total: number } }

const props = defineProps<{ recent: Recent | null }>()
const { t } = useI18n()
const localePath = useLocalePath()

const articles = computed(() => props.recent?.articles ?? [])
const hasAny = computed(() => articles.value.length > 0)
const truncated = computed(() => {
  const tr = props.recent?.truncated
  return tr && tr.total > tr.shown ? tr : null
})

// The catch-all supplier route keeps slashes as path separators — supplier ids
// contain them ("R/2175..."), so each segment is encoded on its own.
function supplierPath(id: string): string {
  return localePath(`/suppliers/${id.split('/').map(encodeURIComponent).join('/')}`)
}
function qtyLabel(p: Purchase): string {
  return [p.quantity != null ? formatNumber(p.quantity) : null, p.unitName].filter(Boolean).join(' ')
}
</script>

<template>
  <section
    v-if="hasAny"
    class="panel rec"
  >
    <h2 class="u-eyebrow rec__title">
      {{ t('llamados.recentTitle') }}
    </h2>
    <p class="rec__lead u-muted">
      {{ t('llamados.recentLead') }}
    </p>

    <article
      v-for="a in articles"
      :key="a.code"
      class="rec__art"
    >
      <header class="rec__arthead">
        <h3 class="rec__artname">
          {{ a.label || a.code }}
        </h3>
        <NuxtLink
          class="rec__artlink"
          :to="localePath(`/products/${a.code}`)"
        >
          {{ t('llamados.recentAllPurchases') }}
        </NuxtLink>
      </header>

      <div class="rec__tablewrap">
        <table class="rec__table">
          <thead>
            <tr>
              <th class="rec__th">
                {{ t('llamados.recentColDate') }}
              </th>
              <th class="rec__th">
                {{ t('llamados.recentColSupplier') }}
              </th>
              <th class="rec__th rec__th--num">
                {{ t('llamados.recentColQty') }}
              </th>
              <th class="rec__th rec__th--num">
                {{ t('llamados.recentColUnitPrice') }}
              </th>
              <th class="rec__th">
                {{ t('llamados.recentColBuyer') }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(p, i) in a.purchases"
              :key="`${a.code}-${i}`"
            >
              <td
                class="rec__td u-mono"
                :data-label="t('llamados.recentColDate')"
              >
                <NuxtLink
                  v-if="p.id"
                  :to="localePath(`/contracts/${p.id}`)"
                >{{ p.date ? formatDate(p.date) : '—' }}</NuxtLink>
                <span v-else>{{ p.date ? formatDate(p.date) : '—' }}</span>
              </td>
              <td
                class="rec__td rec__td--supplier"
                :data-label="t('llamados.recentColSupplier')"
              >
                <NuxtLink
                  v-if="p.supplierId"
                  :to="supplierPath(p.supplierId)"
                >{{ p.supplierName || p.supplierId }}</NuxtLink>
                <span v-else>{{ p.supplierName || '—' }}</span>
              </td>
              <td
                class="rec__td rec__td--num u-mono"
                :data-label="t('llamados.recentColQty')"
              >
                {{ qtyLabel(p) || '—' }}
              </td>
              <td
                class="rec__td rec__td--num"
                :data-label="t('llamados.recentColUnitPrice')"
              >
                <MoneyAmount
                  v-if="p.unitAmount != null"
                  :amount="p.unitAmount"
                  :currency="p.currency ?? undefined"
                  :rule="false"
                  size="sm"
                />
                <span v-else>—</span>
              </td>
              <td
                class="rec__td rec__td--buyer"
                :data-label="t('llamados.recentColBuyer')"
              >
                {{ p.buyerName || '—' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </article>

    <p
      v-if="truncated"
      class="rec__more u-muted"
    >
      {{ t('llamados.recentTruncated', { shown: truncated.shown, total: truncated.total }) }}
    </p>
    <p class="rec__disc u-muted">
      {{ t('llamados.recentDisclaimer') }}
    </p>
  </section>
</template>

<style scoped>
.rec { padding: var(--s-5); }
.rec__title { margin: 0 0 var(--s-1); }
.rec__lead { font-size: var(--t-sm); margin: 0 0 var(--s-4); max-width: 70ch; }

.rec__art { margin-bottom: var(--s-5); }
.rec__art:last-of-type { margin-bottom: var(--s-3); }
.rec__arthead {
  display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between;
  gap: var(--s-2); margin-bottom: var(--s-2);
}
.rec__artname { font-size: var(--t-base); margin: 0; }
.rec__artlink { font-size: var(--t-xs); color: var(--celeste-deep); font-weight: 600; white-space: nowrap; }

.rec__tablewrap { overflow-x: auto; }
.rec__table { width: 100%; border-collapse: collapse; }
.rec__th {
  text-align: left; font-family: var(--font-mono); font-size: var(--t-xs);
  text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted);
  font-weight: 500; padding: var(--s-1) var(--s-2); border-bottom: 1px solid var(--rule);
  white-space: nowrap;
}
.rec__th--num { text-align: right; }
.rec__td { padding: var(--s-2); border-bottom: 1px solid var(--rule); font-size: var(--t-sm); vertical-align: top; }
.rec__td--num { text-align: right; white-space: nowrap; }
.rec__td--supplier { min-width: 14ch; }
.rec__td--buyer { color: var(--text-muted); }
.rec__td a { color: var(--celeste-deep); }
.rec__more, .rec__disc { font-size: var(--t-xs); margin: 0 0 var(--s-1); max-width: 80ch; }

/* Mobile: each row becomes its own card, labels from data-label. 760px, not the
   usual 640, so it flips at the SAME width as the estimate table right above it —
   otherwise the two panels disagree between 641 and 760px. */
@media (max-width: 760px) {
  .rec__table thead { display: none; }
  .rec__table, .rec__table tbody, .rec__table tr, .rec__table td { display: block; width: 100%; }
  .rec__table tr {
    border: 1px solid var(--rule); border-radius: var(--r-md);
    margin-bottom: var(--s-2); padding: var(--s-1) var(--s-2);
  }
  .rec__td { border-bottom: 0; display: flex; gap: var(--s-3); justify-content: space-between; padding: var(--s-1) 0; }
  .rec__td::before {
    content: attr(data-label);
    font-family: var(--font-mono); font-size: var(--t-xs); text-transform: uppercase;
    letter-spacing: 0.04em; color: var(--text-muted); flex: 0 0 auto;
  }
  .rec__td--num { text-align: right; }
  .rec__td--supplier, .rec__td--buyer { text-align: right; }
}
</style>
