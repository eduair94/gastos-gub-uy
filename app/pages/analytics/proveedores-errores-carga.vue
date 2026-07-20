<script setup lang="ts">
/**
 * Proveedores y organismos detrás de los errores de carga.
 *
 * The sibling of /analytics/proveedores-anomalias, scoped to the LOAD-ERROR bucket instead of the
 * unexplained one: the flags the AI triaged as a data-entry mistake (error-carga / moneda-erronea,
 * the same set as /analytics/errores-carga). It cross-references those errors against the providers
 * and buyers behind them so you can see whether the same provider or the same organism makes the same
 * load error over and over. Reads the precomputed provider_load_error_stats + summary (rebuilt every
 * 24h by cross-provider-load-errors.ts); nothing is aggregated on the request path. Each provider row
 * drills back to its own load-error flags on the alerts page by name.
 *
 * A load error is NOT corruption — it is bad data to report at the source. So the page reads in
 * CELESTE, never gold: the "monto mal cargado" figure is a data-quality distortion (how much the bad
 * record inflated the reported total), not money the provider billed, and is shown as plain celeste
 * mono rather than through the gold MoneyAmount rule.
 */
const { t, locale } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const router = useRouter()

// Ordering: most errors first (the point — who repeats), then biggest distortion, then worst divergence.
const sort = ref((route.query.sort as string) ?? 'flags')
const minFlags = ref(Number(route.query.minFlags) || 0)
const rubro = ref((route.query.rubro as string) ?? '')
const currency = ref((route.query.currency as string) ?? '')
const captive = ref(route.query.captive === 'true')
const page = ref(Number(route.query.page ?? 1))
const ITEMS_PER_PAGE = 20

// The alerts-list scope every drill from this page inherits: the load-error bucket.
const LOAD_Q = { ai: 'explainable', category: 'error-carga,moneda-erronea' } as const

const SORTS: Record<string, { sortBy: string, sortOrder: string }> = {
  flags: { sortBy: 'flags', sortOrder: 'desc' },
  overprice: { sortBy: 'overprice', sortOrder: 'desc' },
  worstZ: { sortBy: 'worstZ', sortOrder: 'desc' },
}
const SORT_ITEMS = computed(() => [
  { value: 'flags', title: t('provLoadErr.sort.flags') },
  { value: 'overprice', title: t('provLoadErr.sort.overprice') },
  { value: 'worstZ', title: t('provLoadErr.sort.worstZ') },
])
const MINFLAGS_STEPS = [0, 2, 3, 5] as const
const CURRENCIES = ['UYU', 'USD'] as const

// A page number from a different filter/sort set is meaningless.
watch([sort, minFlags, rubro, currency, captive], () => {
  page.value = 1
})

watch([sort, minFlags, rubro, currency, captive, page], () => {
  const q: Record<string, string> = {}
  if (sort.value !== 'flags') q.sort = sort.value
  if (minFlags.value > 0) q.minFlags = String(minFlags.value)
  if (rubro.value) q.rubro = rubro.value
  if (currency.value) q.currency = currency.value
  if (captive.value) q.captive = 'true'
  if (page.value > 1) q.page = String(page.value)
  router.replace({ query: q })
})

const { data: res, pending, error, refresh } = await useFetch<any>('/api/analytics/provider-load-errors', {
  query: computed(() => ({
    limit: ITEMS_PER_PAGE,
    page: page.value,
    ...(SORTS[sort.value] ?? SORTS.flags),
    ...(minFlags.value > 0 ? { minFlags: minFlags.value } : {}),
    ...(rubro.value ? { rubro: rubro.value } : {}),
    ...(currency.value ? { currency: currency.value } : {}),
    ...(captive.value ? { captive: 'true' } : {}),
  })),
})

const providers = computed<any[]>(() => res.value?.data?.providers ?? [])
const summary = computed<any>(() => res.value?.data?.summary ?? null)
const pagination = computed<any>(() => res.value?.data?.pagination ?? null)
const total = computed<number>(() => pagination.value?.total ?? 0)

// ---- Pagination: a custom sticky pager (the table's default footer is hidden). It drives both the
// desktop table and the mobile cards, and every page change scrolls back to the top of the list. ---
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / ITEMS_PER_PAGE)))
const rangeStart = computed(() => (total.value === 0 ? 0 : (page.value - 1) * ITEMS_PER_PAGE + 1))
const rangeEnd = computed(() => Math.min(page.value * ITEMS_PER_PAGE, total.value))

// The table card is the scroll anchor: land its top just under the 62px app bar so the sticky pager
// sits right below the header and row 1 of the new page is the first thing in view.
const tableCard = ref<any>(null)
function scrollToTableTop() {
  if (!import.meta.client) return
  const el = (tableCard.value?.$el ?? tableCard.value) as HTMLElement | undefined
  if (!el) return
  const top = el.getBoundingClientRect().top + window.scrollY - 62
  window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
}
function goToPage(n: number) {
  const next = Math.min(Math.max(1, n), pageCount.value)
  if (next === page.value) return
  page.value = next
  nextTick(scrollToTableTop)
}

// ---- Freshness: the job rebuilds this every 24h; make that visible and keep a long-open tab live. --
const calculatedAt = computed<Date | null>(() => {
  const s = summary.value?.calculatedAt
  if (!s) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
})
// Absolute (SSR-stable, no hydration mismatch). Relative "hace X" is added client-only below.
const updatedAbs = computed(() => {
  if (!calculatedAt.value) return null
  const s = new Intl.DateTimeFormat(locale.value === 'en' ? 'en-GB' : 'es-UY', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    // Pinned, not the runtime default: without it SSR formats in the server's zone (the prod box is
    // UTC) and the client in the viewer's (UTC−3), so the hour differs and hydration mismatches.
    timeZone: 'America/Montevideo',
  }).format(calculatedAt.value)
  // Node's ICU and Chrome's ICU disagree on the space before the day period (U+202F vs U+00A0 vs
  // plain) — same glyph, different code point — which Vue flags as a hydration text mismatch. Fold
  // every space variant to U+0020 so SSR and client bytes match regardless of ICU version.
  return s.replace(/\p{Zs}/gu, ' ')
})
const now = ref<number | null>(null)
const updatedRel = computed(() => {
  if (!calculatedAt.value || now.value === null) return null
  const mins = Math.max(0, Math.round((now.value - calculatedAt.value.getTime()) / 60000))
  if (mins < 60) return t('provLoadErr.ago.minutes', { n: mins })
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return t('provLoadErr.ago.hours', { n: hrs })
  return t('provLoadErr.ago.days', { n: Math.round(hrs / 24) })
})
const refreshing = ref(false)
async function manualRefresh() {
  refreshing.value = true
  try {
    await refresh()
  }
  finally {
    refreshing.value = false
    now.value = Date.now()
  }
}

let tick: ReturnType<typeof setInterval> | undefined
let poll: ReturnType<typeof setInterval> | undefined
function onVisible() {
  if (!document.hidden) refresh()
}
onMounted(() => {
  now.value = Date.now()
  tick = setInterval(() => {
    now.value = Date.now()
  }, 60_000)
  poll = setInterval(() => refresh(), 30 * 60_000)
  document.addEventListener('visibilitychange', onVisible)
})
onBeforeUnmount(() => {
  if (tick) clearInterval(tick)
  if (poll) clearInterval(poll)
  document.removeEventListener('visibilitychange', onVisible)
})

// ---- Table --------------------------------------------------------------------------------------
const headers = computed(() => [
  { title: '#', key: 'index', sortable: false, width: 48, align: 'end' as const },
  { title: t('provLoadErr.col.provider'), key: 'supplierName', sortable: false },
  { title: t('provLoadErr.col.flags'), key: 'flags', sortable: true, align: 'end' as const },
  { title: t('provLoadErr.col.overprice'), key: 'overprice', sortable: true, align: 'end' as const },
  { title: t('provLoadErr.col.worstZ'), key: 'worstZ', sortable: true, align: 'end' as const },
  { title: t('provLoadErr.col.topBuyer'), key: 'topBuyer', sortable: false },
  { title: '', key: 'actions', sortable: false, align: 'end' as const },
])
const sortBy = computed(() => [{ key: sort.value, order: 'desc' as const }])
function onSortBy(val: { key: string, order: string }[]) {
  const k = val?.[0]?.key
  sort.value = k && SORTS[k] ? k : 'flags'
}

/** Rubro filter options — the SICE top levels present, most frequent first. */
const rubroOptions = computed<string[]>(() =>
  (summary.value?.rubroTotals ?? []).slice(0, 6).map((r: any) => r.rubro).filter((r: string) => r && r !== '—'))
function rubroLabel(r?: string): string {
  return !r || r === '—' ? t('provLoadErr.rubroUnknown') : r
}
const topRubroPct = computed<number | null>(() => {
  const s = summary.value
  if (!s?.flagTotal || !s?.rubroTotals?.length) return null
  return Math.round((s.rubroTotals[0].count / s.flagTotal) * 100)
})

// Load-error type (error-carga / moneda-erronea) — the axis that only this bucket has. The global
// split rides above the table as clickable chips; each provider row shows its dominant type.
function catLabel(c?: string | null): string {
  return c ? t(`anomalies.ai.category.${c}`) : ''
}
const typeChips = computed<any[]>(() => summary.value?.categoryTotals ?? [])

function money(n: number): string {
  return formatMoney(n, 'UYU', { compact: true })
}

function drillTo(name: string) {
  return localePath({ path: '/analytics/anomalies', query: { ...LOAD_Q, supplier: name } })
}
function drillBuyer(name: string) {
  return localePath({ path: '/analytics/anomalies', query: { ...LOAD_Q, buyer: name } })
}
function drillRubro(name: string) {
  return localePath({ path: '/analytics/anomalies', query: { ...LOAD_Q, rubroName: name } })
}
function drillYear(y: number | string) {
  return localePath({ path: '/analytics/anomalies', query: { ...LOAD_Q, year: String(y) } })
}
function drillPair(pr: any) {
  return localePath({ path: '/analytics/anomalies', query: { ...LOAD_Q, supplier: pr.supplierName, buyer: pr.buyerName } })
}
function drillCategory(cat: string) {
  return localePath({ path: '/analytics/anomalies', query: { ai: 'explainable', category: cat } })
}
function zBadge(z?: number): string {
  if (!z || z <= 0) return '—'
  return z >= 1000 ? t('provLoadErr.zCapped') : t('anomalies.zBadge', { z: String(z) })
}
function topRubroOf(p: any): string {
  return rubroLabel(p?.rubros?.[0]?.rubro)
}
function yearsLabel(p: any): string | null {
  if (!p?.firstYear) return null
  return p.firstYear === p.lastYear ? String(p.firstYear) : `${p.firstYear}–${p.lastYear}`
}
function hasActiveFilters(): boolean {
  return !!(minFlags.value || rubro.value || currency.value || captive.value)
}
function clearFilters() {
  minFlags.value = 0
  rubro.value = ''
  currency.value = ''
  captive.value = false
}

// ---- Chart data (from the stable summary, independent of the table's paging) --------------------
const provBars = computed(() =>
  (summary.value?.topProviders ?? []).map((p: any) => ({
    label: p.supplierName, value: p.flagCount, color: 'celeste',
    sub: p.captive ? t('provLoadErr.captiveTag') : undefined,
  })))
const buyerBars = computed(() =>
  (summary.value?.topBuyers ?? []).slice(0, 10).map((b: any) => ({
    label: b.buyerName, value: b.count, color: 'celeste', sub: t('provLoadErr.buyerSub', { n: b.providerCount }),
  })))
const rubroBars = computed(() =>
  (summary.value?.rubroTotals ?? []).slice(0, 6).map((r: any) => ({
    label: rubroLabel(r.rubro), value: r.count, color: 'celeste',
  })))
const yearData = computed(() =>
  (summary.value?.yearTotals ?? []).map((y: any) => ({ year: y.year, value: y.count })))
const topPairs = computed(() => (summary.value?.topPairs ?? []).slice(0, 8))

// Every pattern chart drills into the matching flags on the alerts list. hrefFor receives the bar's
// index, which maps 1:1 to the source array each chart is built from.
function provHref(i: number) {
  const p = summary.value?.topProviders?.[i]
  return p ? drillTo(p.supplierName) : undefined
}
function buyerHref(i: number) {
  const b = summary.value?.topBuyers?.[i]
  return b ? drillBuyer(b.buyerName) : undefined
}
function rubroHref(i: number) {
  const r = summary.value?.rubroTotals?.[i]
  return r && r.rubro !== '—' ? drillRubro(r.rubro) : undefined
}
function yearHref(y: number) {
  return drillYear(y)
}

// Rubro filter: a dropdown (many options — a select stays compact where chips would wrap or scroll).
const rubroSelectItems = computed(() => [
  { value: '', title: t('common.total') },
  ...rubroOptions.value.map(r => ({ value: r, title: rubroLabel(r) })),
])

const orgLd = useOrgLd()

useSeo(() => ({
  title: t('seo.providerLoadErrors.title'),
  description: t('seo.providerLoadErrors.description'),
  path: '/analytics/proveedores-errores-carga',
  kicker: 'Errores de carga',
  jsonLd: [
    {
      '@context': 'https://schema.org',
      '@type': 'Dataset',
      'name': t('seo.providerLoadErrors.title'),
      'description': t('seo.providerLoadErrors.description'),
      'creator': orgLd,
      'isAccessibleForFree': true,
      'license': 'https://catalogodatos.gub.uy',
    },
    orgLd,
  ],
}))
</script>

<template>
  <div class="prov">
    <!-- Ink hero: the editorial band, always dark (DESIGN.md). -->
    <v-sheet
      class="hero"
      tag="header"
    >
      <div class="u-container">
        <div class="hero__in">
          <p class="hero__eyebrow u-mono">
            {{ t('home.eyebrow') }}
          </p>
          <h1 class="hero__title">
            {{ t('provLoadErr.title') }}
          </h1>
          <p class="hero__dek">
            {{ t('provLoadErr.lead') }}
          </p>
          <v-btn
            :to="localePath('/analytics/errores-carga')"
            class="hero__cta"
            variant="flat"
            append-icon="mdi-arrow-right"
          >
            {{ t('provLoadErr.seeFlags') }}
          </v-btn>
        </div>
      </div>
    </v-sheet>

    <div class="u-container page">
      <!-- KPI cards -->
      <v-row
        v-if="summary"
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
            <div class="kpi__n u-mono kpi__n--carga">
              {{ formatNumber(summary.flagTotal) }}
            </div>
            <div class="kpi__l">
              {{ t('provLoadErr.kpi.flags') }}
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
              {{ formatNumber(summary.providerCount) }}
            </div>
            <div class="kpi__l">
              {{ t('provLoadErr.kpi.providers') }}
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
              {{ formatNumber(summary.captiveCount) }}
            </div>
            <div class="kpi__l">
              {{ t('provLoadErr.kpi.captive') }}
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
              {{ topRubroPct !== null ? `${topRubroPct}%` : '—' }}
            </div>
            <div class="kpi__l">
              {{ t('provLoadErr.kpi.topRubro') }}
            </div>
          </v-card>
        </v-col>
      </v-row>

      <!-- Load-error type split: the axis unique to this bucket. Each chip drills to that type's
           alerts. Prominent because "¿qué tipo de error se repite?" is the whole question. -->
      <div
        v-if="typeChips.length"
        class="typechips"
      >
        <NuxtLink
          v-for="c in typeChips"
          :key="c.category"
          :to="drillCategory(c.category)"
          class="typechip"
        >
          <span class="typechip__n u-mono">{{ formatNumber(c.count) }}</span>
          <span class="typechip__l">{{ catLabel(c.category) }}</span>
          <span class="typechip__go">→</span>
        </NuxtLink>
      </div>

      <!-- Method + freshness -->
      <v-card
        class="method"
        border
      >
        <div class="method__body">
          <p class="method__t u-mono">
            {{ t('provLoadErr.method.title') }}
          </p>
          <p class="method__b">
            {{ t('provLoadErr.method.body') }}
          </p>
          <p class="method__n">
            {{ t('provLoadErr.method.distortion') }}
          </p>
          <p
            v-if="summary && summary.clampedFlags > 0"
            class="method__n"
          >
            {{ t('provLoadErr.method.clamped', { n: summary.clampedFlags }) }}
          </p>
          <p class="method__n">
            {{ t('provLoadErr.disclaimer') }}
          </p>
        </div>
        <div
          v-if="updatedAbs"
          class="fresh"
        >
          <div class="fresh__l">
            <v-icon
              icon="mdi-update"
              size="16"
            />
            <span class="fresh__txt">
              {{ t('provLoadErr.updated') }}
              <strong>{{ updatedRel ?? updatedAbs }}</strong>
            </span>
          </div>
          <div class="fresh__abs u-mono">
            {{ updatedAbs }} · {{ t('provLoadErr.autoNote') }}
          </div>
          <v-btn
            :loading="refreshing"
            size="small"
            variant="tonal"
            color="primary"
            prepend-icon="mdi-refresh"
            @click="manualRefresh"
          >
            {{ t('provLoadErr.refresh') }}
          </v-btn>
        </div>
      </v-card>

      <!-- Filters -->
      <div class="controls">
        <v-select
          v-model="sort"
          :items="SORT_ITEMS"
          :label="t('anomalies.sort.label')"
          density="comfortable"
          variant="outlined"
          hide-details
          class="controls__field"
        />
        <v-select
          v-if="rubroOptions.length"
          v-model="rubro"
          :items="rubroSelectItems"
          :label="t('provLoadErr.rubro.label')"
          density="comfortable"
          variant="outlined"
          hide-details
          class="controls__field controls__field--rubro"
        />
        <div class="controls__seg">
          <span class="controls__l u-mono">{{ t('provLoadErr.minFlags.label') }}</span>
          <v-btn-toggle
            v-model="minFlags"
            mandatory
            density="comfortable"
            variant="outlined"
            divided
            color="primary"
          >
            <v-btn
              v-for="n in MINFLAGS_STEPS"
              :key="n"
              :value="n"
              size="small"
            >
              {{ n === 0 ? t('anomalies.minZ.any') : t('provLoadErr.minFlags.step', { n }) }}
            </v-btn>
          </v-btn-toggle>
        </div>
        <div class="controls__seg">
          <span class="controls__l u-mono">{{ t('anomalies.currency.label') }}</span>
          <v-btn-toggle
            v-model="currency"
            mandatory
            density="comfortable"
            variant="outlined"
            divided
            color="primary"
          >
            <v-btn
              value=""
              size="small"
            >
              {{ t('anomalies.currency.all') }}
            </v-btn>
            <v-btn
              v-for="cx in CURRENCIES"
              :key="cx"
              :value="cx"
              size="small"
            >
              {{ cx }}
            </v-btn>
          </v-btn-toggle>
        </div>
        <v-btn
          :variant="captive ? 'flat' : 'outlined'"
          :color="captive ? 'warning' : undefined"
          :prepend-icon="captive ? 'mdi-check' : 'mdi-link-variant'"
          :title="t('provLoadErr.captiveHelp')"
          class="controls__captive"
          @click="captive = !captive"
        >
          {{ t('provLoadErr.captiveOnly') }}
        </v-btn>
      </div>

      <v-alert
        v-if="error"
        type="error"
        variant="tonal"
        class="mb-4"
        :title="t('provLoadErr.notReady.title')"
        :text="t('provLoadErr.notReady.body')"
      />

      <v-card
        v-else
        ref="tableCard"
        border
        class="tablecard"
      >
        <!-- Sticky pager -->
        <div class="tablepager">
          <span class="tablepager__range u-mono">
            {{ t('provLoadErr.pager.range', { from: rangeStart, to: rangeEnd, total }) }}
          </span>
          <div class="tablepager__nav">
            <v-btn
              icon="mdi-page-first"
              size="small"
              variant="text"
              density="comfortable"
              :disabled="pending || page <= 1"
              :aria-label="t('provLoadErr.pager.first')"
              @click="goToPage(1)"
            />
            <v-btn
              icon="mdi-chevron-left"
              size="small"
              variant="text"
              density="comfortable"
              :disabled="pending || page <= 1"
              :aria-label="t('provLoadErr.pager.prev')"
              @click="goToPage(page - 1)"
            />
            <span class="tablepager__page u-mono">{{ page }} / {{ pageCount }}</span>
            <v-btn
              icon="mdi-chevron-right"
              size="small"
              variant="text"
              density="comfortable"
              :disabled="pending || page >= pageCount"
              :aria-label="t('provLoadErr.pager.next')"
              @click="goToPage(page + 1)"
            />
            <v-btn
              icon="mdi-page-last"
              size="small"
              variant="text"
              density="comfortable"
              :disabled="pending || page >= pageCount"
              :aria-label="t('provLoadErr.pager.last')"
              @click="goToPage(pageCount)"
            />
          </div>
          <v-progress-linear
            :active="pending"
            indeterminate
            color="primary"
            height="2"
            class="tablepager__load"
          />
        </div>

        <template v-if="providers.length || pending">
          <!-- Desktop table -->
          <v-data-table-server
            class="provtable-desktop"
            :headers="headers"
            :items="providers"
            :items-length="total"
            :loading="pending"
            :page="page"
            :items-per-page="ITEMS_PER_PAGE"
            :sort-by="sortBy"
            item-value="_id"
            :mobile-breakpoint="0"
            hide-default-footer
            hover
            density="comfortable"
            @update:sort-by="onSortBy"
          >
            <template #[`item.index`]="{ index }">
              <span class="u-mono t-muted">{{ (page - 1) * ITEMS_PER_PAGE + index + 1 }}</span>
            </template>

            <template #[`item.supplierName`]="{ item }">
              <NuxtLink
                :to="drillTo(item.supplierName)"
                class="cell-prov"
              >
                {{ item.supplierName }}
              </NuxtLink>
              <div class="cell-tags">
                <span
                  v-if="item.topCategory"
                  class="chip-cat"
                >{{ catLabel(item.topCategory) }}</span>
                <v-chip
                  v-if="item.captive"
                  color="warning"
                  size="x-small"
                  variant="tonal"
                  :title="t('provLoadErr.captiveHelp')"
                >
                  {{ t('provLoadErr.captiveBadge', { n: item.topBuyerCount }) }}
                </v-chip>
                <v-chip
                  size="x-small"
                  variant="tonal"
                >
                  {{ topRubroOf(item) }}
                </v-chip>
                <span
                  v-if="yearsLabel(item)"
                  class="cell-years u-mono"
                >{{ yearsLabel(item) }}</span>
              </div>
            </template>

            <template #[`item.flags`]="{ item }">
              <span class="cell-flags">
                <span class="cell-flags__stripe" />
                <span class="u-mono cell-flags__n">{{ item.flagCount }}</span>
              </span>
            </template>

            <template #[`item.overprice`]="{ item }">
              <span class="cell-money u-mono">{{ money(item.overpriceUyuToday) }}</span>
            </template>

            <template #[`item.worstZ`]="{ item }">
              <span class="u-mono cell-z">{{ zBadge(item.worstZ) }}</span>
            </template>

            <template #[`item.topBuyer`]="{ item }">
              <span class="cell-buyer">{{ item.topBuyer }}</span>
              <span
                v-if="item.buyerCount > 1"
                class="cell-buyer__c u-mono"
              >{{ t('provLoadErr.ofBuyers', { n: item.buyerCount }) }}</span>
            </template>

            <template #[`item.actions`]="{ item }">
              <CellLink
                :to="drillTo(item.supplierName)"
                :label="t('provLoadErr.seeItsFlags')"
              />
            </template>
          </v-data-table-server>

          <!-- Mobile (<760px): adapted cards. -->
          <ol class="provcards">
            <li
              v-for="(item, i) in providers"
              :key="item._id"
              class="provcards__li"
            >
              <NuxtLink
                :to="drillTo(item.supplierName)"
                class="provcard"
              >
                <span class="provcard__rank u-mono">{{ (page - 1) * ITEMS_PER_PAGE + i + 1 }}</span>
                <div class="provcard__main">
                  <span class="provcard__name">{{ item.supplierName }}</span>
                  <div class="cell-tags">
                    <span
                      v-if="item.topCategory"
                      class="chip-cat"
                    >{{ catLabel(item.topCategory) }}</span>
                    <v-chip
                      v-if="item.captive"
                      color="warning"
                      size="x-small"
                      variant="tonal"
                    >
                      {{ t('provLoadErr.captiveBadge', { n: item.topBuyerCount }) }}
                    </v-chip>
                    <v-chip
                      size="x-small"
                      variant="tonal"
                    >
                      {{ topRubroOf(item) }}
                    </v-chip>
                    <span
                      v-if="yearsLabel(item)"
                      class="cell-years u-mono"
                    >{{ yearsLabel(item) }}</span>
                  </div>
                  <dl class="provcard__stats">
                    <div class="provcard__stat">
                      <dt>{{ t('provLoadErr.col.flags') }}</dt>
                      <dd class="provcard__flags">
                        <span class="cell-flags__stripe" />
                        <span class="u-mono cell-flags__n">{{ item.flagCount }}</span>
                      </dd>
                    </div>
                    <div class="provcard__stat">
                      <dt>{{ t('provLoadErr.col.overprice') }}</dt>
                      <dd><span class="cell-money u-mono">{{ money(item.overpriceUyuToday) }}</span></dd>
                    </div>
                    <div class="provcard__stat">
                      <dt>{{ t('provLoadErr.col.worstZ') }}</dt>
                      <dd><span class="u-mono cell-z">{{ zBadge(item.worstZ) }}</span></dd>
                    </div>
                  </dl>
                  <div class="provcard__buyer">
                    <span class="provcard__buyerlbl u-mono">{{ t('provLoadErr.col.topBuyer') }}</span>
                    <span class="cell-buyer">{{ item.topBuyer }}</span>
                    <span
                      v-if="item.buyerCount > 1"
                      class="cell-buyer__c u-mono"
                    >{{ t('provLoadErr.ofBuyers', { n: item.buyerCount }) }}</span>
                  </div>
                </div>
                <v-icon
                  icon="mdi-arrow-right"
                  size="18"
                  class="provcard__go"
                />
              </NuxtLink>
            </li>
          </ol>
        </template>

        <!-- Shared empty state. -->
        <div
          v-else
          class="empty"
        >
          <p class="empty__t">
            {{ t('provLoadErr.empty.title') }}
          </p>
          <p class="empty__b">
            {{ t('provLoadErr.empty.body') }}
          </p>
          <v-btn
            v-if="hasActiveFilters()"
            color="primary"
            variant="tonal"
            size="small"
            @click="clearFilters"
          >
            {{ t('common.clearAll') }}
          </v-btn>
        </div>
      </v-card>

      <!-- Pattern panels -->
      <section
        v-if="summary"
        class="patterns"
      >
        <div class="patterns__head">
          <h2>{{ t('provLoadErr.patterns.title') }}</h2>
          <p class="patterns__note">
            {{ t('provLoadErr.patterns.note') }}
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
                {{ t('provLoadErr.panel.concentration') }}
              </h3>
              <p class="panel__s">
                {{ t('provLoadErr.panel.concentrationSub') }}
              </p>
              <div class="chartscroll">
                <InvHBars
                  :items="provBars"
                  :href-for="provHref"
                  format="count"
                  :row-height="30"
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
                {{ t('provLoadErr.panel.buyers') }}
              </h3>
              <p class="panel__s">
                {{ t('provLoadErr.panel.buyersSub') }}
              </p>
              <div class="chartscroll">
                <InvHBars
                  :items="buyerBars"
                  :href-for="buyerHref"
                  format="count"
                  :row-height="30"
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
                {{ t('provLoadErr.panel.pairs') }}
              </h3>
              <p class="panel__s">
                {{ t('provLoadErr.panel.pairsSub') }}
              </p>
              <v-list
                class="pairs"
                density="compact"
                bg-color="transparent"
              >
                <v-list-item
                  v-for="(pr, i) in topPairs"
                  :key="i"
                  :to="drillPair(pr)"
                  class="pair"
                >
                  <div class="pair__flow">
                    <span class="pair__s">{{ pr.supplierName }}</span>
                    <span class="pair__b">→ {{ pr.buyerName }}</span>
                  </div>
                  <template #append>
                    <span class="pair__c u-mono">{{ pr.count }}</span>
                    <v-icon
                      icon="mdi-arrow-right"
                      size="14"
                      class="pair__go"
                    />
                  </template>
                </v-list-item>
              </v-list>
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
                {{ t('provLoadErr.panel.rubro') }}
              </h3>
              <p class="panel__s">
                {{ t('provLoadErr.panel.rubroSub') }}
              </p>
              <div class="chartscroll">
                <InvHBars
                  :items="rubroBars"
                  :href-for="rubroHref"
                  format="count"
                  :row-height="30"
                />
              </div>
              <h3 class="panel__t panel__t--sub">
                {{ t('provLoadErr.panel.recurrence') }}
              </h3>
              <YearBars
                :data="yearData"
                :href-for="yearHref"
                unit="count"
                :height="150"
              />
            </v-card>
          </v-col>
        </v-row>
      </section>
    </div>
  </div>
</template>

<style scoped>
.prov { padding-bottom: var(--s-8); }

/* ---- Ink hero ---- */
.hero {
  background: var(--ink) !important;
  color: #eaf1f6;
  padding-block: var(--s-7) var(--s-6);
}
.hero__in { max-width: 72ch; }
.hero__eyebrow {
  margin: 0 0 var(--s-3);
  font-size: var(--t-xs);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--celeste);
}
.hero__title {
  margin: 0 0 var(--s-3);
  font-family: var(--font-display);
  font-size: clamp(28px, 5vw, var(--t-3xl));
  line-height: 1.05;
  color: #fff;
}
.hero__dek { margin: 0 0 var(--s-5); color: #b9c8d4; font-size: var(--t-md); line-height: 1.55; }
.hero__cta {
  text-transform: none;
  letter-spacing: 0;
  font-weight: 600;
  background: var(--celeste) !important;
  color: #04222e !important;
}

.page { padding-top: var(--s-6); }

/* ---- KPIs ---- */
.kpis { margin-bottom: var(--s-4); }
.kpi { padding: var(--s-4); height: 100%; }
.kpi__n { font-size: var(--t-2xl); line-height: 1; font-weight: 700; letter-spacing: -0.02em; }
.kpi__n--carga { color: var(--celeste-deep); }
.kpi__l {
  margin-top: var(--s-2);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
}

/* ---- Type split chips ---- */
.typechips { display: flex; flex-wrap: wrap; gap: var(--s-3); margin-bottom: var(--s-5); }
.typechip {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  padding: var(--s-2) var(--s-4);
  border: 1px solid var(--celeste);
  border-radius: var(--r-full);
  background: color-mix(in srgb, var(--celeste) 8%, var(--surface));
  color: var(--text);
  text-decoration: none;
  font-size: var(--t-sm);
  transition: filter var(--dur) var(--ease);
}
.typechip:hover { filter: brightness(1.04); }
.typechip__n { font-weight: 700; color: var(--celeste-deep); }
.typechip__go { font-family: var(--font-mono); font-size: var(--t-xs); color: var(--celeste-deep); }

/* ---- Method + freshness ---- */
.method {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-4) var(--s-6);
  justify-content: space-between;
  padding: var(--s-4) var(--s-5);
  border-left: 3px solid var(--celeste) !important;
  margin-bottom: var(--s-5);
}
.method__body { flex: 1 1 46ch; min-width: 0; }
.method__t {
  margin: 0 0 var(--s-2);
  font-size: var(--t-xs);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.method__b { margin: 0 0 var(--s-2); font-size: var(--t-sm); line-height: 1.6; }
.method__n { margin: 0 0 var(--s-1); font-size: var(--t-xs); color: var(--text-muted); line-height: 1.55; }
.method__n:last-child { margin-bottom: 0; }
.fresh {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--s-2);
  align-self: flex-start;
}
.fresh__l { display: flex; align-items: center; gap: var(--s-2); color: var(--text); }
.fresh__txt { font-size: var(--t-sm); }
.fresh__abs { font-size: var(--t-xs); color: var(--text-muted); }

/* ---- Controls ---- */
.controls {
  display: flex;
  align-items: flex-end;
  flex-wrap: wrap;
  gap: var(--s-3) var(--s-4);
  margin-bottom: var(--s-5);
}
.controls__field { flex: 0 1 220px; min-width: 170px; }
.controls__field--rubro { flex: 0 1 300px; }
.controls__seg { display: flex; flex-direction: column; gap: 5px; }
.controls__l {
  font-size: var(--t-xs);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.controls__captive { text-transform: none; letter-spacing: 0; }

/* ---- Table shell + sticky pager ---- */
.tablecard { position: relative; overflow: visible; }
.tablepager {
  position: sticky;
  top: 62px;
  z-index: 4;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-3);
  padding: var(--s-2) var(--s-3);
  background: var(--surface);
  border-bottom: 1px solid var(--rule);
  border-top-left-radius: inherit;
  border-top-right-radius: inherit;
}
.tablepager__range { font-size: var(--t-xs); color: var(--text-muted); }
.tablepager__nav { display: flex; align-items: center; gap: 2px; }
.tablepager__page {
  min-width: 4ch;
  padding-inline: var(--s-1);
  font-size: var(--t-xs);
  color: var(--text);
  text-align: center;
  white-space: nowrap;
}
.tablepager__load { position: absolute; left: 0; right: 0; bottom: -1px; }

/* Desktop table vs. mobile cards — one 760px switch. */
.provtable-desktop { display: none; }
.provcards { display: block; }
@media (min-width: 760px) {
  .provtable-desktop { display: block; }
  .provcards { display: none; }
}

/* ---- Mobile cards ---- */
.provcards { list-style: none; margin: 0; padding: 0; }
.provcards__li { border-top: 1px solid var(--rule); }
.provcards__li:first-child { border-top: 0; }
.provcard {
  display: flex;
  align-items: flex-start;
  gap: var(--s-3);
  padding: var(--s-4) var(--s-3);
  color: inherit;
  text-decoration: none;
}
.provcard:active { background: var(--surface-sunken); }
.provcard__rank {
  flex: none;
  min-width: 2ch;
  padding-top: 2px;
  font-size: var(--t-xs);
  color: var(--text-muted);
  text-align: right;
}
.provcard__main { flex: 1 1 auto; min-width: 0; }
.provcard__name { display: block; font-weight: 600; line-height: 1.3; }
.provcard__stats {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2) var(--s-5);
  margin: var(--s-3) 0 0;
}
.provcard__stat { display: flex; flex-direction: column; gap: 2px; margin: 0; }
.provcard__stat dt {
  font-family: var(--font-mono);
  font-size: var(--t-2xs, 0.6875rem);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
}
.provcard__stat dd { margin: 0; }
.provcard__flags { display: inline-flex; align-items: center; gap: var(--s-2); }
.provcard__buyer { margin-top: var(--s-3); font-size: var(--t-sm); }
.provcard__buyerlbl {
  display: block;
  margin-bottom: 1px;
  font-size: var(--t-2xs, 0.6875rem);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
}
.provcard__go { flex: none; align-self: center; color: var(--text-muted); }
.provcard:active .provcard__go,
.provcard:hover .provcard__go { color: var(--celeste-deep); }

.t-muted { color: var(--text-muted); }
.cell-prov { font-weight: 600; color: inherit; text-decoration: none; }
.cell-prov:hover { color: var(--celeste-deep); }
.cell-tags { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 4px; }
.chip-cat {
  display: inline-flex;
  align-items: center;
  padding: 1px 8px;
  border-radius: var(--r-full);
  background: color-mix(in srgb, var(--celeste) 18%, transparent);
  color: var(--celeste-deep);
  font-size: var(--t-2xs, 0.6875rem);
  font-weight: 600;
}
.cell-years { font-size: var(--t-xs); color: var(--text-muted); }
.cell-flags { display: inline-flex; align-items: center; gap: var(--s-2); }
.cell-flags__stripe { width: 4px; height: 18px; border-radius: 2px; background: var(--celeste); opacity: 0.85; }
.cell-flags__n { font-weight: 700; font-size: var(--t-md); }
.cell-money { font-weight: 700; color: var(--celeste-deep); white-space: nowrap; }
.cell-z { font-weight: 700; color: var(--celeste-deep); white-space: nowrap; }
.cell-buyer { display: block; }
.cell-buyer__c { font-size: var(--t-xs); color: var(--text-muted); }

/* Keep the long provider column from collapsing the money/z columns. */
.tablecard :deep(td:nth-child(2)) { min-width: 220px; }
.tablecard :deep(.v-data-table__td) { vertical-align: top; }

/* ---- Empty ---- */
.empty { padding: var(--s-7) var(--s-5); text-align: center; }
.empty__t { margin: 0 0 var(--s-2); font-size: var(--t-lg); }
.empty__b { margin: 0 auto var(--s-4); max-width: 46ch; color: var(--text-muted); font-size: var(--t-sm); }

/* ---- Pattern panels ---- */
.patterns { margin-top: var(--s-7); }
.patterns__head { margin-bottom: var(--s-4); }
.patterns__head h2 { margin: 0 0 var(--s-1); font-family: var(--font-display); }
.patterns__note { margin: 0; color: var(--text-muted); font-size: var(--t-sm); }
.panel { padding: var(--s-5); height: 100%; }
.panel__t { margin: 0 0 var(--s-1); font-family: var(--font-display); font-size: var(--t-lg); }
.panel__t--sub { margin-top: var(--s-5); font-size: var(--t-md); }
.panel__s { margin: 0 0 var(--s-4); color: var(--text-muted); font-size: var(--t-sm); }
.chartscroll { overflow-x: auto; }

.pairs { padding: 0; }
.pair { border-top: 1px dashed var(--rule); min-height: 0; padding-block: var(--s-2); }
.pair:first-child { border-top: 0; }
.pair__flow { min-width: 0; }
.pair__s { display: block; font-weight: 600; font-size: var(--t-sm); }
.pair__b { display: block; font-size: var(--t-xs); color: var(--text-muted); }
.pair__c { flex: none; font-weight: 700; color: var(--celeste-deep); margin-right: var(--s-2); }
.pair :deep(.v-list-item__append) { align-items: center; gap: var(--s-1); }
.pair__go { color: var(--text-muted); opacity: 0; transition: opacity var(--dur) var(--ease); }
.pair:hover .pair__s { color: var(--celeste-deep); }
.pair:hover .pair__go { opacity: 1; }

@media (max-width: 600px) {
  .method { flex-direction: column; }
  .fresh { align-self: stretch; }
}
</style>
