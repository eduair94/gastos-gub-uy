<script setup lang="ts">
/**
 * The agency directory.
 *
 * Every figure here comes from the `buyer_patterns` collection — the only
 * source that holds a per-agency money total. It is a precomputed snapshot
 * (see `lastUpdated`), not a live sum over `releases`: the releases carry no
 * `amount` for the years these agencies bought in.
 *
 * ## Why the whole directory is fetched at once
 *
 * `buyers/index.get.ts` cannot serve this table correctly page by page:
 *
 *   1. Its sort direction is inverted — `sortOrder === 'asc' ? 1 : 1` always
 *      resolves to 1, so `sortOrder=desc` returns the *smallest* spenders.
 *      (The sibling `suppliers/index.get.ts:33` has the intended
 *      `sortOrder === 'desc' ? -1 : 1`.) A directory whose headline promise is
 *      "sorted by total spent" cannot be built on it.
 *   2. It has no field projection, so every row drags its full `suppliers` id
 *      array — 4.964 ids for one agency, 5,6 MB for the 393 rows.
 *
 * So the directory is read once and `transform` drops the three fields the
 * table never reads. `transform` runs before the payload is serialised, so the
 * client receives ~116 kB (~19 kB gzipped) instead of 5,6 MB, and sorting,
 * search and paging are done here — correct regardless of what order the API
 * returns, and instant, which for a fixed set of 393 rows is the right trade.
 */
interface BuyerRow {
  buyerId: string
  name: string
  totalContracts: number
  totalSpending: number
  avgContractValue: number
  supplierCount: number
  yearCount: number
}

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const router = useRouter()
const { track } = useAnalytics()

const PAGE_SIZE = 25

// ---- State lives in the URL ---------------------------------------
// A search or a page is the thing someone pastes into a message; keeping
// it in the query string makes every view linkable and reloadable.
const search = ref((route.query.search as string) ?? '')
const sort = ref((route.query.sort as string) ?? 'totalDesc')
const page = ref(Number(route.query.page ?? 1) || 1)

const { data, pending, error } = await useFetch('/api/buyers', {
  query: { limit: 400 },
  transform: (res: { data?: { buyers?: Record<string, any>[] } }): BuyerRow[] =>
    (res?.data?.buyers ?? []).map(b => ({
      buyerId: String(b.buyerId),
      name: String(b.name ?? ''),
      totalContracts: b.totalContracts ?? 0,
      totalSpending: b.totalSpending ?? 0,
      avgContractValue: b.avgContractValue ?? 0,
      supplierCount: b.supplierCount ?? 0,
      yearCount: b.yearCount ?? 0,
    })),
})

const all = computed<BuyerRow[]>(() => data.value ?? [])

/** Fold accents so "administracion" finds "Administración". */
function fold(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

const term = computed(() => search.value.trim())

const filtered = computed(() => {
  const q = fold(term.value)
  if (!q) return all.value
  return all.value.filter(b => fold(b.name).includes(q))
})

const SORTS: Record<string, (a: BuyerRow, b: BuyerRow) => number> = {
  totalDesc: (a, b) => b.totalSpending - a.totalSpending,
  totalAsc: (a, b) => a.totalSpending - b.totalSpending,
  contractsDesc: (a, b) => b.totalContracts - a.totalContracts,
}

const sorted = computed(() =>
  [...filtered.value].sort(SORTS[sort.value] ?? SORTS.totalDesc!),
)

const totalPages = computed(() => Math.max(1, Math.ceil(sorted.value.length / PAGE_SIZE)))

// Clamped rather than watched: a search that shrinks the result set below the
// current page should not need a round trip through a watcher to stop
// rendering an empty table.
const currentPage = computed(() => Math.min(Math.max(1, page.value), totalPages.value))

const rows = computed(() => {
  const start = (currentPage.value - 1) * PAGE_SIZE
  return sorted.value.slice(start, start + PAGE_SIZE)
})

// Page 7 of a different result set is meaningless.
watch([term, sort], () => {
  page.value = 1
})

watch([term, sort, currentPage], () => {
  const q: Record<string, string> = {}
  if (term.value) q.search = term.value
  if (sort.value !== 'totalDesc') q.sort = sort.value
  if (currentPage.value > 1) q.page = String(currentPage.value)
  router.replace({ query: q })
})

// One settled query = one event. Skips the initial fire (arriving from a
// link/reload isn't "searching").
let searchTouched = false
watch(term, (q) => {
  if (!searchTouched) {
    searchTouched = true
    return
  }
  if (q) track('search', { search_term: q, location: 'buyers' })
  else track('filter_clear', { surface: 'buyers' })
})
watch(sort, s => track('sort_change', { surface: 'buyers', sort: s }))

function clearSearch() {
  search.value = ''
}

const siteUrl = useRuntimeConfig().public.siteUrl as string
const orgLd = useOrgLd()

useSeo(() => ({
  title: t('seo.buyers.title'),
  description: t('seo.buyers.description'),
  path: '/buyers',
  kicker: 'Organismos',
  jsonLd: [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      'name': t('seo.buyers.title'),
      'description': t('seo.buyers.description'),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      // Mirrors what's actually on screen right now (current page/sort/search),
      // capped well below the PAGE_SIZE=25 rows to keep the node small.
      'itemListElement': rows.value.slice(0, 20).map((b, i) => ({
        '@type': 'ListItem',
        'position': i + 1,
        'name': b.name,
        'url': `${siteUrl}/buyers/${encodeURIComponent(b.buyerId)}`,
      })),
    },
    orgLd,
  ],
}))
</script>

<template>
  <div class="u-container page">
    <header class="page__head">
      <p class="u-eyebrow">
        {{ t('home.eyebrow') }}
      </p>
      <h1>{{ t('buyers.title') }}</h1>
      <p class="u-lead page__lead">
        {{ t('buyers.lead', { total: formatNumber(all.length || undefined) }) }}
      </p>
    </header>

    <!-- ===== Toolbar ===== -->
    <div class="toolbar">
      <form
        class="finder"
        role="search"
        @submit.prevent
      >
        <label
          class="u-sr-only"
          for="buyer-q"
        >{{ t('common.search') }}</label>
        <v-icon
          class="finder__icon"
          size="18"
        >
          mdi-magnify
        </v-icon>
        <input
          id="buyer-q"
          v-model="search"
          class="finder__input"
          type="search"
          :placeholder="t('buyers.table.name')"
        >
      </form>

      <p class="toolbar__count u-mono">
        {{ t('buyers.resultsSummary', { count: formatNumber(sorted.length) }) }}
      </p>

      <label class="toolbar__sort">
        <span class="u-sr-only">{{ t('common.sortBy') }}</span>
        <select
          v-model="sort"
          class="toolbar__select"
        >
          <option value="totalDesc">
            {{ t('buyers.sort.totalDesc') }}
          </option>
          <option value="totalAsc">
            {{ t('buyers.sort.totalAsc') }}
          </option>
          <option value="contractsDesc">
            {{ t('buyers.sort.contractsDesc') }}
          </option>
        </select>
      </label>
    </div>

    <!-- ===== States ===== -->
    <PaginatedList
      :page="currentPage"
      :total-pages="totalPages"
      @update:page="page = $event"
    >
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
        v-else-if="pending && !all.length"
        class="skeleton"
      >
        <div
          v-for="i in 10"
          :key="i"
          class="skeleton__row"
        />
      </div>

      <div
        v-else-if="!rows.length"
        class="state"
      >
        <h2 class="state__t">
          {{ t('buyers.empty.title') }}
        </h2>
        <p class="state__b">
          {{ t('buyers.empty.body') }}
        </p>
        <button
          v-if="term"
          class="state__a"
          type="button"
          @click="clearSearch"
        >
          {{ t('buyers.empty.action') }}
        </button>
      </div>

      <!-- ===== Table ===== -->
      <div v-else>
        <table class="ctable dtable">
          <thead>
            <tr>
              <th scope="col">
                {{ t('buyers.table.name') }}
              </th>
              <th
                scope="col"
                class="ctable__c-num"
              >
                {{ t('buyers.table.contracts') }}
              </th>
              <th
                scope="col"
                class="ctable__c-num"
              >
                {{ t('buyers.table.suppliers') }}
              </th>
              <th
                scope="col"
                class="ctable__c-amt"
              >
                {{ t('buyers.table.total') }}
              </th>
              <th
                scope="col"
                class="ctable__c-amt"
              >
                {{ t('buyers.table.avg') }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="b in rows"
              :key="b.buyerId"
              class="ctable__row"
            >
              <td
                class="ctable__obj"
                data-primary
              >
                <NuxtLink
                  :to="localePath(`/buyers/${encodeURIComponent(b.buyerId)}`)"
                  class="ctable__link"
                >
                  {{ b.name }}
                </NuxtLink>
                <span class="ctable__meta">
                  {{ b.yearCount }} {{ t('buyers.table.years').toLowerCase() }}
                </span>
              </td>
              <td
                class="ctable__c-num u-mono"
                :data-label="t('buyers.table.contracts')"
              >
                {{ formatNumber(b.totalContracts) }}
              </td>
              <td
                class="ctable__c-num u-mono"
                :data-label="t('buyers.table.suppliers')"
              >
                {{ formatNumber(b.supplierCount) }}
              </td>
              <td
                class="ctable__c-amt"
                :data-label="t('buyers.table.total')"
              >
                <MoneyAmount
                  :amount="b.totalSpending"
                  compact
                />
              </td>
              <td
                class="ctable__c-amt"
                :data-label="t('buyers.table.avg')"
              >
                <MoneyAmount
                  :amount="b.avgContractValue"
                  compact
                  size="sm"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </PaginatedList>
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

.page__head { margin-bottom: var(--s-5); }

.page__head h1 { margin: var(--s-2) 0 0; }

.page__lead { margin: var(--s-3) 0 0; }

/* ---- Toolbar ---- */
.toolbar {
  display: flex;
  align-items: center;
  gap: var(--s-4);
  margin-bottom: var(--s-4);
}

.finder {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  flex: 0 1 340px;
  padding: var(--s-2) var(--s-3);
  background: var(--surface);
  border: 1px solid var(--rule-strong);
  border-radius: var(--r-md);
  transition: border-color var(--dur) var(--ease);
}

.finder:focus-within { border-color: var(--celeste); }

.finder__icon { color: var(--text-muted); flex: none; }

.finder__input {
  flex: 1 1 auto;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--text);
  font-family: var(--font-body);
  font-size: var(--t-sm);
}

.finder__input:focus { outline: none; }
.finder__input::placeholder { color: var(--text-muted); }

.toolbar__count {
  margin: 0;
  font-size: var(--t-sm);
  color: var(--text-muted);
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

.ctable__obj { max-width: 420px; }

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

.ctable td.ctable__c-num,
.ctable th.ctable__c-num {
  text-align: right;
  color: var(--text-muted);
  white-space: nowrap;
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

/* ---- Responsive ---- */
@media (max-width: 760px) {
  .toolbar {
    flex-wrap: wrap;
    gap: var(--s-3);
  }

  .finder { flex: 1 1 100%; }
  .toolbar__sort { margin-left: 0; }
  .toolbar__count { order: 3; }
}
</style>
