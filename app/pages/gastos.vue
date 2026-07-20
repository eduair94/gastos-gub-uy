<script setup lang="ts">
/**
 * Gastos del Estado — "a dónde va tu plata". A single scrollable read that
 * groups public spending the way a citizen would interrogate it: who gets
 * paid, who spends, what is bought, what doesn't add up, and how incomplete
 * the state's own data is. It stitches together the honest analytics the
 * app already computes (never an all-time grand total — a handful of corrupt
 * source records carry 86% of the raw sum) and links into each explorer.
 *
 * Server-rendered so the numbers land in the crawlable HTML.
 */
const { t } = useI18n()
const localePath = useLocalePath()

// Opacity figures verified against the live DB (jul 2026): of 2.172.678
// releases, tender.status is null on 1.989.234 (91,6%) and
// procurementMethodDetails on 1.506.026 (69,3%). These are structural
// data-quality facts, cited with an as-of date rather than recomputed on
// every request (a null-rate count over 2,17M docs is not free).
const NULL_STATUS_PCT = 91.6
const NULL_METHOD_PCT = 69.3
const DATA_AS_OF = '2026-07-18'

const [
  { data: statsRes },
  { data: metricsRes },
  { data: suppliersRes },
  { data: buyersRes },
  { data: catsRes },
  { data: anomStatsRes },
  { data: anomaliesRes },
] = await Promise.all([
  useFetch<any>('/api/contracts/stats'),
  useFetch<any>('/api/dashboard/metrics'),
  useFetch<any>('/api/analytics/top-suppliers', { query: { limit: 8 } }),
  useFetch<any>('/api/analytics/top-buyers', { query: { limit: 8 } }),
  useFetch<any>('/api/analytics/category-distribution', { query: { limit: 8 } }),
  useFetch<any>('/api/analytics/anomalies/stats'),
  useFetch<any>('/api/analytics/anomalies', {
    query: { limit: 5, severity: 'critical', sortBy: 'confidence', sortOrder: 'desc' },
  }),
])

const stats = computed(() => statsRes.value?.data ?? null)
const metrics = computed(() => metricsRes.value?.data ?? null)

const contractCount = computed<number | null>(() => stats.value?.count ?? null)
const median = computed<number | null>(() => stats.value?.medianValue ?? null)

// From filter_data (via stats.byYear): honest year coverage, starts 2002.
const firstYear = computed(() => {
  const years = (stats.value?.byYear ?? []).map((d: any) => d.year).filter(Boolean)
  return years.length ? Math.min(...years) : 2002
})

// Volume, not money: plotting counts sidesteps the corrupt-total problem
// entirely — every release is one purchase regardless of a bad amount.
const byYear = computed(() =>
  (stats.value?.byYear ?? [])
    .filter((d: any) => d.year)
    .map((d: any) => ({ year: d.year, value: d.count ?? 0 })))

const topSuppliers = computed<any[]>(() => (suppliersRes.value?.data ?? []).slice(0, 6))
const topBuyers = computed<any[]>(() => (buyersRes.value?.data ?? []).slice(0, 6))
const categories = computed<any[]>(() => (catsRes.value?.data ?? []).slice(0, 6))

const anomTotal = computed(() => anomStatsRes.value?.data?.summary?.total ?? null)
const anomCritical = computed(() => anomStatsRes.value?.data?.summary?.critical ?? null)
const anomalies = computed<any[]>(() => anomaliesRes.value?.data?.anomalies ?? [])

const dataAsOf = computed(() => metrics.value?.calculatedAt ?? null)

const govUrl = 'https://www.comprasestatales.gub.uy'

const orgLd = useOrgLd()

useSeo(() => ({
  title: t('seo.gastos.title'),
  description: t('seo.gastos.description'),
  path: '/gastos',
  jsonLd: {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    'name': t('seo.gastos.title'),
    'description': t('seo.gastos.description'),
    'isPartOf': orgLd,
  },
}))
</script>

<template>
  <div class="gastos">
    <!-- ============ Hero ============ -->
    <section class="ghero">
      <div class="ghero__in u-container">
        <p class="u-eyebrow ghero__eyebrow">
          {{ t('gastos.eyebrow') }}
        </p>
        <h1 class="ghero__title">
          {{ t('gastos.title') }}
        </h1>
        <p class="ghero__lead">
          {{ t('gastos.lead', { count: formatNumber(contractCount), yearFrom: firstYear }) }}
        </p>
        <div class="ghero__cta">
          <NuxtLink
            :to="localePath('/contracts')"
            class="btn btn--primary"
          >
            {{ t('gastos.exploreCta') }}
            <v-icon size="18">
              mdi-arrow-right
            </v-icon>
          </NuxtLink>
          <NuxtLink
            :to="localePath('/about')"
            class="btn btn--ghost"
          >
            {{ t('gastos.methodCta') }}
          </NuxtLink>
        </div>
      </div>
    </section>

    <!-- ============ Stat band ============ -->
    <section class="u-container stats">
      <NuxtLink
        :to="localePath('/contracts')"
        class="stat"
      >
        <span class="stat__n">{{ formatCount(contractCount) }}</span>
        <span class="stat__l">{{ t('gastos.stat.contracts') }}</span>
      </NuxtLink>
      <NuxtLink
        :to="localePath('/about')"
        class="stat stat--money"
      >
        <MoneyAmount
          :amount="median"
          size="xl"
          align="start"
        />
        <span class="stat__l">{{ t('gastos.stat.typical') }}</span>
      </NuxtLink>
      <NuxtLink
        :to="localePath('/suppliers')"
        class="stat"
      >
        <span class="stat__n">{{ formatNumber(metrics?.totalSuppliers) }}</span>
        <span class="stat__l">{{ t('gastos.stat.suppliers') }}</span>
      </NuxtLink>
      <NuxtLink
        :to="localePath('/analytics/anomalies')"
        class="stat"
      >
        <span class="stat__n">{{ formatNumber(anomTotal) }}</span>
        <span class="stat__l">{{ t('gastos.stat.flags') }}</span>
      </NuxtLink>
    </section>

    <!-- ============ The number that's missing ============ -->
    <section class="u-container block">
      <article class="callout">
        <p class="u-eyebrow callout__eyebrow">
          {{ t('gastos.noTotal.eyebrow') }}
        </p>
        <h2 class="callout__title">
          {{ t('gastos.noTotal.title') }}
        </h2>
        <p class="callout__body">
          {{ t('gastos.noTotal.body') }}
        </p>
        <p class="callout__body">
          {{ t('gastos.noTotal.body2') }}
        </p>
        <NuxtLink
          :to="localePath('/about')"
          class="callout__cta"
        >
          {{ t('gastos.noTotal.cta') }}
          <v-icon size="16">
            mdi-arrow-right
          </v-icon>
        </NuxtLink>
      </article>
    </section>

    <!-- ============ Volume by year ============ -->
    <section
      v-if="byYear.length"
      class="u-container block"
    >
      <div class="block__head">
        <h2>{{ t('gastos.volume.title') }}</h2>
        <p class="block__help">
          {{ t('gastos.volume.help') }}
        </p>
      </div>
      <div class="panel panel--pad">
        <YearBars
          :data="byYear"
          unit="count"
          :height="180"
          :href-for="(y) => localePath(`/contracts?year=${y}`)"
        />
      </div>
    </section>

    <!-- ============ Who earns / who spends ============ -->
    <section class="u-container cols">
      <div class="block block--flush">
        <div class="block__head">
          <h2>{{ t('gastos.suppliers.title') }}</h2>
          <NuxtLink
            :to="localePath('/suppliers')"
            class="block__all"
          >
            {{ t('common.viewAll') }}
          </NuxtLink>
        </div>
        <p class="block__help block__help--wide">
          {{ t('gastos.suppliers.help') }}
        </p>
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
              <span class="rank__meta">{{ t('gastos.suppliers.meta', { n: formatNumber(s.totalContracts) }) }}</span>
              <MoneyAmount
                :amount="s.totalAmount"
                compact
                size="sm"
              />
            </NuxtLink>
          </li>
        </ol>
      </div>

      <div class="block block--flush">
        <div class="block__head">
          <h2>{{ t('gastos.buyers.title') }}</h2>
          <NuxtLink
            :to="localePath('/buyers')"
            class="block__all"
          >
            {{ t('common.viewAll') }}
          </NuxtLink>
        </div>
        <p class="block__help block__help--wide">
          {{ t('gastos.buyers.help') }}
        </p>
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
              <span class="rank__meta">{{ t('gastos.buyers.meta', { n: formatNumber(b.totalContracts) }) }}</span>
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

    <!-- Grouped views of the same spend -->
    <nav class="grouplinks u-container">
      <NuxtLink
        :to="localePath('/analytics/organismos')"
        class="grouplink"
      >
        <v-icon size="20">
          mdi-finance
        </v-icon>
        {{ t('gastos.buyers.byType') }}
      </NuxtLink>
      <NuxtLink
        :to="localePath('/analytics/intendencias')"
        class="grouplink"
      >
        <v-icon size="20">
          mdi-city-variant-outline
        </v-icon>
        {{ t('gastos.buyers.perCapita') }}
      </NuxtLink>
    </nav>

    <!-- ============ Recopilatorios teaser ============ -->
    <section class="u-container explore">
      <div class="explore__copy">
        <h2 class="explore__title">
          {{ t('recop.teaserTitle') }}
        </h2>
        <p class="explore__body">
          {{ t('recop.teaserBody') }}
        </p>
      </div>
      <div class="explore__links">
        <NuxtLink
          :to="localePath('/recopilatorios')"
          class="btn btn--primary"
        >
          {{ t('recop.teaserCta') }}
          <v-icon size="18">
            mdi-arrow-right
          </v-icon>
        </NuxtLink>
      </div>
    </section>

    <!-- ============ Pauta oficial teaser ============ -->
    <section class="u-container explore">
      <div class="explore__copy">
        <h2 class="explore__title">
          {{ t('pauta.teaserTitle') }}
        </h2>
        <p class="explore__body">
          {{ t('pauta.teaserBody') }}
        </p>
      </div>
      <div class="explore__links">
        <NuxtLink
          :to="localePath('/pauta')"
          class="btn btn--primary"
        >
          {{ t('pauta.teaserCta') }}
          <v-icon size="18">
            mdi-arrow-right
          </v-icon>
        </NuxtLink>
      </div>
    </section>

    <!-- ============ What the state buys ============ -->
    <section
      v-if="categories.length"
      class="u-container block"
    >
      <div class="block__head">
        <h2>{{ t('gastos.categories.title') }}</h2>
        <NuxtLink
          :to="localePath('/products')"
          class="block__all"
        >
          {{ t('gastos.categories.all') }}
        </NuxtLink>
      </div>
      <p class="block__help block__help--wide">
        {{ t('gastos.categories.help') }}
      </p>
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
            <span class="rank__name u-truncate">{{ c.description || c.category }}</span>
            <span class="rank__meta">{{ t('gastos.categories.share', { pct: `${c.percentage?.toFixed(1)}%` }) }}</span>
            <MoneyAmount
              :amount="c.totalAmount"
              compact
              size="sm"
            />
          </NuxtLink>
        </li>
      </ol>
    </section>

    <!-- ============ What doesn't add up ============ -->
    <section
      v-if="anomalies.length"
      class="u-container block"
    >
      <div class="block__head">
        <h2>{{ t('gastos.flags.title') }}</h2>
        <NuxtLink
          :to="localePath('/analytics/anomalies')"
          class="block__all"
        >
          {{ t('gastos.flags.seeAll') }}
        </NuxtLink>
      </div>
      <p class="block__help block__help--wide flags__summary">
        <span
          v-if="anomTotal"
          class="flags__count u-mono"
        >{{ t('gastos.flags.summary', { total: formatNumber(anomTotal), critical: formatNumber(anomCritical) }) }}</span>
        {{ t('gastos.flags.help') }}
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
              :currency="a.currency || a.metadata?.currency"
              compact
              size="sm"
            />
          </NuxtLink>
        </li>
      </ul>
      <NuxtLink
        :to="localePath('/analytics/unexplained')"
        class="block__all block__all--foot"
      >
        {{ t('gastos.flags.seeUnexplained') }}
        <v-icon size="16">
          mdi-arrow-right
        </v-icon>
      </NuxtLink>
    </section>

    <!-- ============ The opacity, in two numbers ============ -->
    <section class="u-container block">
      <div class="block__head">
        <h2>{{ t('gastos.opacity.title') }}</h2>
      </div>
      <p class="block__help block__help--wide">
        {{ t('gastos.opacity.body') }}
      </p>
      <div class="opac">
        <div class="opac__cell">
          <span class="opac__n u-mono">{{ NULL_STATUS_PCT.toLocaleString('es-UY') }}%</span>
          <span class="opac__l">{{ t('gastos.opacity.noStatus') }}</span>
        </div>
        <div class="opac__cell">
          <span class="opac__n u-mono">{{ NULL_METHOD_PCT.toLocaleString('es-UY') }}%</span>
          <span class="opac__l">{{ t('gastos.opacity.noMethod') }}</span>
        </div>
      </div>
      <p class="opac__foot u-mono">
        {{ t('gastos.opacity.asOf', { total: formatNumber(contractCount), date: formatDate(DATA_AS_OF) }) }}
        ·
        <a
          :href="govUrl"
          rel="noopener external"
          target="_blank"
          class="opac__src"
        >{{ t('gastos.opacity.source') }}</a>
      </p>
    </section>

    <!-- ============ Explore ============ -->
    <section class="u-container explore">
      <div class="explore__copy">
        <h2 class="explore__title">
          {{ t('gastos.explore.title') }}
        </h2>
        <p class="explore__body">
          {{ t('gastos.explore.body') }}
        </p>
      </div>
      <div class="explore__links">
        <NuxtLink
          :to="localePath('/contracts')"
          class="btn btn--primary"
        >
          {{ t('gastos.explore.contracts') }}
          <v-icon size="18">
            mdi-arrow-right
          </v-icon>
        </NuxtLink>
        <NuxtLink
          :to="localePath('/suppliers')"
          class="btn btn--ghost"
        >
          {{ t('gastos.explore.suppliers') }}
        </NuxtLink>
        <NuxtLink
          :to="localePath('/buyers')"
          class="btn btn--ghost"
        >
          {{ t('gastos.explore.buyers') }}
        </NuxtLink>
        <NuxtLink
          :to="localePath('/products')"
          class="btn btn--ghost"
        >
          {{ t('gastos.explore.products') }}
        </NuxtLink>
      </div>
    </section>

    <section class="u-container source">
      <p class="source__note">
        {{ t('gastos.sourceNote') }}
        <span v-if="dataAsOf"> · {{ t('footer.lastUpdate', { date: formatDate(dataAsOf) }) }}</span>
      </p>
    </section>
  </div>
</template>

<style scoped>
.gastos { padding-bottom: var(--s-8); }

/* ---- Hero (dark: this is the critique front door, distinct from the
   light dashboard hero) ---- */
.ghero {
  background:
    radial-gradient(1100px 380px at 85% -20%, color-mix(in srgb, var(--sol) 16%, transparent), transparent 70%),
    var(--ink);
  color: #eaf1f6;
  border-bottom: 1px solid var(--rule);
}

/* Left edge is pinned to --container by .u-container so it lines up with the
   stat band and the header. Never re-cap the whole block to a skinny column
   (that floats the text inward on wide screens) — cap only the measure of
   each child line so headline and lead stay readable. */
.ghero__in {
  padding-block: clamp(var(--s-7), 7vw, var(--s-9));
}

.ghero__eyebrow { color: var(--sol); }

.ghero__title {
  margin: var(--s-3) 0 0;
  max-width: 16ch;
  font-family: var(--font-display);
  font-size: clamp(30px, 6vw, var(--t-3xl));
  font-stretch: 112%;
  line-height: 1.02;
  letter-spacing: -0.03em;
  color: #fff;
  text-wrap: balance;
}

.ghero__lead {
  margin: var(--s-4) 0 var(--s-6);
  max-width: 54ch;
  font-size: var(--t-md);
  line-height: 1.55;
  color: #b9c8d4;
}

.ghero__cta { display: flex; flex-wrap: wrap; gap: var(--s-3); }

/* ---- Buttons ---- */
.btn {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  padding: var(--s-3) var(--s-5);
  border-radius: var(--r-full);
  font-size: var(--t-sm);
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;
  transition: filter var(--dur) var(--ease), background var(--dur) var(--ease), border-color var(--dur) var(--ease);
}

.btn--primary { background: var(--cta-fill); color: var(--cta-fg); }
.btn--primary:hover { filter: brightness(1.06); }

.btn--ghost {
  background: transparent;
  color: inherit;
  border: 1px solid color-mix(in srgb, currentColor 40%, transparent);
}

.btn--ghost:hover { background: color-mix(in srgb, currentColor 10%, transparent); }

/* ---- Stat band (overlaps the hero) ---- */
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

/* ---- Blocks ---- */
.block { margin-top: var(--s-8); }
.block--flush { margin-top: 0; }

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
  max-width: 70ch;
  margin-top: calc(var(--s-3) * -1);
  text-align: left;
}

.block__all {
  font-size: var(--t-sm);
  font-weight: 600;
  color: var(--celeste-deep);
  text-decoration: none;
}

.block__all:hover { text-decoration: underline; }

.block__all--foot {
  display: inline-flex;
  align-items: center;
  gap: var(--s-1);
  margin-top: var(--s-4);
}

.panel--pad { padding: var(--s-5); }

.cols {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--s-6);
  margin-top: var(--s-8);
}

/* ---- Callout (the missing total) ---- */
.callout {
  padding: clamp(var(--s-5), 4vw, var(--s-7));
  background: var(--surface);
  border: 1px solid var(--rule);
  border-left: 3px solid var(--sol);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-1);
}

.callout__eyebrow { color: var(--money); }

.callout__title {
  margin: var(--s-2) 0 var(--s-4);
  font-size: var(--t-xl);
  line-height: 1.15;
  max-width: 30ch;
}

.callout__body {
  margin: 0 0 var(--s-3);
  max-width: 68ch;
  font-size: var(--t-base);
  line-height: 1.6;
  color: var(--text);
}

.callout__cta {
  display: inline-flex;
  align-items: center;
  gap: var(--s-1);
  margin-top: var(--s-2);
  font-size: var(--t-sm);
  font-weight: 600;
  color: var(--celeste-deep);
  text-decoration: none;
}

.callout__cta:hover { text-decoration: underline; }

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
.rank__idcell { display: flex; align-items: center; gap: var(--s-2); min-width: 0; }
.rank__name { font-size: var(--t-sm); font-weight: 600; }

.rank__meta {
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  color: var(--text-muted);
  white-space: nowrap;
}

/* ---- Grouped-view links ---- */
.grouplinks {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-3);
  margin-top: var(--s-5);
}

.grouplink {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  padding: var(--s-3) var(--s-4);
  border: 1px solid var(--rule);
  border-radius: var(--r-md);
  background: var(--surface);
  color: var(--text);
  font-size: var(--t-sm);
  font-weight: 500;
  text-decoration: none;
  transition: border-color var(--dur) var(--ease), background var(--dur) var(--ease);
}

.grouplink:hover { border-color: var(--celeste); background: var(--surface-sunken); }
.grouplink :deep(.v-icon) { color: var(--celeste-deep); }

/* ---- Flags ---- */
.flags__summary { display: flex; flex-wrap: wrap; gap: var(--s-2); align-items: baseline; }
.flags__count { color: var(--alerta); font-weight: 700; }

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
.flags__what { font-size: var(--t-sm); font-weight: 500; }

/* ---- Opacity ---- */
.opac {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--s-4);
}

.opac__cell {
  padding: var(--s-5);
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
}

.opac__n {
  display: block;
  font-size: clamp(var(--t-2xl), 6vw, var(--t-3xl));
  font-weight: 700;
  line-height: 1;
  color: var(--alerta);
  letter-spacing: -0.02em;
}

.opac__l {
  display: block;
  margin-top: var(--s-2);
  font-size: var(--t-sm);
  color: var(--text-muted);
  max-width: 34ch;
}

.opac__foot {
  margin: var(--s-3) 0 0;
  font-size: var(--t-xs);
  color: var(--text-muted);
}

/* Underlined at rest: sits inline in a paragraph of muted prose, so color
   alone isn't enough to mark it as a link (Lighthouse link-in-text-block). */
.opac__src { color: var(--celeste-deep); text-decoration: underline; text-decoration-color: color-mix(in srgb, currentColor 40%, transparent); }
.opac__src:hover { text-decoration-color: currentColor; }

/* ---- Explore ---- */
.explore {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-5);
  margin-top: var(--s-8);
  padding: clamp(var(--s-5), 4vw, var(--s-6));
  background: var(--surface-sunken);
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
}

.explore__title { margin: 0 0 var(--s-2); font-size: var(--t-lg); }
.explore__body { margin: 0; font-size: var(--t-sm); color: var(--text-muted); max-width: 46ch; }
.explore__links { display: flex; flex-wrap: wrap; gap: var(--s-3); }

/* ---- Source ---- */
.source {
  margin-top: var(--s-8);
  padding-top: var(--s-5);
  border-top: 1px solid var(--rule);
}

.source__note { margin: 0; font-size: var(--t-sm); color: var(--text-muted); max-width: 80ch; }

/* ---- Responsive ---- */
@media (max-width: 1000px) {
  .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .cols { grid-template-columns: 1fr; gap: var(--s-8); }
}

@media (max-width: 700px) {
  .block__head { flex-direction: column; align-items: flex-start; gap: var(--s-1); }
  .block__help { text-align: left; }
  .opac { grid-template-columns: 1fr; }
}

@media (max-width: 640px) {
  .stats { grid-template-columns: 1fr; margin-top: var(--s-5); }

  .rank__link {
    grid-template-columns: minmax(0, 1fr) auto;
    row-gap: var(--s-1);
  }

  .rank__meta { grid-column: 1; grid-row: 2; }
  .rank__link :deep(.money) { grid-column: 2; grid-row: 1 / span 2; }
}
</style>
