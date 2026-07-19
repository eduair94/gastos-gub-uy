<script setup lang="ts">
/**
 * Intendencias — departmental spending, per capita, year by year (Vuetify).
 *
 * Reads the precomputed intendencias group (refreshed monthly) and joins a static,
 * cited INE census population map to turn pesos into pesos-per-resident — the fairness
 * lens that normalises Montevideo's size.
 *
 * The default lens is INTERANNUAL, not cumulative: the page opens on the latest full
 * year and shows each department's spend against the year before (the current calendar
 * year is still partial, so it is never the default). A year selector — plus an
 * "Acumulado" option for the all-time view — drives every figure, chart and link, and
 * each row links out to that Intendencia's actual contracts, filtered to the same year.
 *
 * Coverage caveat shown: some Intendencias publish little, so a low per-capita can mean
 * under-reporting, not thrift.
 */
import {
  DEPARTMENT_POPULATION,
  POPULATION_CENSUS_YEAR,
  POPULATION_SOURCE,
} from '~/utils/uruguay-departments'

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const router = useRouter()

const { data: res, pending, error } = await useFetch<any>('/api/analytics/intendencias')

const national = computed(() => res.value?.data?.national ?? null)
const byYear = computed<{ year: number, value: number, count: number }[]>(() =>
  (res.value?.data?.byYear ?? []).map((y: any) => ({ year: y.year, value: y.total, count: y.contracts })))
const calculatedAt = computed(() => res.value?.data?.calculatedAt ?? null)

// ---- Year selection (interannual by default) ----------------------------
type SortKey = 'perCapita' | 'total' | 'contracts'
const sort = ref<SortKey>((route.query.sort as SortKey) ?? 'perCapita')

const ALL = 'all'
// The calendar year is partial, so it is excluded from the default and flagged.
// Computed once on the server and serialised into the payload (useState) so SSR and
// client hydration agree on the year — a bare new Date() runs on both sides and would
// disagree across the Jan-1 timezone boundary, tripping a hydration mismatch.
const currentCalendarYear = useState('intend-current-year', () => new Date().getFullYear())

/** Years that carry priced purchases, ascending, from the national series. */
const dataYears = computed<number[]>(() =>
  (res.value?.data?.byYear ?? [])
    .map((y: any) => y.year as number)
    .filter((y: number) => Number.isFinite(y) && y > 0)
    .sort((a: number, b: number) => a - b))
/** Earliest year in the dataset — before it there is nothing to compare against. */
const minDataYear = computed<number | null>(() => dataYears.value[0] ?? null)

/** Latest FULL year — the most recent year that isn't the running calendar year. */
const defaultYear = computed<number | null>(() => {
  const ys = dataYears.value
  if (!ys.length) return null
  const full = ys.filter(y => y < currentCalendarYear.value)
  return (full.length ? full[full.length - 1] : ys[ys.length - 1]) ?? null
})

// '' means "use the default"; 'all' is the cumulative view; otherwise a year string.
const yearParam = ref<string>((route.query.year as string) ?? '')
const selYear = computed<string>(() =>
  yearParam.value === '' ? (defaultYear.value != null ? String(defaultYear.value) : ALL) : yearParam.value)
const isAll = computed(() => selYear.value === ALL)
const yr = computed<number | null>(() => (isAll.value ? null : Number(selYear.value) || null))
const isPartial = (y: number | null) => y != null && y === currentCalendarYear.value

const yearModel = computed<string>({
  get: () => selYear.value,
  set: (v) => { yearParam.value = v },
})

const yearItems = computed(() => [
  { value: ALL, title: t('intend.year.all') },
  ...[...dataYears.value].reverse().map(y => ({
    value: String(y),
    title: isPartial(y) ? t('intend.year.partialOpt', { year: y }) : String(y),
  })),
])

// Keep the URL in step (shareable views), dropping params equal to the defaults.
watch([sort, yearParam], () => {
  const q: Record<string, string> = {}
  if (sort.value !== 'perCapita') q.sort = sort.value
  if (yearParam.value && yearParam.value !== String(defaultYear.value)) q.year = yearParam.value
  router.replace({ query: q })
})
// Reverse sync: the trend chart pushes ?year=… on click; adopt it.
watch(() => route.query.year, (v) => {
  const nv = (v as string) ?? ''
  if (nv !== yearParam.value) yearParam.value = nv
})

// ---- Rows ---------------------------------------------------------------
interface Row {
  buyerId: string
  department: string
  total: number
  contracts: number
  population: number | null
  perCapita: number | null
  minYear: number | null
  maxYear: number | null
  prevTotal: number
  yoy: number | null
  isNew: boolean
}
const rows = computed<Row[]>(() =>
  (res.value?.data?.departments ?? []).map((d: any): Row => {
    const pop = DEPARTMENT_POPULATION[d.buyerId]
    const population = pop?.population ?? null
    const department = pop?.department ?? String(d.name).replace(/^Intendencia de /i, '')
    const series: { year: number, total: number, contracts: number }[] = d.byYear ?? []

    let total: number
    let contracts: number
    let prevTotal = 0
    if (isAll.value) {
      total = d.total
      contracts = d.contracts
    }
    else {
      const cur = series.find(s => s.year === yr.value)
      const prev = series.find(s => s.year === (yr.value ?? 0) - 1)
      total = cur?.total ?? 0
      contracts = cur?.contracts ?? 0
      prevTotal = prev?.total ?? 0
    }
    const yoy = (!isAll.value && prevTotal > 0) ? (total - prevTotal) / prevTotal : null
    // "new" only makes sense when a prior year exists to be absent from — on the
    // earliest year in the dataset nobody has a year-1, so it's "no comparison", not new.
    const hasPriorYear = yr.value != null && minDataYear.value != null && yr.value > minDataYear.value
    const isNew = !isAll.value && hasPriorYear && prevTotal <= 0 && total > 0

    return {
      buyerId: d.buyerId,
      department,
      total,
      contracts,
      population,
      perCapita: population ? total / population : null,
      minYear: d.minYear ?? null,
      maxYear: d.maxYear ?? null,
      prevTotal,
      yoy,
      isNew,
    }
  }))

// Departments that actually have spend in the active view.
const activeRows = computed(() => rows.value.filter(r => r.total > 0))

const nationalTotal = computed(() => activeRows.value.reduce((s, r) => s + r.total, 0))
// Over ALL rows, not activeRows: a department that spent last year but nothing this
// year (total_Y = 0, prevTotal > 0) must stay in the prior-year baseline, or the YoY
// denominator is understated and the headline change reads too high.
const nationalPrev = computed(() => rows.value.reduce((s, r) => s + r.prevTotal, 0))
const nationalYoy = computed(() =>
  (!isAll.value && nationalPrev.value > 0) ? (nationalTotal.value - nationalPrev.value) / nationalPrev.value : null)
const nationalPerCapita = computed(() => {
  const pop = activeRows.value.reduce((s, r) => s + (r.population ?? 0), 0)
  return pop ? nationalTotal.value / pop : null
})
const mvdShare = computed(() => {
  const mvd = activeRows.value.find(r => r.buyerId === '98-1')
  return mvd && nationalTotal.value ? (mvd.total / nationalTotal.value) * 100 : null
})

// Built from activeRows so a year view never lists departments with $0 that year
// (which read as broken data and contradict the "departments with data" KPI). In the
// acumulado view the API already returns only members with spend, so this is the same set.
const sortedRows = computed<Row[]>(() => {
  const list = [...activeRows.value]
  if (sort.value === 'total') return list.sort((a, b) => b.total - a.total)
  if (sort.value === 'contracts') return list.sort((a, b) => b.contracts - a.contracts)
  return list.sort((a, b) => (b.perCapita ?? -1) - (a.perCapita ?? -1))
})
const tableRows = computed(() => sortedRows.value.map((r, i) => ({
  ...r,
  rank: i + 1,
  share: nationalTotal.value ? `${((r.total / nationalTotal.value) * 100).toFixed(1)}%` : '—',
  years: r.minYear === r.maxYear ? String(r.minYear) : `${r.minYear}–${r.maxYear}`,
})))

const prevYear = computed(() => (yr.value != null ? yr.value - 1 : null))

const headers = computed(() => {
  const base: any[] = [
    { title: '#', key: 'rank', sortable: false, width: 44, align: 'end' as const },
    { title: t('intend.col.dept'), key: 'department', sortable: false },
    { title: isAll.value ? t('intend.col.spend') : t('intend.col.spendYear', { year: yr.value }), key: 'total', sortable: false, align: 'end' as const },
  ]
  if (!isAll.value) {
    base.push({ title: t('intend.col.yoyVs', { year: prevYear.value }), key: 'yoy', sortable: false, align: 'end' as const })
  }
  base.push(
    { title: t('intend.col.perCapita'), key: 'perCapita', sortable: false, align: 'end' as const },
    { title: t('intend.col.contracts'), key: 'contracts', sortable: false, align: 'end' as const },
    { title: t('intend.col.share'), key: 'share', sortable: false, align: 'end' as const },
  )
  if (isAll.value) {
    base.push({ title: t('intend.col.years'), key: 'years', sortable: false, align: 'end' as const })
  }
  base.push({ title: '', key: 'actions', sortable: false, align: 'end' as const, width: 120 })
  return base
})

const SORT_ITEMS = computed(() => [
  { value: 'perCapita', title: t('intend.sort.perCapita') },
  { value: 'total', title: t('intend.sort.total') },
  { value: 'contracts', title: t('intend.sort.contracts') },
])

// ---- Charts & panels ----------------------------------------------------
const perCapitaBars = computed(() =>
  activeRows.value.filter(r => r.perCapita != null)
    .sort((a, b) => (b.perCapita ?? 0) - (a.perCapita ?? 0))
    .map(r => ({ label: r.department, value: r.perCapita as number, color: r.buyerId === '98-1' ? 'celeste' : 'gold' })))
const totalBars = computed(() =>
  [...activeRows.value].sort((a, b) => b.total - a.total).map(r => ({ label: r.department, value: r.total, color: 'gold' })))

/** Trend bar → filter the whole page to that year. */
function trendHref(y: number): string | undefined {
  return y ? localePath(`/analytics/intendencias?year=${y}`) : undefined
}

// Distribution (acumulado view): who is farthest from the national mean.
const withPC = computed(() => activeRows.value.filter(r => r.perCapita != null))
const aboveLine = computed(() => withPC.value.filter(r => (r.perCapita as number) > (nationalPerCapita.value ?? 0))
  .sort((a, b) => (b.perCapita as number) - (a.perCapita as number)).slice(0, 6))
const belowLine = computed(() => withPC.value.filter(r => (r.perCapita as number) < (nationalPerCapita.value ?? 0))
  .sort((a, b) => (a.perCapita as number) - (b.perCapita as number)).slice(0, 6))
function ratioText(r: Row): string {
  if (r.perCapita == null || !nationalPerCapita.value) return '—'
  return t('intend.ratio', { x: (r.perCapita / nationalPerCapita.value).toFixed(1).replace('.', ',') })
}

// Interannual (year view): biggest risers and fallers vs the previous year.
const yoyRows = computed(() => activeRows.value.filter(r => r.yoy != null))
const risers = computed(() => [...yoyRows.value].sort((a, b) => (b.yoy as number) - (a.yoy as number)).slice(0, 6))
const fallers = computed(() => [...yoyRows.value].sort((a, b) => (a.yoy as number) - (b.yoy as number)).slice(0, 6))

function pctLabel(v: number | null): string {
  if (v == null) return '—'
  const s = v * 100
  const decimals = Math.abs(s) < 10 ? 1 : 0
  const sign = s > 0 ? '+' : ''
  return `${sign}${s.toFixed(decimals).replace('.', ',')} %`
}

/** Each row → that Intendencia's contracts, filtered to the active year. */
function contractsLink(r: { buyerId: string }): string {
  const q = new URLSearchParams()
  q.set('buyerIds', r.buyerId)
  if (!isAll.value && yr.value) q.set('year', String(yr.value))
  q.set('sort', 'amountDesc')
  return localePath(`/contracts?${q.toString()}`)
}
function profileLink(r: { buyerId: string }): string {
  return localePath(`/buyers/${encodeURIComponent(r.buyerId)}`)
}

useSeo(() => ({
  title: t('seo.intendencias.title'),
  description: t('seo.intendencias.description'),
  path: '/analytics/intendencias',
}))
</script>

<template>
  <div class="intend">
    <v-sheet
      class="hero"
      tag="header"
    >
      <div class="u-container hero__in">
        <p class="hero__eyebrow u-mono">
          {{ t('home.eyebrow') }}
        </p>
        <h1 class="hero__title">
          {{ t('intend.title') }}
        </h1>
        <p class="hero__dek">
          {{ t('intend.lead') }}
        </p>
        <v-btn
          :to="localePath('/investigaciones/intendencia-montevideo')"
          class="hero__cta"
          color="accent"
          variant="flat"
          append-icon="mdi-arrow-right"
        >
          {{ t('intend.seeInvestigation') }}
        </v-btn>
      </div>
    </v-sheet>

    <div class="u-container page">
      <!-- Method -->
      <v-card
        border
        class="method"
      >
        <p class="method__t u-mono">
          {{ t('intend.method.title') }}
        </p>
        <p class="method__b">
          {{ t('intend.method.body') }}
        </p>
        <p class="method__n">
          {{ t('intend.method.interannual') }}
        </p>
        <p class="method__n">
          {{ t('intend.method.percapita', { source: POPULATION_SOURCE, year: POPULATION_CENSUS_YEAR }) }}
        </p>
        <p
          v-if="national"
          class="method__n"
        >
          {{ t('intend.method.cap', { n: national.excludedRecords }) }}
        </p>
        <p class="method__n">
          {{ t('intend.method.coverage') }}
        </p>
      </v-card>

      <div
        v-if="error"
        class="empty"
      >
        <p class="empty__t">
          {{ t('errors.generic.title') }}
        </p>
        <p class="empty__b">
          {{ t('errors.generic.body') }}
        </p>
      </div>

      <v-skeleton-loader
        v-else-if="pending && !rows.length"
        type="card, table"
      />

      <template v-else-if="rows.length">
        <!-- Controls: year + sort -->
        <div class="controls">
          <v-select
            v-model="yearModel"
            :items="yearItems"
            :label="t('intend.year.label')"
            density="comfortable"
            variant="outlined"
            hide-details
            class="controls__year"
            prepend-inner-icon="mdi-calendar-range"
          />
          <v-select
            v-model="sort"
            :items="SORT_ITEMS"
            :label="t('intend.sort.label')"
            density="comfortable"
            variant="outlined"
            hide-details
            class="controls__sort"
          />
          <v-chip
            v-if="isPartial(yr)"
            color="warning"
            variant="tonal"
            size="small"
            class="controls__partial"
          >
            <v-icon
              start
              size="14"
            >
              mdi-progress-clock
            </v-icon>
            {{ t('intend.year.partialNote', { year: yr }) }}
          </v-chip>
        </div>

        <!-- KPIs -->
        <v-row
          class="kpis"
          dense
        >
          <v-col
            cols="6"
            md="3"
          >
            <v-card
              class="kpi"
              border
            >
              <MoneyAmount
                :amount="nationalTotal"
                size="lg"
                align="start"
                compact
              />
              <div class="kpi__l">
                {{ isAll ? t('intend.kpi.total') : t('intend.kpi.totalYear', { year: yr }) }}
              </div>
            </v-card>
          </v-col>
          <v-col
            cols="6"
            md="3"
          >
            <v-card
              class="kpi"
              border
            >
              <MoneyAmount
                :amount="nationalPerCapita"
                size="lg"
                align="start"
                compact
              />
              <div class="kpi__l">
                {{ t('intend.kpi.perCapita') }}
              </div>
            </v-card>
          </v-col>
          <v-col
            cols="6"
            md="3"
          >
            <v-card
              class="kpi"
              border
            >
              <div class="kpi__n u-mono">
                {{ formatNumber(activeRows.length) }}
              </div>
              <div class="kpi__l">
                {{ t('intend.kpi.departments') }}
              </div>
            </v-card>
          </v-col>
          <v-col
            cols="6"
            md="3"
          >
            <v-card
              class="kpi"
              border
            >
              <template v-if="isAll">
                <div class="kpi__n u-mono">
                  {{ mvdShare !== null ? `${mvdShare.toFixed(0)}%` : '—' }}
                </div>
                <div class="kpi__l">
                  {{ t('intend.kpi.mvdShare') }}
                </div>
              </template>
              <template v-else>
                <div
                  class="kpi__n u-mono"
                  :class="nationalYoy != null ? (nationalYoy >= 0 ? 'kpi__n--up' : 'kpi__n--down') : ''"
                >
                  {{ pctLabel(nationalYoy) }}
                </div>
                <div class="kpi__l">
                  {{ t('intend.kpi.yoy', { year: prevYear }) }}
                </div>
              </template>
            </v-card>
          </v-col>
        </v-row>

        <!-- Table -->
        <v-card
          border
          class="tablecard"
        >
          <v-data-table
            :headers="headers"
            :items="tableRows"
            item-value="buyerId"
            :items-per-page="-1"
            density="comfortable"
            hide-default-footer
          >
            <template #[`item.department`]="{ item }">
              <NuxtLink
                :to="profileLink(item)"
                class="dept__link"
                :class="{ 'dept--mvd': item.buyerId === '98-1' }"
              >
                {{ item.department }}
              </NuxtLink>
              <span
                v-if="item.population"
                class="dept__pop u-mono"
              >{{ t('intend.hab', { n: formatCount(item.population) }) }}</span>
            </template>
            <template #[`item.total`]="{ item }">
              <MoneyAmount
                :amount="item.total"
                compact
              />
            </template>
            <template #[`item.yoy`]="{ item }">
              <span
                v-if="item.isNew"
                class="yoy yoy--new u-mono"
              >{{ t('intend.new') }}</span>
              <span
                v-else-if="item.yoy != null"
                class="yoy u-mono"
                :class="item.yoy >= 0 ? 'yoy--up' : 'yoy--down'"
              >{{ pctLabel(item.yoy) }}</span>
              <span
                v-else
                class="u-mono muted"
              >—</span>
            </template>
            <template #[`item.perCapita`]="{ item }">
              <MoneyAmount
                :amount="item.perCapita"
                compact
                :rule="false"
              />
            </template>
            <template #[`item.contracts`]="{ item }">
              <span class="u-mono">{{ formatNumber(item.contracts) }}</span>
            </template>
            <template #[`item.share`]="{ item }">
              <span class="u-mono">{{ item.share }}</span>
            </template>
            <template #[`item.years`]="{ item }">
              <span class="u-mono muted">{{ item.years }}</span>
            </template>
            <template #[`item.actions`]="{ item }">
              <CellLink
                :to="contractsLink(item)"
                :disabled="item.total <= 0"
                :label="t('intend.viewContracts')"
              />
            </template>
          </v-data-table>
          <p
            v-if="calculatedAt"
            class="tablecard__foot u-mono"
          >
            {{ t('intend.updated', { date: formatDate(calculatedAt) }) }}
          </p>
        </v-card>

        <!-- Panels -->
        <div class="patterns__head">
          <h2>{{ isAll ? t('intend.panels.title') : t('intend.panels.titleYear', { year: yr }) }}</h2>
          <p class="patterns__note">
            {{ t('intend.panels.note') }}
          </p>
        </div>
        <v-row dense>
          <v-col
            cols="12"
            md="6"
          >
            <v-card
              border
              class="panel"
            >
              <h3 class="panel__t">
                {{ t('intend.panel.perCapita') }}
              </h3>
              <p class="panel__s">
                {{ t('intend.panel.perCapitaSub') }}
              </p>
              <div class="chartscroll">
                <InvHBars
                  :items="perCapitaBars"
                  format="money"
                  :row-height="26"
                />
              </div>
            </v-card>
          </v-col>
          <v-col
            cols="12"
            md="6"
          >
            <v-card
              border
              class="panel"
            >
              <h3 class="panel__t">
                {{ t('intend.panel.total') }}
              </h3>
              <p class="panel__s">
                {{ t('intend.panel.totalSub') }}
              </p>
              <div class="chartscroll">
                <InvHBars
                  :items="totalBars"
                  format="moneyM"
                  :row-height="26"
                />
              </div>
            </v-card>
          </v-col>
          <v-col
            cols="12"
            md="6"
          >
            <v-card
              border
              class="panel"
            >
              <h3 class="panel__t">
                {{ t('intend.panel.trend') }}
              </h3>
              <p class="panel__s">
                {{ t('intend.panel.trendSub') }}
              </p>
              <YearBars
                :data="byYear"
                unit="money"
                :height="180"
                :href-for="trendHref"
              />
              <p class="panel__hint u-mono">
                {{ t('intend.panel.trendHint') }}
              </p>
            </v-card>
          </v-col>
          <v-col
            cols="12"
            md="6"
          >
            <!-- Interannual (year view) or distance-from-mean (acumulado view). -->
            <v-card
              v-if="!isAll"
              border
              class="panel"
            >
              <h3 class="panel__t">
                {{ t('intend.panel.interannual') }}
              </h3>
              <p class="panel__s">
                {{ t('intend.panel.interannualSub', { year: yr, prev: prevYear }) }}
              </p>
              <div class="dist">
                <div class="dist__col">
                  <p class="dist__h dist__h--above">
                    {{ t('intend.panel.risers') }}
                  </p>
                  <div
                    v-for="r in risers"
                    :key="r.buyerId"
                    class="dist__row"
                  >
                    <span class="dist__dept">{{ r.department }}</span>
                    <span class="dist__pc u-mono yoy--up">{{ pctLabel(r.yoy) }}</span>
                  </div>
                  <p
                    v-if="!risers.length"
                    class="dist__none"
                  >
                    {{ t('intend.panel.noYoy') }}
                  </p>
                </div>
                <div class="dist__col">
                  <p class="dist__h dist__h--below">
                    {{ t('intend.panel.fallers') }}
                  </p>
                  <div
                    v-for="r in fallers"
                    :key="r.buyerId"
                    class="dist__row"
                  >
                    <span class="dist__dept">{{ r.department }}</span>
                    <span class="dist__pc u-mono yoy--down">{{ pctLabel(r.yoy) }}</span>
                  </div>
                  <p
                    v-if="!fallers.length"
                    class="dist__none"
                  >
                    {{ t('intend.panel.noYoy') }}
                  </p>
                </div>
              </div>
            </v-card>
            <v-card
              v-else
              border
              class="panel"
            >
              <h3 class="panel__t">
                {{ t('intend.panel.distribution') }}
              </h3>
              <p class="panel__s">
                {{ t('intend.panel.distributionSub', { line: nationalPerCapita ? formatMoney(nationalPerCapita, 'UYU', { compact: true }) : '—' }) }}
              </p>
              <div class="dist">
                <div class="dist__col">
                  <p class="dist__h dist__h--above">
                    {{ t('intend.panel.above') }}
                  </p>
                  <div
                    v-for="r in aboveLine"
                    :key="r.buyerId"
                    class="dist__row"
                  >
                    <span class="dist__dept">{{ r.department }}</span>
                    <span class="dist__pc u-mono">{{ ratioText(r) }}</span>
                  </div>
                </div>
                <div class="dist__col">
                  <p class="dist__h dist__h--below">
                    {{ t('intend.panel.below') }}
                  </p>
                  <div
                    v-for="r in belowLine"
                    :key="r.buyerId"
                    class="dist__row"
                  >
                    <span class="dist__dept">{{ r.department }}</span>
                    <span class="dist__pc u-mono">{{ ratioText(r) }}</span>
                  </div>
                </div>
              </div>
            </v-card>
          </v-col>
        </v-row>

        <!-- Interconnection -->
        <div class="interlink">
          <v-btn
            :to="localePath('/analytics/organismos')"
            variant="tonal"
            color="primary"
            prepend-icon="mdi-finance"
            class="text-none"
          >
            {{ t('nav.organismos') }}
          </v-btn>
          <v-btn
            :to="localePath('/buyers')"
            variant="text"
            prepend-icon="mdi-bank-outline"
            class="text-none"
          >
            {{ t('nav.buyers') }}
          </v-btn>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.intend { padding-bottom: var(--s-8); }

.hero {
  background: var(--ink) !important;
  color: #eaf1f6;
  padding-block: var(--s-7) var(--s-6);
}
.hero__in { max-width: 74ch; }
.hero__eyebrow { margin: 0 0 var(--s-3); font-size: var(--t-xs); letter-spacing: 0.14em; text-transform: uppercase; color: var(--sol); }
.hero__title { margin: 0 0 var(--s-3); font-family: var(--font-display); font-size: clamp(28px, 5vw, var(--t-3xl)); line-height: 1.05; color: #fff; }
.hero__dek { margin: 0 0 var(--s-5); color: #b9c8d4; font-size: var(--t-md); line-height: 1.55; }
.hero__cta { text-transform: none; letter-spacing: 0; font-weight: 600; }

.page { padding-top: var(--s-6); }

.method { padding: var(--s-4) var(--s-5); margin-bottom: var(--s-5); border-left: 3px solid var(--celeste) !important; }
.method__t { margin: 0 0 var(--s-2); font-size: var(--t-sm); font-family: var(--font-mono); letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-muted); }
.method__b { margin: 0 0 var(--s-2); font-size: var(--t-sm); line-height: 1.6; }
.method__n { margin: 0 0 var(--s-1); font-size: var(--t-xs); color: var(--text-muted); line-height: 1.55; }
.method__n:last-child { margin-bottom: 0; }

.controls { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s-3); margin-bottom: var(--s-4); }
.controls__year { max-width: 260px; }
.controls__sort { max-width: 260px; }
.controls__partial { align-self: center; }

.kpis { margin-bottom: var(--s-4); }
.kpi { padding: var(--s-4); height: 100%; }
.kpi__n { font-size: var(--t-2xl); line-height: 1; font-weight: 700; letter-spacing: -0.02em; }
.kpi__n--up { color: var(--alerta); }
.kpi__n--down { color: var(--verde); }
.kpi__l { margin-top: var(--s-2); font-family: var(--font-mono); font-size: var(--t-xs); text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); }

.tablecard { overflow: hidden; }
.tablecard__foot { margin: 0; padding: var(--s-2) var(--s-4); font-size: var(--t-xs); color: var(--text-muted); border-top: 1px solid var(--rule); }
.dept__link { color: var(--text); font-weight: 600; text-decoration: none; }
.dept__link:hover { color: var(--celeste-deep); text-decoration: underline; }
.dept--mvd { font-weight: 700; color: var(--celeste-deep); }
.dept__pop { display: block; font-size: var(--t-xs); color: var(--text-muted); }
.muted { color: var(--text-muted); }

.yoy { font-weight: 700; font-size: var(--t-sm); }
.yoy--up { color: var(--alerta); }
.yoy--down { color: var(--verde); }
.yoy--new { color: var(--celeste-deep); }

.patterns__head { margin: var(--s-7) 0 var(--s-4); }
.patterns__head h2 { margin: 0 0 var(--s-1); }
.patterns__note { margin: 0; color: var(--text-muted); font-size: var(--t-sm); }
.panel { padding: var(--s-5); height: 100%; }
.panel__t { margin: 0 0 var(--s-1); font-size: var(--t-lg); }
.panel__s { margin: 0 0 var(--s-4); color: var(--text-muted); font-size: var(--t-sm); }
.panel__hint { margin: var(--s-2) 0 0; font-size: var(--t-xs); color: var(--text-muted); }
.chartscroll { overflow-x: auto; }

.dist { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-4); }
.dist__h { margin: 0 0 var(--s-2); font-family: var(--font-mono); font-size: var(--t-xs); text-transform: uppercase; letter-spacing: 0.05em; }
.dist__h--above { color: var(--alerta); }
.dist__h--below { color: var(--verde); }
.dist__row { display: flex; align-items: baseline; justify-content: space-between; gap: var(--s-2); padding: var(--s-2) 0; border-top: 1px dashed var(--rule); }
.dist__dept { font-size: var(--t-sm); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dist__pc { flex: none; font-weight: 700; font-size: var(--t-xs); }
.dist__none { margin: var(--s-2) 0 0; font-size: var(--t-xs); color: var(--text-muted); }

.interlink { display: flex; flex-wrap: wrap; gap: var(--s-3); margin-top: var(--s-5); }

.empty { padding: var(--s-8) var(--s-5); text-align: center; border: 1px solid var(--rule); border-radius: var(--r-lg); background: var(--surface); }
.empty__t { margin: 0 0 var(--s-2); font-size: var(--t-lg); }
.empty__b { margin: 0; color: var(--text-muted); font-size: var(--t-sm); }

@media (max-width: 600px) {
  .dist { grid-template-columns: 1fr; }
  .controls__year, .controls__sort { max-width: 100%; flex: 1 1 100%; }
}
</style>
