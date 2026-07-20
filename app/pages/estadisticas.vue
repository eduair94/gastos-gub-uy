<script setup lang="ts">
/**
 * Estadísticas — the numbers of public spending, in our own frame. Not a clone
 * of an explorer's stats tab: it leads with a lens the raw explorer can't give
 * (spend by TYPE of supplier, from the AI enrichment) and assembles the honest
 * aggregates the app already computes. All SSR.
 */
const { t } = useI18n()
const localePath = useLocalePath()

const [
  { data: statsRes },
  { data: metricsRes },
  { data: catsRes },
  { data: typesRes },
  { data: buyersRes },
  { data: suppliersRes },
] = await Promise.all([
  useFetch<any>('/api/contracts/stats'),
  useFetch<any>('/api/dashboard/metrics'),
  useFetch<any>('/api/analytics/category-distribution', { query: { limit: 10 } }),
  useFetch<any>('/api/analytics/supplier-types'),
  useFetch<any>('/api/analytics/top-buyers', { query: { limit: 8 } }),
  useFetch<any>('/api/analytics/top-suppliers', { query: { limit: 8 } }),
])

const stats = computed(() => statsRes.value?.data ?? null)
const metrics = computed(() => metricsRes.value?.data ?? null)
const median = computed(() => stats.value?.medianValue ?? null)
const contractCount = computed(() => stats.value?.count ?? null)

const byYear = computed(() =>
  (stats.value?.byYear ?? []).filter((d: any) => d.year).map((d: any) => ({ year: d.year, value: d.count ?? 0 })))

const categories = computed<any[]>(() => (catsRes.value?.data ?? []).slice(0, 8))
const supplierTypes = computed<any[]>(() => typesRes.value?.data?.types ?? [])
const typesCoverage = computed(() => typesRes.value?.data ?? null)
const topBuyers = computed<any[]>(() => (buyersRes.value?.data ?? []).slice(0, 8))
const topSuppliers = computed<any[]>(() => (suppliersRes.value?.data ?? []).slice(0, 8))

const pct = (v: number) => `${(v * 100).toFixed(1)}%`

const seoTitle = t('seo.estad.title')
const seoDescription = t('seo.estad.description')
const orgLd = useOrgLd()

useSeo(() => ({
  title: seoTitle,
  description: seoDescription,
  path: '/estadisticas',
  kicker: 'Estadísticas',
  jsonLd: [
    {
      '@context': 'https://schema.org',
      '@type': 'Dataset',
      'name': seoTitle,
      'description': seoDescription,
      'creator': orgLd,
      'isAccessibleForFree': true,
      'license': 'https://catalogodatos.gub.uy',
    },
    { '@context': 'https://schema.org', ...orgLd },
  ],
}))
</script>

<template>
  <div class="estad">
    <!-- Hero -->
    <section class="ehero">
      <div class="ehero__in u-container">
        <p class="u-eyebrow ehero__eyebrow">
          {{ t('estad.eyebrow') }}
        </p>
        <h1 class="ehero__title">
          {{ t('estad.title') }}
        </h1>
        <p class="ehero__lead">
          {{ t('estad.lead') }}
        </p>
      </div>
    </section>

    <!-- KPIs -->
    <section class="u-container stats">
      <NuxtLink
        :to="localePath('/contracts')"
        class="stat"
      >
        <span class="stat__n">{{ formatCount(contractCount) }}</span>
        <span class="stat__l">{{ t('estad.kpi.contracts') }}</span>
      </NuxtLink>
      <div class="stat stat--money">
        <MoneyAmount
          :amount="median"
          size="xl"
          align="start"
        />
        <span class="stat__l">{{ t('estad.kpi.median') }}</span>
      </div>
      <NuxtLink
        :to="localePath('/suppliers')"
        class="stat"
      >
        <span class="stat__n">{{ formatNumber(metrics?.totalSuppliers) }}</span>
        <span class="stat__l">{{ t('estad.kpi.suppliers') }}</span>
      </NuxtLink>
      <NuxtLink
        :to="localePath('/buyers')"
        class="stat"
      >
        <span class="stat__n">{{ formatNumber(metrics?.totalBuyers) }}</span>
        <span class="stat__l">{{ t('estad.kpi.buyers') }}</span>
      </NuxtLink>
    </section>

    <!-- Spend by supplier TYPE — the differentiator -->
    <section
      v-if="supplierTypes.length"
      class="u-container block"
    >
      <div class="block__head">
        <h2>{{ t('estad.typesTitle') }}</h2>
        <NuxtLink
          :to="localePath('/pauta')"
          class="block__all"
        >
          {{ t('estad.typesLink') }}
        </NuxtLink>
      </div>
      <p class="block__help">
        {{ t('estad.typesHelp') }}
      </p>
      <ol class="rank">
        <li
          v-for="ty in supplierTypes"
          :key="ty.category"
          class="rank__row"
        >
          <div class="rank__link rank__link--static">
            <span class="rank__name">
              {{ t(`sup.cat.${ty.category}`) }}
              <span class="rank__sub">· {{ formatNumber(ty.suppliers) }} {{ t('estad.suppliersWord') }}</span>
            </span>
            <span class="rank__meta">{{ pct(ty.share) }}</span>
            <MoneyAmount
              :amount="ty.spend"
              compact
              size="sm"
            />
          </div>
        </li>
      </ol>
      <p
        v-if="typesCoverage"
        class="block__note"
      >
        {{ t('estad.typesNote', { n: formatNumber(typesCoverage.totalSuppliers) }) }}
      </p>
    </section>

    <!-- Volume by year -->
    <section
      v-if="byYear.length"
      class="u-container block"
    >
      <div class="block__head">
        <h2>{{ t('estad.volumeTitle') }}</h2>
        <p class="block__help block__help--right">
          {{ t('estad.volumeHelp') }}
        </p>
      </div>
      <div class="panel panel--pad">
        <YearBars
          :data="byYear"
          unit="count"
          :height="170"
          :href-for="(y) => localePath(`/contracts?year=${y}`)"
        />
      </div>
    </section>

    <!-- Categories -->
    <section
      v-if="categories.length"
      class="u-container block"
    >
      <div class="block__head">
        <h2>{{ t('estad.catsTitle') }}</h2>
        <NuxtLink
          :to="localePath('/products')"
          class="block__all"
        >
          {{ t('common.viewAll') }}
        </NuxtLink>
      </div>
      <ol class="rank">
        <li
          v-for="c in categories"
          :key="c.category"
          class="rank__row"
        >
          <NuxtLink
            :to="localePath(`/contracts?search=${encodeURIComponent(c.category)}`)"
            class="rank__link"
          >
            <span class="rank__name">{{ c.description || c.category }}</span>
            <span class="rank__meta">{{ c.percentage?.toFixed(1) }}%</span>
            <MoneyAmount
              :amount="c.totalAmount"
              compact
              size="sm"
            />
          </NuxtLink>
        </li>
      </ol>
    </section>

    <!-- Top buyers / suppliers -->
    <section class="u-container cols">
      <div class="block block--flush">
        <div class="block__head">
          <h2>{{ t('estad.buyersTitle') }}</h2>
          <NuxtLink
            :to="localePath('/buyers')"
            class="block__all"
          >
            {{ t('common.viewAll') }}
          </NuxtLink>
        </div>
        <ol class="rank">
          <li
            v-for="b in topBuyers"
            :key="b.id"
            class="rank__row"
          >
            <NuxtLink
              :to="localePath(`/buyers/${encodeURIComponent(b.id)}`)"
              class="rank__link"
            >
              <span class="rank__name u-truncate">{{ b.name }}</span>
              <MoneyAmount
                :amount="b.totalAmount"
                compact
                size="sm"
              />
            </NuxtLink>
          </li>
        </ol>
      </div>

      <div class="block block--flush">
        <div class="block__head">
          <h2>{{ t('estad.suppliersTitle') }}</h2>
          <NuxtLink
            :to="localePath('/suppliers')"
            class="block__all"
          >
            {{ t('common.viewAll') }}
          </NuxtLink>
        </div>
        <ol class="rank">
          <li
            v-for="s in topSuppliers"
            :key="s.id"
            class="rank__row"
          >
            <NuxtLink
              :to="localePath(`/suppliers/${encodeURIComponent(s.id)}`)"
              class="rank__link"
            >
              <span class="rank__idcell">
                <span class="rank__name u-truncate">{{ s.name }}</span>
                <SupplierChip :category="s.category" />
              </span>
              <MoneyAmount
                :amount="s.totalAmount"
                compact
                size="sm"
              />
            </NuxtLink>
          </li>
        </ol>
      </div>
    </section>

    <section class="u-container source">
      <p class="source__note">
        {{ t('estad.sourceNote') }}
      </p>
      <NuxtLink
        :to="localePath('/gastos')"
        class="source__cta"
      >
        {{ t('recop.toGastos') }}
        <v-icon size="18">
          mdi-arrow-right
        </v-icon>
      </NuxtLink>
    </section>
  </div>
</template>

<style scoped>
.estad { padding-bottom: var(--s-8); }

.ehero {
  background:
    radial-gradient(1100px 380px at 85% -20%, color-mix(in srgb, var(--sol) 16%, transparent), transparent 70%),
    var(--ink);
  color: #eaf1f6;
  border-bottom: 1px solid var(--rule);
}

.ehero__in { padding-block: clamp(var(--s-7), 6vw, var(--s-9)); }
.ehero__eyebrow { color: var(--sol); }

.ehero__title {
  margin: var(--s-3) 0 0;
  max-width: 20ch;
  font-family: var(--font-display);
  font-size: clamp(28px, 5vw, var(--t-3xl));
  font-stretch: 112%;
  line-height: 1.04;
  letter-spacing: -0.02em;
  color: #fff;
  text-wrap: balance;
}

.ehero__lead {
  margin: var(--s-4) 0 0;
  max-width: 58ch;
  font-size: var(--t-md);
  line-height: 1.55;
  color: #b9c8d4;
}

/* KPIs */
.stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--s-4);
  margin-top: calc(var(--s-6) * -1);
  position: relative;
  z-index: 1;
}

.stat {
  display: flex;
  flex-direction: column;
  gap: var(--s-1);
  padding: var(--s-4) var(--s-5);
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-1);
  text-decoration: none;
  color: inherit;
  transition: border-color var(--dur) var(--ease), transform var(--dur) var(--ease);
}

a.stat:hover { border-color: var(--celeste); transform: translateY(-2px); }

.stat__n {
  font-family: var(--font-display);
  font-size: var(--t-2xl);
  font-weight: 700;
  font-stretch: 112%;
  line-height: 1;
  letter-spacing: -0.03em;
}

.stat__l { font-size: var(--t-sm); color: var(--text-muted); }

/* Blocks */
.block { margin-top: var(--s-8); }
.block--flush { margin-top: 0; }

.block__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--s-4);
  margin-bottom: var(--s-3);
}

.block__help { margin: 0 0 var(--s-4); max-width: 72ch; font-size: var(--t-sm); color: var(--text-muted); }
.block__help--right { margin: 0; text-align: right; }

.block__note {
  margin: var(--s-3) 0 0;
  font-size: var(--t-xs);
  color: var(--text-muted);
  max-width: 80ch;
}

.block__all {
  font-size: var(--t-sm);
  font-weight: 600;
  color: var(--celeste-deep);
  text-decoration: none;
}

.block__all:hover { text-decoration: underline; }
.panel--pad { padding: var(--s-5); }

.cols {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--s-6);
  margin-top: var(--s-8);
}

/* Rank */
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

.rank__link--static { cursor: default; }
a.rank__link:hover { background: var(--surface-sunken); }

.cols .rank__link { grid-template-columns: minmax(0, 1fr) auto; }

.rank__idcell { display: flex; align-items: center; gap: var(--s-2); min-width: 0; }
.rank__name { font-size: var(--t-sm); font-weight: 600; }
.rank__sub { font-family: var(--font-mono); font-size: var(--t-xs); color: var(--text-muted); font-weight: 400; }

.rank__meta {
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  color: var(--text-muted);
  white-space: nowrap;
}

/* Source */
.source {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-4);
  margin-top: var(--s-8);
  padding-top: var(--s-5);
  border-top: 1px solid var(--rule);
}

.source__note { margin: 0; font-size: var(--t-sm); color: var(--text-muted); max-width: 70ch; }
.source__cta {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  font-size: var(--t-sm);
  font-weight: 600;
  color: var(--celeste-deep);
  text-decoration: none;
}

@media (max-width: 1000px) {
  .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .cols { grid-template-columns: 1fr; gap: var(--s-8); }
}

@media (max-width: 640px) {
  .stats { grid-template-columns: 1fr; margin-top: var(--s-5); }
  .block__help--right { text-align: left; }
  .rank__link { grid-template-columns: minmax(0, 1fr) auto; row-gap: var(--s-1); }
  .rank__link :deep(.money) { grid-column: 2; grid-row: 1; }
  .rank__meta { grid-column: 1; grid-row: 2; }
}
</style>
