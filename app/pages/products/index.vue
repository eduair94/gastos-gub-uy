<script setup lang="ts">
/**
 * "What the state buys", by catalogue code.
 *
 * Reads the precomputed `product_analytics` collection — one row per real catalogue code
 * (classification.id), never the free-text description, which fragments one economic category
 * across spelling variants. Counts (contracts / buyers / suppliers) are meaningful even where the
 * source never published a price, so a code ranks by activity as well as by money.
 */
const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const router = useRouter()

const search = ref((route.query.search as string) ?? '')
const sort = ref((route.query.sort as string) ?? 'spend')
const page = ref(Number(route.query.page ?? 1))

const SORTS = ['spend', 'contracts', 'buyers', 'lines'] as const

// A page from a different query set is meaningless.
watch([search, sort], () => {
  page.value = 1
})

// Debounced so typing doesn't fire a request per keystroke.
const debouncedSearch = refDebounced(search, 300)

watch([debouncedSearch, sort, page], () => {
  const q: Record<string, string> = {}
  if (debouncedSearch.value) q.search = debouncedSearch.value
  if (sort.value !== 'spend') q.sort = sort.value
  if (page.value > 1) q.page = String(page.value)
  router.replace({ query: q })
})

const { data: res, pending, error } = await useFetch<any>('/api/analytics/products', {
  query: computed(() => ({
    limit: 25,
    page: page.value,
    sort: sort.value,
    ...(debouncedSearch.value ? { search: debouncedSearch.value } : {}),
  })),
})

const products = computed(() => res.value?.data?.products ?? [])
const pagination = computed(() => res.value?.data?.pagination ?? null)
const totalProducts = computed(() => res.value?.data?.meta?.totalProducts ?? null)

const columns = computed(() => [
  { key: 'description', label: t('common.item'), primary: true },
  { key: 'totalUYU', label: t('products.cols.spend'), align: 'end' as const },
  { key: 'contractCount', label: t('products.cols.contracts'), align: 'end' as const, mono: true },
  { key: 'buyerCount', label: t('products.cols.buyers'), align: 'end' as const, mono: true },
  { key: 'supplierCount', label: t('products.cols.suppliers'), align: 'end' as const, mono: true },
])

useSeo(() => ({
  title: t('seo.products.title'),
  description: t('seo.products.description'),
  path: '/products',
}))
</script>

<template>
  <div class="u-container page">
    <header class="head">
      <p class="u-eyebrow">
        {{ t('home.eyebrow') }}
      </p>
      <h1>{{ t('products.title') }}</h1>
      <p class="u-lead">
        {{ t('products.lead') }}
      </p>
    </header>

    <section class="method">
      <p class="method__b">
        {{ t('products.help') }}
      </p>
    </section>

    <div class="bar">
      <div class="search">
        <v-icon
          class="search__i"
          size="18"
        >
          mdi-magnify
        </v-icon>
        <input
          v-model="search"
          class="search__in"
          type="search"
          :placeholder="t('products.searchPlaceholder')"
          :aria-label="t('products.searchPlaceholder')"
        >
      </div>
      <p
        v-if="totalProducts"
        class="bar__n u-mono"
      >
        {{ t('products.count', { n: formatNumber(totalProducts) }) }}
      </p>
    </div>

    <div
      id="p-results-top"
      class="chips"
      role="group"
      :aria-label="t('products.sortLabel')"
    >
      <button
        v-for="s in SORTS"
        :key="s"
        class="chip"
        :class="{ 'chip--on': sort === s }"
        type="button"
        @click="sort = s"
      >
        {{ t(`products.sort.${s}`) }}
      </button>
    </div>

    <DataPager
      v-if="products.length && pagination && pagination.totalPages > 1"
      v-model:page="page"
      :total-pages="pagination.totalPages"
      sticky
      scroll-target-id="p-results-top"
    />

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
    </div>

    <div
      v-else-if="pending && !products.length"
      class="skeleton"
    >
      <div
        v-for="i in 8"
        :key="i"
        class="skeleton__row"
      />
    </div>

    <div
      v-else-if="!products.length"
      class="state"
    >
      <h2 class="state__t">
        {{ t('products.empty.title') }}
      </h2>
      <p class="state__b">
        {{ t('products.empty.body') }}
      </p>
      <button
        v-if="search"
        class="state__a"
        type="button"
        @click="search = ''"
      >
        {{ t('common.clearAll') }}
      </button>
    </div>

    <!-- The link lives in the name cell, not on the whole row: an <a> as a
         direct child of <table>/<tbody> is invalid HTML the browser hoists out
         of the table, which desynchronises SSR from client and warns on
         hydration. A cell-level NuxtLink is what the buyer/supplier tables do. -->
    <DataTable
      v-else
      :columns="columns"
      :rows="products"
      :row-key="(r) => r.code"
      min-width="640px"
    >
      <template #cell:description="{ row }">
        <NuxtLink
          :to="localePath(`/products/${encodeURIComponent(row.code)}`)"
          class="pname pname--link"
        >{{ row.description }}</NuxtLink>
        <span class="pcode u-mono">{{ t('products.codeLabel', { code: row.code }) }}</span>
      </template>
      <template #cell:totalUYU="{ row }">
        <!-- MoneyAmount renders the "Sin monto" label for a null amount, so a
             code the source never priced reads cleanly rather than "$ 0". -->
        <MoneyAmount
          :amount="row.totalUYU > 0 ? row.totalUYU : null"
          currency="UYU"
          compact
          size="sm"
        />
      </template>
      <template #cell:contractCount="{ row }">
        {{ formatNumber(row.contractCount) }}
      </template>
      <template #cell:buyerCount="{ row }">
        {{ formatNumber(row.buyerCount) }}
      </template>
      <template #cell:supplierCount="{ row }">
        {{ formatNumber(row.supplierCount) }}
      </template>
    </DataTable>

    <DataPager
      v-if="products.length && pagination && pagination.totalPages > 1"
      v-model:page="page"
      :total-pages="pagination.totalPages"
      class="pager--foot"
      scroll-target-id="p-results-top"
    />
  </div>
</template>

<style scoped>
.page { padding-block: var(--s-6) var(--s-8); }

.head {
  max-width: 68ch;
  margin-bottom: var(--s-5);
}

.head h1 { margin: var(--s-2) 0 var(--s-3); }

.method {
  padding: var(--s-4) var(--s-5);
  border: 1px solid var(--rule);
  border-left: 3px solid var(--celeste);
  border-radius: var(--r-lg);
  background: var(--surface);
  max-width: 80ch;
}

.method__b {
  margin: 0;
  font-size: var(--t-sm);
  line-height: 1.6;
  color: var(--text-muted);
}

/* ---- Bar (search + count) ---- */
.bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-4);
  margin: var(--s-6) 0 var(--s-3);
}

.search {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  flex: 1;
  max-width: 420px;
  padding: var(--s-2) var(--s-3);
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-md);
}

.search__i { color: var(--text-muted); }

.search__in {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--text);
  font-family: var(--font-body);
  font-size: var(--t-sm);
  outline: none;
}

.bar__n {
  font-size: var(--t-sm);
  color: var(--text-muted);
  white-space: nowrap;
}

/* ---- Sort chips ---- */
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2);
  margin-bottom: var(--s-4);
}

.chip {
  padding: var(--s-2) var(--s-3);
  border: 1px solid var(--rule);
  border-radius: var(--r-full);
  background: var(--surface);
  color: var(--text-muted);
  font-family: var(--font-body);
  font-size: var(--t-sm);
  font-weight: 500;
  cursor: pointer;
  transition: border-color var(--dur) var(--ease), color var(--dur) var(--ease);
}

.chip:hover { color: var(--text); border-color: var(--rule-strong); }

.chip--on { background: var(--ink); border-color: var(--ink); color: #fff; }

/* ---- Product cell ---- */
.pname {
  display: block;
  font-weight: 600;
}

.pname--link {
  color: var(--text);
  text-decoration: none;
}

.pname--link:hover { color: var(--celeste-deep); text-decoration: underline; }

.pcode {
  display: block;
  margin-top: 2px;
  font-size: var(--t-xs);
  color: var(--text-muted);
}

/* ---- States / skeleton / pager (shared with the anomalies page) ---- */
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
  height: 64px;
  background: linear-gradient(90deg, var(--surface) 25%, var(--surface-sunken) 37%, var(--surface) 63%);
  background-size: 400% 100%;
  animation: shimmer 1.4s ease infinite;
}

@keyframes shimmer {
  0% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}

/* Pager markup + styles live in <DataPager>. */
.pager--foot { margin-top: var(--s-5); }
.chips { scroll-margin-top: calc(var(--header-h) + var(--s-3)); }

@media (max-width: 560px) {
  .bar { flex-direction: column; align-items: stretch; }
  .search { max-width: none; }
}
</style>
