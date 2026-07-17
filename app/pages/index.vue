<script setup lang="ts">
const { t } = useI18n()
const localePath = useLocalePath()
const router = useRouter()
// Resolved in setup: the useSeo getter below runs lazily, and Nuxt
// composables throw if first called outside a setup context.
const siteUrl = useRuntimeConfig().public.siteUrl

const query = ref('')

function submit() {
  const q = query.value.trim()
  router.push(q
    ? { path: localePath('/contracts'), query: { search: q } }
    : { path: localePath('/contracts') })
}

// Server-rendered so the numbers and the ledger are in the HTML a
// crawler sees, not fetched after hydration.
const { data: metricsRes } = await useFetch<any>('/api/dashboard/metrics')
const { data: latestRes } = await useFetch<any>('/api/contracts', {
  query: { limit: 7, sortBy: 'date', sortOrder: 'desc', hasAmount: 'true' },
})
const { data: trendsRes } = await useFetch<any>('/api/dashboard/spending-trends', {
  query: { groupBy: 'year' },
})
const { data: suppliersRes } = await useFetch<any>('/api/analytics/top-suppliers', { query: { limit: 6 } })
const { data: buyersRes } = await useFetch<any>('/api/analytics/top-buyers', { query: { limit: 6 } })
const { data: anomaliesRes } = await useFetch<any>('/api/analytics/anomalies', {
  query: { limit: 4, severity: 'critical', sortBy: 'confidence', sortOrder: 'desc' },
})
const { data: statsRes } = await useFetch<any>('/api/contracts/stats')

const metrics = computed(() => metricsRes.value?.data ?? null)
const stats = computed(() => statsRes.value?.data ?? null)
const latest = computed<ContractLike[]>(() => latestRes.value?.data?.contracts ?? [])

// `estimatedDocumentCount` is live and accurate; the precomputed
// dashboard_metrics doc is a stale snapshot on a different basis.
const contractCount = computed(() => stats.value?.count ?? metrics.value?.totalContracts)
const topSuppliers = computed(() => suppliersRes.value?.data ?? [])
const topBuyers = computed(() => buyersRes.value?.data ?? [])
const anomalies = computed(() => anomaliesRes.value?.data?.anomalies ?? anomaliesRes.value?.data ?? [])

// Years the data actually covers, from filter_data via stats.byYear.
const knownYears = computed<Set<number>>(() =>
  new Set((stats.value?.byYear ?? []).map((d: any) => d.year).filter(Boolean)),
)

const trends = computed(() => {
  const raw = trendsRes.value?.data ?? []
  return raw
    .map((d: any) => ({
      year: d.year ?? (d.date ? new Date(d.date).getFullYear() : null),
      value: d.value ?? 0,
      count: d.count ?? 0,
    }))
    // spending_trends carries a 2001 bucket that no release falls in;
    // plotting it contradicts the "desde 2002" the lead states.
    .filter((d: any) => d.year && d.value > 0 && (!knownYears.value.size || knownYears.value.has(d.year)))
    .sort((a: any, b: any) => a.year - b.year)
})

// From filter_data (via stats.byYear), which is derived from sourceYear
// and starts at 2002. The precomputed spending_trends collection carries
// a 2001 bucket that no release actually falls in, and this number is a
// factual claim in the hero copy.
const firstYear = computed(() => {
  const years = (stats.value?.byYear ?? []).map((d: any) => d.year).filter(Boolean)
  return years.length ? Math.min(...years) : 2002
})

// The precomputed metrics doc is a snapshot, not live. Say when it was
// taken rather than implying the totals are current.
const dataAsOf = computed(() => metrics.value?.calculatedAt ?? null)

useSeo(() => ({
  title: t('seo.home.title'),
  description: t('seo.home.description', { count: formatNumber(contractCount.value) }),
  path: '/',
  jsonLd: {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    'name': t('brand.name'),
    'description': t('seo.home.description', { count: formatNumber(contractCount.value) }),
    'inLanguage': 'es-UY',
    'potentialAction': {
      '@type': 'SearchAction',
      'target': {
        '@type': 'EntryPoint',
        'urlTemplate': `${siteUrl}/contracts?search={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  },
}))
</script>

<template>
  <div>
    <!-- ============ Hero ============
         The thesis is the ledger: money moves constantly, here is what
         moved last. The magnitude rules teach the gold vocabulary on
         first contact, before the reader meets a table. -->
    <section class="hero">
      <div class="hero__inner u-container">
        <div class="hero__pitch">
          <p class="u-eyebrow">
            {{ t('home.eyebrow') }}
          </p>
          <h1 class="u-hero hero__title u-rise">
            {{ t('home.title') }}<br>
            <span class="hero__accent">{{ t('home.titleAccent') }}</span>
          </h1>
          <p class="u-lead hero__lead u-rise u-rise-1">
            {{ t('home.lead', { yearFrom: firstYear }) }}
          </p>

          <form
            class="bigsearch u-rise u-rise-2"
            role="search"
            @submit.prevent="submit"
          >
            <label
              class="u-sr-only"
              for="hero-q"
            >
              {{ t('home.searchLabel', { count: formatNumber(contractCount) }) }}
            </label>
            <v-icon
              class="bigsearch__icon"
              size="22"
            >
              mdi-magnify
            </v-icon>
            <input
              id="hero-q"
              v-model="query"
              class="bigsearch__input"
              type="search"
              :placeholder="t('common.searchPlaceholder')"
            >
            <button
              class="bigsearch__go"
              type="submit"
            >
              {{ t('home.searchCta') }}
            </button>
          </form>
          <p class="hero__hint">
            {{ t('home.searchHint') }}
          </p>
        </div>

        <aside
          class="ledger"
          :aria-label="t('home.ledgerTitle')"
        >
          <div class="ledger__head">
            <p class="u-eyebrow">
              {{ t('home.ledgerTitle') }}
            </p>
            <NuxtLink
              :to="localePath('/contracts')"
              class="ledger__all"
            >
              {{ t('common.viewAll') }}
            </NuxtLink>
          </div>
          <ol class="ledger__list">
            <li
              v-for="c in latest"
              :key="c.id"
              class="ledger__row"
            >
              <NuxtLink
                :to="localePath(`/contracts/${c.id}`)"
                class="ledger__link"
              >
                <span class="ledger__text">
                  <span class="ledger__what u-truncate">{{ contractTitle(c) || t('common.contract') }}</span>
                  <span class="ledger__who u-truncate">{{ c.buyer?.name }}</span>
                </span>
                <MoneyAmount
                  :amount="contractAmount(c)"
                  :currency="contractCurrency(c)"
                  compact
                  size="sm"
                />
              </NuxtLink>
            </li>
          </ol>
          <p class="ledger__foot">
            {{ t('money.scaleHelp') }}
          </p>
        </aside>
      </div>
    </section>

    <!-- ============ Stats ============
         Deliberately no all-time grand total. Three source records
         (one of them 1.2 million generators) carry 86% of the reported
         sum, so a headline total would be an artefact, not a fact. The
         median says something true and robust instead: half of what the
         state buys is smaller than this. See /about. -->
    <section class="u-container stats">
      <NuxtLink
        :to="localePath('/contracts')"
        class="stat"
      >
        <span class="stat__n">{{ formatCount(contractCount) }}</span>
        <span class="stat__l">{{ t('home.statContracts') }}</span>
      </NuxtLink>
      <div class="stat stat--money">
        <MoneyAmount
          :amount="stats?.medianValue"
          size="xl"
          align="start"
        />
        <span class="stat__l">{{ t('home.statTypical') }}</span>
      </div>
      <NuxtLink
        :to="localePath('/suppliers')"
        class="stat"
      >
        <span class="stat__n">{{ formatNumber(metrics?.totalSuppliers) }}</span>
        <span class="stat__l">{{ t('home.statSuppliers') }}</span>
      </NuxtLink>
      <NuxtLink
        :to="localePath('/buyers')"
        class="stat"
      >
        <span class="stat__n">{{ formatNumber(metrics?.totalBuyers) }}</span>
        <span class="stat__l">{{ t('home.statBuyers') }}</span>
      </NuxtLink>
    </section>

    <!-- ============ Spending by year ============ -->
    <section
      v-if="trends.length"
      class="u-container block"
    >
      <div class="block__head">
        <h2>{{ t('home.trendsTitle') }}</h2>
        <p class="block__help">
          {{ t('home.trendsHelp') }}
        </p>
      </div>
      <div class="panel panel--pad">
        <YearBars
          :data="trends"
          :height="170"
          :href-for="(y) => localePath(`/contracts?year=${y}`)"
        />
      </div>
    </section>

    <!-- ============ Who earns / who spends ============ -->
    <section class="u-container cols">
      <div class="block">
        <div class="block__head">
          <h2>{{ t('home.topSuppliersTitle') }}</h2>
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
              <span class="rank__name u-truncate">{{ s.name }}</span>
              <span class="rank__meta">{{ formatNumber(s.totalContracts) }} {{ t('common.contracts').toLowerCase() }}</span>
              <MoneyAmount
                :amount="s.totalAmount"
                compact
                size="sm"
              />
            </NuxtLink>
          </li>
        </ol>
      </div>

      <div class="block">
        <div class="block__head">
          <h2>{{ t('home.topBuyersTitle') }}</h2>
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
              <span class="rank__meta">{{ formatNumber(b.totalContracts) }} {{ t('common.contracts').toLowerCase() }}</span>
              <MoneyAmount
                :amount="b.totalAmount"
                compact
                size="sm"
              />
            </NuxtLink>
          </li>
        </ol>
      </div>
    </section>

    <!-- ============ Flags ============ -->
    <section
      v-if="anomalies.length"
      class="u-container block"
    >
      <div class="block__head">
        <h2>{{ t('home.anomaliesTitle') }}</h2>
        <NuxtLink
          :to="localePath('/analytics/anomalies')"
          class="block__all"
        >
          {{ t('common.viewAll') }}
        </NuxtLink>
      </div>
      <p class="block__help block__help--wide">
        {{ t('home.anomaliesHelp') }}
      </p>
      <ul class="flags">
        <li
          v-for="a in anomalies"
          :key="a._id"
          class="flags__row"
        >
          <NuxtLink
            :to="localePath(`/contracts/${a.releaseId}`)"
            class="flags__link"
          >
            <span class="tag tag--alerta">{{ t(`anomalies.severity.${a.severity}`) }}</span>
            <span class="flags__what u-truncate">
              {{ a.metadata?.itemDescription && a.metadata.itemDescription !== 'Unknown'
                ? a.metadata.itemDescription
                : a.metadata?.buyerName }}
            </span>
            <MoneyAmount
              :amount="a.detectedValue"
              :currency="a.metadata?.currency"
              compact
              size="sm"
            />
          </NuxtLink>
        </li>
      </ul>
    </section>

    <section class="u-container source">
      <p class="source__note">
        {{ t('home.sourceNote') }}
        <span v-if="dataAsOf"> · {{ t('footer.lastUpdate', { date: formatDate(dataAsOf) }) }}</span>
      </p>
      <NuxtLink
        :to="localePath('/contracts')"
        class="source__cta"
      >
        {{ t('home.exploreCta') }}
        <v-icon size="18">
          mdi-arrow-right
        </v-icon>
      </NuxtLink>
    </section>
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

/* ---- Hero ---- */
.hero {
  border-bottom: 1px solid var(--rule);
  background:
    radial-gradient(1200px 400px at 12% -10%, var(--celeste-wash), transparent 70%),
    var(--surface);
}

.hero__inner {
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
  gap: clamp(var(--s-6), 5vw, var(--s-8));
  align-items: center;
  padding-block: clamp(var(--s-7), 7vw, var(--s-9));
}

.hero__title { margin: var(--s-3) 0 0; }

.hero__accent { color: var(--money); }

.hero__lead { margin: var(--s-4) 0 var(--s-6); }

.bigsearch {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  padding: var(--s-2) var(--s-2) var(--s-2) var(--s-4);
  background: var(--surface);
  border: 1px solid var(--rule-strong);
  border-radius: var(--r-full);
  box-shadow: var(--shadow-1);
  transition: border-color var(--dur) var(--ease), box-shadow var(--dur) var(--ease);
}

.bigsearch:focus-within {
  border-color: var(--celeste);
  box-shadow: var(--shadow-2);
}

.bigsearch__icon {
  color: var(--text-muted);
  flex: none;
}

.bigsearch__input {
  flex: 1 1 auto;
  min-width: 0;
  padding: var(--s-2) 0;
  border: 0;
  background: transparent;
  color: var(--text);
  font-family: var(--font-body);
  font-size: var(--t-md);
}

.bigsearch__input:focus { outline: none; }
.bigsearch__input::placeholder { color: var(--text-muted); }

.bigsearch__go {
  flex: none;
  padding: var(--s-3) var(--s-5);
  border: 0;
  border-radius: var(--r-full);
  background: var(--ink);
  color: #fff;
  font-family: var(--font-body);
  font-weight: 600;
  font-size: var(--t-sm);
  cursor: pointer;
  transition: background var(--dur) var(--ease);
}

.bigsearch__go:hover { background: var(--ink-3); }

.hero__hint {
  margin: var(--s-3) 0 0;
  font-size: var(--t-sm);
  color: var(--text-muted);
}

/* ---- Ledger ---- */
.ledger {
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-2);
  overflow: hidden;
}

.ledger__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--s-3);
  padding: var(--s-4) var(--s-5);
  border-bottom: 1px solid var(--rule);
}

.ledger__all,
.block__all,
.source__cta {
  font-size: var(--t-sm);
  font-weight: 600;
  color: var(--celeste-deep);
  text-decoration: none;
}

.ledger__all:hover,
.block__all:hover { text-decoration: underline; }

.ledger__list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.ledger__row + .ledger__row { border-top: 1px solid var(--rule); }

.ledger__link {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-4);
  padding: var(--s-3) var(--s-5);
  text-decoration: none;
  color: inherit;
  transition: background var(--dur) var(--ease);
}

.ledger__link:hover { background: var(--surface-sunken); }

.ledger__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 1px;
}

.ledger__what {
  font-size: var(--t-sm);
  font-weight: 600;
}

.ledger__who {
  font-size: var(--t-xs);
  color: var(--text-muted);
}

.ledger__foot {
  margin: 0;
  padding: var(--s-3) var(--s-5);
  border-top: 1px solid var(--rule);
  background: var(--surface-sunken);
  font-size: var(--t-xs);
  color: var(--text-muted);
  line-height: 1.45;
}

/* ---- Stats ---- */
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

a.stat:hover {
  border-color: var(--celeste);
  transform: translateY(-2px);
}

.stat__n {
  font-family: var(--font-display);
  font-size: var(--t-2xl);
  font-weight: 700;
  font-stretch: 112%;
  line-height: 1;
  letter-spacing: -0.03em;
}

.stat__l {
  font-size: var(--t-sm);
  color: var(--text-muted);
}

/* ---- Blocks ---- */
.block { margin-top: var(--s-8); }

.block__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--s-4);
  margin-bottom: var(--s-4);
}

.block__help {
  margin: 0 0 var(--s-4);
  font-size: var(--t-sm);
  color: var(--text-muted);
  text-align: right;
}

.block__help--wide {
  max-width: 68ch;
  margin-top: calc(var(--s-3) * -1);
  text-align: left;
}

.panel--pad { padding: var(--s-5); }

.cols {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--s-6);
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

/* ---- Flags ---- */
.flags {
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
  background: var(--surface);
  overflow: hidden;
}

.flags__row + .flags__row { border-top: 1px solid var(--rule); }

.flags__link {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--s-4);
  padding: var(--s-3) var(--s-4);
  text-decoration: none;
  color: inherit;
  transition: background var(--dur) var(--ease);
}

.flags__link:hover { background: var(--surface-sunken); }

.flags__what {
  font-size: var(--t-sm);
  font-weight: 500;
}

/* ---- Source ---- */
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

.source__note {
  margin: 0;
  font-size: var(--t-sm);
  color: var(--text-muted);
}

.source__cta {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
}

/* ---- Responsive ---- */
@media (max-width: 1000px) {
  .hero__inner {
    grid-template-columns: 1fr;
    gap: var(--s-6);
  }

  .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .cols { grid-template-columns: 1fr; }
}

@media (max-width: 700px) {
  .block__head { flex-direction: column; align-items: flex-start; gap: var(--s-1); }
  .block__help { text-align: left; }
}

@media (max-width: 640px) {
  .stats {
    grid-template-columns: 1fr;
    margin-top: var(--s-5);
  }

  .bigsearch {
    padding-left: var(--s-3);
    border-radius: var(--r-lg);
  }

  .bigsearch__go { padding-inline: var(--s-4); }

  .rank__link {
    grid-template-columns: minmax(0, 1fr) auto;
    row-gap: var(--s-1);
  }

  .rank__meta { grid-column: 1; grid-row: 2; }
  .rank__link :deep(.money) { grid-column: 2; grid-row: 1 / span 2; }
}
</style>
