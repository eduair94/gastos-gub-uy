<script setup lang="ts">
/**
 * The supplier directory.
 *
 * Every figure here comes from the `supplier_patterns` collection, which is
 * the only source that holds a per-supplier money total. It is a precomputed
 * snapshot (see `lastUpdated`), not a live sum over `releases` — the releases
 * themselves carry no `amount` for the years these suppliers traded in.
 */
interface SupplierRow {
  supplierId: string
  name: string
  totalContracts: number
  buyerCount: number
  totalValue: number
  avgContractValue: number
}

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const router = useRouter()

// ---- State lives in the URL ---------------------------------------
// A search or a page is the thing someone pastes into a message; keeping
// it in the query string makes every view linkable and reloadable.
const search = ref((route.query.search as string) ?? '')
const page = ref(Number(route.query.page ?? 1))
const sort = ref((route.query.sort as string) ?? 'totalDesc')

/** The two sort fields `suppliers/index.get.ts` actually indexes. */
const SORTS: Record<string, { sortBy: string, sortOrder: string }> = {
  totalDesc: { sortBy: 'totalValue', sortOrder: 'desc' },
  totalAsc: { sortBy: 'totalValue', sortOrder: 'asc' },
  contractsDesc: { sortBy: 'totalContracts', sortOrder: 'desc' },
}

// The API matches `name` with an unanchored regex, so every keystroke is a
// scan. Debounce rather than fire one per character.
const searchDebounced = refDebounced(search, 350)
const searchTerm = computed(() => searchDebounced.value.trim())

const listQuery = computed(() => ({
  page: page.value,
  limit: 25,
  ...(searchTerm.value ? { search: searchTerm.value } : {}),
  ...(SORTS[sort.value] ?? SORTS.totalDesc),
}))

// Page 7 of a different result set is meaningless.
watch([searchTerm, sort], () => {
  page.value = 1
})

watch([searchTerm, page, sort], () => {
  const q: Record<string, string> = {}
  if (searchTerm.value) q.search = searchTerm.value
  if (page.value > 1) q.page = String(page.value)
  if (sort.value !== 'totalDesc') q.sort = sort.value
  router.replace({ query: q })
})

const { data: listRes, pending, error } = await useFetch<any>('/api/suppliers', { query: listQuery })

// The lead states the size of the directory, which must not move when the
// reader types. The list's own total describes the search, so it cannot
// serve both — this asks for the unfiltered count once.
const { data: totalRes } = await useFetch<any>('/api/suppliers', {
  query: { limit: 1 },
  key: 'suppliers-directory-total',
})

const suppliers = computed<SupplierRow[]>(() => listRes.value?.data?.suppliers ?? [])
const pagination = computed(() => listRes.value?.data?.pagination ?? null)
const directoryTotal = computed<number | null>(() => totalRes.value?.data?.pagination?.total ?? null)
const totalPages = computed(() => Math.max(1, pagination.value?.totalPages ?? 1))

function clearSearch() {
  search.value = ''
  page.value = 1
}

/**
 * Supplier ids carry a forward slash (`R/210002980010`).
 *
 * Vue Router decodes `%2F` back to `/` while resolving a path, so a
 * pre-encoded link to a single-segment route resolved to
 * `/suppliers/R/210002980010`, matched nothing, and every row in this table
 * pointed at a 404. The detail route is therefore a catch-all
 * (`[...id].vue`); each segment is encoded on its own so the slash survives
 * as a real separator.
 */
function supplierPath(id: string) {
  return localePath(`/suppliers/${id.split('/').map(encodeURIComponent).join('/')}`)
}

useSeo(() => ({
  title: t('seo.suppliers.title'),
  description: t('seo.suppliers.description', { total: formatNumber(directoryTotal.value) }),
  path: '/suppliers',
  // A search is not its own page — don't ask a crawler to index a query space.
  noindex: Boolean(searchTerm.value),
}))
</script>

<template>
  <div class="u-container page">
    <header class="page__head">
      <p class="u-eyebrow">
        {{ t('home.eyebrow') }}
      </p>
      <h1>{{ t('suppliers.title') }}</h1>
      <p class="u-lead page__lead">
        {{ t('suppliers.lead', { total: formatNumber(directoryTotal) }) }}
      </p>
    </header>

    <!-- ===== Toolbar: search + sort ===== -->
    <div class="toolbar">
      <form
        class="find"
        role="search"
        @submit.prevent
      >
        <label
          class="u-sr-only"
          for="supplier-q"
        >{{ t('common.search') }}</label>
        <v-icon
          class="find__icon"
          size="20"
        >
          mdi-magnify
        </v-icon>
        <input
          id="supplier-q"
          v-model="search"
          class="find__input"
          type="search"
          :placeholder="t('filters.supplierPlaceholder')"
        >
        <button
          v-if="search"
          class="find__x"
          type="button"
          :aria-label="t('common.clear')"
          @click="clearSearch"
        >
          <v-icon size="18">
            mdi-close
          </v-icon>
        </button>
      </form>

      <label class="toolbar__sort">
        <span class="u-sr-only">{{ t('common.sortBy') }}</span>
        <select
          v-model="sort"
          class="toolbar__select"
        >
          <option value="totalDesc">
            {{ t('suppliers.sort.totalDesc') }}
          </option>
          <option value="totalAsc">
            {{ t('suppliers.sort.totalAsc') }}
          </option>
          <option value="contractsDesc">
            {{ t('suppliers.sort.contractsDesc') }}
          </option>
        </select>
      </label>
    </div>

    <p
      v-if="pagination?.total != null"
      class="count"
    >
      {{ t('suppliers.resultsSummary', { count: formatNumber(pagination.total) }) }}
    </p>

    <!-- ===== Results ===== -->
    <PaginatedList
      v-model:page="page"
      :total-pages="totalPages"
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
        v-else-if="pending && !suppliers.length"
        class="skeleton"
      >
        <div
          v-for="i in 8"
          :key="i"
          class="skeleton__row"
        />
      </div>

      <div
        v-else-if="!suppliers.length"
        class="state"
      >
        <h2 class="state__t">
          {{ t('suppliers.empty.title') }}
        </h2>
        <p class="state__b">
          {{ t('suppliers.empty.body') }}
        </p>
        <button
          v-if="searchTerm"
          class="state__a"
          type="button"
          @click="clearSearch"
        >
          {{ t('suppliers.empty.action') }}
        </button>
      </div>

      <div v-else>
        <table class="ctable dtable">
          <thead>
            <tr>
              <th scope="col">
                {{ t('suppliers.table.name') }}
              </th>
              <th
                scope="col"
                class="ctable__c-n"
              >
                {{ t('suppliers.table.contracts') }}
              </th>
              <th
                scope="col"
                class="ctable__c-n"
              >
                {{ t('suppliers.table.buyers') }}
              </th>
              <th
                scope="col"
                class="ctable__c-amt"
              >
                {{ t('suppliers.table.total') }}
              </th>
              <th
                scope="col"
                class="ctable__c-amt"
              >
                {{ t('suppliers.table.avg') }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="s in suppliers"
              :key="s.supplierId"
              class="ctable__row"
            >
              <td
                class="ctable__obj"
                data-primary
              >
                <NuxtLink
                  :to="supplierPath(s.supplierId)"
                  class="ctable__link"
                >
                  {{ s.name }}
                </NuxtLink>
                <span class="ctable__id">{{ s.supplierId }}</span>
              </td>
              <td
                class="ctable__c-n u-mono"
                :data-label="t('suppliers.table.contracts')"
              >
                {{ formatNumber(s.totalContracts) }}
              </td>
              <td
                class="ctable__c-n u-mono"
                :data-label="t('suppliers.table.buyers')"
              >
                {{ formatNumber(s.buyerCount) }}
              </td>
              <td
                class="ctable__c-amt"
                :data-label="t('suppliers.table.total')"
              >
                <MoneyAmount
                  :amount="s.totalValue"
                  compact
                />
              </td>
              <td
                class="ctable__c-amt"
                :data-label="t('suppliers.table.avg')"
              >
                <MoneyAmount
                  :amount="s.avgContractValue"
                  compact
                  size="sm"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </PaginatedList>

    <p class="source">
      {{ t('home.sourceNote') }}
    </p>
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

.page__lead { margin: var(--s-3) 0 0; }

/* ---- Toolbar ---- */
.toolbar {
  display: flex;
  align-items: center;
  gap: var(--s-4);
  margin-bottom: var(--s-3);
}

.find {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  flex: 1 1 auto;
  min-width: 0;
  max-width: 420px;
  padding: var(--s-1) var(--s-3);
  background: var(--surface);
  border: 1px solid var(--rule-strong);
  border-radius: var(--r-md);
  transition: border-color var(--dur) var(--ease);
}

.find:focus-within { border-color: var(--celeste); }

.find__icon {
  color: var(--text-muted);
  flex: none;
}

.find__input {
  flex: 1 1 auto;
  min-width: 0;
  padding: var(--s-2) 0;
  border: 0;
  background: transparent;
  color: var(--text);
  font-family: var(--font-body);
  font-size: var(--t-sm);
}

.find__input:focus { outline: none; }
.find__input::placeholder { color: var(--text-muted); }
.find__input::-webkit-search-cancel-button { display: none; }

.find__x {
  display: grid;
  place-items: center;
  flex: none;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}

.find__x:hover { color: var(--text); }

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

.count {
  margin: 0 0 var(--s-3);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  color: var(--text-muted);
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

.ctable__id {
  display: block;
  margin-top: 2px;
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  color: var(--text-muted);
}

.ctable td.ctable__c-n,
.ctable th.ctable__c-n {
  text-align: right;
  white-space: nowrap;
  color: var(--text-muted);
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

.source {
  margin: var(--s-6) 0 0;
  padding-top: var(--s-5);
  border-top: 1px solid var(--rule);
  font-size: var(--t-sm);
  color: var(--text-muted);
}

/* ---- Responsive ---- */
@media (max-width: 640px) {
  .toolbar { flex-direction: column; align-items: stretch; }
  .find { max-width: none; }
  .toolbar__sort { margin-left: 0; }
  .toolbar__select { width: 100%; }
}
</style>
