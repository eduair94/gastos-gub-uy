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
  /** AI category from supplier_enrichment (null when un-enriched). */
  category?: string | null
  /** DEI industrial-registry record when registered (null otherwise). */
  dei?: { estado?: string | null } | null
}

/** Uruguay's 19 departments, value = DB form (uppercase), matched case-insensitively. */
const DEPARTAMENTOS = [
  'ARTIGAS', 'CANELONES', 'CERRO LARGO', 'COLONIA', 'DURAZNO', 'FLORES', 'FLORIDA',
  'LAVALLEJA', 'MALDONADO', 'MONTEVIDEO', 'PAYSANDU', 'RIO NEGRO', 'RIVERA', 'ROCHA',
  'SALTO', 'SAN JOSE', 'SORIANO', 'TACUAREMBO', 'TREINTA Y TRES',
]

/** The `sup.cat.*` values a supplier can be filtered by (mirrors SupplierChip; excludes 'otro', which never renders as a chip). */
const CATEGORIAS = [
  'empresa', 'organismo-publico', 'persona', 'cooperativa', 'agencia-publicidad', 'productora',
  'medio-tv', 'medio-radio', 'medio-prensa', 'medio-digital', 'medio-via-publica',
]

const { t } = useI18n()

// v-select item lists (title/value pairs so translated labels can differ from
// the query-string value the API expects).
const SORT_ITEMS = computed(() => [
  { title: t('suppliers.sort.totalDesc'), value: 'totalDesc' },
  { title: t('suppliers.sort.totalAsc'), value: 'totalAsc' },
  { title: t('suppliers.sort.contractsDesc'), value: 'contractsDesc' },
  { title: t('suppliers.sort.buyersDesc'), value: 'buyersDesc' },
  { title: t('suppliers.sort.avgDesc'), value: 'avgDesc' },
  { title: t('suppliers.sort.nameAsc'), value: 'nameAsc' },
])

const TAMANO_ITEMS = computed(() => [
  { title: t('sup.dei.filter.sizeAny'), value: '' },
  { title: t('sup.dei.size.micro'), value: 'micro' },
  { title: t('sup.dei.size.pequena'), value: 'pequena' },
  { title: t('sup.dei.size.mediana'), value: 'mediana' },
  { title: t('sup.dei.size.gran'), value: 'gran' },
])

const DEPARTAMENTO_ITEMS = computed(() => [
  { title: t('sup.dei.filter.deptAny'), value: '' },
  ...DEPARTAMENTOS.map(d => ({ title: d, value: d })),
])

const CATEGORIA_ITEMS = computed(() => [
  { title: t('sup.filter.categoryAny'), value: '' },
  ...CATEGORIAS.map(c => ({ title: t(`sup.cat.${c}`), value: c })),
])
const localePath = useLocalePath()
const route = useRoute()
const router = useRouter()
const { track } = useAnalytics()

// ---- State lives in the URL ---------------------------------------
// A search or a page is the thing someone pastes into a message; keeping
// it in the query string makes every view linkable and reloadable.
const search = ref((route.query.search as string) ?? '')
const page = ref(Number(route.query.page ?? 1))
const sort = ref((route.query.sort as string) ?? 'totalDesc')

// ---- DEI cross-reference filters (also live in the URL) ----
const deiOnly = ref(route.query.dei === '1')
const tamano = ref((route.query.tamano as string) ?? '')
const departamento = ref((route.query.departamento as string) ?? '')
const categoria = ref((route.query.categoria as string) ?? '')
const hasFilters = computed(() => deiOnly.value || !!tamano.value || !!departamento.value || !!categoria.value)

function clearFilters() {
  track('filter_clear', { surface: 'suppliers' })
  deiOnly.value = false
  tamano.value = ''
  departamento.value = ''
  categoria.value = ''
  page.value = 1
}

/** Every sort key → the API `sortBy`/`sortOrder` it maps to. Each column has a
 * desc + asc key; `suppliers/index.get.ts` indexes all five fields. */
const SORTS: Record<string, { sortBy: string, sortOrder: 'asc' | 'desc' }> = {
  totalDesc: { sortBy: 'totalValue', sortOrder: 'desc' },
  totalAsc: { sortBy: 'totalValue', sortOrder: 'asc' },
  contractsDesc: { sortBy: 'totalContracts', sortOrder: 'desc' },
  contractsAsc: { sortBy: 'totalContracts', sortOrder: 'asc' },
  buyersDesc: { sortBy: 'buyerCount', sortOrder: 'desc' },
  buyersAsc: { sortBy: 'buyerCount', sortOrder: 'asc' },
  avgDesc: { sortBy: 'avgContractValue', sortOrder: 'desc' },
  avgAsc: { sortBy: 'avgContractValue', sortOrder: 'asc' },
  nameAsc: { sortBy: 'name', sortOrder: 'asc' },
  nameDesc: { sortBy: 'name', sortOrder: 'desc' },
}

// One table column = one sortable field with its desc/asc keys. `numeric` cols
// default to desc on first click (biggest first — the useful view); name to asc.
interface SortCol { field: string, label: string, cls: string, numeric: boolean, desc: string, asc: string }
const COLUMNS: SortCol[] = [
  { field: 'name', label: 'suppliers.table.name', cls: '', numeric: false, desc: 'nameDesc', asc: 'nameAsc' },
  { field: 'totalContracts', label: 'suppliers.table.contracts', cls: 'ctable__c-n', numeric: true, desc: 'contractsDesc', asc: 'contractsAsc' },
  { field: 'buyerCount', label: 'suppliers.table.buyers', cls: 'ctable__c-n', numeric: true, desc: 'buyersDesc', asc: 'buyersAsc' },
  { field: 'totalValue', label: 'suppliers.table.total', cls: 'ctable__c-amt', numeric: true, desc: 'totalDesc', asc: 'totalAsc' },
  { field: 'avgContractValue', label: 'suppliers.table.avg', cls: 'ctable__c-amt', numeric: true, desc: 'avgDesc', asc: 'avgAsc' },
]

// The active sort resolved to a field + direction, for header state/aria.
const activeSort = computed(() => SORTS[sort.value] ?? SORTS.totalDesc)
function sortDirFor(col: SortCol): 'asc' | 'desc' | null {
  if (activeSort.value.sortBy !== col.field) return null
  return activeSort.value.sortOrder
}
function ariaSortFor(col: SortCol): 'ascending' | 'descending' | 'none' {
  const d = sortDirFor(col)
  return d === 'asc' ? 'ascending' : d === 'desc' ? 'descending' : 'none'
}
// Click a header: if already sorting by this column, flip direction; else start
// on the column's natural first direction (desc for numbers, asc for name).
function toggleSort(col: SortCol) {
  const d = sortDirFor(col)
  sort.value = d === null ? (col.numeric ? col.desc : col.asc) : (d === 'desc' ? col.asc : col.desc)
}

// The API matches `name` with an unanchored regex, so every keystroke is a
// scan. Debounce rather than fire one per character.
const searchDebounced = refDebounced(search, 350)
const searchTerm = computed(() => searchDebounced.value.trim())

const listQuery = computed(() => ({
  page: page.value,
  limit: 25,
  ...(searchTerm.value ? { search: searchTerm.value } : {}),
  ...(deiOnly.value ? { dei: '1' } : {}),
  ...(tamano.value ? { tamano: tamano.value } : {}),
  ...(departamento.value ? { departamento: departamento.value } : {}),
  ...(categoria.value ? { categoria: categoria.value } : {}),
  ...(SORTS[sort.value] ?? SORTS.totalDesc),
}))

// Page 7 of a different result set is meaningless.
watch([searchTerm, sort, deiOnly, tamano, departamento, categoria], () => {
  page.value = 1
})

watch([searchTerm, page, sort, deiOnly, tamano, departamento, categoria], () => {
  const q: Record<string, string> = {}
  if (searchTerm.value) q.search = searchTerm.value
  if (page.value > 1) q.page = String(page.value)
  if (sort.value !== 'totalDesc') q.sort = sort.value
  if (deiOnly.value) q.dei = '1'
  if (tamano.value) q.tamano = tamano.value
  if (departamento.value) q.departamento = departamento.value
  if (categoria.value) q.categoria = categoria.value
  router.replace({ query: q })
})

// One settled query/filter set = one event. Skips the initial fire (arriving
// from a link/reload isn't "searching").
let searchTouched = false
watch([searchTerm, deiOnly, tamano, departamento, categoria], () => {
  if (!searchTouched) {
    searchTouched = true
    return
  }
  if (searchTerm.value) track('search', { search_term: searchTerm.value, location: 'suppliers' })
  if (hasFilters.value) track('filter_apply', { surface: 'suppliers', active_count: [deiOnly.value, tamano.value, departamento.value, categoria.value].filter(Boolean).length })
})
watch(sort, s => track('sort_change', { surface: 'suppliers', sort: s }))

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
  track('filter_clear', { surface: 'suppliers' })
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

// JSON-LD ItemList mirrors exactly what the table renders — the current
// page of results, capped well under the 25/page limit — never a fetch of
// its own. Absolute path (schema.org url expects one), matching the other
// index pages' jsonLd.
const siteUrl = useRuntimeConfig().public.siteUrl as string
const supplierListItems = computed(() =>
  suppliers.value.slice(0, 20).map((s, i) => ({
    '@type': 'ListItem',
    'position': i + 1,
    'name': s.name,
    'url': `${siteUrl}/suppliers/${s.supplierId.split('/').map(encodeURIComponent).join('/')}`,
  })),
)

const orgLd = useOrgLd()

useSeo(() => {
  const title = t('seo.suppliers.title')
  const description = t('seo.suppliers.description', { total: formatNumber(directoryTotal.value) })
  return {
    title,
    description,
    path: '/suppliers',
    // A search is not its own page — don't ask a crawler to index a query space.
    noindex: Boolean(searchTerm.value),
    kicker: 'Proveedores',
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        'name': title,
        'description': description,
      },
      {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        'itemListElement': supplierListItems.value,
      },
      orgLd,
    ],
  }
})
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

      <v-select
        v-model="sort"
        :items="SORT_ITEMS"
        :label="t('common.sortBy')"
        class="toolbar__vsel"
      />
    </div>

    <!-- ===== Tipo de proveedor (AI-classified) — kept apart from the DEI
         registry filters below: this is an advisory guess, not a verified fact. -->
    <div class="typefilter">
      <v-select
        v-model="categoria"
        :items="CATEGORIA_ITEMS"
        :label="t('sup.filter.category')"
        class="typefilter__vsel"
      />
      <span
        class="typefilter__note"
        :title="t('sup.aiTitle')"
      >{{ t('sup.filter.categoryNote') }}</span>
    </div>

    <!-- ===== DEI cross-reference filters ===== -->
    <div class="filters">
      <v-checkbox
        v-model="deiOnly"
        :label="t('sup.dei.filter.only')"
        density="compact"
        hide-details
        color="success"
        class="filters__toggle"
      />

      <v-select
        v-model="tamano"
        :items="TAMANO_ITEMS"
        :label="t('sup.dei.filter.size')"
        class="filters__vsel"
      />

      <v-select
        v-model="departamento"
        :items="DEPARTAMENTO_ITEMS"
        :label="t('sup.dei.filter.dept')"
        class="filters__vsel"
      />

      <button
        v-if="hasFilters"
        class="filters__clear"
        type="button"
        @click="clearFilters"
      >
        {{ t('sup.dei.filter.clear') }}
      </button>
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
              <th
                v-for="col in COLUMNS"
                :key="col.field"
                scope="col"
                :class="col.cls"
                :aria-sort="ariaSortFor(col)"
              >
                <button
                  type="button"
                  class="ctable__sort"
                  :class="{ 'ctable__sort--active': sortDirFor(col) }"
                  :title="t('suppliers.sortHint')"
                  @click="toggleSort(col)"
                >
                  <span>{{ t(col.label) }}</span>
                  <span
                    class="ctable__caret"
                    aria-hidden="true"
                  >{{ sortDirFor(col) === 'asc' ? '▲' : sortDirFor(col) === 'desc' ? '▼' : '↕' }}</span>
                </button>
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
                <div class="ctable__namerow d-flex align-center flex-wrap ga-2">
                  <NuxtLink
                    :to="supplierPath(s.supplierId)"
                    class="ctable__link"
                  >
                    {{ s.name }}
                  </NuxtLink>
                  <SupplierChip :category="s.category" />
                  <DeiChip
                    v-if="s.dei"
                    :estado="s.dei.estado"
                  />
                </div>
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

    <!-- ===== DEI: transparency signal + map ===== -->
    <DeiInsights />

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

.toolbar__vsel { flex: 0 0 auto; max-width: 220px; margin-left: auto; }

/* ---- DEI filters ---- */
.filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--s-3);
  margin-bottom: var(--s-3);
}

.filters__toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  font-size: var(--t-sm);
  color: var(--text);
  cursor: pointer;
}

.filters__toggle input { accent-color: var(--verde); cursor: pointer; }

.filters__vsel { flex: 0 1 200px; }

.filters__clear {
  padding: var(--s-1) var(--s-3);
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--celeste-deep);
  font-family: var(--font-body);
  font-size: var(--t-sm);
  font-weight: 600;
  cursor: pointer;
}

.filters__clear:hover { text-decoration: underline; }

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

/* ---- Sortable headers ---- */
.ctable__sort {
  display: inline-flex;
  align-items: center;
  gap: var(--s-1);
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  letter-spacing: inherit;
  text-transform: inherit;
  cursor: pointer;
}
.ctable th.ctable__c-n .ctable__sort,
.ctable th.ctable__c-amt .ctable__sort { flex-direction: row-reverse; }
.ctable__sort:hover { color: var(--text); }
.ctable__sort--active { color: var(--text); font-weight: 700; }
.ctable__caret {
  font-size: 0.7em;
  color: var(--text-muted);
  transition: color var(--dur) var(--ease);
}
.ctable__sort--active .ctable__caret { color: var(--celeste-deep); }

/* ---- Tipo filter (AI, kept apart from the DEI registry filters) ---- */
.typefilter {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--s-3);
  margin-bottom: var(--s-3);
}
.typefilter__vsel { flex: 0 1 220px; }
.typefilter__note {
  font-size: var(--t-xs);
  color: var(--text-muted);
  cursor: help;
}

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
  .toolbar__vsel { max-width: none; margin-left: 0; }
}
</style>
