<script setup lang="ts">
/**
 * Evolución del gasto — why the yearly total moved, not just that it did.
 *
 * The site already shows how much was spent per year. That number, on its own,
 * answers nothing: pesos of 2003 are not pesos of 2025, a couple of releases
 * carry a lump sum in the unit price and swamp whole years, and the feed itself
 * covered 110 bodies in 2002 against 278 in 2024 — so a rise can be inflation,
 * an artefact, better reporting, or actual spending, and the four look identical
 * on a bar chart.
 *
 * This page separates them. Everything is read from the precomputed
 * `spending_trend` collection (src/jobs/refresh-spending-trend.ts); the page does
 * no arithmetic beyond picking a lens and formatting. The exclusion list is
 * published in full, with a link per release, because a series we sanitise is
 * only trustworthy if the reader can check what we took out.
 */
const { t, locale } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const router = useRouter()
const siteUrl = useRuntimeConfig().public.siteUrl as string

const { data: res, pending, error } = await useFetch<any>('/api/analytics/spending-trend')

interface TrendYear {
  year: number
  partial: boolean
  nominalUyu: number
  realUyu: number
  usd: number
  rawNominalUyu: number
  releases: number
  buyers: number
  suppliers: number
  pctOfGdp: number | null
  pctOfCentralGovExpense: number | null
  realPerCapita: number | null
  usdPerCapita: number | null
  population: number | null
  exclusions: Array<{ releaseId: string, ocid: string, buyerName: string, title: string, nominalUyu: number, reason: string }>
  excludedCount: number
  excludedNominalUyu: number
  unconvertibleCount: number
  bridge: null | {
    base: number
    inflation: number
    entrants: number
    exits: number
    panelDelta: number
    total: number
    realDelta: number
    panelBuyers: number
    entrantBuyers: number
    exitBuyers: number
  }
  priceQuantity: null | { quantity: number, price: number, matchedDelta: number, matchedTotal: number, coverage: number, codes: number, droppedCodes: number }
  topBuyers: Array<{ key: string, label: string, delta: number, share: number, current: number, previous: number }>
  topCategories: Array<{ key: string, label: string, delta: number, share: number, current: number, previous: number }>
  events: Array<{ releaseId: string, ocid: string, title: string, buyerName: string, supplierName: string, nominalUyu: number, share: number }>
  narrativeEs: string
  narrativeEn: string
}

const years = computed<TrendYear[]>(() => res.value?.data?.years ?? [])
const method = computed(() => res.value?.data?.method ?? null)
const calculatedAt = computed(() => res.value?.data?.calculatedAt ?? null)

// ---- Lens ----------------------------------------------------------------
// One series, six ways of reading it. The default is real pesos: it is the only
// lens that answers the question the page is named after.
type LensKey = 'real' | 'nominal' | 'usd' | 'pctGdp' | 'pctGov' | 'perCapita'
const LENSES: LensKey[] = ['real', 'nominal', 'usd', 'pctGdp', 'pctGov', 'perCapita']

const lens = ref<LensKey>(LENSES.includes(route.query.lens as LensKey) ? (route.query.lens as LensKey) : 'real')
const showRaw = ref(route.query.raw === '1')

const lensFormat = computed<'money' | 'usd' | 'pct'>(() => {
  if (lens.value === 'usd' || lens.value === 'perCapita') return 'usd'
  if (lens.value === 'pctGdp' || lens.value === 'pctGov') return 'pct'
  return 'money'
})

function lensValue(y: TrendYear): number | null {
  switch (lens.value) {
    case 'nominal': return y.nominalUyu
    case 'usd': return y.usd
    case 'pctGdp': return y.pctOfGdp
    case 'pctGov': return y.pctOfCentralGovExpense
    case 'perCapita': return y.usdPerCapita
    default: return y.realUyu
  }
}

const labels = computed(() => years.value.map(y => String(y.year)))
const partialIndex = computed(() => years.value.findIndex(y => y.partial))

const series = computed(() => {
  const main = {
    label: t(`evolucion.lens.${lens.value}`),
    values: years.value.map(lensValue),
    colorVar: 'celeste-deep',
    fallback: '#3c6d9c',
  }
  const out = [main]
  // The "as reported" line only makes sense against the two peso lenses — a raw
  // total has no meaning once divided by GDP or converted per head.
  if (showRaw.value && (lens.value === 'real' || lens.value === 'nominal')) {
    out.push({
      label: t('evolucion.lens.raw'),
      values: years.value.map(y => y.rawNominalUyu),
      colorVar: 'alerta',
      fallback: '#b2423b',
      dashed: true,
    } as any)
  }
  if (lens.value === 'real') {
    out.unshift({
      label: t('evolucion.lens.nominal'),
      values: years.value.map(y => y.nominalUyu),
      colorVar: 'text-muted',
      fallback: '#596b76',
      dashed: true,
    } as any)
  }
  return out
})

// ---- Selected year -------------------------------------------------------
const lastComplete = computed(() => {
  const complete = years.value.filter(y => !y.partial)
  return complete[complete.length - 1]?.year ?? years.value[years.value.length - 1]?.year ?? null
})
const yearParam = ref<string>((route.query.year as string) ?? '')
const selectedYear = computed<number | null>(() => {
  const y = yearParam.value ? Number(yearParam.value) : lastComplete.value
  return Number.isFinite(y) ? (y as number) : null
})
const selected = computed<TrendYear | null>(() => years.value.find(y => y.year === selectedYear.value) ?? null)

const yearItems = computed(() => [...years.value]
  .filter(y => !!y.bridge)
  .reverse()
  .map(y => ({ value: String(y.year), title: y.partial ? t('evolucion.partialOpt', { year: y.year }) : String(y.year) })))
const yearModel = computed<string>({
  get: () => (selectedYear.value != null ? String(selectedYear.value) : ''),
  set: (v) => { yearParam.value = v },
})

watch([lens, showRaw, yearParam], () => {
  const q: Record<string, string> = {}
  if (lens.value !== 'real') q.lens = lens.value
  if (showRaw.value) q.raw = '1'
  if (yearParam.value && yearParam.value !== String(lastComplete.value)) q.year = yearParam.value
  router.replace({ query: q })
})

// ---- Headline numbers ----------------------------------------------------
const headline = computed(() => {
  const y = years.value.find(v => v.year === lastComplete.value)
  if (!y?.bridge) return null
  const b = y.bridge
  return {
    year: y.year,
    total: b.total,
    nominalPct: b.base > 0 ? (b.total - b.base) / b.base : 0,
    realPct: b.base > 0 ? b.realDelta / b.base : 0,
    inflation: b.inflation,
    coverage: b.entrants + b.exits,
  }
})

/** Cumulative real growth across the whole series, on complete years only. */
const longRun = computed(() => {
  const complete = years.value.filter(y => !y.partial && y.realUyu > 0)
  const first = complete[0]
  const last = complete[complete.length - 1]
  if (!first || !last || first.year === last.year) return null
  const span = last.year - first.year
  return {
    from: first.year,
    to: last.year,
    multiple: last.realUyu / first.realUyu,
    cagr: (last.realUyu / first.realUyu) ** (1 / span) - 1,
  }
})

const totalExcluded = computed(() => years.value.reduce((s, y) => s + y.excludedCount, 0))
const totalExcludedAmount = computed(() => years.value.reduce((s, y) => s + y.excludedNominalUyu, 0))

// ---- Bridge steps --------------------------------------------------------
const bridgeSteps = computed(() => {
  const y = selected.value
  if (!y?.bridge) return []
  const b = y.bridge
  return [
    { key: 'base', label: t('evolucion.bridge.base', { year: y.year - 1 }), value: b.base, kind: 'total' as const },
    { key: 'inflation', label: t('evolucion.bridge.inflation'), value: b.inflation, kind: 'inflation' as const, help: t('evolucion.bridge.inflationHelp') },
    { key: 'entrants', label: t('evolucion.bridge.entrants', { n: b.entrantBuyers }), value: b.entrants, kind: 'coverage' as const, help: t('evolucion.bridge.entrantsHelp') },
    { key: 'exits', label: t('evolucion.bridge.exits', { n: b.exitBuyers }), value: b.exits, kind: 'coverage' as const, help: t('evolucion.bridge.exitsHelp') },
    { key: 'panel', label: t('evolucion.bridge.panel', { n: b.panelBuyers }), value: b.panelDelta, kind: 'real' as const, help: t('evolucion.bridge.panelHelp') },
    { key: 'total', label: t('evolucion.bridge.total', { year: y.year }), value: b.total, kind: 'total' as const },
  ]
})

const narrative = computed(() => {
  const y = selected.value
  if (!y) return ''
  return locale.value.startsWith('en') ? y.narrativeEn : y.narrativeEs
})

// ---- Contributor bars ----------------------------------------------------
const buyerBars = computed(() => (selected.value?.topBuyers ?? []).map(b => ({
  label: b.label,
  value: b.delta,
  sub: `${b.share >= 0 ? '+' : ''}${(b.share * 100).toFixed(0)}%`,
})))
const categoryBars = computed(() => (selected.value?.topCategories ?? []).map(c => ({
  label: c.label,
  value: c.delta,
  sub: `${c.share >= 0 ? '+' : ''}${(c.share * 100).toFixed(0)}%`,
})))

// ---- Coverage ------------------------------------------------------------
const coverageSeries = computed(() => [
  {
    label: t('evolucion.coverage.buyers'),
    values: years.value.map(y => y.buyers),
    colorVar: 'celeste-deep',
    fallback: '#3c6d9c',
  },
])
const releaseSeries = computed(() => [
  {
    label: t('evolucion.coverage.releases'),
    values: years.value.map(y => y.releases),
    colorVar: 'text-muted',
    fallback: '#596b76',
  },
])

// ---- Exclusion audit -----------------------------------------------------
const exclusionRows = computed(() => years.value.flatMap(y =>
  y.exclusions.map(e => ({ ...e, year: y.year }))).sort((a, b) => b.nominalUyu - a.nominalUyu))

const exclusionColumns = computed(() => [
  { key: 'year', label: t('evolucion.audit.year'), mono: true, width: '5rem' },
  { key: 'title', label: t('evolucion.audit.contract'), primary: true },
  { key: 'buyerName', label: t('evolucion.audit.buyer') },
  { key: 'nominalUyu', label: t('evolucion.audit.amount'), align: 'end' as const },
  { key: 'reason', label: t('evolucion.audit.reason') },
])

const fmtPct = (v: number | null | undefined, digits = 1) =>
  v === null || v === undefined || !Number.isFinite(v) ? '—' : `${(v * 100).toFixed(digits).replace('.', ',')}%`

const orgLd = useOrgLd()
useSeo(() => ({
  title: t('seo.evolucion.title'),
  description: t('seo.evolucion.description'),
  path: '/analytics/evolucion-gasto',
  kicker: 'Análisis',
  jsonLd: [
    {
      '@context': 'https://schema.org',
      '@type': 'Dataset',
      'name': t('seo.evolucion.title'),
      'description': t('seo.evolucion.description'),
      'creator': orgLd,
      'isAccessibleForFree': true,
      'url': `${siteUrl}/analytics/evolucion-gasto`,
      'license': 'https://catalogodatos.gub.uy',
    },
    orgLd,
  ],
}))
</script>

<template>
  <div class="ev">
    <header class="ev-hero">
      <div class="u-container">
        <p class="ev-kicker">
          {{ t('evolucion.kicker') }}
        </p>
        <h1>{{ t('evolucion.title') }}</h1>
        <p class="ev-dek">
          {{ t('evolucion.dek') }}
        </p>
      </div>
    </header>

    <div class="u-container ev-body">
      <v-alert
        v-if="error"
        type="warning"
        variant="tonal"
        class="mb-6"
      >
        {{ t('evolucion.unavailable') }}
      </v-alert>

      <div
        v-else-if="pending"
        class="ev-loading"
      >
        {{ t('common.loading') }}
      </div>

      <template v-else>
        <!-- What this counts, before any chart. The page's number is not the
             national budget, and saying so first is not a footnote. -->
        <section class="panel panel--pad ev-scope">
          <h2 class="ev-h2">
            {{ t('evolucion.scope.title') }}
          </h2>
          <p>{{ t('evolucion.scope.body') }}</p>
          <ul class="ev-scope__list">
            <li>{{ t('evolucion.scope.fx') }}</li>
            <li>{{ t('evolucion.scope.inflation') }}</li>
            <li>
              {{ t('evolucion.scope.artifacts', { n: totalExcluded }) }}
              <a href="#auditoria">{{ t('evolucion.scope.artifactsLink') }}</a>
            </li>
          </ul>
        </section>

        <!-- Headline -->
        <section
          v-if="headline"
          class="ev-kpis"
        >
          <article class="kpi">
            <p class="kpi__k">
              {{ t('evolucion.kpi.total', { year: headline.year }) }}
            </p>
            <MoneyAmount
              :amount="headline.total"
              currency="UYU"
              size="lg"
              align="start"
              compact
            />
            <p class="kpi__s">
              {{ t('evolucion.kpi.totalSub') }}
            </p>
          </article>
          <article class="kpi">
            <p class="kpi__k">
              {{ t('evolucion.kpi.nominalChange') }}
            </p>
            <p
              class="kpi__v"
              :class="headline.nominalPct >= 0 ? 'is-up' : 'is-down'"
            >
              {{ headline.nominalPct >= 0 ? '+' : '' }}{{ fmtPct(headline.nominalPct) }}
            </p>
            <p class="kpi__s">
              {{ t('evolucion.kpi.nominalSub', { year: headline.year - 1 }) }}
            </p>
          </article>
          <article class="kpi kpi--hero">
            <p class="kpi__k">
              {{ t('evolucion.kpi.realChange') }}
            </p>
            <p
              class="kpi__v"
              :class="headline.realPct >= 0 ? 'is-up' : 'is-down'"
            >
              {{ headline.realPct >= 0 ? '+' : '' }}{{ fmtPct(headline.realPct) }}
            </p>
            <p class="kpi__s">
              {{ t('evolucion.kpi.realSub') }}
            </p>
          </article>
          <article
            v-if="longRun"
            class="kpi"
          >
            <p class="kpi__k">
              {{ t('evolucion.kpi.longRun', { from: longRun.from, to: longRun.to }) }}
            </p>
            <p class="kpi__v">
              ×{{ longRun.multiple.toFixed(1).replace('.', ',') }}
            </p>
            <p class="kpi__s">
              {{ t('evolucion.kpi.longRunSub', { cagr: fmtPct(longRun.cagr) }) }}
            </p>
          </article>
        </section>

        <!-- Lens + series -->
        <ChartBlock
          :title="t('evolucion.series.title')"
          :help="t(`evolucion.lensHelp.${lens}`)"
          :scroll="false"
          class="ev-block"
        >
          <template #actions>
            <div class="ev-lenses">
              <button
                v-for="k in LENSES"
                :key="k"
                type="button"
                class="ev-lens"
                :class="{ 'is-on': lens === k }"
                :aria-pressed="lens === k"
                @click="lens = k"
              >
                {{ t(`evolucion.lens.${k}`) }}
              </button>
            </div>
          </template>
          <TrendLines
            :labels="labels"
            :series="series"
            :format="lensFormat"
            :partial-index="partialIndex"
            :height="340"
          />
          <template #meta>
            <label class="ev-raw">
              <input
                v-model="showRaw"
                type="checkbox"
              >
              {{ t('evolucion.series.rawToggle') }}
            </label>
            <span class="ev-meta-sep">·</span>
            {{ t('evolucion.series.meta') }}
          </template>
        </ChartBlock>

        <!-- The bridge -->
        <section class="ev-bridge">
          <div class="ev-bridge__head">
            <h2 class="ev-h2">
              {{ t('evolucion.bridge.title') }}
            </h2>
            <v-select
              v-model="yearModel"
              :items="yearItems"
              item-title="title"
              item-value="value"
              density="compact"
              variant="outlined"
              hide-details
              class="ev-yearsel"
              :label="t('evolucion.bridge.yearLabel')"
            />
          </div>
          <p class="ev-bridge__help">
            {{ t('evolucion.bridge.help') }}
          </p>

          <div
            v-if="selected?.bridge"
            class="panel panel--pad"
          >
            <BridgeWaterfall :steps="bridgeSteps" />
            <p class="ev-narrative">
              {{ narrative }}
            </p>
          </div>
          <p
            v-else
            class="ev-empty"
          >
            {{ t('evolucion.bridge.empty') }}
          </p>
        </section>

        <!-- Who moved it -->
        <div
          v-if="selected?.bridge"
          class="ev-grid2"
        >
          <ChartBlock
            :title="t('evolucion.contrib.buyers')"
            :help="t('evolucion.contrib.buyersHelp')"
            framed
            level="3"
          >
            <InvHBars
              :items="buyerBars"
              format="moneyM"
              :row-height="32"
            />
          </ChartBlock>
          <ChartBlock
            :title="t('evolucion.contrib.categories')"
            :help="t('evolucion.contrib.categoriesHelp')"
            framed
            level="3"
          >
            <InvHBars
              :items="categoryBars"
              format="moneyM"
              :row-height="32"
            />
          </ChartBlock>
        </div>

        <!-- Price vs quantity -->
        <section
          v-if="selected?.priceQuantity"
          class="panel panel--pad ev-pq"
        >
          <h2 class="ev-h2">
            {{ t('evolucion.pq.title') }}
          </h2>
          <p class="ev-pq__help">
            {{ t('evolucion.pq.help', {
              coverage: fmtPct(selected.priceQuantity.coverage, 0),
              codes: formatCount(selected.priceQuantity.codes),
              dropped: formatCount(selected.priceQuantity.droppedCodes),
            }) }}
          </p>
          <div class="ev-pq__grid">
            <div class="ev-pq__cell">
              <p class="kpi__k">
                {{ t('evolucion.pq.price') }}
              </p>
              <p
                class="kpi__v"
                :class="selected.priceQuantity.price >= 0 ? 'is-up' : 'is-down'"
              >
                {{ selected.priceQuantity.price >= 0 ? '+' : '−' }}{{ formatMoney(Math.abs(selected.priceQuantity.price), 'UYU', { compact: true }) }}
              </p>
              <p class="kpi__s">
                {{ t('evolucion.pq.priceSub') }}
              </p>
            </div>
            <div class="ev-pq__cell">
              <p class="kpi__k">
                {{ t('evolucion.pq.quantity') }}
              </p>
              <p
                class="kpi__v"
                :class="selected.priceQuantity.quantity >= 0 ? 'is-up' : 'is-down'"
              >
                {{ selected.priceQuantity.quantity >= 0 ? '+' : '−' }}{{ formatMoney(Math.abs(selected.priceQuantity.quantity), 'UYU', { compact: true }) }}
              </p>
              <p class="kpi__s">
                {{ t('evolucion.pq.quantitySub') }}
              </p>
            </div>
          </div>
          <p class="ev-caveat">
            {{ t('evolucion.pq.caveat') }}
          </p>
        </section>

        <!-- Events -->
        <section
          v-if="selected?.events?.length"
          class="ev-events"
        >
          <h2 class="ev-h2">
            {{ t('evolucion.events.title', { year: selected.year }) }}
          </h2>
          <p class="ev-events__help">
            {{ t('evolucion.events.help') }}
          </p>
          <ul class="ev-events__list">
            <li
              v-for="e in selected.events"
              :key="e.releaseId"
              class="ev-event"
            >
              <div class="ev-event__id">
                <CellLink :to="localePath(`/contracts/${e.releaseId}`)">
                  {{ e.title || t('evolucion.events.untitled') }}
                </CellLink>
                <p class="ev-event__meta">
                  {{ e.buyerName }}<template v-if="e.supplierName">
                    → {{ e.supplierName }}
                  </template>
                </p>
              </div>
              <div class="ev-event__fig">
                <MoneyAmount
                  :amount="e.nominalUyu"
                  currency="UYU"
                  compact
                />
                <p class="ev-event__share">
                  {{ t('evolucion.events.share', { pct: fmtPct(e.share, 0) }) }}
                </p>
              </div>
            </li>
          </ul>
        </section>

        <!-- Coverage -->
        <div class="ev-grid2">
          <ChartBlock
            :title="t('evolucion.coverage.title')"
            :help="t('evolucion.coverage.help')"
            :scroll="false"
            framed
            level="3"
          >
            <TrendLines
              :labels="labels"
              :series="coverageSeries"
              format="count"
              :partial-index="partialIndex"
              :height="220"
            />
          </ChartBlock>
          <ChartBlock
            :title="t('evolucion.coverage.releasesTitle')"
            :help="t('evolucion.coverage.releasesHelp')"
            :scroll="false"
            framed
            level="3"
          >
            <TrendLines
              :labels="labels"
              :series="releaseSeries"
              format="count"
              :partial-index="partialIndex"
              :height="220"
            />
          </ChartBlock>
        </div>

        <!-- Audit -->
        <section
          id="auditoria"
          class="ev-audit"
        >
          <h2 class="ev-h2">
            {{ t('evolucion.audit.title') }}
          </h2>
          <p class="ev-audit__help">
            {{ t('evolucion.audit.help', {
              n: totalExcluded,
              amount: formatMoney(totalExcludedAmount, 'UYU', { compact: true }),
              ceiling: formatMoney(method?.artifactCeilingReal ?? 5e10, 'UYU', { compact: true }),
            }) }}
          </p>
          <DataTable
            :columns="exclusionColumns"
            :rows="exclusionRows"
            :row-key="(r) => r.releaseId"
            :row-to="(r) => localePath(`/contracts/${r.releaseId}`)"
            min-width="720px"
          >
            <template #cell:title="{ row }">
              {{ row.title || t('evolucion.events.untitled') }}
            </template>
            <template #cell:nominalUyu="{ row }">
              <MoneyAmount
                :amount="row.nominalUyu"
                currency="UYU"
                compact
              />
            </template>
            <template #cell:reason="{ row }">
              {{ t(`evolucion.audit.reasons.${row.reason}`) }}
            </template>
          </DataTable>
        </section>

        <!-- Method -->
        <section class="panel panel--pad ev-method">
          <h2 class="ev-h2">
            {{ t('evolucion.method.title') }}
          </h2>
          <dl class="ev-method__dl">
            <div>
              <dt>{{ t('evolucion.method.deflator') }}</dt>
              <dd>{{ t('evolucion.method.deflatorBody') }}</dd>
            </div>
            <div>
              <dt>{{ t('evolucion.method.fx') }}</dt>
              <dd>{{ t('evolucion.method.fxBody') }}</dd>
            </div>
            <div>
              <dt>{{ t('evolucion.method.bridge') }}</dt>
              <dd>{{ t('evolucion.method.bridgeBody') }}</dd>
            </div>
            <div>
              <dt>{{ t('evolucion.method.macro') }}</dt>
              <dd>
                {{ t('evolucion.method.macroBody') }}
                <a
                  v-if="method?.macroSource?.url"
                  :href="method.macroSource.url"
                  rel="noopener noreferrer"
                  target="_blank"
                >{{ method.macroSource.name }}</a>
              </dd>
            </div>
          </dl>
          <p
            v-if="calculatedAt"
            class="ev-method__stamp"
          >
            {{ t('evolucion.method.updated', { date: new Date(calculatedAt).toLocaleDateString(locale) }) }}
          </p>
        </section>
      </template>
    </div>
  </div>
</template>

<style scoped>
.ev-hero {
  padding: var(--s-7) 0 var(--s-5);
  border-bottom: 1px solid var(--rule);
}

.ev-kicker {
  margin: 0 0 var(--s-2);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.ev-hero h1 {
  margin: 0;
  font-size: var(--t-3xl);
  line-height: 1.04;
}

.ev-dek {
  margin: var(--s-3) 0 0;
  max-width: 68ch;
  font-size: var(--t-base);
  line-height: 1.55;
  color: var(--text-muted);
}

.ev-body {
  display: grid;
  gap: var(--s-7);
  padding-top: var(--s-6);
  padding-bottom: var(--s-8);
  min-width: 0;
}

.ev-h2 {
  margin: 0 0 var(--s-3);
  font-size: var(--t-xl);
  line-height: 1.1;
}

.ev-loading,
.ev-empty {
  padding: var(--s-6) 0;
  color: var(--text-muted);
}

/* Scope note */
.ev-scope p { margin: 0; max-width: 72ch; line-height: 1.6; }
.ev-scope__list {
  margin: var(--s-4) 0 0;
  padding-left: var(--s-5);
  display: grid;
  gap: var(--s-2);
  max-width: 72ch;
  font-size: var(--t-sm);
  line-height: 1.5;
  color: var(--text-muted);
}

/* KPIs */
/* 16rem, not 13rem: the money KPI is a 14-character mono figure
   ("$ 179,58 mil M") and at 13rem the four cards each got ~250px, which the
   figure and its gold rule overran past the card border. At 16rem the row
   drops to three cards before that can happen. */
.ev-kpis {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr));
  gap: var(--s-4);
  min-width: 0;
}

.kpi {
  padding: var(--s-4) var(--s-5);
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
  min-width: 0;
}

.kpi--hero { border-color: var(--rule-strong); }

.kpi__k {
  margin: 0 0 var(--s-2);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-muted);
}

/* --t-xl, not --t-2xl: at 2xl the percentages reach 44px and tower over the
   money KPI beside them (<MoneyAmount size="lg"> is --t-xl), so the row read as
   two different hierarchies. One size across all four. */
.kpi__v {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--t-xl);
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}

/* Deliberately NOT green-down / red-up. Spending falling is not "good" and
   rising is not "bad" — that is the reader's call, not the page's. The sign
   carries the direction; the colour stays neutral, same principle as
   /analytics/partidos. (`--verde` also means "verified active" site-wide.) */
.kpi__v.is-up,
.kpi__v.is-down { color: var(--text); }

.kpi__s {
  margin: var(--s-2) 0 0;
  font-size: var(--t-xs);
  line-height: 1.4;
  color: var(--text-muted);
}

/* Lens switcher — a fixed vocabulary of views, so chips are the right shape. */
.ev-lenses { display: flex; flex-wrap: wrap; gap: var(--s-1); min-width: 0; }

/* <ChartBlock> sets `.cb__actions { flex: 0 0 auto }`, which is right for a
   one-word action but not for six chips: at 360px the row refused to shrink and
   pushed the whole PAGE 288px wide. Letting it shrink (with min-width: 0) is
   what lets the chips wrap inside it instead. */
.ev-block :deep(.cb__actions) {
  flex: 0 1 auto;
  min-width: 0;
}

.ev-lens {
  padding: 4px var(--s-3);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  color: var(--text-muted);
  background: var(--surface-sunken);
  border: 1px solid transparent;
  border-radius: var(--r-sm);
  cursor: pointer;
}

.ev-lens:hover { color: var(--text); }

.ev-lens.is-on {
  color: var(--surface);
  background: var(--celeste-deep);
  border-color: var(--celeste-deep);
}

.ev-raw { display: inline-flex; align-items: center; gap: var(--s-2); cursor: pointer; }
.ev-meta-sep { margin: 0 var(--s-2); }

/* Bridge */
.ev-bridge__head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: var(--s-3);
}
.ev-bridge__head .ev-h2 { margin-bottom: 0; }
.ev-yearsel { max-width: 12rem; }

.ev-bridge__help {
  margin: var(--s-3) 0 var(--s-4);
  max-width: 76ch;
  font-size: var(--t-sm);
  line-height: 1.5;
  color: var(--text-muted);
}

.ev-narrative {
  margin: var(--s-5) 0 0;
  padding-top: var(--s-4);
  border-top: 1px solid var(--rule);
  max-width: 80ch;
  line-height: 1.6;
}

.ev-grid2 {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr));
  gap: var(--s-5);
  min-width: 0;
}

/* Price vs quantity */
.ev-pq__help,
.ev-events__help,
.ev-audit__help {
  margin: 0 0 var(--s-4);
  max-width: 76ch;
  font-size: var(--t-sm);
  line-height: 1.5;
  color: var(--text-muted);
}

.ev-pq__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr));
  gap: var(--s-5);
}

.ev-pq__cell { min-width: 0; }

.ev-caveat {
  margin: var(--s-4) 0 0;
  font-size: var(--t-xs);
  line-height: 1.5;
  color: var(--text-muted);
}

/* Events */
.ev-events__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0;
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
  overflow: hidden;
}

.ev-event {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: var(--s-3);
  padding: var(--s-3) var(--s-5);
  border-top: 1px solid var(--rule);
  min-width: 0;
}
.ev-event:first-child { border-top: 0; }

.ev-event__id { min-width: 0; }

.ev-event__meta {
  margin: 2px 0 0;
  font-size: var(--t-xs);
  line-height: 1.4;
  color: var(--text-muted);
  overflow-wrap: break-word;
}

.ev-event__fig { text-align: right; }

.ev-event__share {
  margin: 2px 0 0;
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  color: var(--text-muted);
  white-space: nowrap;
}

/* Method */
.ev-method__dl {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr));
  gap: var(--s-4);
  margin: 0;
}
.ev-method__dl dt {
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.ev-method__dl dd {
  margin: var(--s-2) 0 0;
  font-size: var(--t-sm);
  line-height: 1.55;
}
.ev-method__stamp {
  margin: var(--s-5) 0 0;
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  color: var(--text-muted);
}

@media (max-width: 600px) {
  .ev-hero { padding-top: var(--s-6); }
  .ev-hero h1 { font-size: var(--t-2xl); }
}
</style>
