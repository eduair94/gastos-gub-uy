<script setup lang="ts">
/**
 * Compras por partido — a DESCRIPTIVE departmental comparison over open data, with a
 * choropleth map. It answers "how did each department's procurement look, grouped by
 * the party that governed?" — never "which party manages better". The data cannot
 * support causal party claims, and the page says so, prominently.
 *
 * Two lenses per indicator (see utils/party-comparison): the MEDIAN of departments
 * (size-neutral — Montevideo, 37% of the country and always FA, doesn't dominate) and
 * the size-weighted AGGREGATE. A fixed confounders panel names the traps. Party is
 * shown strictly as public electoral record; this page is kept out of the anomaly
 * accusation surfaces — the anomaly-density metric is descriptive, heavily caveated.
 */
import { DEPT_PATHS, GEO_VIEWBOX, GEO_SOURCE } from '~/assets/geo/uruguay-dept-paths'
import { DEPARTMENT_POPULATION, POPULATION_SOURCE, POPULATION_CENSUS_YEAR } from '~/utils/uruguay-departments'
import {
  aggregateByParty,
  metricValue,
  METRICS,
  type DeptRow,
  type MetricKey,
} from '~/utils/party-comparison'

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const router = useRouter()

const { data: res, pending, error } = await useFetch<any>('/api/analytics/party-comparison')

const allRows = computed<DeptRow[]>(() => res.value?.data?.rows ?? [])
const dataYears = computed<number[]>(() => (res.value?.data?.years ?? []).filter((y: number) => y > 0).sort((a: number, b: number) => a - b))
const calculatedAt = computed(() => res.value?.data?.calculatedAt ?? null)

// ---- Controls ----------------------------------------------------------
type Mode = 'party' | 'metric'
const mode = ref<Mode>((route.query.mode as Mode) === 'metric' ? 'metric' : 'party')
const metric = ref<MetricKey>((route.query.metric as MetricKey) in METRICS ? (route.query.metric as MetricKey) : 'perCapita')

const currentCalendarYear = useState('partidos-current-year', () => new Date().getFullYear())
// How many of the 19 departments actually reported priced contracts in each year.
const coverageByYear = computed<Map<number, number>>(() => {
  const m = new Map<number, number>()
  for (const r of allRows.value) if (r.contracts > 0) m.set(r.year, (m.get(r.year) ?? 0) + 1)
  return m
})
// Default to the latest FULL year with broad coverage (≥12 of 19 depts). The most
// recent year is both partial and a departmental-handover transition, so it reports
// sparsely and mixes administrations — a poor first impression. Fall back gracefully.
const defaultYear = computed<number | null>(() => {
  const ys = dataYears.value
  if (!ys.length) return null
  const full = ys.filter(y => y < currentCalendarYear.value)
  const wellCovered = full.filter(y => (coverageByYear.value.get(y) ?? 0) >= 12)
  return (wellCovered[wellCovered.length - 1] ?? full[full.length - 1] ?? ys[ys.length - 1]) ?? null
})
const yearParam = ref<string>((route.query.year as string) ?? '')
const year = computed<number | null>(() => {
  const y = yearParam.value ? Number(yearParam.value) : defaultYear.value
  return Number.isFinite(y) ? (y as number) : null
})
const isPartial = computed(() => year.value === currentCalendarYear.value)

const yearItems = computed(() => [...dataYears.value].reverse().map(y => ({
  value: String(y),
  title: y === currentCalendarYear.value ? t('partidos.year.partialOpt', { year: y }) : String(y),
})))
const yearModel = computed<string>({
  get: () => (year.value != null ? String(year.value) : ''),
  set: v => { yearParam.value = v },
})

const METRIC_ITEMS = computed(() => (['perCapita', 'directShare', 'priceCoverage', 'top5', 'anomalyDensity'] as MetricKey[])
  .map(k => ({ value: k, title: t(`partidos.metric.${k}`) })))

watch([mode, metric, yearParam], () => {
  const q: Record<string, string> = {}
  if (mode.value !== 'party') q.mode = mode.value
  if (metric.value !== 'perCapita') q.metric = metric.value
  if (yearParam.value && yearParam.value !== String(defaultYear.value)) q.year = yearParam.value
  router.replace({ query: q })
})

// ---- Rows for the selected year ----------------------------------------
const popMap = computed<Record<string, number>>(() => {
  const m: Record<string, number> = {}
  for (const [id, d] of Object.entries(DEPARTMENT_POPULATION)) m[id] = d.population
  return m
})
const nameOf = (id: string) => DEPARTMENT_POPULATION[id]?.department ?? id

const yearRows = computed<DeptRow[]>(() => allRows.value.filter(r => r.year === year.value))
const rowById = computed<Record<string, DeptRow>>(() => {
  const m: Record<string, DeptRow> = {}
  for (const r of yearRows.value) m[r.buyerId] = r
  return m
})

// ---- Metric formatting + value ------------------------------------------
function valueOf(id: string): number | null {
  const r = rowById.value[id]
  if (!r) return null
  return metricValue(r, metric.value, popMap.value[id])
}
function fmtMetric(v: number | null, m: MetricKey = metric.value): string {
  if (v == null) return '—'
  const def = METRICS[m]
  if (def.format === 'money') return formatMoney(v, 'UYU', { compact: true })
  if (def.format === 'pct') return `${(v * 100).toFixed(v * 100 < 10 ? 1 : 0).replace('.', ',')}%`
  return v.toFixed(1).replace('.', ',') // per1000
}

// ---- Color scales -------------------------------------------------------
function hexLerp(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16))
  const pb = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16))
  const p = pa.map((c, i) => Math.round(c + (pb[i]! - c) * Math.max(0, Math.min(1, t))))
  return `#${p.map(c => c.toString(16).padStart(2, '0')).join('')}`
}
const NEUTRAL = '#e2e6ea'
// pale → strong ramp per metric family; anomalies use an alert ramp (with disclaimer).
const ramp = computed<[string, string]>(() => metric.value === 'anomalyDensity' ? ['#f6e9ea', '#d7263d'] : ['#eaf1f7', '#c69214'])

const metricExtent = computed<[number, number] | null>(() => {
  const vals = yearRows.value.map(r => metricValue(r, metric.value, popMap.value[r.buyerId])).filter((v): v is number => v != null)
  if (!vals.length) return null
  return [Math.min(...vals), Math.max(...vals)]
})

const colorFor = computed(() => (id: string): string => {
  if (mode.value === 'party') {
    return rowById.value[id]?.partyColor ?? NEUTRAL
  }
  const v = valueOf(id)
  const ext = metricExtent.value
  if (v == null || !ext) return NEUTRAL
  const [lo, hi] = ext
  const tt = hi > lo ? (v - lo) / (hi - lo) : 0.5
  return hexLerp(ramp.value[0], ramp.value[1], tt)
})

// ---- Party legend (party mode) ------------------------------------------
const partiesPresent = computed(() => {
  const seen = new Map<string, { party: string, label: string, color: string, n: number }>()
  for (const r of yearRows.value) {
    if (!r.party) continue
    const e = seen.get(r.party) ?? { party: r.party, label: r.partyLabel ?? r.party, color: r.partyColor ?? '#888', n: 0 }
    e.n += 1
    seen.set(r.party, e)
  }
  const ORDER = ['FA', 'PN', 'PC', 'CR']
  return [...seen.values()].sort((a, b) => ORDER.indexOf(a.party) - ORDER.indexOf(b.party))
})

// ---- Hover / selection --------------------------------------------------
const hoverId = ref<string | null>(null)
const focusId = computed(() => hoverId.value)
const focusRow = computed(() => (focusId.value ? rowById.value[focusId.value] ?? null : null))

function detailRows(r: DeptRow) {
  return [
    { k: 'perCapita', v: fmtMetric(metricValue(r, 'perCapita', popMap.value[r.buyerId]), 'perCapita') },
    { k: 'directShare', v: fmtMetric(metricValue(r, 'directShare'), 'directShare'), cover: r.totalRecords ? Math.round(100 * r.methodKnown / r.totalRecords) : 0 },
    { k: 'priceCoverage', v: fmtMetric(metricValue(r, 'priceCoverage'), 'priceCoverage') },
    { k: 'top5', v: fmtMetric(metricValue(r, 'top5'), 'top5') },
    { k: 'anomalyDensity', v: fmtMetric(metricValue(r, 'anomalyDensity'), 'anomalyDensity') },
  ]
}

// ---- Party comparison (selected metric) ---------------------------------
const partyAgg = computed(() => aggregateByParty(yearRows.value, metric.value, popMap.value))
const aggMax = computed(() => {
  const vals = partyAgg.value.flatMap(p => [p.median, p.aggregate]).filter((v): v is number => v != null)
  return vals.length ? Math.max(...vals) : 1
})
const barPct = (v: number | null) => (v == null || aggMax.value <= 0 ? 0 : Math.max(2, (v / aggMax.value) * 100))

// ---- Table --------------------------------------------------------------
// Only departments that actually reported that year — a $0 row reads as broken data
// and contradicts the map, where those departments are simply uncoloured/neutral.
const tableRows = computed(() =>
  [...yearRows.value]
    .filter(r => r.contracts > 0)
    .map(r => ({
      ...r,
      name: nameOf(r.buyerId),
      val: valueOf(r.buyerId),
      // Method coverage — shown beside % compra directa, because a low/zero value
      // usually means the direct purchases went UNLABELLED, not that they didn't happen.
      cover: r.totalRecords ? Math.round(100 * r.methodKnown / r.totalRecords) : 0,
    }))
    .sort((a, b) => (b.val ?? -Infinity) - (a.val ?? -Infinity)))

function contractsLink(buyerId: string) {
  const q = new URLSearchParams({ buyerIds: buyerId, sort: 'amountDesc' })
  if (year.value) q.set('year', String(year.value))
  return localePath(`/contracts?${q.toString()}`)
}

const orgLd = useOrgLd()

useSeo(() => ({
  title: t('seo.partidos.title'),
  description: t('seo.partidos.description'),
  path: '/analytics/partidos',
  kicker: 'Partidos',
  jsonLd: [
    {
      '@context': 'https://schema.org',
      '@type': 'Dataset',
      'name': t('seo.partidos.title'),
      'description': t('seo.partidos.description'),
      'creator': orgLd,
      'isAccessibleForFree': true,
      'license': 'https://catalogodatos.gub.uy',
    },
    orgLd,
  ],
}))
</script>

<template>
  <div class="pty">
    <v-sheet
      class="hero"
      tag="header"
    >
      <div class="u-container hero__in">
        <p class="hero__eyebrow u-mono">
          {{ t('home.eyebrow') }}
        </p>
        <h1 class="hero__title">
          {{ t('partidos.title') }}
        </h1>
        <p class="hero__dek">
          {{ t('partidos.lead') }}
        </p>
      </div>
    </v-sheet>

    <div class="u-container page">
      <!-- Framing / method -->
      <v-card
        border
        class="method"
      >
        <p class="method__t u-mono">
          {{ t('partidos.method.title') }}
        </p>
        <p class="method__b">
          {{ t('partidos.method.body') }}
        </p>
        <p class="method__n">
          {{ t('partidos.method.percapita', { source: POPULATION_SOURCE, year: POPULATION_CENSUS_YEAR }) }}
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
          {{ t('partidos.notReady') }}
        </p>
      </div>

      <v-skeleton-loader
        v-else-if="pending && !allRows.length"
        type="image, table"
      />

      <template v-else-if="allRows.length">
        <!-- Controls -->
        <div class="controls">
          <v-btn-toggle
            v-model="mode"
            mandatory
            density="comfortable"
            variant="outlined"
            divided
            class="controls__mode"
          >
            <v-btn value="party" size="small">
              {{ t('partidos.mode.party') }}
            </v-btn>
            <v-btn value="metric" size="small">
              {{ t('partidos.mode.metric') }}
            </v-btn>
          </v-btn-toggle>

          <v-select
            v-if="mode === 'metric'"
            v-model="metric"
            :items="METRIC_ITEMS"
            :label="t('partidos.metricLabel')"
            density="comfortable"
            variant="outlined"
            hide-details
            class="controls__metric"
          />
          <v-select
            v-model="yearModel"
            :items="yearItems"
            :label="t('partidos.yearLabel')"
            density="comfortable"
            variant="outlined"
            hide-details
            class="controls__year"
            prepend-inner-icon="mdi-calendar-range"
          />
          <v-chip
            v-if="isPartial"
            color="warning"
            variant="tonal"
            size="small"
          >
            <v-icon
              start
              size="14"
            >
              mdi-progress-clock
            </v-icon>
            {{ t('partidos.year.partialNote', { year }) }}
          </v-chip>
        </div>

        <!-- Map + detail -->
        <div class="mapwrap">
          <v-card
            border
            class="mapcard"
          >
            <MapChoropleth
              :paths="DEPT_PATHS"
              :view-box="GEO_VIEWBOX"
              :color-for="colorFor"
              :label-for="nameOf"
              :active-id="focusId"
              :aria-label="t('partidos.mapAria')"
              @hover="hoverId = $event"
              @select="hoverId = $event"
            />
          </v-card>

          <div class="side">
            <!-- Legend -->
            <v-card
              border
              class="legend"
            >
              <p class="legend__t u-mono">
                {{ mode === 'party' ? t('partidos.legend.party') : t(`partidos.metric.${metric}`) }}
              </p>
              <template v-if="mode === 'party'">
                <div
                  v-for="p in partiesPresent"
                  :key="p.party"
                  class="legend__row"
                >
                  <span
                    class="legend__dot"
                    :style="{ background: p.color }"
                  />
                  <span class="legend__lbl">{{ p.label }}</span>
                  <span class="legend__n u-mono">{{ t('partidos.legend.nDepts', { n: p.n }) }}</span>
                </div>
              </template>
              <template v-else>
                <p class="legend__sub">
                  {{ t(`partidos.metricHelp.${metric}`) }}
                </p>
                <div
                  class="legend__ramp"
                  :style="{ background: `linear-gradient(90deg, ${ramp[0]}, ${ramp[1]})` }"
                />
                <div class="legend__scale u-mono">
                  <span>{{ fmtMetric(metricExtent?.[0] ?? null) }}</span>
                  <span>{{ fmtMetric(metricExtent?.[1] ?? null) }}</span>
                </div>
                <p
                  v-if="metric === 'anomalyDensity'"
                  class="legend__warn"
                >
                  {{ t('partidos.anomalyCaveat') }}
                </p>
              </template>
            </v-card>

            <!-- Hover detail -->
            <v-card
              border
              class="detail"
            >
              <template v-if="focusRow">
                <p class="detail__name">
                  {{ nameOf(focusRow.buyerId) }}
                </p>
                <MandateChip
                  :buyer-id="focusRow.buyerId"
                  :year="focusRow.year"
                  size="small"
                  class="detail__chip"
                />
                <dl class="detail__list">
                  <div
                    v-for="d in detailRows(focusRow)"
                    :key="d.k"
                    class="detail__row"
                  >
                    <dt>{{ t(`partidos.metric.${d.k}`) }}</dt>
                    <dd class="u-mono">
                      {{ d.v }}<span
                        v-if="d.k === 'directShare' && d.cover != null"
                        class="detail__cover"
                      > · {{ t('partidos.coverage', { n: d.cover }) }}</span>
                    </dd>
                  </div>
                </dl>
                <NuxtLink
                  :to="contractsLink(focusRow.buyerId)"
                  class="detail__link"
                >
                  {{ t('partidos.viewContracts') }}
                </NuxtLink>
              </template>
              <p
                v-else
                class="detail__hint"
              >
                {{ t('partidos.hoverHint') }}
              </p>
            </v-card>
          </div>
        </div>

        <!-- Party comparison for the selected metric -->
        <div class="cmp">
          <div class="cmp__head">
            <h2>{{ t('partidos.cmp.title', { metric: t(`partidos.metric.${metric === 'perCapita' ? 'perCapita' : metric}`) }) }}</h2>
            <p class="cmp__note">
              {{ t('partidos.cmp.note') }}
            </p>
          </div>
          <div class="cmp__grid">
            <div
              v-for="p in partyAgg"
              :key="p.party"
              class="pcard"
            >
              <div class="pcard__head">
                <span
                  class="pcard__dot"
                  :style="{ background: p.partyColor }"
                />
                <span class="pcard__lbl">{{ p.partyLabel }}</span>
                <span class="pcard__n u-mono">{{ t('partidos.legend.nDepts', { n: p.nDepts }) }}</span>
              </div>
              <div class="pcard__metric">
                <span class="pcard__ml u-mono">{{ t('partidos.cmp.median') }}</span>
                <div class="pcard__bar">
                  <span
                    class="pcard__fill"
                    :style="{ width: `${barPct(p.median)}%`, background: p.partyColor }"
                  />
                </div>
                <span class="pcard__mv u-mono">{{ fmtMetric(p.median) }}</span>
              </div>
              <div class="pcard__metric">
                <span class="pcard__ml u-mono">{{ t('partidos.cmp.aggregate') }}</span>
                <div class="pcard__bar">
                  <span
                    class="pcard__fill pcard__fill--agg"
                    :style="{ width: `${barPct(p.aggregate)}%`, background: p.partyColor }"
                  />
                </div>
                <span class="pcard__mv u-mono">{{ fmtMetric(p.aggregate) }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Confounders (fixed) -->
        <v-card
          border
          class="conf"
        >
          <p class="conf__t u-mono">
            {{ t('partidos.conf.title') }}
          </p>
          <ul class="conf__list">
            <li>{{ t('partidos.conf.size') }}</li>
            <li>{{ t('partidos.conf.geography') }}</li>
            <li>{{ t('partidos.conf.terms') }}</li>
            <li>{{ t('partidos.conf.reporting') }}</li>
            <li>{{ t('partidos.conf.causation') }}</li>
          </ul>
        </v-card>

        <!-- Table -->
        <v-card
          border
          class="tablecard"
        >
          <table class="dt">
            <thead>
              <tr>
                <th>{{ t('partidos.col.dept') }}</th>
                <th>{{ t('partidos.col.party') }}</th>
                <th class="dt--num">
                  {{ t(`partidos.metric.${metric}`) }}
                </th>
                <th class="dt--num">
                  {{ t('partidos.col.contracts') }}
                </th>
                <th />
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="r in tableRows"
                :key="r.buyerId"
              >
                <td>
                  <NuxtLink
                    :to="localePath(`/buyers/${r.buyerId}`)"
                    class="dt__dept"
                  >
                    {{ r.name }}
                  </NuxtLink>
                </td>
                <td>
                  <MandateChip
                    :buyer-id="r.buyerId"
                    :year="r.year"
                    size="x-small"
                    :show-holder="false"
                  />
                </td>
                <td class="dt--num u-mono">
                  {{ fmtMetric(r.val) }}<span
                    v-if="metric === 'directShare'"
                    class="dt__cover"
                  > · {{ t('partidos.coverage', { n: r.cover }) }}</span>
                </td>
                <td class="dt--num u-mono">
                  {{ formatNumber(r.contracts) }}
                </td>
                <td class="dt--num">
                  <CellLink
                    :to="contractsLink(r.buyerId)"
                    :label="t('partidos.viewContracts')"
                  />
                </td>
              </tr>
            </tbody>
          </table>
          <p
            v-if="calculatedAt"
            class="tablecard__foot u-mono"
          >
            {{ t('partidos.updated', { date: formatDate(calculatedAt) }) }} · {{ GEO_SOURCE }}
          </p>
        </v-card>

        <div class="interlink">
          <v-btn
            :to="localePath('/analytics/intendencias')"
            variant="tonal"
            color="primary"
            prepend-icon="mdi-map-marker-outline"
            class="text-none"
          >
            {{ t('nav.intendencias') }}
          </v-btn>
          <v-btn
            :to="localePath('/analytics/organismos')"
            variant="text"
            prepend-icon="mdi-finance"
            class="text-none"
          >
            {{ t('nav.organismos') }}
          </v-btn>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.pty { padding-bottom: var(--s-8); }
.hero { background: var(--ink) !important; color: #eaf1f6; padding-block: var(--s-7) var(--s-6); }
.hero__in { max-width: 76ch; }
.hero__eyebrow { margin: 0 0 var(--s-3); font-size: var(--t-xs); letter-spacing: 0.14em; text-transform: uppercase; color: var(--sol); }
.hero__title { margin: 0 0 var(--s-3); font-family: var(--font-display); font-size: clamp(28px, 5vw, var(--t-3xl)); line-height: 1.05; color: #fff; }
.hero__dek { margin: 0; color: #b9c8d4; font-size: var(--t-md); line-height: 1.55; }

.page { padding-top: var(--s-6); }
.method { padding: var(--s-4) var(--s-5); margin-bottom: var(--s-5); border-left: 3px solid var(--celeste) !important; }
.method__t { margin: 0 0 var(--s-2); font-size: var(--t-sm); font-family: var(--font-mono); letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-muted); }
.method__b { margin: 0 0 var(--s-2); font-size: var(--t-sm); line-height: 1.6; }
.method__n { margin: 0; font-size: var(--t-xs); color: var(--text-muted); line-height: 1.55; }

.controls { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s-3); margin-bottom: var(--s-4); }
.controls__metric, .controls__year { max-width: 260px; }

.mapwrap { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(260px, 1fr); gap: var(--s-4); align-items: start; }
.mapcard { padding: var(--s-4); background: var(--surface); }
.side { display: flex; flex-direction: column; gap: var(--s-4); }
.legend, .detail { padding: var(--s-4); }
.legend__t { margin: 0 0 var(--s-3); font-size: var(--t-xs); text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); }
.legend__row { display: flex; align-items: center; gap: var(--s-2); padding: var(--s-1) 0; }
.legend__dot { width: 12px; height: 12px; border-radius: var(--r-full); flex: none; }
.legend__lbl { font-size: var(--t-sm); flex: 1; }
.legend__n { font-size: var(--t-xs); color: var(--text-muted); }
.legend__sub { margin: 0 0 var(--s-3); font-size: var(--t-xs); color: var(--text-muted); line-height: 1.5; }
.legend__ramp { height: 10px; border-radius: var(--r-full); border: 1px solid var(--rule); }
.legend__scale { display: flex; justify-content: space-between; margin-top: var(--s-2); font-size: var(--t-xs); color: var(--text-muted); }
.legend__warn { margin: var(--s-3) 0 0; font-size: var(--t-xs); color: var(--alerta); line-height: 1.45; }

.detail__name { margin: 0 0 var(--s-2); font-weight: 700; font-size: var(--t-md); }
.detail__chip { margin-bottom: var(--s-3); }
.detail__list { margin: 0; }
.detail__row { display: flex; justify-content: space-between; gap: var(--s-3); padding: var(--s-2) 0; border-top: 1px dashed var(--rule); }
.detail__row dt { font-size: var(--t-xs); color: var(--text-muted); }
.detail__row dd { margin: 0; font-size: var(--t-sm); font-weight: 600; }
.detail__cover { color: var(--text-muted); font-weight: 400; font-size: var(--t-xs); }
.detail__link { display: inline-block; margin-top: var(--s-3); font-size: var(--t-sm); font-weight: 600; color: var(--celeste-deep); text-decoration: none; }
.detail__link:hover { text-decoration: underline; }
.detail__hint { margin: 0; font-size: var(--t-sm); color: var(--text-muted); line-height: 1.5; }

.cmp { margin-top: var(--s-7); }
.cmp__head { margin-bottom: var(--s-4); }
.cmp__head h2 { margin: 0 0 var(--s-1); }
.cmp__note { margin: 0; font-size: var(--t-sm); color: var(--text-muted); }
.cmp__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: var(--s-4); }
.pcard { padding: var(--s-4); border: 1px solid var(--rule); border-radius: var(--r-lg); background: var(--surface); }
.pcard__head { display: flex; align-items: center; gap: var(--s-2); margin-bottom: var(--s-3); }
.pcard__dot { width: 12px; height: 12px; border-radius: var(--r-full); flex: none; }
.pcard__lbl { font-weight: 700; font-size: var(--t-sm); flex: 1; }
.pcard__n { font-size: var(--t-xs); color: var(--text-muted); }
.pcard__metric { display: grid; grid-template-columns: 64px 1fr auto; align-items: center; gap: var(--s-2); margin-top: var(--s-2); }
.pcard__ml { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); }
.pcard__bar { height: 8px; background: var(--surface-sunken); border-radius: var(--r-full); overflow: hidden; }
.pcard__fill { display: block; height: 100%; border-radius: var(--r-full); }
.pcard__fill--agg { opacity: 0.55; }
.pcard__mv { font-size: var(--t-xs); font-weight: 700; }

.conf { padding: var(--s-4) var(--s-5); margin-top: var(--s-5); border-left: 3px solid var(--alerta) !important; }
.conf__t { margin: 0 0 var(--s-2); font-size: var(--t-xs); text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); }
.conf__list { margin: 0; padding-left: var(--s-4); }
.conf__list li { font-size: var(--t-xs); color: var(--text-muted); line-height: 1.6; margin-bottom: var(--s-1); }

.tablecard { margin-top: var(--s-6); overflow: hidden; }
.dt { width: 100%; border-collapse: collapse; }
.dt th { padding: var(--s-3) var(--s-4); text-align: left; font-family: var(--font-mono); font-size: var(--t-xs); text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); border-bottom: 1px solid var(--rule); }
.dt td { padding: var(--s-3) var(--s-4); font-size: var(--t-sm); border-bottom: 1px solid var(--rule); }
.dt tr:last-child td { border-bottom: 0; }
.dt--num { text-align: right; }
.dt__cover { color: var(--text-muted); font-weight: 400; font-size: var(--t-xs); }
.dt__dept { font-weight: 600; color: var(--text); text-decoration: none; }
.dt__dept:hover { color: var(--celeste-deep); text-decoration: underline; }
.tablecard__foot { margin: 0; padding: var(--s-2) var(--s-4); font-size: var(--t-xs); color: var(--text-muted); border-top: 1px solid var(--rule); }

.interlink { display: flex; flex-wrap: wrap; gap: var(--s-3); margin-top: var(--s-5); }
.empty { padding: var(--s-8) var(--s-5); text-align: center; border: 1px solid var(--rule); border-radius: var(--r-lg); background: var(--surface); }
.empty__t { margin: 0 0 var(--s-2); font-size: var(--t-lg); }
.empty__b { margin: 0; color: var(--text-muted); font-size: var(--t-sm); }

@media (max-width: 860px) {
  .mapwrap { grid-template-columns: 1fr; }
  .controls__metric, .controls__year { max-width: 100%; flex: 1 1 100%; }
}
</style>
