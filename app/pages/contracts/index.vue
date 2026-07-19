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

/**
 * The explorer opens on awards.
 *
 * One OCID emits a release per lifecycle step, and the newest are always
 * `tenderUpdate` clarifications — no supplier, no items, no amount. Left
 * unfiltered and sorted by date, the landing view is a wall of "$ 0"
 * rows, which reads as broken data rather than as the tender paperwork
 * it is. "Contrato" means the award to a citizen, so that is the default.
 * Nothing is hidden: every other stage is one chip away in the rail.
 */
const DEFAULT_TAGS = ['award']

function fromRoute(): FilterState {
  const q = route.query
  return {
    search: (q.search as string) ?? '',
    // `tag=` (explicitly empty) means "all stages" and must survive a
    // reload; a missing param means the reader hasn't chosen yet.
    tag: q.tag === undefined ? [...DEFAULT_TAGS] : parseList(q.tag),
    buyers: parseList(q.buyers),
    suppliers: parseList(q.suppliers),
    // Catalogue article ("PIGMENTO"). No rail control of its own — it
    // arrives via links like the detail page's "ver comparables" — but
    // it must survive the round-trip through this state or the link
    // would silently show ALL contracts as if they were comparables.
    category: parseList(q.category),
    // The catalogue code the "ver comparables" link filters by. Read it or the
    // link silently shows every award as if it were a comparable.
    categoryId: parseList(q.categoryId),
    // Buyer id ("98-1") — arrives from the Intendencias/organism analytics links,
    // where the buyer is known by its stable id. No rail control; read it or the
    // per-intendencia link would show every award instead of that buyer's.
    buyerIds: parseList(q.buyerIds),
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
  // Only meaningful in single-product focus mode; the server projects
  // `focusItem` and falls back to date when there is no single categoryId.
  itemPriceDesc: { sortBy: 'itemUnitPrice', sortOrder: 'desc' },
  itemPriceAsc: { sortBy: 'itemUnitPrice', sortOrder: 'asc' },
  itemQtyDesc: { sortBy: 'itemQuantity', sortOrder: 'desc' },
  itemQtyAsc: { sortBy: 'itemQuantity', sortOrder: 'asc' },
}

const PRODUCT_SORTS = ['itemPriceDesc', 'itemPriceAsc', 'itemQtyDesc', 'itemQtyAsc']

/** Exactly one catalogue code filtered → the table shows that line's specifics. */
const focusCode = computed(() => filters.value.categoryId.length === 1 ? filters.value.categoryId[0]! : null)

// Leaving focus mode (or picking several products) invalidates a product sort.
watch(focusCode, (v) => {
  if (!v && PRODUCT_SORTS.includes(sort.value)) sort.value = 'dateDesc'
})

const activeCount = computed(() => {
  const f = filters.value
  return [
    f.search, f.tag.length, f.buyers.length, f.buyerIds.length, f.suppliers.length, f.category.length, f.categoryId.length,
    f.procurementMethodDetails.length,
    f.status.length, f.currency.length, f.yearFrom, f.yearTo,
    f.amountFrom, f.amountTo, f.hasAmount || null,
  ].filter(Boolean).length
})

/** The params both /contracts and /contracts/stats accept. */
const apiQueryNow = computed(() => {
  const f = filters.value
  const q: Record<string, unknown> = {}
  if (f.search) q.search = f.search
  if (f.tag.length) q.tag = f.tag.join(',')
  if (f.buyers.length) q.buyers = f.buyers.join(',')
  if (f.buyerIds.length) q.buyerIds = f.buyerIds.join(',')
  if (f.suppliers.length) q.suppliers = f.suppliers.join(',')
  if (f.category.length) q.category = f.category.join(',')
  if (f.categoryId.length) q.categoryId = f.categoryId.join(',')
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

/**
 * Debounced before it reaches the network.
 *
 * The search box and the amount fields are free-text, and every
 * keystroke used to fire BOTH `/api/contracts` and
 * `/api/contracts/stats`. Typing "tomografo" issued 18 requests — each a
 * text search or aggregation over 2.2M documents — which stalled the
 * server, tripped the 30/min rate limiter, and froze the page. The
 * discrete controls (chips, selects) pay 300ms they don't need; that is
 * imperceptible and not worth two code paths.
 */
const apiQuery = refDebounced(apiQueryNow, 300)

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

/** The query string this page would write for its current state. */
function urlQueryNow(): Record<string, string> {
  const q: Record<string, string> = {}
  for (const [k, v] of Object.entries(apiQuery.value)) q[k] = String(v)
  // `tag` is always written, including as an empty string, so that
  // "show me every stage" survives a reload instead of snapping back to
  // the award default.
  q.tag = filters.value.tag.join(',')
  if (page.value > 1) q.page = String(page.value)
  if (sort.value !== 'dateDesc') q.sort = sort.value
  return q
}

// Push state to the URL once the query settles. Driven by the debounced
// value so the address bar reflects what was actually fetched, rather
// than lagging a keystroke behind it.
watch([apiQuery, page, sort], () => {
  router.replace({ query: urlQueryNow() })
}, { deep: true })

function sameQuery(a: Record<string, unknown>, b: Record<string, unknown>) {
  const ka = Object.keys(a).sort()
  const kb = Object.keys(b).sort()
  return ka.length === kb.length && ka.every((k, i) => k === kb[i] && String(a[k]) === String(b[k]))
}

// The top bar's search (and the browser's back button) rewrites the
// query while this page is already mounted, and setup() only runs once —
// without this, an in-place navigation changes the address bar and
// nothing else.
//
// The guard is NOT a simple state comparison: apiQuery lags filters by
// 300ms, so our own router.replace above can legitimately write a URL
// built from stale values (e.g. a sort change fires the writer while the
// search debounce is still pending). Re-importing that echo would revert
// what the user just typed. Anything identical to what we'd write right
// now is ours; only a genuinely foreign query re-imports state.
watch(() => route.query, () => {
  if (sameQuery(route.query, urlQueryNow())) return
  const next = fromRoute()
  if (JSON.stringify(next) !== JSON.stringify(filters.value)) filters.value = next
  const nextPage = Number(route.query.page ?? 1)
  if (nextPage !== page.value) page.value = nextPage
  const nextSort = (route.query.sort as string) ?? 'dateDesc'
  if (nextSort !== sort.value) sort.value = nextSort
})

// Relevance ordering only exists while there is a search term. If the
// term is cleared, the <option> disappears but the value would linger —
// a blank select, sorting by a score the API no longer computes.
watch(() => filters.value.search, (s) => {
  if (!s && sort.value === 'relevance') sort.value = 'dateDesc'
})

const { data: optionsRes, pending: optionsPending } = await useFetch<any>('/api/contracts/filters')
const options = computed(() => optionsRes.value?.data ?? null)

// The monthly BCU rate table, loaded once, so the preview popup can restate an
// amount in UYU at the contract's own month and in today's pesos client-side.
const { data: rateRes } = await useFetch<any>('/api/rates')
const rateTable = computed(() => rateRes.value?.data ?? null)

const { data: listRes, pending, error } = await useFetch<any>('/api/contracts', { query: listQuery })
const { data: statsRes, pending: statsPending } = await useFetch<any>('/api/contracts/stats', { query: apiQuery })

const contracts = computed<ContractLike[]>(() => listRes.value?.data?.contracts ?? [])
const pagination = computed(() => listRes.value?.data?.pagination ?? null)
const stats = computed(() => statsRes.value?.data ?? null)

// --- Per-item características (focus mode) ---------------------------------
// In single-product mode the table shows the matched line's scraped detail
// (Marca, Presentación, Nombre comercial). Those live only in the scraped
// cache, keyed by compraId, so we batch-fetch them for the visible page:
// cached rows come back instantly, misses fill over repeat views.
type FeatureRec = { items: Array<{ nro: number, features: Array<{ name: string, value: string }>, variation?: string }>, object: string | null }
const featuresByCompra = ref<Map<string, FeatureRec>>(new Map())

const stripAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/**
 * Value of the first feature matching `names`, tried IN ORDER — so
 * `['nombre comercial','presentacion']` prefers the commercial name and only
 * falls back to presentación. Accent/case-insensitive.
 */
function featureValue(compraId: string | null | undefined, nro: number | null | undefined, names: string[]): string | null {
  if (!compraId || nro == null) return null
  const rec = featuresByCompra.value.get(compraId)
  const item = rec?.items.find(i => i.nro === nro)
  if (!item) return null
  for (const w of names.map(stripAccents)) {
    const hit = item.features.find(f => stripAccents(f.name).includes(w))
    if (hit) return hit.value
  }
  return null
}

async function loadFeatures() {
  if (!focusCode.value) return
  const rows = (contracts.value as any[])
    .filter(c => c.compraId && c.ocid && !featuresByCompra.value.has(c.compraId))
    .map(c => ({ compraId: c.compraId as string, ocid: c.ocid as string }))
  if (!rows.length) return
  try {
    const res = await $fetch<any>('/api/contracts/item-features/batch', { method: 'POST', body: { items: rows.slice(0, 25) } })
    const next = new Map(featuresByCompra.value)
    for (const [id, v] of Object.entries<any>(res?.data ?? {})) if (v && !('pending' in v)) next.set(id, v)
    featuresByCompra.value = next
  }
  catch { /* leave cells blank; a later view retries */ }
}

watch(contracts, () => {
  loadFeatures()
}, { immediate: true })

/**
 * The histogram plots money when we could total it, and contract counts
 * when we couldn't.
 *
 * A broad filter set (the default `tag=award` matches 1.4M releases)
 * can't be summed inside the time budget, so `byYear[].value` comes back
 * null — which plotted a chart of nulls: an empty frame with a "$ 0"
 * axis. The counts are always exact, so show those and say so, rather
 * than render an empty box.
 */
const byYearIsCount = computed(() =>
  (stats.value?.byYear ?? []).some((d: any) => d.value === null || d.value === undefined),
)

/** True when the API actually totalled this filter set. */
const canTotal = computed(() =>
  typeof stats.value?.totalValue === 'number' && stats.value.totalValue > 0,
)

const byYear = computed(() =>
  (stats.value?.byYear ?? [])
    .filter((d: any) => d.year && (byYearIsCount.value ? d.count > 0 : d.value > 0))
    .map((d: any) => ({
      year: d.year,
      value: byYearIsCount.value ? d.count : d.value,
      count: d.count,
    }))
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
    // Back to the default view, not to an empty one: clearing should
    // land the reader on contracts again, not on a wall of $0 paperwork.
    search: '', tag: [...DEFAULT_TAGS], buyers: [], buyerIds: [], suppliers: [], category: [], categoryId: [],
    procurementMethodDetails: [],
    status: [], currency: [], yearFrom: null, yearTo: null,
    amountFrom: null, amountTo: null, hasAmount: false,
  }
  page.value = 1
}

const railOpen = ref(false)

/**
 * Names every row.
 *
 * A clarification or an amendment has no subject of its own, so
 * `contractTitle` returns ''. Printing a bare "Contrato" there made the
 * row look like broken data; naming the stage and the tender it belongs
 * to says what it actually is.
 */
function rowTitle(c: ContractLike): string {
  const title = contractTitle(c)
  if (title) return title
  const fb = contractTitleFallback(c)
  return t(fb.key, fb.params)
}

function itemCount(c: ContractLike): number {
  return (c.awards ?? []).reduce((n, a) => n + (a.items?.length ?? 0), 0)
}

/** How many item lines a row previews before collapsing to a count. */
const PREVIEW_ITEMS = 3

/**
 * "6 unidades", not "6unidad".
 *
 * The unit comes from the source in singular upper case ("UNIDAD",
 * "MENSUAL"). Lower-casing it is not enough — it has to agree with the
 * quantity, and only some of these units are nouns that pluralise. The
 * ones that are adjectival periods ("MENSUAL", "ANUAL") do not take an
 * -s here, so only pluralise the plain nouns.
 */
const PLURALISABLE = new Set(['unidad', 'kilo', 'kilogramo', 'litro', 'metro', 'hora', 'día', 'dia', 'mes', 'año', 'ano', 'caja', 'bolsa', 'paquete', 'juego', 'rollo', 'tonelada', 'gramo'])

function qtyLabel(it: { quantity?: number | null, unitName?: string }): string {
  const n = it.quantity ?? 0
  const qty = formatNumber(n)
  const raw = (it.unitName ?? '').trim().toLowerCase()
  if (!raw) return qty

  const plural = n !== 1 && PLURALISABLE.has(raw)
    ? (/[aeiou]$/.test(raw) ? `${raw}s` : `${raw}es`)
    : raw

  return `${qty} ${plural}`
}

/**
 * Reorders lines so the ones matching the active search lead.
 *
 * A search for "bicarbonatada molar" is a search for the LINE that says so,
 * but that line can sit ninth in a ten-item contract — off the bottom of the
 * three-row preview, so the row that matched shows none of why it matched.
 * Ranking by how many of the search tokens a line contains (stable within a
 * tie) floats the reason for the match to the top, here and in the dialog.
 */
function orderByMatch<T extends { description?: string, code?: string, codeDescription?: string }>(rows: T[], phrase: string): T[] {
  const tokens = phrase.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (!tokens.length) return rows
  const score = (r: T) => {
    const hay = `${r.description ?? ''} ${r.code ?? ''} ${r.codeDescription ?? ''}`.toLowerCase()
    return tokens.reduce((n, tk) => n + (hay.includes(tk) ? 1 : 0), 0)
  }
  return rows
    .map((r, i) => ({ r, i, s: score(r) }))
    .sort((a, b) => (b.s - a.s) || (a.i - b.i))
    .map(x => x.r)
}

/**
 * The lines actually bought, previewed under each row.
 *
 * A title alone reduces a three-line contract to one phrase, which is
 * how the item detail went missing from the table. Showing the real
 * lines — with quantity, unit and unit price — is the difference between
 * a list of names and a record you can read.
 */
function itemPreview(c: ContractLike) {
  const rows = orderByMatch(contractItems(c), filters.value.search)
  return {
    rows: rows.slice(0, PREVIEW_ITEMS),
    more: Math.max(0, rows.length - PREVIEW_ITEMS),
  }
}

// ---- Full item list, in place ---------------------------------------
const itemsDialog = ref(false)
const itemsFor = ref<ContractLike | null>(null)

// Opens the preview popup for a row (from the object link or the "+N items"
// button). The dialog component owns the item table, its in-dialog filter, the
// total and the amount conversions — it just needs the contract and the rate
// table.
function openItems(c: ContractLike) {
  itemsFor.value = c
  itemsDialog.value = true
}

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
        data-tour="explorer-filters"
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
        <div
          class="strip"
          data-tour="explorer-kpis"
        >
          <div class="strip__figures">
            <div class="strip__fig">
              <span class="strip__n">{{ statsPending ? '·····' : formatNumber(stats?.count) }}</span>
              <span class="strip__l">{{ t('common.contracts') }}</span>
            </div>

            <!-- Totals only exist for a filter set narrow enough to sum.
                 A stack of "Sin monto" reads as broken; say what to do
                 instead. -->
            <template v-if="!statsPending && canTotal">
              <div class="strip__fig">
                <MoneyAmount
                  :amount="stats?.totalValue"
                  compact
                  size="lg"
                  align="start"
                />
                <span class="strip__l">{{ t('home.statSpending') }}</span>
              </div>
              <div class="strip__fig strip__fig--avg">
                <MoneyAmount
                  :amount="stats?.medianValue ?? stats?.avgValue"
                  compact
                  size="sm"
                  align="start"
                />
                <span class="strip__l">{{ stats?.medianValue ? t('home.statTypical') : t('suppliers.detail.avgContract') }}</span>
              </div>
            </template>

            <p
              v-else-if="!statsPending"
              class="strip__hint"
            >
              {{ t('contracts.needFilter') }}
            </p>
          </div>

          <div
            v-if="byYear.length > 1"
            class="strip__hist"
          >
            <p class="u-eyebrow strip__histl">
              {{ byYearIsCount ? t('contracts.histogramCount') : t('contracts.histogramValue') }}
            </p>
            <YearBars
              :data="byYear"
              :height="64"
              :unit="byYearIsCount ? 'count' : 'money'"
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
              <template v-if="focusCode">
                <option value="itemPriceDesc">
                  {{ t('contracts.sort.itemPriceDesc') }}
                </option>
                <option value="itemPriceAsc">
                  {{ t('contracts.sort.itemPriceAsc') }}
                </option>
                <option value="itemQtyDesc">
                  {{ t('contracts.sort.itemQtyDesc') }}
                </option>
                <option value="itemQtyAsc">
                  {{ t('contracts.sort.itemQtyAsc') }}
                </option>
              </template>
            </select>
          </label>
        </div>

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

          <div v-else>
            <table
              class="ctable dtable"
              data-tour="explorer-table"
            >
              <thead>
                <tr>
                  <th scope="col">
                    {{ t('contracts.table.object') }}
                  </th>
                  <template v-if="focusCode">
                    <th
                      scope="col"
                      class="ctable__c-prod"
                    >
                      {{ t('contracts.table.product') }}
                    </th>
                    <th
                      scope="col"
                      class="ctable__c-qty"
                    >
                      {{ t('contracts.table.qty') }}
                    </th>
                    <th
                      scope="col"
                      class="ctable__c-uprice"
                    >
                      {{ t('contracts.table.unitPrice') }}
                    </th>
                  </template>
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
                  <td
                    class="ctable__obj"
                    data-primary
                  >
                    <!-- A plain anchor, not <NuxtLink>: a RouterLink navigates
                         from its OWN click handler (router.push), so @click.prevent
                         can't reliably stop it. On a bare <a> the default action IS
                         the navigation, so .exact.prevent opens the preview on a
                         plain click while ⌘/Ctrl/middle-click still follow the href
                         to a new tab, and crawlers still see a real link. -->
                    <a
                      :href="localePath(`/contracts/${c.id}`)"
                      class="ctable__link"
                      @click.exact.prevent="openItems(c)"
                    >
                      {{ rowTitle(c) }}
                    </a>
                    <span class="ctable__sub">
                      <!-- The stage is why a row may carry no supplier or
                         amount. Naming it turns "missing data" into a
                         fact the reader can act on. -->
                      <span
                        v-if="primaryTag(c)"
                        class="tag"
                        :class="tagTone(primaryTag(c))"
                        :title="t(`contract.stageHelp.${primaryTag(c)}`)"
                      >{{ t(`contract.stage.${primaryTag(c)}`) }}</span>
                      <span
                        v-if="c.tender?.procurementMethodDetails"
                        class="ctable__method"
                      >{{ c.tender.procurementMethodDetails }}</span>
                      <span
                        v-if="itemCount(c) > 1"
                        class="ctable__method"
                      >{{ t('contract.itemsCount', itemCount(c), { n: itemCount(c) }) }}</span>
                    </span>

                    <!-- What was actually bought. The title collapses a
                       multi-line contract into one phrase; these are the
                       lines behind it. -->
                    <ul
                      v-if="itemPreview(c).rows.length"
                      class="items"
                    >
                      <li
                        v-for="(it, i) in itemPreview(c).rows"
                        :key="i"
                        class="items__row"
                      >
                        <span class="items__desc">{{ it.description || '—' }}</span>
                        <span
                          v-if="it.quantity"
                          class="items__qty"
                        >{{ qtyLabel(it) }}</span>
                        <MoneyAmount
                          v-if="it.unitAmount !== null"
                          :amount="it.unitAmount"
                          :currency="it.currency"
                          :rule="false"
                          size="sm"
                          compact
                        />
                      </li>
                      <!-- Opens the full item list in place. Sending the
                         reader to the detail page to answer "what else is
                         in this contract?" loses their filters and their
                         scroll position for one question. -->
                      <li
                        v-if="itemPreview(c).more"
                        class="items__more"
                      >
                        <button
                          type="button"
                          @click="openItems(c)"
                        >
                          {{ t('contracts.moreItems', itemPreview(c).more, { n: itemPreview(c).more }) }}
                        </button>
                      </li>
                    </ul>
                  </td>
                  <template v-if="focusCode">
                    <td
                      class="ctable__c-prod"
                      :data-label="t('contracts.table.product')"
                    >
                      <span class="u-clamp-2">{{ c.focusItem?.description || '—' }}</span>
                      <span
                        v-if="featureValue(c.compraId, c.focusItem?.nro, ['marca'])"
                        class="ctable__feat"
                      >{{ t('contracts.table.brand') }}: {{ featureValue(c.compraId, c.focusItem?.nro, ['marca']) }}</span>
                      <span
                        v-if="featureValue(c.compraId, c.focusItem?.nro, ['nombre comercial', 'modelo', 'presentacion'])"
                        class="ctable__feat"
                      >{{ featureValue(c.compraId, c.focusItem?.nro, ['nombre comercial', 'modelo', 'presentacion']) }}</span>
                    </td>
                    <td
                      class="ctable__c-qty u-mono"
                      :data-label="t('contracts.table.qty')"
                    >
                      {{ c.focusItem?.quantity != null ? formatNumber(c.focusItem.quantity) : '—' }}
                      <span
                        v-if="c.focusItem?.unitName"
                        class="ctable__unit"
                      >{{ c.focusItem.unitName }}</span>
                    </td>
                    <td
                      class="ctable__c-uprice"
                      :data-label="t('contracts.table.unitPrice')"
                    >
                      <MoneyAmount
                        :amount="c.focusItem?.unitAmount ?? null"
                        :currency="c.focusItem?.currency"
                        :rule="false"
                        size="sm"
                        compact
                      />
                    </td>
                  </template>
                  <td
                    class="ctable__c-buyer"
                    :data-label="t('contracts.table.buyer')"
                  >
                    <span class="u-clamp-2">{{ c.buyer?.name || '—' }}</span>
                  </td>
                  <td
                    class="ctable__c-sup"
                    :data-label="t('contracts.table.supplier')"
                  >
                    <span class="u-clamp-2">{{ contractSuppliers(c)[0]?.name || '—' }}</span>
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
                    :title="!isMoneyStage(c) ? t('contract.noMoneyStage') : undefined"
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
        </PaginatedList>
      </div>
    </div>

    <!-- Click-to-preview: who / what / how much, without leaving the results. -->
    <ContractPreviewDialog
      v-model="itemsDialog"
      :contract="itemsFor"
      :rate-table="rateTable"
      :search-phrase="filters.search"
    />
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
  /* --celeste-deep flips light on the dark theme; --surface flips dark, so the
     digit stays readable on both (and is #fff on light, same as before). */
  color: var(--surface);
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

.strip__hint {
  margin: 0;
  max-width: 34ch;
  font-size: var(--t-xs);
  line-height: 1.45;
  color: var(--text-muted);
  align-self: center;
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
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
  font-weight: 600;
  color: var(--text);
  text-decoration: none;
}

.ctable__link:hover {
  color: var(--celeste-deep);
  text-decoration: underline;
}

.ctable__sub {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--s-2);
  margin-top: var(--s-2);
}

.ctable__method {
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  color: var(--text-muted);
}

/* ---- Item preview ----
   Indented under the title and set on a rule, so it reads as detail
   belonging to the row rather than as more rows. */
.items {
  margin: var(--s-2) 0 0;
  padding: 0 0 0 var(--s-3);
  list-style: none;
  border-left: 2px solid var(--rule);
}

.items__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: baseline;
  gap: var(--s-2) var(--s-3);
  padding: 2px 0;
}

.items__desc {
  font-size: var(--t-xs);
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.items__qty {
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  color: var(--text-muted);
  white-space: nowrap;
}

.items__more {
  padding-top: 2px;
}

.items__more button {
  padding: 0;
  border: 0;
  background: none;
  font-family: var(--font-body);
  font-size: var(--t-xs);
  font-weight: 600;
  color: var(--celeste-deep);
  cursor: pointer;
}

.items__more button:hover { text-decoration: underline; }

/* ---- Items dialog ---- */
.idlg {
  display: flex;
  flex-direction: column;
  max-height: 84dvh;
  background: var(--surface);
  border-radius: var(--r-lg);
}

.idlg__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--s-4);
  padding: var(--s-4) var(--s-5);
  border-bottom: 1px solid var(--rule);
}

.idlg__headtext { min-width: 0; }

.idlg__title {
  margin: var(--s-1) 0 0;
  /* The dialog names a contract; it is not the page's headline. At the
     global h2 scale it shouted over the very table it introduces. */
  font-size: var(--t-md);
  font-stretch: 100%;
  letter-spacing: -0.01em;
  line-height: 1.25;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.idlg__x {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  flex: none;
  border: 0;
  border-radius: var(--r-md);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}

.idlg__x:hover { color: var(--text); background: var(--surface-sunken); }

.idlg__filter {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  margin: var(--s-3) var(--s-5) 0;
  padding: var(--s-2) var(--s-3);
  border: 1px solid var(--rule-strong);
  border-radius: var(--r-md);
  background: var(--surface-sunken);
}

.idlg__filter:focus-within { border-color: var(--celeste-deep); }
.idlg__filtericon { flex: none; color: var(--text-muted); }

.idlg__filterinput {
  flex: 1 1 auto;
  min-width: 0;
  border: 0;
  background: none;
  color: var(--text);
  font-family: var(--font-body);
  font-size: var(--t-sm);
  outline: none;
}

.idlg__filtercount {
  flex: none;
  font-size: var(--t-xs);
  color: var(--text-muted);
}

.idlg__desc { display: block; }

.idlg__code {
  display: inline-block;
  margin-top: 3px;
  color: var(--celeste-deep);
  font-size: var(--t-xs);
  text-decoration: none;
}

.idlg__code:hover { text-decoration: underline; }

.idlg__empty {
  padding: var(--s-6) var(--s-4);
  text-align: center;
  font-size: var(--t-sm);
}

.idlg__body {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: var(--s-2) var(--s-5) var(--s-4);
}

.idlg__foot {
  padding: var(--s-3) var(--s-5);
  border-top: 1px solid var(--rule);
  text-align: right;
}

.idlg__go {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  font-size: var(--t-sm);
  font-weight: 600;
  color: var(--celeste-deep);
  text-decoration: none;
}

.idlg__go:hover { text-decoration: underline; }

.idlg .itable {
  width: 100%;
  border-collapse: collapse;
  /* Fixed layout stops one long description from starving the numeric
     columns — the widths below then actually hold. */
  table-layout: fixed;
}

.idlg .itable th {
  padding: var(--s-2) var(--s-3);
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

.idlg .itable td {
  padding: var(--s-3);
  font-size: var(--t-sm);
  vertical-align: middle;
  border-bottom: 1px solid var(--rule);
  overflow-wrap: anywhere;
}

.idlg .itable tbody tr:hover { background: var(--surface-sunken); }

.idlg .itable th.itable__num,
.idlg .itable td.itable__num {
  text-align: right;
  white-space: nowrap;
}

/* Numerals line up in their own columns; the description takes the rest. */
.idlg .itable th:nth-child(1) { width: auto; }
.idlg .itable th:nth-child(2) { width: 16%; }
.idlg .itable th:nth-child(3) { width: 20%; }
.idlg .itable th:nth-child(4) { width: 20%; }

.idlg .itable td.itable__num .money { align-items: flex-end; }

/* The sum: set apart from the lines, and the only bold figure. */
.idlg .itable tfoot td {
  padding-top: var(--s-3);
  border-top: 2px solid var(--rule-strong);
  border-bottom: 0;
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-muted);
}

@media (max-width: 760px) {
  /* The card layout owns the widths below the breakpoint. */
  .idlg .itable { table-layout: auto; }
  .idlg .itable tfoot td { border-top: 0; }

  .idlg .itable tfoot tr {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--s-3);
    padding: var(--s-3) var(--s-4);
    border: 1px solid var(--rule-strong);
    border-radius: var(--r-lg);
    background: var(--surface-sunken);
  }
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

/* ---- Product-focus columns (single catalogue code filtered) ---- */
.ctable__c-prod { max-width: 260px; }
.ctable__feat {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-top: 2px;
  font-size: var(--t-xs);
  color: var(--text-muted);
}
.ctable__c-qty { white-space: nowrap; color: var(--text-muted); font-size: var(--t-xs); }
.ctable__unit { margin-left: 0.4ch; color: var(--text-muted); }
.ctable td.ctable__c-uprice,
.ctable th.ctable__c-uprice { text-align: right; white-space: nowrap; }

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

/* A sheet header is a label, not a page title — the global h2 scale
   (up to 2rem) is sized for section headings on a full page. */
.railsheet__head h2 {
  font-size: var(--t-md);
  letter-spacing: -0.01em;
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
