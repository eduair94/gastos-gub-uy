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

// The rank rows' PRIMARY action: this product's contracts from THIS party, i.e.
// filtered by product AND supplier/buyer at once (the profile link stays as a
// secondary affordance where an id exists).
const sellerContractsTo = (s: { name: string }) => localePath(`/contracts?categoryId=${encodeURIComponent(code.value)}&suppliers=${encodeURIComponent(s.name)}`)
const buyerContractsTo = (b: { name: string }) => localePath(`/contracts?categoryId=${encodeURIComponent(code.value)}&buyers=${encodeURIComponent(b.name)}`)

// Supplier concentration bars: top suppliers by number of purchases (few = captive market).
const supplierConcentration = computed(() =>
  topSuppliers.value.slice(0, 8).map((s: any) => ({ label: s.name, value: s.lines, color: 'celeste' })),
)

/**
 * "¿Varía el producto?" — the distinct característica values across this code's
 * contracts. Precomputed in `product_variants` for the unexplained-anomaly codes;
 * for every other code we aggregate the same shape lazily from a sample.
 */
const variants = computed<any | null>(() => product.value?.variants ?? null)
const lazyVariants = ref<any | null>(null)
const variantsData = computed(() => variants.value ?? lazyVariants.value)

const stripAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const VARIANT_AXES: Array<{ label: string, match: string[], key?: boolean }> = [
  { label: 'Marca', match: ['marca'], key: true },
  { label: 'Nombre comercial/modelo', match: ['nombre comercial', 'modelo'], key: true },
  { label: 'Presentación', match: ['presentacion'], key: true },
  { label: 'Concentración', match: ['concentracion'] },
  { label: 'Medida presentación', match: ['medida'] },
  { label: 'Variación', match: ['__variation__'] },
]

/** Client mirror of src/jobs/variants/rollup.ts, for codes without a precomputed doc. */
function clientRollup(matched: Array<{ features: Array<{ name: string, value: string }>, variation?: string }>) {
  const counts = new Map<string, Map<string, number>>()
  for (const ax of VARIANT_AXES) counts.set(ax.label, new Map())
  for (const m of matched) {
    for (const ax of VARIANT_AXES) {
      let value: string | undefined
      if (ax.match[0] === '__variation__') value = m.variation
      else value = m.features.find(f => ax.match.some(w => stripAccents(f.name).includes(w)))?.value
      if (!value) continue
      const b = counts.get(ax.label)!
      b.set(value, (b.get(value) ?? 0) + 1)
    }
  }
  const attributes: Array<{ name: string, values: Array<{ value: string, count: number }>, distinct: number }> = []
  let varies = false
  for (const ax of VARIANT_AXES) {
    const b = counts.get(ax.label)!
    if (!b.size) continue
    const values = [...b.entries()].map(([value, count]) => ({ value, count })).sort((a, z) => z.count - a.count)
    attributes.push({ name: ax.label, values, distinct: values.length })
    if (ax.key && values.length > 1) varies = true
  }
  return { attributes, varies, sampledContracts: matched.length }
}

async function loadLazyVariants() {
  if (variants.value || lazyVariants.value) return
  const list = await $fetch<any>('/api/contracts', {
    query: { categoryId: code.value, tag: 'award', limit: 20, sortBy: 'date', sortOrder: 'desc' },
  }).catch(() => null)
  const rows = (list?.data?.contracts ?? []).filter((c: any) => c.compraId && c.ocid && c.focusItem?.nro != null)
  if (!rows.length) return
  const res = await $fetch<any>('/api/contracts/item-features/batch', {
    method: 'POST',
    body: { items: rows.map((c: any) => ({ compraId: c.compraId, ocid: c.ocid })) },
  }).catch(() => null)
  const matched: Array<{ features: Array<{ name: string, value: string }>, variation?: string }> = []
  for (const c of rows) {
    const rec = res?.data?.[c.compraId]
    const item = rec && !('pending' in rec) ? rec.items.find((i: any) => i.nro === c.focusItem.nro) : null
    if (item) matched.push({ features: item.features ?? [], variation: item.variation })
  }
  if (matched.length) lazyVariants.value = clientRollup(matched)
}

onMounted(() => { if (!variants.value) loadLazyVariants() })

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

const breadcrumbLd = useBreadcrumbLd([
  { name: 'Productos', path: '/products' },
  { name: description.value },
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
  kicker: 'Producto',
  stat: product.value?.contractCount ? formatNumber(product.value.contractCount) : undefined,
  jsonLd: notFound.value
    ? undefined
    : [
        {
          '@context': 'https://schema.org',
          '@type': 'Dataset',
          'name': t('seo.productDetail.title', { name: description.value }),
          'identifier': code.value,
          'url': `${config.public.siteUrl}/products/${encodeURIComponent(code.value)}`,
          'creator': orgLd,
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

      <!-- ===== Anticipated tender (self-hides when no upcoming forecast) ===== -->
      <AnticipatedTenderCard
        :rubro="code"
        class="block"
      />

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

      <!-- ===== Does the product vary? (flagship) ===== -->
      <section
        v-if="variantsData?.attributes?.length"
        class="block"
      >
        <div class="block__head">
          <h2>{{ t('products.detail.variesTitle') }}</h2>
        </div>
        <p class="block__help">
          {{ variantsData.varies ? t('products.detail.variesYes') : t('products.detail.variesNo') }}
          <span v-if="variantsData.sampledContracts"> {{ t('products.detail.variesSample', { n: variantsData.sampledContracts }) }}</span>
        </p>
        <div class="varies">
          <div
            v-for="a in variantsData.attributes"
            :key="a.name"
            class="varies__attr"
          >
            <span class="varies__name">{{ a.name }} <span class="varies__count">· {{ a.distinct }}</span></span>
            <ul class="varies__vals">
              <li
                v-for="v in a.values.slice(0, 6)"
                :key="v.value"
                class="varies__row"
              >
                <span class="varies__v u-truncate">{{ v.value }}</span>
                <span class="varies__c u-mono">{{ v.count }}</span>
              </li>
            </ul>
          </div>
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
                :to="buyerContractsTo(b)"
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
              <NuxtLink
                v-if="b.id"
                :to="buyerTo(b)"
                class="rank__profile"
              >{{ t('products.detail.profile') }}</NuxtLink>
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
                :to="sellerContractsTo(s)"
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
              <NuxtLink
                v-if="s.id"
                :to="supplierTo(s)"
                class="rank__profile"
              >{{ t('products.detail.profile') }}</NuxtLink>
            </li>
          </ol>
        </div>
      </section>

      <!-- ===== Supplier concentration ===== -->
      <ChartBlock
        v-if="supplierConcentration.length > 1"
        class="block"
        :title="t('products.detail.concentrationTitle')"
        :help="t('products.detail.concentrationHelp')"
      >
        <ClientOnly>
          <InvHBars
            :items="supplierConcentration"
            format="count"
          />
        </ClientOnly>
      </ChartBlock>

      <!-- ===== Price dispersion ===== -->
      <ChartBlock
        v-if="priceUnits.length"
        class="block"
        :title="t('products.detail.dispersionTitle')"
        :help="t('products.detail.dispersionHelp')"
      >
        <ClientOnly>
          <PriceDispersion :units="priceUnits" />
        </ClientOnly>
      </ChartBlock>

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

.rank__row { display: flex; align-items: stretch; }
.rank__row + .rank__row { border-top: 1px solid var(--rule); }

.rank__link {
  flex: 1;
  min-width: 0;
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

/* Secondary link to the party's own profile — sibling of the main row link so
   the two anchors never nest (which the browser foster-parents and breaks). */
.rank__profile {
  flex: none;
  display: flex;
  align-items: center;
  padding: 0 var(--s-4);
  border-left: 1px solid var(--rule);
  font-size: var(--t-xs);
  color: var(--celeste-deep);
  text-decoration: none;
  white-space: nowrap;
}
.rank__profile:hover { background: var(--surface-sunken); text-decoration: underline; }

.rank__name { font-size: var(--t-sm); font-weight: 600; }

.rank__meta {
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  color: var(--text-muted);
  white-space: nowrap;
}

/* ---- Variants panel (¿varía el producto?) ---- */
.varies {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: var(--s-4);
}

.varies__attr {
  padding: var(--s-4);
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
}

.varies__name {
  display: block;
  margin-bottom: var(--s-2);
  font-size: var(--t-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

.varies__count { color: var(--celeste-deep); }

.varies__vals { margin: 0; padding: 0; list-style: none; }

.varies__row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--s-3);
  padding: 2px 0;
}

.varies__v { font-size: var(--t-sm); }
.varies__c { font-size: var(--t-xs); color: var(--text-muted); flex: none; }

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
  .cols { grid-template-columns: minmax(0, 1fr); }
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
  .stats { grid-template-columns: minmax(0, 1fr); }
}
</style>
