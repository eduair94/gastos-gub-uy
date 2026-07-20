<script setup lang="ts">
/**
 * Organismos — state spending grouped by type of public body (Vuetify).
 * Reads the precomputed organism_group_stats (refreshed monthly). A group selector
 * switches between Intendencias, Ministerios, Salud, Entes and Educación; each shows
 * KPIs, a member ranking, a year trend and a full-width table. Per-capita is the
 * Intendencias' dedicated page — linked, not duplicated.
 */
const { t, locale } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const router = useRouter()

const { data: res, pending, error } = await useFetch<any>('/api/analytics/organism-groups')

const groups = computed<any[]>(() => res.value?.data?.groups ?? [])
const calculatedAt = computed(() => res.value?.data?.calculatedAt ?? null)

const selected = ref<string>((route.query.g as string) || 'intendencias')

const current = computed<any | null>(() =>
  groups.value.find(g => g.groupKey === selected.value) ?? groups.value[0] ?? null)

const groupItems = computed(() =>
  groups.value.map(g => ({ value: g.groupKey, title: locale.value === 'en' ? g.labelEn : g.label })))
function groupBlurb(g: any): string {
  return locale.value === 'en' ? g.blurbEn : g.blurbEs
}

// ---- Year selection -----------------------------------------------------
// Defaults to the latest full year (a one-year view, like the Intendencias page),
// with an "Acumulado" option for the all-time totals. Every KPI, the ranking and the
// table read the active year; the trend chart always shows the whole series.
const ALL = 'all'
// Computed server-side and serialised (useState) so SSR and client hydration agree —
// a bare new Date() runs on both sides and could disagree across the Jan-1 boundary.
const currentCalendarYear = useState('organ-current-year', () => new Date().getFullYear())

/** Every year carrying data across all groups — union, so the list is stable when switching groups. */
const dataYears = computed<number[]>(() => {
  const set = new Set<number>()
  for (const g of groups.value)
    for (const y of (g.byYear ?? []))
      if (Number.isFinite(y.year) && y.year > 0) set.add(y.year)
  return [...set].sort((a, b) => a - b)
})

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
  { value: ALL, title: t('organismos.year.all') },
  ...[...dataYears.value].reverse().map(y => ({
    value: String(y),
    title: isPartial(y) ? t('organismos.year.partialOpt', { year: y }) : String(y),
  })),
])

// Keep the URL in step (shareable views), dropping params equal to the defaults.
watch([selected, yearParam], () => {
  const q: Record<string, string> = {}
  if (selected.value && selected.value !== 'intendencias') q.g = selected.value
  if (yearParam.value && yearParam.value !== String(defaultYear.value)) q.year = yearParam.value
  router.replace({ query: q })
})

// ---- Members / figures for the active year ------------------------------
/** A member's spend + contracts for the active year (or all-time under Acumulado). */
function memberFigures(m: any): { total: number, contracts: number } {
  if (isAll.value) return { total: m.total ?? 0, contracts: m.contracts ?? 0 }
  const row = (m.byYear ?? []).find((y: any) => y.year === yr.value)
  return { total: row?.total ?? 0, contracts: row?.contracts ?? 0 }
}

const members = computed<any[]>(() =>
  (current.value?.members ?? [])
    .map((m: any) => ({ ...m, ...memberFigures(m) }))
    .filter((m: any) => m.total > 0 || m.contracts > 0)
    .sort((a: any, b: any) => b.total - a.total))

/** Group total for the active year — drives the KPI and every share. */
const groupTotal = computed<number>(() => {
  if (isAll.value) return current.value?.total ?? 0
  const row = (current.value?.byYear ?? []).find((y: any) => y.year === yr.value)
  return row?.total ?? 0
})
const memberCount = computed(() => members.value.length)

const memberBars = computed(() =>
  members.value.map(m => ({ label: m.label, value: m.total, color: 'gold' })))
// Trend chart always spans the whole series, regardless of the year filter.
const byYear = computed(() =>
  (current.value?.byYear ?? []).map((y: any) => ({ year: y.year, value: y.total, count: y.contracts })))

const topMember = computed(() => members.value[0] ?? null)
function sharePct(m: any): string {
  if (!groupTotal.value) return '—'
  return `${((m.total / groupTotal.value) * 100).toFixed(1)}%`
}
// Data-coverage span — the full range of the group, independent of the year filter.
const groupSpan = computed(() => {
  const years = (current.value?.members ?? [])
    .flatMap((m: any) => [m.minYear, m.maxYear]).filter((y: any) => typeof y === 'number')
  if (!years.length) return '—'
  const lo = Math.min(...years)
  const hi = Math.max(...years)
  return lo === hi ? String(lo) : `${lo}–${hi}`
})

const rows = computed(() => members.value.map((m, i) => ({ ...m, rank: i + 1, share: sharePct(m) })))
const headers = computed(() => [
  { title: '#', key: 'rank', sortable: false, width: 48, align: 'end' as const },
  { title: t('organismos.col.member'), key: 'label', sortable: false },
  { title: isAll.value ? t('organismos.col.spend') : t('organismos.col.spendYear', { year: yr.value }), key: 'total', align: 'end' as const },
  { title: t('organismos.col.contracts'), key: 'contracts', align: 'end' as const },
  { title: t('organismos.col.share'), key: 'share', sortable: false, align: 'end' as const },
])

const orgLd = useOrgLd()

useSeo(() => ({
  title: t('seo.organismos.title'),
  description: t('seo.organismos.description'),
  path: '/analytics/organismos',
  kicker: 'Organismos',
  jsonLd: [
    {
      '@context': 'https://schema.org',
      '@type': 'Dataset',
      'name': t('seo.organismos.title'),
      'description': t('seo.organismos.description'),
      'creator': orgLd,
      'isAccessibleForFree': true,
      'license': 'https://catalogodatos.gub.uy',
    },
    orgLd,
  ],
}))
</script>

<template>
  <div class="organ">
    <v-sheet
      class="hero"
      tag="header"
    >
      <div class="u-container hero__in">
        <p class="hero__eyebrow u-mono">
          {{ t('home.eyebrow') }}
        </p>
        <h1 class="hero__title">
          {{ t('organismos.title') }}
        </h1>
        <p class="hero__dek">
          {{ t('organismos.lead') }}
        </p>
        <v-btn
          :to="localePath('/analytics/intendencias')"
          class="hero__cta"
          color="accent"
          variant="flat"
          append-icon="mdi-arrow-right"
        >
          {{ t('organismos.toIntendencias') }}
        </v-btn>
      </div>
    </v-sheet>

    <div class="u-container page">
      <!-- Group selector -->
      <v-chip-group
        v-model="selected"
        mandatory
        color="primary"
        class="groupsel"
        :aria-label="t('organismos.groupAria')"
      >
        <v-chip
          v-for="g in groupItems"
          :key="g.value"
          :value="g.value"
          filter
          variant="outlined"
        >
          {{ g.title }}
        </v-chip>
      </v-chip-group>

      <div
        v-if="error"
        class="empty"
      >
        <p class="empty__t">
          {{ t('organismos.empty.title') }}
        </p>
        <p class="empty__b">
          {{ t('organismos.empty.body') }}
        </p>
      </div>

      <v-skeleton-loader
        v-else-if="pending && !groups.length"
        type="card, table"
      />

      <template v-else-if="current">
        <p class="groupblurb">
          {{ groupBlurb(current) }}
        </p>

        <!-- Year filter -->
        <div class="controls">
          <v-select
            v-model="yearModel"
            :items="yearItems"
            :label="t('organismos.year.label')"
            density="comfortable"
            variant="outlined"
            hide-details
            class="controls__year"
            prepend-inner-icon="mdi-calendar-range"
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
            {{ t('organismos.year.partialNote', { year: yr }) }}
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
                :amount="groupTotal"
                size="lg"
                align="start"
                compact
              />
              <div class="kpi__l">
                {{ isAll ? t('organismos.kpi.total') : t('organismos.kpi.totalYear', { year: yr }) }}
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
                {{ formatNumber(memberCount) }}
              </div>
              <div class="kpi__l">
                {{ t('organismos.kpi.members') }}
              </div>
            </v-card>
          </v-col>
          <v-col
            cols="12"
            md="3"
          >
            <v-card
              class="kpi"
              border
            >
              <div class="kpi__top">
                {{ topMember?.label ?? '—' }}
              </div>
              <div class="kpi__l">
                {{ t('organismos.kpi.top') }} · {{ topMember ? sharePct(topMember) : '—' }}
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
                {{ groupSpan }}
              </div>
              <div class="kpi__l">
                {{ t('organismos.kpi.span') }}
              </div>
            </v-card>
          </v-col>
        </v-row>

        <!-- Panels -->
        <v-row dense>
          <v-col
            cols="12"
            md="6"
          >
            <v-card
              border
              class="panel"
            >
              <h2 class="panel__t">
                {{ t('organismos.panel.ranking') }}
              </h2>
              <p class="panel__s">
                {{ t('organismos.panel.rankingSub') }}
              </p>
              <div class="chartscroll">
                <InvHBars
                  :items="memberBars"
                  format="moneyM"
                  :row-height="28"
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
              <h2 class="panel__t">
                {{ t('organismos.panel.trend') }}
              </h2>
              <p class="panel__s">
                {{ t('organismos.panel.trendSub') }}
              </p>
              <YearBars
                :data="byYear"
                unit="money"
                :height="200"
              />
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
            :items="rows"
            item-value="key"
            :items-per-page="-1"
            :mobile-breakpoint="760"
            density="comfortable"
            hide-default-footer
          >
            <template #[`item.total`]="{ item }">
              <MoneyAmount
                :amount="item.total"
                compact
              />
            </template>
            <template #[`item.contracts`]="{ item }">
              <span class="u-mono">{{ formatNumber(item.contracts) }}</span>
            </template>
            <template #[`item.share`]="{ item }">
              <span class="u-mono">{{ item.share }}</span>
            </template>
          </v-data-table>
          <p
            v-if="calculatedAt"
            class="tablecard__foot u-mono"
          >
            {{ t('organismos.updated', { date: formatDate(calculatedAt) }) }}
          </p>
        </v-card>

        <!-- Interconnection -->
        <div class="interlink">
          <v-btn
            :to="localePath('/buyers')"
            variant="tonal"
            color="primary"
            prepend-icon="mdi-bank-outline"
            class="text-none"
          >
            {{ t('organismos.linkBuyers') }}
          </v-btn>
          <v-btn
            :to="localePath('/contracts')"
            variant="text"
            prepend-icon="mdi-magnify"
            class="text-none"
          >
            {{ t('home.exploreCta') }}
          </v-btn>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.organ { padding-bottom: var(--s-8); }

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
.groupsel { flex-wrap: wrap; height: auto; margin-bottom: var(--s-5); }
.groupblurb { margin: 0 0 var(--s-5); color: var(--text-muted); font-size: var(--t-sm); max-width: 74ch; }

.controls { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s-3); margin-bottom: var(--s-5); }
.controls__year { flex: 0 1 260px; }
.controls__partial { flex: 0 0 auto; }

.kpis { margin-bottom: var(--s-4); }
.kpi { padding: var(--s-4); height: 100%; }
.kpi__n { font-size: var(--t-2xl); line-height: 1; font-weight: 700; letter-spacing: -0.02em; }
.kpi__top { font-size: var(--t-md); font-weight: 700; line-height: 1.2; }
.kpi__l { margin-top: var(--s-2); font-family: var(--font-mono); font-size: var(--t-xs); text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); }

.panel { padding: var(--s-5); height: 100%; }
.panel__t { margin: 0 0 var(--s-1); font-size: var(--t-lg); }
.panel__s { margin: 0 0 var(--s-4); color: var(--text-muted); font-size: var(--t-sm); }
.chartscroll { overflow-x: auto; }

.tablecard { margin-top: var(--s-4); overflow: hidden; }
.tablecard__foot { margin: 0; padding: var(--s-2) var(--s-4); font-size: var(--t-xs); color: var(--text-muted); border-top: 1px solid var(--rule); }

.interlink { display: flex; flex-wrap: wrap; gap: var(--s-3); margin-top: var(--s-5); }

.empty { padding: var(--s-8) var(--s-5); text-align: center; border: 1px solid var(--rule); border-radius: var(--r-lg); background: var(--surface); }
.empty__t { margin: 0 0 var(--s-2); font-size: var(--t-lg); }
.empty__b { margin: 0; color: var(--text-muted); font-size: var(--t-sm); }
</style>
