<script setup lang="ts">
/**
 * A single catalogue code (classification.id): what it is, who buys it, from whom, over what
 * years, and — from the same baseline the anomaly detector uses — the usual price per unit.
 *
 * All figures come from the precomputed `product_analytics` doc plus the code's
 * `item_price_baselines` rows. Counts are exact; spend is the plausibility-capped UYU total and is
 * shown only where the source actually priced the purchases (never a "$ 0" under a gold rule).
 */
const route = useRoute()
const { t } = useI18n()
const localePath = useLocalePath()
const config = useRuntimeConfig()
const orgLd = useOrgLd()

const code = computed(() => String(route.params.code ?? ''))

const { data: res, error, refresh } = await useFetch<any>(
  () => `/api/analytics/products/${encodeURIComponent(code.value)}`,
  // A cold SSR/DB connection can make the first read throw a transient 500. Retry once at
  // SSR time so a connection blip doesn't get turned into a hard 404 on a real product.
  { retry: 1, retryDelay: 400 },
)

const product = computed<any | null>(() => res.value?.data ?? null)

/**
 * A product is truly *missing* only when the API says 404, or it answered OK with no data.
 * A 5xx / network error is *transient* — it must NOT become a 404 (that would noindex and
 * cache a real, existing product as gone). The two states render differently below.
 */
const errStatus = computed<number>(() =>
  (error.value as any)?.statusCode ?? (error.value as any)?.response?.status ?? 0,
)
const notFound = computed(() => errStatus.value === 404 || (!error.value && !product.value))
const loadError = computed(() => !!error.value && errStatus.value !== 404)

if (import.meta.server) {
  const event = useRequestEvent()
  if (event && notFound.value) setResponseStatus(event, 404)
  else if (event && loadError.value) setResponseStatus(event, 503)
}

// Prefer the official SICE catalog canonical name over the noisy modal award
// description ('Papel A4' / 'PAPEL A4' / 'Papel A-4'); fall back when uncataloged.
const description = computed(() => product.value?.canonicalName || product.value?.description || code.value)
const hasSpend = computed(() => (product.value?.totalUYU ?? 0) > 0)

// Rubro breadcrumb from the catalog path (familia › subfamilia › clase › subclase),
// each linking to the products list filtered to that rubro node.
const rubroChain = computed<Array<{ label: string, token: string }>>(() => {
  const p = product.value
  if (!p?.rubroPath) return []
  const parts = String(p.rubroPath).split('.')
  const names = [p.famiName, p.subfName, p.clasName, p.subcName]
  const prefixes = ['F', 'SF', 'C', 'SC']
  const out: Array<{ label: string, token: string }> = []
  for (let i = 0; i < parts.length && i < 4; i++) {
    if (!names[i]) continue
    out.push({ label: names[i]!, token: prefixes[i]! + parts.slice(0, i + 1).join('.') })
  }
  return out
})

/** Purchases per year — always meaningful (line counts), unlike the sparsely-priced spend. */
const byYear = computed(() =>
  (product.value?.byYear ?? [])
    .filter((y: any) => y.year && y.lines > 0)
    .map((y: any) => ({ year: y.year, value: y.lines, count: y.lines }))
    .sort((a: any, b: any) => a.year - b.year),
)

const topBuyers = computed(() => (product.value?.topBuyers ?? []).filter((b: any) => b.name))
const topSuppliers = computed(() => (product.value?.topSuppliers ?? []).filter((s: any) => s.name))
const priceUnits = computed(() => (product.value?.priceUnits ?? []).filter((u: any) => u.n >= 5))

/** The explorer, filtered to exactly this catalogue code (exact, index-backed). */
const explorerLink = computed(() => `/contracts?categoryId=${encodeURIComponent(code.value)}`)

/**
 * Supplier ids in the award data may or may not carry the `R/` slash that
 * `supplier_patterns` (behind /suppliers/{id}) keys on. Normalise, and keep the
 * slash inside a single named-route param so the router doesn't split the path.
 */
function supplierTo(s: { id?: string, name: string }) {
  if (!s.id) return localePath(`/contracts?suppliers=${encodeURIComponent(s.name)}`)
  const key = /^[A-Za-z]\d+$/.test(s.id) ? s.id.replace(/^([A-Za-z])/, '$1/') : s.id
  return localePath({ name: 'suppliers-id', params: { id: key } })
}

function buyerTo(b: { id?: string, name: string }) {
  return b.id
    ? localePath(`/buyers/${encodeURIComponent(b.id)}`)
    : localePath(`/contracts?buyers=${encodeURIComponent(b.name)}`)
}

function unitLabel(u: any): string {
  return [u.currency, u.unitName].filter(Boolean).join(' · ')
}

function rangeText(u: any): string {
  const lo = formatMoney(u.p25, u.currency, { compact: true })
  const hi = formatMoney(u.p95, u.currency, { compact: true })
  const sym = lo.split(' ')[0]
  const hiShort = hi.startsWith(`${sym} `) ? hi.slice(sym.length + 1) : hi
  return `${lo} – ${hiShort}`
}

const priceColumns = computed(() => [
  { key: 'unit', label: t('products.detail.unit'), primary: true },
  { key: 'p50', label: t('contract.reference.typical'), align: 'end' as const },
  { key: 'range', label: t('contract.reference.range'), align: 'end' as const, mono: true },
  { key: 'n', label: t('contract.reference.comparables'), align: 'end' as const, mono: true },
])

useSeo(() => ({
  title: t('seo.productDetail.title', { name: description.value }),
  description: t('seo.productDetail.description', {
    name: description.value,
    contracts: formatNumber(product.value?.contractCount),
    buyers: formatNumber(product.value?.buyerCount),
  }),
  path: `/products/${encodeURIComponent(code.value)}`,
  noindex: notFound.value,
  jsonLd: notFound.value
    ? undefined
    : {
        '@context': 'https://schema.org',
        '@type': 'Dataset',
        'name': t('seo.productDetail.title', { name: description.value }),
        'identifier': code.value,
        'url': `${config.public.siteUrl}/products/${encodeURIComponent(code.value)}`,
        'creator': orgLd,
      },
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
        {{ t('products.detail.notFound.title') }}
      </h1>
      <p class="state__b">
        {{ t('products.detail.notFound.body') }}
      </p>
      <NuxtLink
        :to="localePath('/products')"
        class="state__a"
      >
        {{ t('products.detail.notFound.action') }}
      </NuxtLink>
    </div>

    <!-- ===== Transient load error (never a 404) ===== -->
    <div
      v-else-if="loadError"
      class="state"
    >
      <h1 class="state__t">
        {{ t('products.detail.error.title') }}
      </h1>
      <p class="state__b">
        {{ t('products.detail.error.body') }}
      </p>
      <button
        type="button"
        class="state__a"
        @click="refresh()"
      >
        {{ t('products.detail.error.action') }}
      </button>
    </div>

    <template v-else>
      <!-- ===== Header ===== -->
      <header class="head">
        <div class="head__id">
          <p class="u-eyebrow">
            {{ t('products.detail.eyebrow') }}
          </p>
          <h1 class="head__name">
            {{ description }}
          </h1>
          <nav
            v-if="rubroChain.length"
            class="head__rubro"
            :aria-label="t('products.detail.category')"
          >
            <template
              v-for="(r, i) in rubroChain"
              :key="r.token"
            >
              <span
                v-if="i"
                class="head__sep"
              >›</span>
              <NuxtLink
                :to="localePath(`/products?rubro=${encodeURIComponent(r.token)}`)"
                class="head__rubrolink"
              >{{ r.label }}</NuxtLink>
            </template>
          </nav>
          <p class="head__code u-mono">
            {{ t('products.codeLabel', { code }) }}
            <span v-if="product?.unitName"> · {{ t('products.detail.officialUnit', { unit: product.unitName }) }}</span>
          </p>
        </div>
        <div
          v-if="hasSpend"
          class="head__money"
        >
          <MoneyAmount
            :amount="product.totalUYU"
            size="xl"
            align="start"
          />
          <p class="head__moneyl">
            {{ t('products.detail.totalSpent') }}
          </p>
        </div>
      </header>

      <!-- ===== Stats ===== -->
      <section
        class="stats"
        :aria-label="t('products.title')"
      >
        <div class="stat">
          <span class="stat__n">{{ formatNumber(product.contractCount) }}</span>
          <span class="stat__l">{{ t('products.detail.contracts') }}</span>
        </div>
        <div class="stat">
          <span class="stat__n">{{ formatNumber(product.buyerCount) }}</span>
          <span class="stat__l">{{ t('products.detail.buyers') }}</span>
        </div>
        <div class="stat">
          <span class="stat__n">{{ formatNumber(product.supplierCount) }}</span>
          <span class="stat__l">{{ t('products.detail.suppliers') }}</span>
        </div>
        <div class="stat">
          <span class="stat__n">{{ formatNumber(product.lineCount) }}</span>
          <span class="stat__l">{{ t('products.detail.lines') }}</span>
          <span
            v-if="product.firstYear && product.lastYear"
            class="stat__sub u-mono"
          >{{ product.firstYear }}–{{ product.lastYear }}</span>
        </div>
      </section>

      <!-- ===== Purchases by year ===== -->
      <section
        v-if="byYear.length"
        class="block"
      >
        <div class="block__head">
          <h2>{{ t('products.detail.byYearTitle') }}</h2>
        </div>
        <div class="panel panel--pad">
          <YearBars
            :data="byYear"
            :height="150"
            unit="count"
            :href-for="(y) => localePath(`/contracts?categoryId=${encodeURIComponent(code)}&yearFrom=${y}&yearTo=${y}`)"
          />
        </div>
      </section>

      <!-- ===== Who buys / who sells ===== -->
      <section
        v-if="topBuyers.length || topSuppliers.length"
        class="cols"
      >
        <div
          v-if="topBuyers.length"
          class="block block--flush"
        >
          <div class="block__head">
            <h2>{{ t('products.detail.topBuyersTitle') }}</h2>
          </div>
          <p class="block__help">
            {{ t('products.detail.topBuyersHelp') }}
          </p>
          <ol class="rank">
            <li
              v-for="b in topBuyers"
              :key="b.id || b.name"
              class="rank__row"
            >
              <NuxtLink
                :to="buyerTo(b)"
                class="rank__link"
              >
                <span class="rank__name u-truncate">{{ b.name }}</span>
                <span class="rank__meta">{{ t('products.detail.nPurchases', { n: formatNumber(b.lines) }) }}</span>
                <MoneyAmount
                  :amount="b.spendUYU > 0 ? b.spendUYU : null"
                  compact
                  size="sm"
                />
              </NuxtLink>
            </li>
          </ol>
        </div>

        <div
          v-if="topSuppliers.length"
          class="block block--flush"
        >
          <div class="block__head">
            <h2>{{ t('products.detail.topSuppliersTitle') }}</h2>
          </div>
          <p class="block__help">
            {{ t('products.detail.topSuppliersHelp') }}
          </p>
          <ol class="rank">
            <li
              v-for="s in topSuppliers"
              :key="s.id || s.name"
              class="rank__row"
            >
              <NuxtLink
                :to="supplierTo(s)"
                class="rank__link"
              >
                <span class="rank__name u-truncate">{{ s.name }}</span>
                <span class="rank__meta">{{ t('products.detail.nPurchases', { n: formatNumber(s.lines) }) }}</span>
                <MoneyAmount
                  :amount="s.spendUYU > 0 ? s.spendUYU : null"
                  compact
                  size="sm"
                />
              </NuxtLink>
            </li>
          </ol>
        </div>
      </section>

      <!-- ===== Price reference ===== -->
      <section
        v-if="priceUnits.length"
        class="block"
      >
        <div class="block__head">
          <h2>{{ t('products.detail.priceTitle') }}</h2>
        </div>
        <p class="block__help">
          {{ t('products.detail.priceHelp') }}
        </p>
        <DataTable
          :columns="priceColumns"
          :rows="priceUnits"
          :row-key="(_r, i) => i"
          min-width="520px"
        >
          <template #cell:unit="{ row }">
            <span class="u-mono">{{ unitLabel(row) }}</span>
          </template>
          <template #cell:p50="{ row }">
            <MoneyAmount
              :amount="row.p50"
              :currency="row.currency"
              :rule="false"
              size="sm"
            />
          </template>
          <template #cell:range="{ row }">
            {{ rangeText(row) }}
          </template>
          <template #cell:n="{ row }">
            {{ formatNumber(row.n) }}
          </template>
        </DataTable>
      </section>

      <!-- ===== All contracts of this product ===== -->
      <section class="block">
        <NuxtLink
          :to="localePath(explorerLink)"
          class="allcta"
        >
          {{ t('products.detail.viewAllContracts') }}
          <v-icon size="16">
            mdi-arrow-right
          </v-icon>
        </NuxtLink>
      </section>
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

.head__rubro {
  margin: var(--s-2) 0 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--s-1) var(--s-2);
  font-size: var(--t-xs);
}

.head__sep { color: var(--text-muted); }

.head__rubrolink {
  color: var(--celeste-deep);
  text-decoration: none;
}

.head__rubrolink:hover { text-decoration: underline; }

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

.stat__l { font-size: var(--t-xs); color: var(--text-muted); }
.stat__sub { font-size: var(--t-xs); color: var(--text-muted); }

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

.block__help {
  margin: 0 0 var(--s-4);
  max-width: 68ch;
  font-size: var(--t-sm);
  color: var(--text-muted);
}

.panel--pad { padding: var(--s-5); }

.cols {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
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

.rank__name { font-size: var(--t-sm); font-weight: 600; }

.rank__meta {
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  color: var(--text-muted);
  white-space: nowrap;
}

/* ---- All-contracts CTA ---- */
.allcta {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  padding: var(--s-3) var(--s-5);
  border: 1px solid var(--rule-strong);
  border-radius: var(--r-md);
  background: var(--surface);
  color: var(--celeste-deep);
  font-weight: 600;
  font-size: var(--t-sm);
  text-decoration: none;
}

.allcta:hover { background: var(--surface-sunken); }

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
  .cols { grid-template-columns: 1fr; }
  .block--flush + .block--flush { margin-top: var(--s-6); }
}

@media (max-width: 780px) {
  .head { flex-direction: column; align-items: flex-start; gap: var(--s-4); }
  .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 560px) {
  .rank__link { grid-template-columns: minmax(0, 1fr) auto; row-gap: var(--s-1); }
  .rank__meta { grid-column: 1; grid-row: 2; }
  .rank__link :deep(.money) { grid-column: 2; grid-row: 1 / span 2; }
}

@media (max-width: 380px) {
  .stats { grid-template-columns: 1fr; }
}
</style>
