<script setup lang="ts">
/**
 * Errores de carga — the real-time, reportable view.
 *
 * The second-stage AI triage (score-anomalies-ai.ts) tags a flag `error-carga`
 * or `moneda-erronea` when the extreme unit price is not a real overprice but a
 * data-entry mistake: a quantity of 10.000 where it should be 1, the whole line
 * total loaded as the unit price, or a figure in the wrong currency. Those are
 * NOT corruption — they are bad data to report at the source. This page lists
 * them worst-first, polls the "changes" feed so new ones surface live, and gives
 * each row a Reportar action (ReportErrorDialog) with a ready-to-paste report.
 */
const LOAD_CATEGORIES = 'error-carga,moneda-erronea'

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const router = useRouter()
const { track } = useAnalytics()

const page = ref(Number(route.query.page ?? 1))
watch(page, () => {
  router.replace({ query: page.value > 1 ? { page: String(page.value) } : {} })
})

const { data: res, pending, error, refresh } = await useFetch<any>('/api/analytics/anomalies', {
  query: computed(() => ({
    ai: 'explainable',
    category: LOAD_CATEGORIES,
    sortBy: 'divergence',
    sortOrder: 'desc',
    page: page.value,
    limit: 20,
  })),
})

const flags = computed<any[]>(() => res.value?.data?.anomalies ?? [])
const pagination = computed(() => res.value?.data?.pagination ?? null)
const total = computed<number | null>(() => pagination.value?.total ?? null)

// "Dónde se concentran" — a read-only aggregation (top organisms/suppliers/years)
// so a reporter can see whom to contact first. Lazy: it must not block the list.
const { data: statsRes } = await useFetch<any>('/api/analytics/anomalies/load-error-stats', { lazy: true })
const stats = computed(() => statsRes.value?.data ?? null)
const byOrganism = computed<any[]>(() => stats.value?.byOrganism ?? [])
const bySupplier = computed<any[]>(() => stats.value?.bySupplier ?? [])
const byYear = computed<any[]>(() => stats.value?.byYear ?? [])
const orgMax = computed(() => Math.max(1, ...byOrganism.value.map(o => o.count)))
const yearMax = computed(() => Math.max(1, ...byYear.value.map(y => y.count)))
// Each organism links to the alerts page pre-filtered to ITS load errors (the alerts
// page carries the buyer + category filters; the list page here has no buyer filter).
function orgLink(name: string) {
  return localePath({ path: '/analytics/anomalies', query: { ai: 'explainable', category: 'error-carga', buyer: name } })
}
function pct(n: number, max: number): string {
  return `${Math.max(6, Math.round((n / max) * 100))}%`
}

function cur(a: any): string {
  return a?.currency ?? a?.metadata?.currency ?? 'UYU'
}
function itemLabel(a: any): string {
  const cls = a?.metadata?.itemClassification?.description
  if (cls && cls !== 'Unknown') return cls
  const d = a?.metadata?.itemDescription
  return d && d !== 'Unknown' ? d : (a?.metadata?.buyerName ?? '—')
}
function unitName(a: any): string | null {
  return a?.metadata?.itemUnit?.name ?? null
}
function reason(a: any): string | null {
  const r = a?.aiVerdict?.reason
  return typeof r === 'string' && r ? r : null
}
function category(a: any): string | null {
  return a?.aiVerdict?.category ?? null
}
function rangeLabel(a: any): string {
  const min = a?.expectedRange?.min
  const max = a?.expectedRange?.max
  if (!Number.isFinite(min) || !Number.isFinite(max)) return '—'
  const c = cur(a)
  const lo = formatMoney(min, c, { compact: true })
  const hi = formatMoney(max, c, { compact: true })
  const sym = lo.split(' ')[0]
  const hiShort = hi.startsWith(`${sym} `) ? hi.slice(sym.length + 1) : hi
  const NB = ' '
  return [lo, NB, '–', NB, hiShort].join('').split(' ').join(NB)
}

// ---- Report dialog ----
const dialogOpen = ref(false)
const active = ref<any>(null)
function report(a: any) {
  active.value = a
  dialogOpen.value = true
  track('report_error_open')
}

// ---- Live polling ----
// New load errors surface via the keyset "changes" feed, newest-first by
// firstDetectedAt and scoped to category=error-carga. We keep the timestamp of
// the newest one seen; each poll counts feed rows newer than it. Clicking the
// pill refreshes the list and re-baselines. Polling pauses when the tab is
// hidden. (A poll reads the top `limit` rows, so >limit arrivals between polls
// are only surfaced on the next refresh — a non-issue at the triage cadence.)
const latestSeen = ref<number>(0)
const newCount = ref(0)
let pollTimer: ReturnType<typeof setInterval> | null = null

function tsOf(row: any): number {
  const t2 = row?.firstDetectedAt ? new Date(row.firstDetectedAt).getTime() : 0
  return Number.isFinite(t2) ? t2 : 0
}

async function pollChanges() {
  if (import.meta.server) return
  if (document.visibilityState === 'hidden') return
  try {
    const r = await $fetch<any>('/api/v1/anomalies/changes', {
      query: { category: 'error-carga', limit: 50 },
    })
    const rows: any[] = r?.data ?? []
    if (!rows.length) return
    if (!latestSeen.value) {
      // First poll establishes the baseline without flashing a count.
      latestSeen.value = tsOf(rows[0])
      return
    }
    newCount.value = rows.filter(row => tsOf(row) > latestSeen.value).length
  }
  catch {
    // Transient network/feed error — keep the last count, try again next tick.
  }
}

async function showNew() {
  latestSeen.value = 0
  newCount.value = 0
  await refresh()
  await pollChanges()
}

onMounted(() => {
  pollChanges()
  pollTimer = setInterval(pollChanges, 60_000)
  document.addEventListener('visibilitychange', onVisible)
})
function onVisible() {
  if (document.visibilityState === 'visible') pollChanges()
}
onBeforeUnmount(() => {
  if (pollTimer) clearInterval(pollTimer)
  document.removeEventListener('visibilitychange', onVisible)
})

const orgLd = useOrgLd()

useSeo(() => ({
  title: t('seo.erroresCarga.title'),
  description: t('seo.erroresCarga.description'),
  path: '/analytics/errores-carga',
  kicker: 'Errores de carga',
  jsonLd: [
    {
      '@context': 'https://schema.org',
      '@type': 'Dataset',
      'name': t('seo.erroresCarga.title'),
      'description': t('seo.erroresCarga.description'),
      'creator': orgLd,
      'isAccessibleForFree': true,
      'license': 'https://catalogodatos.gub.uy',
    },
    orgLd,
  ],
}))
</script>

<template>
  <div class="u-container page">
    <header class="hero">
      <p class="u-eyebrow hero__eyebrow">
        <span class="hero__live">
          <span class="hero__live-dot" />
          {{ t('erroresCarga.live') }}
        </span>
        {{ t('erroresCarga.eyebrow') }}
      </p>
      <div class="hero__figure">
        <span class="hero__n u-mono">{{ total !== null ? formatNumber(total) : '—' }}</span>
        <h1 class="hero__t">
          {{ t('erroresCarga.title') }}
        </h1>
      </div>
      <p class="u-lead hero__lead">
        {{ t('erroresCarga.lead') }}
      </p>

      <button
        v-if="newCount > 0"
        type="button"
        class="hero__new"
        @click="showNew"
      >
        <span class="hero__new-dot" />
        {{ t('erroresCarga.newFlags', { n: formatNumber(newCount) }) }}
        <span class="hero__new-act">{{ t('erroresCarga.newFlagsAction') }} →</span>
      </button>
    </header>

    <section class="note">
      <p class="note__b">
        {{ t('erroresCarga.banner') }}
      </p>
      <NuxtLink
        :to="localePath('/analytics/como-reportar')"
        class="note__link"
      >
        {{ t('erroresCarga.bannerLink') }} →
      </NuxtLink>
    </section>

    <!-- Dónde se concentran: whom to report to first. Read-only aggregation. -->
    <section
      v-if="stats && stats.total"
      class="conc"
    >
      <div class="conc__head">
        <h2 class="conc__t">
          {{ t('erroresCarga.concentration.title') }}
        </h2>
        <p class="conc__note">
          {{ t('erroresCarga.concentration.note') }}
        </p>
      </div>

      <div class="conc__grid">
        <!-- Organismos: the actionable column — each links to its filtered alerts. -->
        <div class="conc__col conc__col--wide">
          <h3 class="conc__ct u-mono">
            {{ t('erroresCarga.concentration.orgTitle') }}
          </h3>
          <ol class="bars">
            <li
              v-for="o in byOrganism"
              :key="o.name"
              class="bar"
            >
              <NuxtLink
                :to="orgLink(o.name)"
                class="bar__link"
              >
                <span class="bar__name">{{ o.name }}</span>
                <span class="bar__n u-mono">{{ formatNumber(o.count) }}</span>
              </NuxtLink>
              <span
                class="bar__track"
                aria-hidden="true"
              >
                <span
                  class="bar__fill"
                  :style="{ width: pct(o.count, orgMax) }"
                />
              </span>
            </li>
          </ol>
        </div>

        <!-- Proveedores: who recurs across the errors. -->
        <div class="conc__col">
          <h3 class="conc__ct u-mono">
            {{ t('erroresCarga.concentration.supTitle') }}
          </h3>
          <ol class="rows">
            <li
              v-for="s in bySupplier"
              :key="s.name"
              class="row"
            >
              <span class="row__name">{{ s.name }}</span>
              <span class="row__n u-mono">{{ formatNumber(s.count) }}</span>
            </li>
          </ol>
        </div>

        <!-- Por año: when the bad data was loaded. -->
        <div class="conc__col conc__col--year">
          <h3 class="conc__ct u-mono">
            {{ t('erroresCarga.concentration.yearTitle') }}
          </h3>
          <ol class="years">
            <li
              v-for="y in byYear"
              :key="y.year"
              class="year"
            >
              <span class="year__l u-mono">{{ y.year }}</span>
              <span
                class="year__track"
                aria-hidden="true"
              >
                <span
                  class="year__fill"
                  :style="{ width: pct(y.count, yearMax) }"
                />
              </span>
              <span class="year__n u-mono">{{ formatNumber(y.count) }}</span>
            </li>
          </ol>
        </div>
      </div>
    </section>

    <PaginatedList
      v-model:page="page"
      :total-pages="pagination?.totalPages ?? 1"
    >
      <div
        v-if="error"
        class="state"
      >
        <h2 class="state__t">
          {{ t('errors.generic.title') }}
        </h2>
        <p class="state__b">
          {{ t('errors.generic.body') }}
        </p>
      </div>

      <div
        v-else-if="pending && !flags.length"
        class="skeleton"
      >
        <div
          v-for="i in 6"
          :key="i"
          class="skeleton__row"
        />
      </div>

      <div
        v-else-if="!flags.length"
        class="state"
      >
        <h2 class="state__t">
          {{ t('erroresCarga.empty.title') }}
        </h2>
        <p class="state__b">
          {{ t('erroresCarga.empty.body') }}
        </p>
      </div>

      <ol
        v-else
        class="flags"
      >
        <li
          v-for="(a, i) in flags"
          :key="a._id"
          class="flag"
        >
          <div class="flag__rank u-mono">
            {{ (pagination?.page ? (pagination.page - 1) * 20 : 0) + i + 1 }}
          </div>

          <div class="flag__body">
            <div class="flag__tags">
              <span class="tag tag--carga">{{ t(`anomalies.ai.category.${category(a)}`) }}</span>
              <span
                v-if="a.sourceYear ?? a.metadata?.year"
                class="flag__yr u-mono"
              >{{ a.sourceYear ?? a.metadata?.year }}</span>
            </div>

            <p class="flag__what">
              {{ itemLabel(a) }}
              <span
                v-if="unitName(a)"
                class="flag__unit u-mono"
              >/ {{ unitName(a) }}</span>
            </p>

            <p class="flag__who">
              {{ a.metadata?.buyerName }}
              <span v-if="a.metadata?.supplierName"> · {{ a.metadata.supplierName }}</span>
            </p>

            <div class="flag__money">
              <div class="flag__fig">
                <span class="flag__figl">{{ t('reportDialog.detectedLabel') }}</span>
                <MoneyAmount
                  :amount="a.detectedValue"
                  :currency="cur(a)"
                  compact
                  class="flag__bad"
                />
              </div>
              <div class="flag__fig flag__fig--range">
                <span class="flag__figl">{{ t('reportDialog.expectedLabel') }}</span>
                <span class="flag__range u-mono">{{ rangeLabel(a) }}</span>
              </div>
            </div>

            <p
              v-if="reason(a)"
              class="flag__reason"
            >
              <span class="flag__reasonl">{{ t('erroresCarga.reason') }}</span>
              {{ reason(a) }}
            </p>

            <div class="flag__actions">
              <button
                type="button"
                class="flag__report"
                @click="report(a)"
              >
                <v-icon size="16">
                  mdi-flag-outline
                </v-icon>
                {{ t('erroresCarga.report') }}
              </button>
              <NuxtLink
                :to="localePath(`/contracts/${a.releaseId}`)"
                class="flag__see"
              >
                {{ t('reportDialog.openContract') }} →
              </NuxtLink>
            </div>
          </div>
        </li>
      </ol>
    </PaginatedList>

    <p class="disclaimer">
      {{ t('erroresCarga.disclaimer') }}
    </p>

    <ReportErrorDialog
      v-model="dialogOpen"
      :anomaly="active"
    />
  </div>
</template>

<style scoped>
.page { padding-block: var(--s-6) var(--s-8); }

/* ---- Hero ---- */
.hero {
  max-width: 72ch;
  margin-bottom: var(--s-6);
}

.hero__eyebrow {
  display: inline-flex;
  align-items: center;
  gap: var(--s-3);
  color: var(--celeste-deep);
}

.hero__live {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px var(--s-2);
  border-radius: var(--r-full);
  background: color-mix(in srgb, var(--celeste) 15%, transparent);
  color: var(--celeste-deep);
  font-size: var(--t-2xs, 0.6875rem);
  letter-spacing: 0.04em;
}

.hero__live-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--celeste);
  animation: live-pulse 1.6s ease-in-out infinite;
}

@keyframes live-pulse {
  0%, 100% { opacity: 0.35; }
  50% { opacity: 1; }
}

.hero__figure {
  display: flex;
  align-items: baseline;
  gap: var(--s-4);
  flex-wrap: wrap;
  margin: var(--s-2) 0 var(--s-3);
}

.hero__n {
  font-size: var(--t-3xl);
  font-weight: 700;
  line-height: 1;
  color: var(--celeste-deep);
  font-variant-numeric: tabular-nums;
}

.hero__t { margin: 0; font-size: var(--t-xl); }
.hero__lead { color: var(--text-muted); }

/* "N nuevos" pill — a live affordance, clickable to reload the list. */
.hero__new {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  margin-top: var(--s-4);
  padding: var(--s-2) var(--s-4);
  border: 1px solid var(--celeste);
  border-radius: var(--r-full);
  background: color-mix(in srgb, var(--celeste) 10%, var(--surface));
  color: var(--text);
  font-size: var(--t-sm);
  font-weight: 600;
  cursor: pointer;
  transition: filter var(--dur) var(--ease);
}

.hero__new:hover { filter: brightness(1.04); }

.hero__new-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--celeste);
  flex: none;
  animation: live-pulse 1.4s ease-in-out infinite;
}

.hero__new-act {
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  color: var(--celeste-deep);
}

@media (prefers-reduced-motion: reduce) {
  .hero__live-dot, .hero__new-dot { animation: none; opacity: 0.85; }
}

/* ---- Reporting note ---- */
.note {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--s-3);
  padding: var(--s-4) var(--s-5);
  border: 1px solid var(--rule);
  border-left: 3px solid var(--celeste);
  border-radius: var(--r-lg);
  background: var(--surface);
  margin-bottom: var(--s-6);
}

.note__b {
  margin: 0;
  font-size: var(--t-sm);
  line-height: 1.6;
  color: var(--text-muted);
  max-width: 80ch;
}

.note__link {
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--celeste-deep);
  text-decoration: none;
  white-space: nowrap;
}

.note__link:hover { text-decoration: underline; }

/* ---- Concentration strip ---- */
.conc {
  margin: 0 0 var(--s-6);
  padding: var(--s-5);
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
  background: var(--surface);
}

.conc__head { margin-bottom: var(--s-4); }

.conc__t {
  margin: 0 0 2px;
  font-size: var(--t-lg);
}

.conc__note {
  margin: 0;
  font-size: var(--t-sm);
  color: var(--text-muted);
}

.conc__grid {
  display: grid;
  grid-template-columns: 1.4fr 1fr 0.9fr;
  gap: var(--s-5) var(--s-6);
}

.conc__ct {
  margin: 0 0 var(--s-3);
  font-size: var(--t-xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--celeste-deep);
}

.bars, .rows, .years {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
}

.bar__link {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--s-3);
  text-decoration: none;
  color: inherit;
}

.bar__name {
  font-size: var(--t-sm);
  line-height: 1.25;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bar__link:hover .bar__name { color: var(--celeste-deep); text-decoration: underline; }

.bar__n {
  font-size: var(--t-sm);
  font-weight: 700;
  color: var(--celeste-deep);
  flex: none;
}

.bar__track,
.year__track {
  display: block;
  height: 6px;
  margin-top: 5px;
  border-radius: var(--r-full);
  background: var(--surface-sunken);
  overflow: hidden;
}

.bar__fill,
.year__fill {
  display: block;
  height: 100%;
  border-radius: var(--r-full);
  background: var(--celeste);
}

.row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--s-3);
}

.row__name {
  font-size: var(--t-sm);
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row__n {
  font-size: var(--t-sm);
  font-weight: 600;
  flex: none;
}

.year {
  display: grid;
  grid-template-columns: 3.5ch 1fr auto;
  align-items: center;
  gap: var(--s-2);
}

.year__l { font-size: var(--t-xs); color: var(--text-muted); }
.year__track { margin-top: 0; }
.year__n { font-size: var(--t-xs); font-weight: 600; }

@media (max-width: 780px) {
  .conc__grid { grid-template-columns: 1fr; gap: var(--s-5); }
}

/* ---- The list ---- */
.flags {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
}

.flag {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: start;
  gap: var(--s-4);
  padding: var(--s-4) var(--s-5);
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
}

.flag__rank {
  font-size: var(--t-lg);
  font-weight: 700;
  color: var(--text-faint, var(--text-muted));
  line-height: 1.4;
  min-width: 2ch;
  text-align: right;
}

.flag__body { min-width: 0; }

.flag__tags {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--s-2);
  margin-bottom: var(--s-2);
}

.tag--carga {
  background: color-mix(in srgb, var(--celeste) 18%, transparent);
  color: var(--celeste-deep);
}

.flag__yr {
  font-size: var(--t-xs);
  color: var(--text-muted);
}

.flag__what {
  margin: 0 0 2px;
  font-size: var(--t-md);
  font-weight: 600;
  line-height: 1.25;
}

.flag__unit {
  font-size: var(--t-xs);
  font-weight: 400;
  color: var(--text-muted);
}

.flag__who {
  margin: 0 0 var(--s-3);
  font-size: var(--t-sm);
  color: var(--text-muted);
}

.flag__money {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-5);
  padding: var(--s-3) 0;
  border-top: 1px solid var(--rule);
}

.flag__fig { display: flex; flex-direction: column; gap: 2px; }

.flag__figl {
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.flag__bad { color: var(--alerta); font-weight: 700; }

.flag__range {
  font-size: var(--t-sm);
  color: var(--text-muted);
  white-space: nowrap;
}

.flag__reason {
  margin: var(--s-2) 0 0;
  padding: var(--s-3);
  border-radius: var(--r-md);
  background: color-mix(in srgb, var(--celeste) 8%, transparent);
  font-size: var(--t-sm);
  line-height: 1.5;
}

.flag__reasonl {
  display: block;
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--celeste-deep);
  margin-bottom: 2px;
}

.flag__actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--s-3);
  margin-top: var(--s-3);
}

.flag__report {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 var(--s-4);
  border: 1px solid var(--celeste);
  border-radius: var(--r-md);
  background: var(--celeste);
  color: #fff;
  font-size: var(--t-sm);
  font-weight: 600;
  font-family: var(--font-body);
  cursor: pointer;
  transition: filter var(--dur) var(--ease);
}

.flag__report:hover { filter: brightness(1.06); }

.flag__see {
  font-size: var(--t-sm);
  font-weight: 600;
  color: var(--celeste-deep);
  text-decoration: none;
}

.flag__see:hover { text-decoration: underline; }

/* ---- States ---- */
.state { text-align: center; padding: var(--s-8) var(--s-4); }
.state__t { margin: 0 0 var(--s-2); }
.state__b { margin: 0; color: var(--text-muted); }

.skeleton { display: flex; flex-direction: column; gap: var(--s-3); }

.skeleton__row {
  height: 150px;
  border-radius: var(--r-lg);
  background: linear-gradient(90deg, var(--surface) 25%, var(--surface-sunken) 37%, var(--surface) 63%);
  background-size: 400% 100%;
  animation: shimmer 1.4s ease infinite;
}

@keyframes shimmer {
  0% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}

.disclaimer {
  margin: var(--s-6) 0 0;
  padding-top: var(--s-5);
  border-top: 1px solid var(--rule);
  font-size: var(--t-xs);
  color: var(--text-muted);
  font-style: italic;
}

@media (max-width: 620px) {
  .flag { grid-template-columns: auto 1fr; gap: var(--s-3); }
}
</style>
