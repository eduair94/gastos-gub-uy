<script setup lang="ts">
/**
 * The agency profile.
 *
 * ## Two sources, on purpose
 *
 * The headline total and the stat row come from `buyer_patterns`
 * (`/api/buyers/{id}`). Everything with a breakdown — by year, by supplier, by
 * category — comes from a live aggregation over `releases`
 * (`/api/contracts/stats`). They are not interchangeable, and the split is
 * deliberate:
 *
 *   - `buyer_patterns` is the only source with a per-agency total that spans
 *     every year, and it is internally consistent
 *     (`avgContractValue * totalContracts == totalSpending`). Critically, it is
 *     also the CLEAN one. DESIGN.md records that a handful of releases carry
 *     corrupt quantities; the worst, `adjudicacion-1318822`, multiplies USD
 *     519.788,85 by 1.200.007 generators. It belongs to UTE (61-1), and it
 *     drags UTE's live `stats.totalValue` to 24,9 **billones** — roughly 8x
 *     Uruguay's GDP. UTE's `buyer_patterns` total is 125,7 mil M: plausible,
 *     and untouched by that record. So the headline is never the live sum.
 *   - `buyer_patterns` holds no breakdown at all: `topCategories` is an empty
 *     array on all 397 documents, `suppliers` is a bare id list, and
 *     `/api/buyers/{id}`'s own `analytics.{spendingByYear,categoryDistribution,
 *     supplierDistribution}` are declared but never written — `{}` on every
 *     response. The live aggregation is the only way to answer "on what?" and
 *     "to whom?".
 *
 * Each panel therefore states its own basis rather than implying one number
 * explains another, and `recordHelp` tells the reader plainly that the record
 * only carries amounts from a given year on.
 *
 * ## Why the year series is filtered
 *
 * `stats.byYear` returns a real count for every year but a value of 0 for the
 * years before the source began reporting amounts (ANCAP: counts from 2009,
 * money only from 2019). Charting those as zero-height bars would assert the
 * agency bought nothing for a decade, which is false — it bought plenty and
 * the price was not published. Only years with a recorded amount are charted.
 *
 * Outliers are NOT filtered out of any of this: per DESIGN.md the source's
 * number is the source's number, and every row links to the official record.
 */
interface BuyerDetail {
  buyerId: string
  name: string
  totalContracts: number
  totalSpending: number
  avgContractValue: number
  yearCount: number
  years: number[]
  supplierCount: number
  lastUpdated?: string
}

const route = useRoute()
const { t } = useI18n()
const localePath = useLocalePath()
const config = useRuntimeConfig()

// Resolved in setup: `useSeo`'s getter runs inside a computed, where the Nuxt
// instance these composables need is out of scope.
const orgLd = useOrgLd()

const buyerId = computed(() => decodeURIComponent(String(route.params.id ?? '')))

/**
 * All three requests key off the route param, so none waits on another's
 * answer — they are issued together. Awaited in sequence they cost the sum
 * (~9,6 s against the live DB: 0,4 + 6,2 + 3,0); in parallel they cost the
 * slowest (~6,2 s, the stats facet over the agency's releases).
 *
 * `buyerIds` is guarded against an empty param: with no clause at all
 * `contracts/stats` falls through to its unbounded branch and answers for the
 * whole 2,17 M-document collection, which is emphatically not this page.
 */
const statsQuery = computed(() => (buyerId.value ? { buyerIds: buyerId.value } : {}))

const [
  { data: buyer, error },
  { data: statsRes },
  { data: contractsRes },
] = await Promise.all([
  useFetch<BuyerDetail>(() => `/api/buyers/${encodeURIComponent(buyerId.value)}`),

  useFetch<any>('/api/contracts/stats', {
    query: statsQuery,
    immediate: Boolean(buyerId.value),
  }),

  // The agency's largest contracts. Sorted by amount rather than date because a
  // spending profile is about size, and because the recent end of this record is
  // mostly `llamado` notices carrying no amount at all.
  useFetch<any>('/api/contracts', {
    query: computed(() => ({
      buyerIds: buyerId.value,
      limit: 8,
      sortBy: 'amount',
      sortOrder: 'desc',
    })),
    immediate: Boolean(buyerId.value),
  }),
])

const notFound = computed(() => !buyer.value || (error.value as any)?.statusCode === 404)

// A missing agency is a 404 for a crawler too, not a 200 with an apology.
if (notFound.value) {
  setResponseStatus(useRequestEvent()!, 404)
}

const name = computed(() => buyer.value?.name ?? '')

/** The explorer reads `buyers` as an exact name match. */
const explorerLink = computed(() => `/contracts?buyers=${encodeURIComponent(name.value)}`)

// Live breakdowns are keyed by id, not name: `buyer.id` is the field the
// release indexes, and it sidesteps agencies whose name differs between
// collections.
const stats = computed(() => statsRes.value?.data ?? null)

/** Live spending total. Only ever a denominator here — never a headline. */
const recordedTotal = computed<number>(() => stats.value?.totalValue ?? 0)

// Years the record actually prices. See the header note.
const byYear = computed(() =>
  (stats.value?.byYear ?? [])
    .filter((d: any) => d.year && d.value > 0)
    .map((d: any) => ({ year: d.year, value: d.value, count: d.count }))
    .sort((a: any, b: any) => a.year - b.year),
)

const firstPricedYear = computed<number | null>(() => byYear.value[0]?.year ?? null)

const suppliers = computed(() =>
  (stats.value?.topSuppliers ?? []).filter((s: any) => s.name && s.value > 0),
)

/**
 * The share of recorded spending taken by the largest supplier.
 *
 * Numerator and denominator both come from the same live aggregation, so the
 * figure ties out to the list beside it. It is deliberately not compared
 * against the `buyer_patterns` headline, which is a different basis.
 */
const concentration = computed<number | null>(() => {
  const top = suppliers.value[0]
  if (!top || !recordedTotal.value) return null
  const share = (top.value / recordedTotal.value) * 100
  return Number.isFinite(share) ? Math.min(share, 100) : null
})

const contracts = computed<ContractLike[]>(() => contractsRes.value?.data?.contracts ?? [])

/**
 * `contractAmount` returns the stored `amount.primaryAmount`, which the ingest
 * sets to a literal 0 — not null — on releases carrying no money at all: a
 * `llamado` (tender notice) is published before any award exists, and its
 * `amount.hasAmounts` is false. Passing that 0 to <MoneyAmount> would print
 * "$ 0" under a gold rule and assert the agency bought something for nothing.
 * The flag the schema provides for exactly this is honoured here.
 */
function amountOf(c: ContractLike): number | null {
  return c.amount?.hasAmounts ? contractAmount(c) : null
}

/**
 * Categories, derived from the awarded items of the contracts fetched above.
 * `category_distribution` is site-wide with no buyer dimension, and
 * `buyer_patterns.topCategories` is empty on every document, so this is the
 * only per-agency answer available. It is scoped honestly by `categoriesHelp`:
 * it describes the contracts on this page, not the agency's whole history.
 */
const categories = computed(() => {
  const totals = new Map<string, { name: string, value: number, count: number }>()
  for (const c of contracts.value) {
    for (const i of contractItems(c)) {
      const label = i.description
      if (!label || !i.total) continue
      const row = totals.get(label) ?? { name: label, value: 0, count: 0 }
      row.value += i.total
      row.count += 1
      totals.set(label, row)
    }
  }
  return [...totals.values()].sort((a, b) => b.value - a.value).slice(0, 6)
})

/**
 * Linking a supplier to its profile takes two corrections.
 *
 * 1. The collections spell the id differently: a release stores
 *    `awards[].suppliers[].id` as `R213977190018`, while `supplier_patterns` —
 *    the collection behind /suppliers/{id} — keys on `R/213977190018`. Only the
 *    slash differs, and no sampled award id carries it, so the raw value 404s
 *    on a supplier that does exist.
 * 2. That slash cannot travel in a path string: Vue Router decodes `%2F` back
 *    to `/` while parsing, and `/suppliers/R/210002980010` matches no route. A
 *    named-route location keeps it inside the single `id` param — the same
 *    approach `pages/suppliers/index.vue` takes.
 */
function supplierRoute(id: string) {
  const key = /^[A-Za-z]\d+$/.test(id) ? id.replace(/^([A-Za-z])/, '$1/') : id
  return localePath({ name: 'suppliers-id', params: { id: key } })
}

/**
 * `stats.topSuppliers` groups by supplier NAME — the facet carries no id — so
 * the id comes from the contracts already fetched above. A supplier big enough
 * to rank usually appears among the agency's largest contracts; when it does
 * not, the explorer filtered by name is a working destination rather than a
 * dead link.
 */
const supplierIdByName = computed(() => {
  const map = new Map<string, string>()
  for (const c of contracts.value) {
    for (const s of contractSuppliers(c)) {
      if (s.id && !map.has(s.name)) map.set(s.name, s.id)
    }
  }
  return map
})

function supplierTo(supplierName: string) {
  const id = supplierIdByName.value.get(supplierName)
  return id
    ? supplierRoute(id)
    : localePath(`/contracts?suppliers=${encodeURIComponent(supplierName)}`)
}

function contractSupplierTo(s: { id?: string, name: string }) {
  return s.id
    ? supplierRoute(s.id)
    : localePath(`/contracts?suppliers=${encodeURIComponent(s.name)}`)
}

const years = computed(() =>
  [...(buyer.value?.years ?? [])].filter(y => Number.isFinite(y)).sort((a, b) => a - b),
)

const firstYear = computed(() => years.value[0] ?? null)
const lastYear = computed(() => years.value[years.value.length - 1] ?? null)

// Resolved in setup for the same reason as `orgLd` above: the `useSeo` getter
// can be re-invoked outside the component's active setup context.
const breadcrumbLd = useBreadcrumbLd([
  { name: t('nav.buyers'), path: '/buyers' },
  { name: name.value },
])

useSeo(() => ({
  title: t('seo.buyerDetail.title', { name: name.value }),
  description: t('seo.buyerDetail.description', {
    name: name.value,
    amount: formatMoney(buyer.value?.totalSpending, 'UYU', { compact: true }),
    contracts: formatNumber(buyer.value?.totalContracts),
    suppliers: formatNumber(buyer.value?.supplierCount),
  }),
  path: `/buyers/${encodeURIComponent(buyerId.value)}`,
  noindex: notFound.value,
  kicker: 'Organismo',
  stat: formatMoney(buyer.value?.totalSpending, 'UYU', { compact: true }),
  jsonLd: notFound.value
    ? undefined
    : [
        {
          '@context': 'https://schema.org',
          '@type': 'GovernmentOrganization',
          'name': name.value,
          'identifier': buyer.value?.buyerId,
          'url': `${config.public.siteUrl}/buyers/${encodeURIComponent(buyerId.value)}`,
          'areaServed': { '@type': 'Country', 'name': 'Uruguay' },
          'subjectOf': {
            '@type': 'Dataset',
            'name': t('seo.buyerDetail.title', { name: name.value }),
            'creator': orgLd,
          },
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
        {{ t('buyers.detail.notFound.title') }}
      </h1>
      <p class="state__b">
        {{ t('buyers.detail.notFound.body') }}
      </p>
      <NuxtLink
        :to="localePath('/buyers')"
        class="state__a"
      >
        {{ t('buyers.detail.notFound.action') }}
      </NuxtLink>
    </div>

    <template v-else>
      <!-- ===== Header ===== -->
      <header class="head">
        <div class="head__id">
          <p class="u-eyebrow">
            {{ t('buyers.detail.eyebrow') }}
          </p>
          <h1 class="head__name">
            {{ name }}
          </h1>
          <p class="head__code u-mono">
            {{ buyer?.buyerId }}
          </p>
        </div>
        <div class="head__money">
          <MoneyAmount
            :amount="buyer?.totalSpending"
            size="xl"
            align="start"
          />
          <p class="head__moneyl">
            {{ t('buyers.detail.totalSpent') }}
          </p>
        </div>
      </header>

      <!-- ===== Stats ===== -->
      <section
        class="stats"
        :aria-label="t('buyers.detail.totalSpent')"
      >
        <div class="stat">
          <span class="stat__n">{{ formatNumber(buyer?.totalContracts) }}</span>
          <span class="stat__l">{{ t('buyers.detail.contractCount') }}</span>
        </div>
        <div class="stat">
          <span class="stat__n">{{ formatNumber(buyer?.supplierCount) }}</span>
          <span class="stat__l">{{ t('buyers.detail.supplierCount') }}</span>
        </div>
        <div class="stat stat--money">
          <MoneyAmount
            :amount="buyer?.avgContractValue"
            compact
            size="lg"
            align="start"
          />
          <span class="stat__l">{{ t('buyers.detail.avgContract') }}</span>
        </div>
        <div class="stat">
          <span class="stat__n">{{ formatNumber(buyer?.yearCount) }}</span>
          <span class="stat__l">{{ t('buyers.detail.activeYears') }}</span>
          <span
            v-if="firstYear && lastYear"
            class="stat__sub u-mono"
          >{{ firstYear }}–{{ lastYear }}</span>
        </div>
      </section>

      <!-- ===== What the live record covers ===== -->
      <p
        v-if="firstPricedYear"
        class="basis"
      >
        {{ t('buyers.detail.recordHelp', { year: firstPricedYear }) }}
      </p>

      <!-- ===== Political mandate timeline ===== -->
      <!-- Renders itself only for organisms with an executive mandate (departmental
           or executive-controlled); silent for the judiciary, university, etc. -->
      <MandateTimeline
        class="block"
        :buyer-id="buyer?.buyerId"
        :first-year="firstYear"
        :last-year="lastYear"
      />

      <!-- ===== Spending by year ===== -->
      <section
        v-if="byYear.length"
        class="block"
      >
        <div class="block__head">
          <h2>{{ t('buyers.detail.byYearTitle') }}</h2>
        </div>
        <div class="panel panel--pad">
          <YearBars
            :data="byYear"
            :height="150"
            :href-for="(y) => localePath(`/contracts?buyers=${encodeURIComponent(name)}&year=${y}`)"
          />
        </div>
      </section>

      <!-- ===== Who it buys from + concentration ===== -->
      <section
        v-if="suppliers.length"
        class="cols"
      >
        <div class="block block--flush">
          <div class="block__head">
            <h2>{{ t('buyers.detail.bySupplierTitle') }}</h2>
          </div>
          <p class="block__help">
            {{ t('buyers.detail.bySupplierHelp') }}
          </p>
          <ol class="rank">
            <li
              v-for="s in suppliers"
              :key="s.name"
              class="rank__row"
            >
              <NuxtLink
                :to="supplierTo(s.name)"
                class="rank__link"
              >
                <span class="rank__name u-truncate">{{ s.name }}</span>
                <span class="rank__meta">{{ formatNumber(s.count) }} {{ t('common.contracts').toLowerCase() }}</span>
                <MoneyAmount
                  :amount="s.value"
                  compact
                  size="sm"
                />
              </NuxtLink>
            </li>
          </ol>
          <p class="block__note">
            {{ t('buyers.detail.bySupplierNote') }}
          </p>
        </div>

        <div
          v-if="concentration !== null"
          class="block block--flush"
        >
          <div class="block__head">
            <h2>{{ t('buyers.detail.concentrationTitle') }}</h2>
          </div>
          <p class="block__help">
            {{ t('buyers.detail.concentrationHelp') }}
          </p>
          <div class="conc">
            <p class="conc__n">
              {{ formatNumber(Math.round(concentration)) }}<span class="conc__pct">%</span>
            </p>
            <p class="conc__of">
              {{ t('buyers.detail.concentrationOf') }}
            </p>
            <div
              class="conc__bar"
              role="img"
              :aria-label="`${Math.round(concentration)}%`"
            >
              <span
                class="conc__fill"
                :style="{ width: `${concentration}%` }"
              />
            </div>
            <p class="conc__who u-truncate">
              {{ suppliers[0]?.name }}
            </p>
          </div>
        </div>
      </section>

      <!-- ===== What it buys ===== -->
      <section
        v-if="categories.length"
        class="block"
      >
        <div class="block__head">
          <h2>{{ t('buyers.detail.categoriesTitle') }}</h2>
        </div>
        <p class="block__help">
          {{ t('buyers.detail.categoriesHelp') }}
        </p>
        <ol class="rank">
          <li
            v-for="c in categories"
            :key="c.name"
            class="rank__row"
          >
            <NuxtLink
              :to="localePath(`/contracts?buyers=${encodeURIComponent(name)}&category=${encodeURIComponent(c.name)}`)"
              class="rank__link"
            >
              <span class="rank__name u-truncate">{{ c.name }}</span>
              <span class="rank__meta">{{ formatNumber(c.count) }} {{ t('common.items').toLowerCase() }}</span>
              <MoneyAmount
                :amount="c.value"
                compact
                size="sm"
              />
            </NuxtLink>
          </li>
        </ol>
      </section>

      <!-- ===== Contracts ===== -->
      <section class="block">
        <div class="block__head">
          <h2>{{ t('buyers.detail.contractsTitle') }}</h2>
          <NuxtLink
            :to="localePath(explorerLink)"
            class="block__all"
          >
            {{ t('common.viewAll') }}
          </NuxtLink>
        </div>
        <p class="block__help">
          {{ t('buyers.detail.contractsHelp') }}
        </p>

        <div
          v-if="!contracts.length"
          class="state state--inline"
        >
          <p class="state__b">
            {{ t('buyers.detail.noAmounts') }}
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
                  class="ctable__c-sup"
                >
                  {{ t('contracts.table.supplier') }}
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
                    class="ctable__meta"
                  >
                    {{ c.tender.procurementMethodDetails }}
                  </span>
                </td>
                <td
                  class="ctable__c-sup"
                  :data-label="t('contracts.table.supplier')"
                >
                  <template v-if="contractSuppliers(c).length">
                    <NuxtLink
                      v-for="s in contractSuppliers(c)"
                      :key="s.name"
                      :to="contractSupplierTo(s)"
                      class="ctable__sup u-clamp-2"
                    >
                      {{ s.name }}
                    </NuxtLink>
                  </template>
                  <span
                    v-else
                    class="u-muted"
                  >—</span>
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
                    :amount="amountOf(c)"
                    :currency="contractCurrency(c)"
                    compact
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <p
        v-if="buyer?.lastUpdated"
        class="asof u-mono"
      >
        {{ t('footer.lastUpdate', { date: formatDate(buyer.lastUpdated) }) }}
      </p>
    </template>
  </div>
</template>

<style scoped>
.page { padding-block: var(--s-6) var(--s-8); }

/* ---- Header ---- */
.head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--s-6);
  padding-bottom: var(--s-5);
  border-bottom: 1px solid var(--rule);
}

.head__id { min-width: 0; }

.head__name { margin: var(--s-2) 0 0; }

.head__code {
  margin: var(--s-2) 0 0;
  font-size: var(--t-xs);
  color: var(--text-muted);
}

.head__money {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--s-1);
  flex: none;
}

.head__moneyl {
  margin: 0;
  font-size: var(--t-sm);
  color: var(--text-muted);
}

/* ---- Stats ---- */
.stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--s-4);
  margin-top: var(--s-5);
}

.stat {
  display: flex;
  flex-direction: column;
  gap: var(--s-1);
  padding: var(--s-4);
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
}

.stat__n {
  font-family: var(--font-display);
  font-size: var(--t-xl);
  font-weight: 700;
  font-stretch: 112%;
  line-height: 1.1;
  letter-spacing: -0.03em;
}

.stat__l {
  font-size: var(--t-xs);
  color: var(--text-muted);
}

.stat__sub {
  font-size: var(--t-xs);
  color: var(--text-muted);
}

/* ---- Basis note ---- */
.basis {
  margin: var(--s-5) 0 0;
  padding: var(--s-3) var(--s-4);
  max-width: 90ch;
  background: var(--surface-sunken);
  border: 1px solid var(--rule);
  border-radius: var(--r-md);
  font-size: var(--t-sm);
  color: var(--text-muted);
  line-height: 1.5;
}

/* ---- Blocks ---- */
.block { margin-top: var(--s-7); }

.block--flush { margin-top: 0; }

.block__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--s-4);
  margin-bottom: var(--s-2);
}

.block__all {
  font-size: var(--t-sm);
  font-weight: 600;
  color: var(--celeste-deep);
  text-decoration: none;
}

.block__all:hover { text-decoration: underline; }

.block__help {
  margin: 0 0 var(--s-4);
  max-width: 68ch;
  font-size: var(--t-sm);
  color: var(--text-muted);
}

.block__note {
  margin: var(--s-3) 0 0;
  max-width: 68ch;
  font-size: var(--t-xs);
  color: var(--text-muted);
  line-height: 1.5;
}

.panel--pad { padding: var(--s-5); }

.cols {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
  gap: var(--s-6);
  align-items: start;
  margin-top: var(--s-7);
}

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

.rank__link:hover { background: var(--surface-sunken); }

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

/* ---- Concentration ----
   A share of money, but not itself a peso figure — so it is ink and celeste,
   never gold. Gold stays reserved for the amounts in the list beside it. */
.conc {
  padding: var(--s-5);
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
}

.conc__n {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--t-3xl);
  font-weight: 800;
  font-stretch: 112%;
  line-height: 1;
  letter-spacing: -0.04em;
  color: var(--text);
}

.conc__pct {
  font-size: 0.5em;
  margin-left: 2px;
  color: var(--text-muted);
}

.conc__of {
  margin: var(--s-2) 0 0;
  font-size: var(--t-sm);
  color: var(--text-muted);
}

.conc__bar {
  height: 6px;
  margin: var(--s-4) 0 var(--s-3);
  background: var(--surface-sunken);
  border: 1px solid var(--rule);
  border-radius: var(--r-full);
  overflow: hidden;
}

.conc__fill {
  display: block;
  height: 100%;
  background: var(--celeste);
}

.conc__who {
  margin: 0;
  font-size: var(--t-sm);
  font-weight: 600;
}

/* ---- Table ---- */
.ctable {
  width: 100%;
  min-width: 680px;
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

.ctable__obj { max-width: 320px; }

.ctable__link {
  font-weight: 600;
  color: var(--text);
  text-decoration: none;
}

.ctable__link:hover {
  color: var(--celeste-deep);
  text-decoration: underline;
}

.ctable__meta {
  display: block;
  margin-top: 2px;
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  color: var(--text-muted);
}

.ctable__c-sup { max-width: 200px; }

.ctable__sup {
  display: block;
  color: var(--text-muted);
  text-decoration: none;
}

.ctable__sup:hover {
  color: var(--celeste-deep);
  text-decoration: underline;
}

.ctable__sup + .ctable__sup { margin-top: 2px; }

.ctable__c-date {
  white-space: nowrap;
  color: var(--text-muted);
  font-size: var(--t-xs);
}

.ctable td.ctable__c-amt,
.ctable th.ctable__c-amt { text-align: right; }

/* ---- As-of ---- */
.asof {
  margin: var(--s-6) 0 0;
  font-size: var(--t-xs);
  color: var(--text-muted);
}

/* ---- States ---- */
.state {
  padding: var(--s-8) var(--s-5);
  text-align: center;
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
}

.state--inline { padding: var(--s-6) var(--s-5); }

.state__t { margin: 0 0 var(--s-2); font-size: var(--t-lg); }

.state__b {
  margin: 0 auto;
  max-width: 46ch;
  color: var(--text-muted);
  font-size: var(--t-sm);
}

.state__a {
  display: inline-block;
  margin-top: var(--s-4);
  padding: var(--s-2) var(--s-5);
  border-radius: var(--r-md);
  background: var(--ink);
  color: #fff;
  font-weight: 600;
  font-size: var(--t-sm);
  text-decoration: none;
}

/* ---- Responsive ---- */
@media (max-width: 980px) {
  .cols { grid-template-columns: minmax(0, 1fr); }
  .block--flush + .block--flush { margin-top: var(--s-6); }
}

@media (max-width: 780px) {
  .head {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--s-4);
  }

  .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 560px) {
  .rank__link {
    grid-template-columns: minmax(0, 1fr) auto;
    row-gap: var(--s-1);
  }

  .rank__meta { grid-column: 1; grid-row: 2; }
  .rank__link :deep(.money) { grid-column: 2; grid-row: 1 / span 2; }
}

@media (max-width: 380px) {
  .stats { grid-template-columns: 1fr; }
}
</style>
