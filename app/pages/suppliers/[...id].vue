<script setup lang="ts">
/**
 * A supplier's profile.
 *
 * ## Where each number comes from, and why it matters
 *
 * There are two bases for supplier money in this dataset and they must never
 * be mixed in one figure:
 *
 *  1. `supplier_patterns` — a precomputed snapshot (`lastUpdated`) holding
 *     `totalValue` / `avgContractValue`. It is the ONLY source with a
 *     per-supplier total, so the headline and the stat row read from it.
 *
 *  2. `releases.amount.primaryAmount` — the live per-release figure that
 *     `contracts/stats` sums. Verified against the live DB: it is populated
 *     on 600 of 2.17M releases (all 2025), and on **zero** releases belonging
 *     to any supplier in `supplier_patterns` — the snapshot was built from an
 *     earlier ingest whose supplier ids carry a slash (`R/210002980010`),
 *     while the re-synced 2025 releases use `R213382910014`.
 *
 * So the by-year, by-buyer and concentration sections below are wired to (2)
 * — the only basis on which those breakdowns are computable — and each is
 * guarded on the values actually being there. Today they render nothing;
 * showing zeroed gold bars would be a lie about the data rather than a fact
 * about it. They light up on their own if the amount enrichment lands.
 *
 * A ratio (concentration) is only ever taken within a single basis.
 */
interface SupplierPattern {
  supplierId: string
  name: string
  totalContracts: number
  buyerCount: number
  totalValue: number
  avgContractValue: number
  yearCount: number
  years: number[]
  topCategories?: { category: string, totalAmount: number, contractCount: number }[]
  lastUpdated?: string
}

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
// Resolved in setup scope: the useSeo getter below runs inside a computed,
// where the Nuxt instance is no longer reachable.
const siteUrl = useRuntimeConfig().public.siteUrl as string

/**
 * Supplier ids carry a forward slash — `R/210002980010` is the real format in
 * both `supplier_patterns.supplierId` and `awards[].suppliers[].id`.
 *
 * That is why this route is a catch-all rather than `[id].vue`: Vue Router
 * decodes `%2F` back to `/` while resolving a path, so a single-segment route
 * could never match a link to one of these ids and every row in the directory
 * pointed at a 404. The catch-all takes the slash as a real separator and we
 * rejoin the segments here. Params arrive already decoded.
 */
const supplierId = computed(() => {
  const raw = route.params.id
  return (Array.isArray(raw) ? raw.join('/') : String(raw ?? '')).trim()
})

/** The API takes the id as ONE path segment, so the slash must be escaped. */
const encodedId = computed(() => encodeURIComponent(supplierId.value))

/** The page's own URL, where the slash stays a separator. One canonical per
 *  supplier: the encoded and unencoded forms must not both be indexable. */
const pagePath = computed(
  () => `/suppliers/${supplierId.value.split('/').map(encodeURIComponent).join('/')}`,
)

const { data: detailRes, error: detailError } = await useFetch<any>(
  () => `/api/suppliers/${encodedId.value}`,
)

const supplier = computed<SupplierPattern | null>(() => detailRes.value?.data?.supplier ?? null)
/** DEI industrial-registry record when this supplier's RUT is registered (else null). */
const dei = computed(() => detailRes.value?.data?.dei ?? null)
/** RUPE state-provider record (91.7% coverage). Shown only when DEI isn't (DEI is richer). */
const rupe = computed(() => detailRes.value?.data?.rupe ?? null)
const notFound = computed(() => detailError.value?.statusCode === 404 || (!supplier.value && !!detailError.value))

// A 404 must answer 404, not a 200 carrying an apology — but the state itself
// stays on-brand and translated rather than falling through to error.vue.
if (import.meta.server && notFound.value) {
  setResponseStatus(useRequestEvent()!, 404)
}

// An id that matches no supplier has no contracts to look up either; don't
// spend three more queries proving it. `notFound` is settled by the await
// above and cannot change for this id, so reading it once here is safe.
const exists = !notFound.value

// ---- Their contracts ----------------------------------------------
// Read from /api/contracts rather than the `recentContracts` the supplier
// endpoint bundles: that one's projection drops `amount` and `buyer.id`, so
// every row would render "sin monto" even where a figure exists.
const { data: listRes } = await useFetch<any>('/api/contracts', {
  query: computed(() => ({
    supplierIds: supplierId.value,
    limit: 8,
    sortBy: 'date',
    sortOrder: 'desc',
  })),
  immediate: exists,
})

// The oldest contract, for the "first contract" stat. One indexed row.
const { data: firstRes } = await useFetch<any>('/api/contracts', {
  query: computed(() => ({
    supplierIds: supplierId.value,
    limit: 1,
    sortBy: 'date',
    sortOrder: 'asc',
  })),
  key: computed(() => `supplier-first-${supplierId.value}`),
  immediate: exists,
})

// Breakdowns. See the header note on why these are guarded.
const { data: statsRes } = await useFetch<any>('/api/contracts/stats', {
  query: computed(() => ({ supplierIds: supplierId.value })),
  immediate: exists,
})

const contracts = computed<ContractLike[]>(() => listRes.value?.data?.contracts ?? [])
const contractTotal = computed<number | null>(() => listRes.value?.data?.pagination?.total ?? null)
const stats = computed(() => statsRes.value?.data ?? null)

const lastDate = computed(() => contractDate(contracts.value[0]))
const firstDate = computed(() => contractDate(firstRes.value?.data?.contracts?.[0]))

const activeYears = computed(() => [...(supplier.value?.years ?? [])].sort((a, b) => a - b))

// ---- Guarded breakdowns -------------------------------------------
const byYear = computed(() =>
  (stats.value?.byYear ?? [])
    .filter((d: any) => d.year && (d.value ?? 0) > 0)
    .sort((a: any, b: any) => a.year - b.year),
)

const byBuyer = computed(() =>
  (stats.value?.topBuyers ?? []).filter((b: any) => (b.value ?? 0) > 0),
)

/** Share of revenue taken by the single largest buyer, within one basis. */
const concentration = computed(() => {
  const total = stats.value?.totalValue ?? 0
  const top = byBuyer.value[0]
  if (!top || !(total > 0)) return null
  return { name: top.name, pct: Math.round((top.value / total) * 100) }
})

const categories = computed(() => supplier.value?.topCategories ?? [])

/** Nothing the source publishes supports a breakdown for this supplier. */
const hasBreakdown = computed(() =>
  byYear.value.length > 0 || byBuyer.value.length > 0 || categories.value.length > 0,
)

const seoDescription = computed(() => t('seo.supplierDetail.description', {
  name: supplier.value?.name ?? '',
  amount: formatMoney(supplier.value?.totalValue, 'UYU', { compact: true }),
  contracts: formatNumber(supplier.value?.totalContracts),
  buyers: formatNumber(supplier.value?.buyerCount),
}))

// Resolved in setup scope: the useSeo getter below can be re-invoked outside
// the component's active setup context, where useBreadcrumbLd's Nuxt-instance
// dependency is no longer reachable.
const breadcrumbLd = useBreadcrumbLd([
  { name: 'Proveedores', path: '/suppliers' },
  { name: supplier.value?.name ?? '' },
])

useSeo(() => ({
  title: notFound.value
    ? t('suppliers.detail.notFound.title')
    : t('seo.supplierDetail.title', { name: supplier.value?.name ?? '' }),
  description: notFound.value ? t('suppliers.detail.notFound.body') : seoDescription.value,
  path: pagePath.value,
  noindex: notFound.value,
  kicker: 'Proveedor',
  stat: notFound.value || !supplier.value
    ? undefined
    : formatMoney(supplier.value.totalValue, 'UYU', { compact: true }),
  jsonLd: notFound.value || !supplier.value
    ? undefined
    : [
        {
          '@context': 'https://schema.org',
          '@type': 'Organization',
          'name': supplier.value.name,
          'identifier': supplier.value.supplierId,
          'description': seoDescription.value,
          'url': `${siteUrl}${pagePath.value}`,
        },
        breadcrumbLd,
      ],
}))
</script>

<template>
  <div class="u-container page">
    <!-- ===== Not found ===== -->
    <div
      v-if="notFound"
      class="state"
    >
      <h1 class="state__t">
        {{ t('suppliers.detail.notFound.title') }}
      </h1>
      <p class="state__b">
        {{ t('suppliers.detail.notFound.body') }}
      </p>
      <NuxtLink
        :to="localePath('/suppliers')"
        class="state__a"
      >
        {{ t('suppliers.detail.notFound.action') }}
      </NuxtLink>
    </div>

    <template v-else-if="supplier">
      <!-- ===== Header ===== -->
      <header class="head">
        <div class="head__id">
          <p class="u-eyebrow">
            {{ t('suppliers.detail.eyebrow') }}
          </p>
          <h1>{{ supplier.name }}</h1>
          <p class="head__rut u-mono">
            {{ supplier.supplierId }}
          </p>
        </div>
        <div class="head__money">
          <MoneyAmount
            :amount="supplier.totalValue"
            size="xl"
            align="start"
          />
          <p class="head__moneyl">
            {{ t('suppliers.detail.totalEarned') }}
          </p>
        </div>
      </header>

      <!-- ===== Stat row ===== -->
      <dl class="stats">
        <div class="stats__i">
          <dt class="stats__l">
            {{ t('suppliers.detail.contractCount') }}
          </dt>
          <dd class="stats__v">
            {{ formatNumber(supplier.totalContracts) }}
          </dd>
        </div>
        <div class="stats__i">
          <dt class="stats__l">
            {{ t('suppliers.detail.buyerCount') }}
          </dt>
          <dd class="stats__v">
            {{ formatNumber(supplier.buyerCount) }}
          </dd>
        </div>
        <div class="stats__i">
          <dt class="stats__l">
            {{ t('suppliers.detail.avgContract') }}
          </dt>
          <dd class="stats__v">
            <MoneyAmount
              :amount="supplier.avgContractValue"
              compact
              size="sm"
              align="start"
            />
          </dd>
        </div>
        <div class="stats__i">
          <dt class="stats__l">
            {{ t('suppliers.detail.activeYears') }}
          </dt>
          <dd class="stats__v">
            {{ formatNumber(supplier.yearCount) }}
          </dd>
        </div>
        <div class="stats__i">
          <dt class="stats__l">
            {{ t('suppliers.detail.firstContract') }}
          </dt>
          <dd class="stats__v stats__v--date u-mono">
            {{ firstDate ? formatDate(firstDate) : (activeYears[0] ?? '—') }}
          </dd>
        </div>
        <div class="stats__i">
          <dt class="stats__l">
            {{ t('suppliers.detail.lastContract') }}
          </dt>
          <dd class="stats__v stats__v--date u-mono">
            {{ lastDate ? formatDate(lastDate) : (activeYears[activeYears.length - 1] ?? '—') }}
          </dd>
        </div>
      </dl>

      <!-- ===== Industrial registry (DEI) =====
           Shown only when the supplier's RUT is a registered industrial company.
           Official MIEM open data, cross-referenced — a fact of record. -->
      <DeiPanel
        v-if="dei"
        :dei="dei"
        :supplier-name="supplier.name"
      />

      <!-- ===== State-provider registry (RUPE) =====
           Fallback location card for the ~85% of suppliers in RUPE but not DEI.
           Official ARCE open data, cross-referenced by RUT — a fact of record. -->
      <RupePanel
        v-if="rupe && !dei"
        :rupe="rupe"
        :supplier-name="supplier.name"
        :supplier-id="supplier.supplierId"
      />

      <!-- ===== Revenue by year =====
           Guarded: the bars are gold, so they may only ever carry money. -->
      <section
        v-if="byYear.length > 1"
        class="block"
      >
        <div class="block__head">
          <h2>{{ t('suppliers.detail.byYearTitle') }}</h2>
        </div>
        <div class="panel panel--pad">
          <YearBars
            :data="byYear"
            :height="150"
          />
        </div>
      </section>

      <div class="cols">
        <!-- ===== Who buys from them ===== -->
        <section
          v-if="byBuyer.length"
          class="block"
        >
          <div class="block__head">
            <h2>{{ t('suppliers.detail.byBuyerTitle') }}</h2>
          </div>
          <p class="block__help">
            {{ t('suppliers.detail.byBuyerHelp') }}
          </p>
          <ol class="rank">
            <li
              v-for="b in byBuyer"
              :key="b.name"
              class="rank__row"
            >
              <div class="rank__link">
                <span class="rank__name u-truncate">{{ b.name }}</span>
                <span class="rank__meta">{{ formatNumber(b.count) }} {{ t('common.contracts').toLowerCase() }}</span>
                <MoneyAmount
                  :amount="b.value"
                  compact
                  size="sm"
                />
              </div>
            </li>
          </ol>
        </section>

        <!-- ===== Client concentration =====
             A real transparency signal: a supplier living off one agency is
             a different kind of business than one selling across the state. -->
        <section
          v-if="concentration"
          class="block"
        >
          <div class="block__head">
            <h2>{{ t('suppliers.detail.concentrationTitle') }}</h2>
          </div>
          <div class="panel conc">
            <p class="conc__pct">
              {{ concentration.pct }}<span class="conc__sign">%</span>
            </p>
            <p class="conc__who u-truncate">
              {{ concentration.name }}
            </p>
            <p class="conc__help">
              {{ t('suppliers.detail.concentrationHelp') }}
            </p>
          </div>
        </section>
      </div>

      <!-- ===== What they sell ===== -->
      <section
        v-if="categories.length"
        class="block"
      >
        <div class="block__head">
          <h2>{{ t('suppliers.detail.categoriesTitle') }}</h2>
        </div>
        <ol class="rank">
          <li
            v-for="c in categories"
            :key="c.category"
            class="rank__row"
          >
            <div class="rank__link">
              <span class="rank__name u-truncate">{{ c.category }}</span>
              <span class="rank__meta">{{ formatNumber(c.contractCount) }} {{ t('common.contracts').toLowerCase() }}</span>
              <MoneyAmount
                :amount="c.totalAmount"
                compact
                size="sm"
              />
            </div>
          </li>
        </ol>
      </section>

      <!-- ===== Their contracts ===== -->
      <section class="block">
        <div class="block__head">
          <h2>{{ t('suppliers.detail.contractsTitle') }}</h2>
          <NuxtLink
            v-if="contracts.length"
            :to="localePath({ path: '/contracts', query: { suppliers: supplier.name } })"
            class="block__all"
          >
            {{ t('common.viewAll') }}
          </NuxtLink>
        </div>

        <div
          v-if="!contracts.length"
          class="state state--sm"
        >
          <p class="state__b">
            {{ t('contracts.empty.body') }}
          </p>
        </div>

        <div v-else>
          <table class="ctable dtable">
            <thead>
              <tr>
                <th scope="col">
                  {{ t('contracts.table.object') }}
                </th>
                <th
                  scope="col"
                  class="ctable__c-buyer"
                >
                  {{ t('contracts.table.buyer') }}
                </th>
                <th
                  scope="col"
                  class="ctable__c-date"
                >
                  {{ t('contracts.table.date') }}
                </th>
                <th
                  scope="col"
                  class="ctable__c-amt"
                >
                  {{ t('contracts.table.amount') }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="c in contracts"
                :key="c.id"
                class="ctable__row"
              >
                <td
                  class="ctable__obj"
                  data-primary
                >
                  <NuxtLink
                    :to="localePath(`/contracts/${c.id}`)"
                    class="ctable__link"
                  >
                    {{ contractTitle(c) || t('common.contract') }}
                  </NuxtLink>
                  <span
                    v-if="c.tender?.procurementMethodDetails"
                    class="ctable__method"
                  >
                    {{ c.tender.procurementMethodDetails }}
                  </span>
                </td>
                <td
                  class="ctable__c-buyer"
                  :data-label="t('contracts.table.buyer')"
                >
                  <NuxtLink
                    v-if="c.buyer?.id"
                    :to="localePath(`/buyers/${encodeURIComponent(c.buyer.id)}`)"
                    class="ctable__blink u-clamp-2"
                  >
                    {{ c.buyer.name }}
                  </NuxtLink>
                  <span
                    v-else
                    class="u-clamp-2"
                  >{{ c.buyer?.name || '—' }}</span>
                </td>
                <td
                  class="ctable__c-date u-mono"
                  :data-label="t('contracts.table.date')"
                >
                  {{ formatDate(contractDate(c)) }}
                </td>
                <td
                  class="ctable__c-amt"
                  :data-label="t('contracts.table.amount')"
                >
                  <MoneyAmount
                    :amount="contractAmount(c)"
                    :currency="contractCurrency(c)"
                    compact
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p
          v-if="contractTotal && contractTotal > contracts.length"
          class="block__more"
        >
          {{ t('suppliers.resultsSummary', { count: formatNumber(contractTotal) }) }}
        </p>
      </section>

      <!-- ===== Source + honesty about the gaps ===== -->
      <footer class="source">
        <p
          v-if="!hasBreakdown"
          class="source__gap"
        >
          {{ t('suppliers.detail.dataNote') }}
        </p>
        <p class="source__note">
          {{ t('home.sourceNote') }}
          <span v-if="supplier.lastUpdated"> · {{ t('footer.lastUpdate', { date: formatDate(supplier.lastUpdated) }) }}</span>
        </p>
      </footer>
    </template>
  </div>
</template>

<style scoped>
.page { padding-block: var(--s-6) var(--s-8); }

/* ---- Header ---- */
.head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--s-5);
  align-items: end;
  padding-bottom: var(--s-5);
  border-bottom: 1px solid var(--rule);
}

.head__id { min-width: 0; }

.head h1 { margin: var(--s-3) 0 0; }

.head__rut {
  margin: var(--s-2) 0 0;
  font-size: var(--t-xs);
  color: var(--text-muted);
}

.head__money {
  display: flex;
  flex-direction: column;
  gap: var(--s-1);
}

.head__moneyl {
  margin: 0;
  font-size: var(--t-sm);
  color: var(--text-muted);
}

/* ---- Stat row ---- */
.stats {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: var(--s-4);
  margin: var(--s-5) 0 0;
  padding: var(--s-4) var(--s-5);
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
}

.stats__i { min-width: 0; }

.stats__l {
  font-size: var(--t-xs);
  color: var(--text-muted);
  line-height: 1.3;
}

.stats__v {
  margin: var(--s-2) 0 0;
  font-family: var(--font-display);
  font-size: var(--t-lg);
  font-weight: 700;
  font-stretch: 112%;
  letter-spacing: -0.02em;
  line-height: 1.1;
}

.stats__v--date {
  font-family: var(--font-mono);
  font-size: var(--t-sm);
  font-weight: 500;
  letter-spacing: 0;
}

/* ---- Blocks ---- */
.block { margin-top: var(--s-7); }

.block__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--s-4);
  margin-bottom: var(--s-3);
}

.block__all {
  font-size: var(--t-sm);
  font-weight: 600;
  color: var(--celeste-deep);
  text-decoration: none;
  white-space: nowrap;
}

.block__all:hover { text-decoration: underline; }

.block__help {
  margin: 0 0 var(--s-3);
  max-width: 62ch;
  font-size: var(--t-sm);
  color: var(--text-muted);
}

.block__more {
  margin: var(--s-3) 0 0;
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  color: var(--text-muted);
}

.panel--pad { padding: var(--s-5); }

.cols {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
  gap: var(--s-6);
  align-items: start;
}

/* An only child in the pair should not sit in a half-width column. */
.cols > .block:only-child { grid-column: 1 / -1; }

/* ---- Rank lists ---- */
.rank {
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
  background: var(--surface);
  overflow: hidden;
}

.rank__row + .rank__row { border-top: 1px solid var(--rule); }

.rank__link {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: var(--s-4);
  padding: var(--s-3) var(--s-4);
  text-decoration: none;
  color: inherit;
  transition: background var(--dur) var(--ease);
}

a.rank__link:hover { background: var(--surface-sunken); }

.rank__name {
  font-size: var(--t-sm);
  font-weight: 600;
}

.rank__meta {
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  color: var(--text-muted);
  white-space: nowrap;
}

/* ---- Concentration ---- */
.conc { padding: var(--s-5); }

.conc__pct {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--t-2xl);
  font-weight: 800;
  font-stretch: 112%;
  line-height: 1;
  letter-spacing: -0.04em;
}

.conc__sign {
  margin-left: 2px;
  font-size: 0.5em;
  color: var(--text-muted);
}

.conc__who {
  margin: var(--s-2) 0 0;
  font-size: var(--t-sm);
  font-weight: 600;
}

.conc__help {
  margin: var(--s-3) 0 0;
  font-size: var(--t-xs);
  color: var(--text-muted);
  line-height: 1.5;
}

/* ---- Table ---- */
.ctable {
  width: 100%;
  min-width: 640px;
  border-collapse: collapse;
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
  overflow: hidden;
}

.ctable th {
  padding: var(--s-3) var(--s-4);
  text-align: left;
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  font-weight: 500;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-muted);
  border-bottom: 1px solid var(--rule);
  white-space: nowrap;
}

.ctable td {
  padding: var(--s-3) var(--s-4);
  font-size: var(--t-sm);
  vertical-align: top;
  border-bottom: 1px solid var(--rule);
}

.ctable__row:last-child td { border-bottom: 0; }
.ctable__row:hover { background: var(--surface-sunken); }

.ctable__obj { max-width: 340px; }

.ctable__link {
  font-weight: 600;
  color: var(--text);
  text-decoration: none;
}

.ctable__link:hover {
  color: var(--celeste-deep);
  text-decoration: underline;
}

.ctable__method {
  display: block;
  margin-top: 2px;
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  color: var(--text-muted);
}

.ctable__c-buyer {
  max-width: 220px;
  color: var(--text-muted);
}

.ctable__blink {
  color: var(--text-muted);
  text-decoration: none;
}

.ctable__blink:hover {
  color: var(--celeste-deep);
  text-decoration: underline;
}

.ctable__c-date {
  white-space: nowrap;
  color: var(--text-muted);
  font-size: var(--t-xs);
}

.ctable td.ctable__c-amt,
.ctable th.ctable__c-amt { text-align: right; }

/* ---- States ---- */
.state {
  padding: var(--s-8) var(--s-5);
  text-align: center;
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
}

.state--sm { padding: var(--s-6) var(--s-5); }

.state__t { margin: 0 0 var(--s-2); font-size: var(--t-lg); }

.state__b {
  margin: 0 auto var(--s-4);
  max-width: 46ch;
  color: var(--text-muted);
  font-size: var(--t-sm);
}

.state--sm .state__b { margin-bottom: 0; }

.state__a {
  display: inline-block;
  padding: var(--s-2) var(--s-5);
  border-radius: var(--r-md);
  background: var(--ink);
  color: #fff;
  font-weight: 600;
  font-size: var(--t-sm);
  text-decoration: none;
}

/* ---- Source ---- */
.source {
  margin-top: var(--s-7);
  padding-top: var(--s-5);
  border-top: 1px solid var(--rule);
}

.source__gap,
.source__note {
  margin: 0;
  max-width: 68ch;
  font-size: var(--t-sm);
  color: var(--text-muted);
}

.source__gap { margin-bottom: var(--s-2); }

/* ---- Responsive ---- */
@media (max-width: 1000px) {
  .cols { grid-template-columns: 1fr; }
  .stats { grid-template-columns: repeat(3, minmax(0, 1fr)); row-gap: var(--s-5); }
}

@media (max-width: 720px) {
  .head {
    grid-template-columns: 1fr;
    align-items: start;
    gap: var(--s-4);
  }
}

@media (max-width: 480px) {
  .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }

  .rank__link {
    grid-template-columns: minmax(0, 1fr) auto;
    row-gap: var(--s-1);
  }

  .rank__meta { grid-column: 1; grid-row: 2; }
  .rank__link :deep(.money) { grid-column: 2; grid-row: 1 / span 2; }
}
</style>
