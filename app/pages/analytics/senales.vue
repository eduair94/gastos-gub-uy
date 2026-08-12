<script setup lang="ts">
/**
 * Señales de gestión — which organisms buy in ways worth a question.
 *
 * Reads the precomputed `integrity_signals` collection (one document per buying organism, rebuilt
 * nightly by src/jobs/refresh-integrity-signals.ts). Nothing is aggregated on the request path:
 * `releases.buyer.id` carries no index, so every measurement behind these numbers is a COLLSCAN.
 *
 * FRAMING, which the page must never soften: each of the five indicators is a DESCRIPTIVE
 * MEASUREMENT of published procurement records. None is evidence of wrongdoing, and every one has
 * legitimate explanations — a hospital that buys its oxygen from the single licensed supplier shows
 * 100% concentration and is perfectly in order. A level says only that the organism sits in the top
 * decile or top 3% of every organism measured, which is why the page shows the percentile and the
 * denominator next to every number rather than a verdict.
 */
const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const router = useRouter()

const SIGNAL_ORDER = ['concentration', 'bursts', 'directAward', 'expressWindow', 'unexplainedPrices'] as const
type SignalKey = typeof SIGNAL_ORDER[number]

const signal = ref((route.query.signal as string) ?? '')
const level = ref((route.query.level as string) ?? '')
const page = ref(Number(route.query.page ?? 1))
const ITEMS_PER_PAGE = 25

watch([signal, level], () => {
  page.value = 1
})
watch([signal, level, page], () => {
  const q: Record<string, string> = {}
  if (signal.value) q.signal = signal.value
  if (level.value) q.level = level.value
  if (page.value > 1) q.page = String(page.value)
  router.replace({ query: q })
})

const { data: res, pending, error } = await useFetch<any>('/api/analytics/integrity-signals', {
  query: computed(() => ({
    page: page.value,
    limit: ITEMS_PER_PAGE,
    ...(signal.value ? { signal: signal.value } : {}),
    ...(level.value ? { level: level.value } : {}),
  })),
})

const organisms = computed<any[]>(() => res.value?.data?.organisms ?? [])
const meta = computed<any>(() => res.value?.data?.meta ?? null)
const pagination = computed<any>(() => res.value?.data?.pagination ?? null)
const total = computed<number>(() => pagination.value?.total ?? 0)
const totalPages = computed<number>(() => pagination.value?.totalPages ?? 1)

const SIGNAL_ITEMS = computed(() => [
  { value: '', title: t('senales.filter.allSignals') },
  ...SIGNAL_ORDER.map(key => ({ value: key, title: t(`senales.signal.${key}.label`) })),
])
const LEVEL_ITEMS = computed(() => [
  { value: '', title: t('senales.filter.allLevels') },
  { value: 'watch', title: t('senales.level.watch') },
  { value: 'high', title: t('senales.level.high') },
])

/**
 * NuxtLink RESOLVED, not named by string. A string  does not resolve the component and Vue
 * emits a literal <NuxtLink> element: the card looks right and nothing is clickable. Documented
 * repo gotcha, reproduced here before this line existed.
 */
const NuxtLinkComponent = resolveComponent('NuxtLink')

function signalOf(row: any, key: SignalKey): any | null {
  return (row?.signals ?? []).find((s: any) => s.key === key) ?? null
}

/**
 * Where a raised signal takes the reader — the contracts that produced it.
 *
 * Without this the page is a scoreboard: it says "177 tandas" and you cannot open a single one of
 * them. Every link below lands on filters the explorer already understands, so the reader ends up
 * looking at the actual records rather than at our arithmetic.
 *
 * Returns null where the corpus genuinely cannot support a drill-down, and the card then stays
 * plain rather than linking somewhere approximate. `expressWindow` is the honest null: the bidding
 * window lives on the tender-phase sibling, and the explorer filters awards.
 */
function drillTo(org: any, key: SignalKey): string | null {
  const buyerId = org?.buyerId
  if (!buyerId) return null

  if (key === 'concentration' && org.topSupplierName) {
    return localePath(`/contracts?buyerIds=${encodeURIComponent(buyerId)}&suppliers=${encodeURIComponent(org.topSupplierName)}`)
  }
  if (key === 'bursts' && org.burstWorstSupplier) {
    // Narrow to the year of the worst burst; the month is not a filter the explorer has.
    const year = String(org.burstWorstMonth ?? '').slice(0, 4)
    const range = /^\d{4}$/.test(year) ? `&yearFrom=${year}&yearTo=${year}` : ''
    return localePath(`/contracts?buyerIds=${encodeURIComponent(buyerId)}&suppliers=${encodeURIComponent(org.burstWorstSupplier)}${range}`)
  }
  if (key === 'directAward') {
    // The two non-competitive procedures, as the explorer names them.
    return localePath(
      `/contracts?buyerIds=${encodeURIComponent(buyerId)}`
      + `&procurementMethodDetails=${encodeURIComponent('Compra Directa')}`
      + `&procurementMethodDetails=${encodeURIComponent('Compra por Excepción')}`
      // tag=tender is LOAD-BEARING: the method only exists on the tender-phase release, and the
      // explorer defaults to awards only — without it this link renders an empty list (measured:
      // 0 rows vs 25).
      + '&tag=tender',
    )
  }
  if (key === 'unexplainedPrices' && org.buyerName) {
    return localePath(`/analytics/anomalies?ai=unexplained&buyer=${encodeURIComponent(org.buyerName)}`)
  }
  return null
}

/** The measured value, formatted the way its own indicator is read. */
function signalValue(key: SignalKey, value: number | null): string {
  if (value === null || value === undefined) return t('senales.notMeasurable')
  if (key === 'bursts' || key === 'unexplainedPrices') return String(value)
  return `${(value * 100).toFixed(1)}%`
}

/** "supera al 94% de los organismos" — the only honest way to read a level. */
function percentileLabel(p: number | null | undefined): string | null {
  if (typeof p !== 'number' || !Number.isFinite(p)) return null
  return t('senales.percentile', { pct: Math.round(p * 100) })
}

function formatDate(value?: string | Date | null): string {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${String(date.getUTCDate()).padStart(2, '0')}/${String(date.getUTCMonth() + 1).padStart(2, '0')}/${date.getUTCFullYear()}`
}

useSeo(() => ({
  title: t('seo.senales.title'),
  description: t('seo.senales.description'),
  path: '/analytics/senales',
  kicker: 'Análisis',
}))
</script>

<template>
  <div class="sen">
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
            {{ t('senales.title') }}
          </h1>
          <p class="hero__dek">
            {{ t('senales.lead') }}
          </p>
        </div>
      </div>
    </v-sheet>

    <div class="u-container page">
      <!-- The disclaimer is not decoration: it is the contract under which these numbers
           are published, and it stays above the list. -->
      <v-alert
        type="info"
        variant="tonal"
        class="caveat"
        density="comfortable"
      >
        {{ t('senales.caveat') }}
      </v-alert>

      <p
        v-if="meta"
        class="window u-mono"
      >
        {{ t('senales.window', {
          from: formatDate(meta.windowStart),
          to: formatDate(meta.windowEnd),
          organisms: meta.measuredOrganisms,
        }) }}
      </p>

      <!-- What each signal means, and what it does not. Shown before the list, because a reader
           who meets "ráfagas: alta" without this has been told nothing. -->
      <section class="legend">
        <h2 class="legend__h">
          {{ t('senales.legendTitle') }}
        </h2>
        <dl class="legend__list">
          <div
            v-for="key in SIGNAL_ORDER"
            :key="key"
            class="legend__item"
          >
            <dt>{{ t(`senales.signal.${key}.label`) }}</dt>
            <dd>
              {{ t(`senales.signal.${key}.help`) }}
              <span
                v-if="meta?.cutoffs?.[key]"
                class="legend__cut u-mono"
              >{{ t('senales.cutoff', {
                watch: key === 'bursts' || key === 'unexplainedPrices'
                  ? meta.cutoffs[key].watch
                  : `${(meta.cutoffs[key].watch * 100).toFixed(0)}%`,
                high: key === 'bursts' || key === 'unexplainedPrices'
                  ? meta.cutoffs[key].high
                  : `${(meta.cutoffs[key].high * 100).toFixed(0)}%`,
              }) }}</span>
            </dd>
          </div>
        </dl>
      </section>

      <div class="filters">
        <v-select
          v-model="signal"
          :items="SIGNAL_ITEMS"
          :label="t('senales.filter.signal')"
          density="comfortable"
          variant="outlined"
          hide-details
        />
        <v-select
          v-model="level"
          :items="LEVEL_ITEMS"
          :label="t('senales.filter.level')"
          density="comfortable"
          variant="outlined"
          hide-details
        />
      </div>

      <p class="count">
        {{ t('senales.count', { n: total }) }}
      </p>

      <v-alert
        v-if="error"
        type="warning"
        variant="tonal"
      >
        {{ t('senales.notComputed') }}
      </v-alert>

      <v-progress-linear
        v-else-if="pending"
        indeterminate
        color="accent"
      />

      <ul
        v-else
        id="senales-orgs"
        class="orgs"
      >
        <li
          v-for="org in organisms"
          :key="org.buyerId"
          class="orgs__row"
        >
          <div class="orgs__head">
            <NuxtLink
              :to="localePath(`/buyers/${org.buyerId}`)"
              class="orgs__name"
            >
              {{ org.buyerName ?? org.buyerId }}
            </NuxtLink>
            <span class="orgs__meta u-mono">
              {{ t('senales.contracts', { n: org.contracts }) }}
            </span>
            <MoneyAmount
              :amount="org.totalUyu"
              currency="UYU"
              compact
              size="sm"
            />
          </div>

          <ul class="sig">
            <li
              v-for="key in SIGNAL_ORDER"
              :key="key"
              class="sig__item"
              :class="`sig__item--${signalOf(org, key)?.level ?? 'none'}`"
            >
              <!-- A raised signal links to the records behind it; an unraised one stays plain,
                   because sending a reader to an unfiltered list would waste the click. -->
              <component
                :is="signalOf(org, key)?.level !== 'none' && drillTo(org, key) ? NuxtLinkComponent : 'div'"
                :to="signalOf(org, key)?.level !== 'none' ? drillTo(org, key) : undefined"
                class="sig__body"
              >
                <span class="sig__label">{{ t(`senales.signal.${key}.short`) }}</span>
                <span class="sig__value u-mono">{{ signalValue(key, signalOf(org, key)?.value ?? null) }}</span>
                <span
                  v-if="percentileLabel(signalOf(org, key)?.populationPercentile)"
                  class="sig__pct"
                >{{ percentileLabel(signalOf(org, key)?.populationPercentile) }}</span>
                <span
                  v-if="signalOf(org, key)?.level !== 'none' && drillTo(org, key)"
                  class="sig__go"
                >{{ t(key === 'directAward' ? 'senales.drillCalls' : 'senales.drill') }}</span>
              </component>
            </li>
          </ul>

          <!-- The concrete fact behind the worst indicator, so the row is checkable rather than
               a label. Concentration and bursts both name the supplier involved. -->
          <p
            v-if="org.topSupplierName && signalOf(org, 'concentration')?.level !== 'none'"
            class="orgs__detail"
          >
            {{ t('senales.detail.concentration', {
              supplier: org.topSupplierName,
              suppliers: org.supplierCount,
            }) }}
          </p>
          <p
            v-if="org.burstWorstSupplier && signalOf(org, 'bursts')?.level !== 'none'"
            class="orgs__detail"
          >
            {{ t('senales.detail.bursts', {
              awards: org.burstWorstAwards,
              supplier: org.burstWorstSupplier,
              month: org.burstWorstMonth,
            }) }}
          </p>
          <p
            v-if="org.unexplainedFlags > 0"
            class="orgs__detail"
          >
            <NuxtLink :to="localePath('/analytics/unexplained')">
              {{ t('senales.detail.unexplained', { n: org.unexplainedFlags }) }}
            </NuxtLink>
          </p>
        </li>
      </ul>

      <!-- `<DataPager>`, not `<v-pagination>`: seven 48px number buttons plus
           prev/next need 432px, so the raw pager pushed the whole page 37px
           sideways on a 390px phone. The house pager is prev / "page X of Y" /
           next, fits any width, and returns the reader to the top of the list. -->
      <DataPager
        v-if="totalPages > 1"
        v-model:page="page"
        :total-pages="totalPages"
        scroll-target-id="senales-orgs"
        class="pager"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.hero {
  background: var(--ink);
  color: var(--paper);
  /* The scale stops at `--s-9`. This named `--s-10`, so the declaration was
     invalid and the hero shipped with no padding at all. */
  padding-block: var(--s-7) var(--s-6);
}

.hero__in { max-width: 46rem; }
.hero__eyebrow { font-size: var(--t-xs); opacity: 0.7; letter-spacing: 0.08em; text-transform: uppercase; }
.hero__title { font-family: var(--font-display); margin: var(--s-2) 0 var(--s-3); }
.hero__dek { opacity: 0.85; }

/* `padding-block`, never the `padding` shorthand — see `.u-container` in
   main.scss: a shorthand here wipes the site gutter on mobile. The scale
   stops at `--s-9`; the `--s-12` this used to name does not exist, so the
   whole declaration was invalid and the page opened welded to the hero. */
.page { padding-block: var(--s-8) var(--s-9); }
.caveat { margin-bottom: var(--s-4); }
.window { font-size: var(--t-xs); color: var(--text-muted); margin-bottom: var(--s-6); }

.legend { margin-bottom: var(--s-6); }
.legend__h { font-family: var(--font-display); font-size: var(--t-lg); margin-bottom: var(--s-3); }
.legend__list { display: grid; gap: var(--s-3); margin: 0; }
.legend__item { display: grid; grid-template-columns: minmax(0, 14rem) minmax(0, 1fr); gap: var(--s-3); }
.legend__item dt { font-weight: 600; }
.legend__item dd { margin: 0; color: var(--text-muted); font-size: var(--t-sm); }
.legend__cut { display: block; font-size: var(--t-xs); margin-top: 2px; }

.filters { display: flex; flex-wrap: wrap; gap: var(--s-3); margin-bottom: var(--s-4); }
.filters > * { min-width: 14rem; }
.count { font-size: var(--t-sm); color: var(--text-muted); margin-bottom: var(--s-3); }

.orgs { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--s-3); }

.orgs__row {
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
  background: var(--surface);
  padding: var(--s-4);
}

.orgs__head { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--s-3); }
.orgs__name { font-weight: 600; text-decoration: none; color: inherit; }
.orgs__name:hover { text-decoration: underline; }
.orgs__meta { font-size: var(--t-xs); color: var(--text-muted); }
.orgs__detail { margin: var(--s-2) 0 0; font-size: var(--t-sm); color: var(--text-muted); }

.sig {
  list-style: none;
  margin: var(--s-3) 0 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 11rem), 1fr));
  gap: var(--s-2);
}

.sig__item {
  border: 1px solid var(--rule);
  border-radius: var(--r-md);
  padding: var(--s-2) var(--s-3);
  min-width: 0;
}

/* Level is carried by tone AND by the printed percentile, never by colour alone. */
.sig__item--watch { border-color: var(--alerta); background: var(--alerta-wash); }
.sig__item--high { border-color: var(--alerta); background: var(--alerta-wash); border-width: 2px; }

.sig__body { display: block; color: inherit; text-decoration: none; }
a.sig__body:hover .sig__go { text-decoration: underline; }

.sig__label { display: block; font-size: var(--t-xs); color: var(--text-muted); }
.sig__value { display: block; font-weight: 600; }
.sig__pct { display: block; font-size: var(--t-xs); color: var(--text-muted); }

/* Named in words, not by colour alone — the card is already tinted for the level. */
.sig__go {
  display: block;
  margin-top: var(--s-1);
  font-size: var(--t-xs);
  color: var(--celeste-deep);
}

.pager { margin-top: var(--s-6); }

@media (max-width: 40rem) {
  .legend__item { grid-template-columns: minmax(0, 1fr); gap: var(--s-1); }
}
</style>
