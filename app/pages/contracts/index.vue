<script setup lang="ts">
import type { FilterState } from '~/components/FilterRail.vue'

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const router = useRouter()

// ---- Filter state lives in the URL --------------------------------
// A filtered view is the thing people share with a journalist or paste
// into a message. Keeping state in the query string makes every view
// linkable, reloadable and back-button-able for free.
function parseList(v: unknown): string[] {
  if (!v) return []
  return (Array.isArray(v) ? v : [v]).flatMap(x => String(x).split(',')).filter(Boolean)
}
function parseNum(v: unknown): number | null {
  const n = Number(v)
  return v !== undefined && v !== '' && Number.isFinite(n) ? n : null
}

function fromRoute(): FilterState {
  const q = route.query
  return {
    search: (q.search as string) ?? '',
    buyers: parseList(q.buyers),
    suppliers: parseList(q.suppliers),
    procurementMethodDetails: parseList(q.procurementMethodDetails),
    status: parseList(q.status),
    currency: parseList(q.currency),
    yearFrom: parseNum(q.yearFrom) ?? parseNum(q.year),
    yearTo: parseNum(q.yearTo) ?? parseNum(q.year),
    amountFrom: parseNum(q.amountFrom),
    amountTo: parseNum(q.amountTo),
    hasAmount: q.hasAmount === 'true',
  }
}

const filters = ref<FilterState>(fromRoute())
const page = ref(Number(route.query.page ?? 1))
const sort = ref((route.query.sort as string) ?? 'dateDesc')

const SORTS: Record<string, { sortBy: string, sortOrder: string }> = {
  dateDesc: { sortBy: 'date', sortOrder: 'desc' },
  dateAsc: { sortBy: 'date', sortOrder: 'asc' },
  amountDesc: { sortBy: 'amount', sortOrder: 'desc' },
  amountAsc: { sortBy: 'amount', sortOrder: 'asc' },
  relevance: { sortBy: 'relevance', sortOrder: 'desc' },
}

const activeCount = computed(() => {
  const f = filters.value
  return [
    f.search, f.buyers.length, f.suppliers.length, f.procurementMethodDetails.length,
    f.status.length, f.currency.length, f.yearFrom, f.yearTo,
    f.amountFrom, f.amountTo, f.hasAmount || null,
  ].filter(Boolean).length
})

/** The params both /contracts and /contracts/stats accept. */
const apiQuery = computed(() => {
  const f = filters.value
  const q: Record<string, unknown> = {}
  if (f.search) q.search = f.search
  if (f.buyers.length) q.buyers = f.buyers.join(',')
  if (f.suppliers.length) q.suppliers = f.suppliers.join(',')
  if (f.procurementMethodDetails.length) q.procurementMethodDetails = f.procurementMethodDetails.join(',')
  if (f.status.length) q.status = f.status.join(',')
  if (f.currency.length) q.currency = f.currency.join(',')
  if (f.yearFrom) q.yearFrom = f.yearFrom
  if (f.yearTo) q.yearTo = f.yearTo
  if (f.amountFrom !== null) q.amountFrom = f.amountFrom
  if (f.amountTo !== null) q.amountTo = f.amountTo
  if (f.hasAmount) q.hasAmount = 'true'
  return q
})

const listQuery = computed(() => ({
  ...apiQuery.value,
  page: page.value,
  limit: 25,
  ...(SORTS[sort.value] ?? SORTS.dateDesc),
}))

// Reset to page 1 whenever the filter set changes — staying on page 7
// of a different result set is meaningless.
watch(filters, () => {
  page.value = 1
}, { deep: true })

// Push state to the URL; the fetches below react to the same refs.
watch([filters, page, sort], () => {
  const q: Record<string, string> = {}
  for (const [k, v] of Object.entries(apiQuery.value)) q[k] = String(v)
  if (page.value > 1) q.page = String(page.value)
  if (sort.value !== 'dateDesc') q.sort = sort.value
  router.replace({ query: q })
}, { deep: true })

const { data: optionsRes, pending: optionsPending } = await useFetch<any>('/api/contracts/filters')
const options = computed(() => optionsRes.value?.data ?? null)

const { data: listRes, pending, error } = await useFetch<any>('/api/contracts', { query: listQuery })
const { data: statsRes, pending: statsPending } = await useFetch<any>('/api/contracts/stats', { query: apiQuery })

const contracts = computed<ContractLike[]>(() => listRes.value?.data?.contracts ?? [])
const pagination = computed(() => listRes.value?.data?.pagination ?? null)
const stats = computed(() => statsRes.value?.data ?? null)

const byYear = computed(() =>
  (stats.value?.byYear ?? [])
    .filter((d: any) => d.year)
    .sort((a: any, b: any) => a.year - b.year),
)

const totalPages = computed(() => {
  const p = pagination.value
  if (!p?.total) return 1
  // The API caps deep pagination; don't advertise pages we refuse to serve.
  return Math.max(1, Math.ceil(Math.min(p.total, 2500) / (p.limit ?? 25)))
})

function clearAll() {
  filters.value = {
    search: '', buyers: [], suppliers: [], procurementMethodDetails: [],
    status: [], currency: [], yearFrom: null, yearTo: null,
    amountFrom: null, amountTo: null, hasAmount: false,
  }
  page.value = 1
}

const railOpen = ref(false)

useSeo(() => ({
  title: t('seo.contracts.title'),
  description: t('seo.contracts.description'),
  path: '/contracts',
  // A filtered permutation is not its own page — every combination
  // canonicalises to the bare explorer so we don't ask a crawler to
  // index an infinite query space.
  noindex: activeCount.value > 0,
}))
</script>

<template>
  <div class="u-container page">
    <header class="page__head">
      <div>
        <p class="u-eyebrow">
          {{ t('home.eyebrow') }}
        </p>
        <h1>{{ t('contracts.title') }}</h1>
      </div>
      <button
        class="railtoggle"
        type="button"
        @click="railOpen = true"
      >
        <v-icon size="18">
          mdi-tune-variant
        </v-icon>
        {{ t('common.filters') }}
        <span
          v-if="activeCount"
          class="railtoggle__n"
        >{{ activeCount }}</span>
      </button>
    </header>

    <div class="explorer">
      <!-- Filter rail: a sidebar on desktop, a sheet on small screens. -->
      <aside
        class="explorer__rail"
        :aria-label="t('filters.title')"
      >
        <FilterRail
          v-model="filters"
          :options="options"
          :loading="optionsPending"
          @clear="clearAll"
        />
      </aside>

      <v-dialog
        v-model="railOpen"
        fullscreen
        transition="dialog-bottom-transition"
      >
        <div class="railsheet">
          <div class="railsheet__head">
            <h2>{{ t('filters.title') }}</h2>
            <button
              class="railsheet__x"
              type="button"
              :aria-label="t('nav.close')"
              @click="railOpen = false"
            >
              <v-icon>mdi-close</v-icon>
            </button>
          </div>
          <div class="railsheet__body">
            <FilterRail
              v-model="filters"
              :options="options"
              :loading="optionsPending"
              @clear="clearAll"
            />
          </div>
          <div class="railsheet__foot">
            <button
              class="railsheet__apply"
              type="button"
              @click="railOpen = false"
            >
              {{ stats ? t('contracts.resultsSummary', { count: formatNumber(stats.count) }) : t('common.apply') }}
            </button>
          </div>
        </div>
      </v-dialog>

      <div class="explorer__main">
        <!-- ===== Insight strip =====
             What this filter set actually contains, before you read a
             single row: how many, worth how much, spread across which
             years. -->
        <div class="strip">
          <div class="strip__figures">
            <div class="strip__fig">
              <span class="strip__n">{{ statsPending ? '·····' : formatNumber(stats?.count) }}</span>
              <span class="strip__l">{{ t('common.contracts') }}</span>
            </div>
            <div class="strip__fig">
              <MoneyAmount
                :amount="statsPending ? null : stats?.totalValue"
                compact
                size="lg"
                align="start"
              />
              <span class="strip__l">{{ t('home.statSpending') }}</span>
            </div>
            <div class="strip__fig strip__fig--avg">
              <MoneyAmount
                :amount="statsPending ? null : stats?.avgValue"
                compact
                size="sm"
                align="start"
              />
              <span class="strip__l">{{ t('suppliers.detail.avgContract') }}</span>
            </div>
          </div>

          <div
            v-if="byYear.length > 1"
            class="strip__hist"
          >
            <p class="u-eyebrow strip__histl">
              {{ t('contracts.histogramTitle') }}
            </p>
            <YearBars
              :data="byYear"
              :height="52"
            />
          </div>
        </div>

        <!-- ===== Toolbar ===== -->
        <div class="toolbar">
          <p class="toolbar__count">
            <span
              v-if="pagination?.totalIsCapped"
              class="u-muted"
            >
              {{ t('contracts.tooMany', { shown: formatNumber(pagination.total) }) }}
            </span>
          </p>
          <label class="toolbar__sort">
            <span class="u-sr-only">{{ t('common.sortBy') }}</span>
            <select
              v-model="sort"
              class="toolbar__select"
            >
              <option
                v-if="filters.search"
                value="relevance"
              >
                {{ t('contracts.sort.relevance') }}
              </option>
              <option value="dateDesc">
                {{ t('contracts.sort.dateDesc') }}
              </option>
              <option value="dateAsc">
                {{ t('contracts.sort.dateAsc') }}
              </option>
              <option value="amountDesc">
                {{ t('contracts.sort.amountDesc') }}
              </option>
              <option value="amountAsc">
                {{ t('contracts.sort.amountAsc') }}
              </option>
            </select>
          </label>
        </div>

        <!-- ===== Results ===== -->
        <div
          v-if="error"
          class="state"
        >
          <h2 class="state__t">
            {{ t('errors.generic.title') }}
          </h2>
          <p class="state__b">
            {{ t('errors.generic.body') }}
          </p>
          <button
            class="state__a"
            type="button"
            @click="() => refreshNuxtData()"
          >
            {{ t('errors.generic.action') }}
          </button>
        </div>

        <div
          v-else-if="pending && !contracts.length"
          class="skeleton"
        >
          <div
            v-for="i in 8"
            :key="i"
            class="skeleton__row"
          />
        </div>

        <div
          v-else-if="!contracts.length"
          class="state"
        >
          <h2 class="state__t">
            {{ activeCount ? t('contracts.empty.title') : t('contracts.emptyInitial.title') }}
          </h2>
          <p class="state__b">
            {{ activeCount ? t('contracts.empty.body') : t('contracts.emptyInitial.body') }}
          </p>
          <button
            v-if="activeCount"
            class="state__a"
            type="button"
            @click="clearAll"
          >
            {{ t('contracts.empty.action') }}
          </button>
        </div>

        <div
          v-else
          class="u-scroll-x"
        >
          <table class="ctable">
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
                <td class="ctable__obj">
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
                <td class="ctable__c-buyer">
                  <span class="u-clamp-2">{{ c.buyer?.name || '—' }}</span>
                </td>
                <td class="ctable__c-sup">
                  <span class="u-clamp-2">{{ contractSuppliers(c)[0]?.name || '—' }}</span>
                </td>
                <td class="ctable__c-date u-mono">
                  {{ formatDate(contractDate(c)) }}
                </td>
                <td class="ctable__c-amt">
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

        <!-- ===== Pagination ===== -->
        <nav
          v-if="contracts.length && totalPages > 1"
          class="pager"
          :aria-label="t('common.page')"
        >
          <button
            class="pager__b"
            type="button"
            :disabled="page <= 1"
            @click="page = Math.max(1, page - 1)"
          >
            <v-icon size="16">
              mdi-chevron-left
            </v-icon>
            {{ t('common.previous') }}
          </button>
          <span class="pager__n">
            {{ t('common.page') }} <strong>{{ page }}</strong> {{ t('common.of') }} {{ formatNumber(totalPages) }}
          </span>
          <button
            class="pager__b"
            type="button"
            :disabled="page >= totalPages"
            @click="page = page + 1"
          >
            {{ t('common.next') }}
            <v-icon size="16">
              mdi-chevron-right
            </v-icon>
          </button>
        </nav>
      </div>
    </div>
  </div>
</template>

<style scoped>
.u-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}

.page { padding-block: var(--s-6) var(--s-8); }

.page__head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--s-4);
  margin-bottom: var(--s-5);
}

.railtoggle {
  display: none;
  align-items: center;
  gap: var(--s-2);
  padding: var(--s-2) var(--s-4);
  border: 1px solid var(--rule-strong);
  border-radius: var(--r-md);
  background: var(--surface);
  color: var(--text);
  font-family: var(--font-body);
  font-weight: 600;
  font-size: var(--t-sm);
  cursor: pointer;
}

.railtoggle__n {
  display: grid;
  place-items: center;
  min-width: 18px;
  height: 18px;
  padding-inline: 4px;
  border-radius: var(--r-full);
  background: var(--celeste-deep);
  color: #fff;
  font-family: var(--font-mono);
  font-size: 10px;
}

.explorer {
  display: grid;
  grid-template-columns: var(--rail) minmax(0, 1fr);
  gap: var(--s-6);
  align-items: start;
}

.explorer__rail {
  position: sticky;
  top: 78px;
  max-height: calc(100dvh - 96px);
  overflow-y: auto;
  padding-right: var(--s-2);
}

.explorer__main { min-width: 0; }

/* ---- Insight strip ---- */
.strip {
  display: grid;
  grid-template-columns: minmax(0, auto) minmax(0, 1fr);
  gap: var(--s-6);
  align-items: center;
  padding: var(--s-4) var(--s-5);
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
}

.strip__figures {
  display: flex;
  align-items: flex-start;
  gap: var(--s-6);
}

.strip__fig {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.strip__n {
  font-family: var(--font-display);
  font-size: var(--t-xl);
  font-weight: 700;
  font-stretch: 112%;
  line-height: 1.1;
  letter-spacing: -0.03em;
}

.strip__l {
  font-size: var(--t-xs);
  color: var(--text-muted);
}

.strip__hist { min-width: 0; }

.strip__histl { margin: 0 0 var(--s-2); }

/* ---- Toolbar ---- */
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-4);
  margin: var(--s-5) 0 var(--s-3);
}

.toolbar__count {
  margin: 0;
  font-size: var(--t-sm);
}

.toolbar__sort { margin-left: auto; }

.toolbar__select {
  padding: var(--s-2) var(--s-3);
  border: 1px solid var(--rule);
  border-radius: var(--r-md);
  background: var(--surface);
  color: var(--text);
  font-family: var(--font-body);
  font-size: var(--t-sm);
  cursor: pointer;
}

/* ---- Table ---- */
.ctable {
  width: 100%;
  min-width: 720px;
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

.ctable__c-buyer,
.ctable__c-sup {
  max-width: 190px;
  color: var(--text-muted);
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

.state__t { margin: 0 0 var(--s-2); font-size: var(--t-lg); }

.state__b {
  margin: 0 auto var(--s-4);
  max-width: 46ch;
  color: var(--text-muted);
  font-size: var(--t-sm);
}

.state__a {
  padding: var(--s-2) var(--s-5);
  border: 0;
  border-radius: var(--r-md);
  background: var(--ink);
  color: #fff;
  font-family: var(--font-body);
  font-weight: 600;
  font-size: var(--t-sm);
  cursor: pointer;
}

.skeleton {
  display: flex;
  flex-direction: column;
  gap: 1px;
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
  overflow: hidden;
}

.skeleton__row {
  height: 52px;
  background: linear-gradient(90deg, var(--surface) 25%, var(--surface-sunken) 37%, var(--surface) 63%);
  background-size: 400% 100%;
  animation: shimmer 1.4s ease infinite;
}

@keyframes shimmer {
  0% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}

/* ---- Pager ---- */
.pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--s-4);
  margin-top: var(--s-5);
}

.pager__b {
  display: inline-flex;
  align-items: center;
  gap: var(--s-1);
  padding: var(--s-2) var(--s-4);
  border: 1px solid var(--rule-strong);
  border-radius: var(--r-md);
  background: var(--surface);
  color: var(--text);
  font-family: var(--font-body);
  font-size: var(--t-sm);
  font-weight: 600;
  cursor: pointer;
}

.pager__b:disabled { opacity: 0.4; cursor: not-allowed; }
.pager__b:not(:disabled):hover { background: var(--surface-sunken); }

.pager__n {
  font-family: var(--font-mono);
  font-size: var(--t-sm);
  color: var(--text-muted);
}

/* ---- Rail sheet (mobile) ---- */
.railsheet {
  display: flex;
  flex-direction: column;
  height: 100dvh;
  background: var(--bg);
}

.railsheet__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--s-4) var(--s-5);
  border-bottom: 1px solid var(--rule);
  background: var(--surface);
}

.railsheet__x {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: var(--r-md);
  background: transparent;
  color: var(--text);
  cursor: pointer;
}

.railsheet__body {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: var(--s-5);
}

.railsheet__foot {
  padding: var(--s-4) var(--s-5) calc(var(--s-4) + env(safe-area-inset-bottom));
  border-top: 1px solid var(--rule);
  background: var(--surface);
}

.railsheet__apply {
  width: 100%;
  padding: var(--s-3);
  border: 0;
  border-radius: var(--r-md);
  background: var(--ink);
  color: #fff;
  font-family: var(--font-body);
  font-weight: 600;
  cursor: pointer;
}

/* ---- Responsive ---- */
@media (max-width: 1080px) {
  .explorer { grid-template-columns: 1fr; }
  .explorer__rail { display: none; }
  .railtoggle { display: inline-flex; }
}

@media (max-width: 820px) {
  .strip { grid-template-columns: 1fr; gap: var(--s-4); }
}

@media (max-width: 560px) {
  .strip__figures { gap: var(--s-4); flex-wrap: wrap; }
  .strip__fig--avg { display: none; }
  .page__head { align-items: center; }
}
</style>
