<script setup lang="ts">
const { t, locale } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const router = useRouter()
const config = useRuntimeConfig()

function toArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string' && item !== '')
  return typeof value === 'string' && value ? [value] : []
}

const SEVERITIES = ['', 'critical', 'high', 'medium', 'low'] as const
const FOCUS_VALUES = ['', 'unexplained', 'load-errors', 'uncertain'] as const
const MIN_Z_VALUES = [0, 10, 25, 50] as const

type Severity = typeof SEVERITIES[number]
type Focus = typeof FOCUS_VALUES[number]

const initialSeverity = typeof route.query.severity === 'string' && SEVERITIES.includes(route.query.severity as Severity)
  ? route.query.severity as Severity
  : ''
const initialFocus = typeof route.query.focus === 'string' && FOCUS_VALUES.includes(route.query.focus as Focus)
  ? route.query.focus as Focus
  : ''
const initialMinZ = Number(route.query.minZ)

const severity = ref<Severity>(initialSeverity)
const focus = ref<Focus>(initialFocus)
const minZ = ref<(typeof MIN_Z_VALUES)[number]>(
  MIN_Z_VALUES.includes(initialMinZ as (typeof MIN_Z_VALUES)[number])
    ? initialMinZ as (typeof MIN_Z_VALUES)[number]
    : 0,
)
const rubroName = ref<string[]>(toArray(route.query.rubroName))
const buyer = ref<string[]>(toArray(route.query.buyer))
const supplier = ref<string[]>(toArray(route.query.supplier))

function addFocusQuery(query: URLSearchParams | Record<string, string | string[] | number>) {
  const set = (key: string, value: string | string[]) => {
    if (query instanceof URLSearchParams) {
      for (const item of Array.isArray(value) ? value : [value]) query.append(key, item)
    }
    else {
      query[key] = value
    }
  }
  if (focus.value === 'unexplained') set('ai', 'unexplained')
  else if (focus.value === 'uncertain') set('ai', 'uncertain')
  else if (focus.value === 'load-errors') set('category', ['error-carga', 'moneda-erronea'])
}

const feedParams = computed(() => {
  const query = new URLSearchParams()
  if (locale.value === 'en') query.set('lang', 'en')
  if (severity.value) query.set('severity', severity.value)
  if (minZ.value) query.set('minZ', String(minZ.value))
  for (const value of rubroName.value) query.append('rubroName', value)
  for (const value of buyer.value) query.append('buyer', value)
  for (const value of supplier.value) query.append('supplier', value)
  addFocusQuery(query)
  return query
})

const pageQuery = computed<Record<string, string | string[]>>(() => {
  const query: Record<string, string | string[]> = {}
  if (severity.value) query.severity = severity.value
  if (focus.value) query.focus = focus.value
  if (minZ.value) query.minZ = String(minZ.value)
  if (rubroName.value.length) query.rubroName = rubroName.value
  if (buyer.value.length) query.buyer = buyer.value
  if (supplier.value.length) query.supplier = supplier.value
  return query
})

watch([severity, focus, minZ, rubroName, buyer, supplier], () => {
  router.replace({ query: pageQuery.value })
}, { deep: true })

const siteUrl = (config.public.siteUrl as string).replace(/\/+$/, '')
const generalFeedUrl = `${siteUrl}/rss/anomalies.xml`
const feedUrl = computed(() => {
  const query = feedParams.value.toString()
  return `${generalFeedUrl}${query ? `?${query}` : ''}`
})

const previewQuery = computed(() => {
  const query: Record<string, string | string[] | number> = {
    limit: 3,
    page: 1,
    sortBy: 'firstDetectedAt',
    sortOrder: 'desc',
  }
  if (severity.value) query.severity = severity.value
  if (minZ.value) query.minZ = minZ.value
  if (rubroName.value.length) query.rubroName = rubroName.value
  if (buyer.value.length) query.buyer = buyer.value
  if (supplier.value.length) query.supplier = supplier.value
  addFocusQuery(query)
  return query
})

const { data: preview, pending: previewPending } = await useFetch<any>('/api/analytics/anomalies', {
  query: previewQuery,
})
const previewRows = computed<any[]>(() => preview.value?.data?.anomalies ?? [])
const previewTotal = computed<number>(() => preview.value?.data?.pagination?.total ?? 0)
const latestDetected = computed<string | undefined>(() => previewRows.value[0]?.firstDetectedAt)

const activeCount = computed(() =>
  Number(Boolean(severity.value))
  + Number(Boolean(focus.value))
  + Number(Boolean(minZ.value))
  + rubroName.value.length
  + buyer.value.length
  + supplier.value.length,
)

function clearAll() {
  severity.value = ''
  focus.value = ''
  minZ.value = 0
  rubroName.value = []
  buyer.value = []
  supplier.value = []
}

const copyState = ref<'idle' | 'done' | 'error'>('idle')
let copyTimer: ReturnType<typeof setTimeout> | undefined

async function copyFeedUrl() {
  try {
    await navigator.clipboard.writeText(feedUrl.value)
    copyState.value = 'done'
  }
  catch {
    copyState.value = 'error'
  }
  if (copyTimer) clearTimeout(copyTimer)
  copyTimer = setTimeout(() => {
    copyState.value = 'idle'
  }, 2500)
}

function selectFeedUrl(event: FocusEvent) {
  if (event.target instanceof HTMLInputElement) event.target.select()
}

onBeforeUnmount(() => {
  if (copyTimer) clearTimeout(copyTimer)
})

function itemLabel(row: any): string {
  return row?.metadata?.itemClassification?.description
    || row?.metadata?.itemDescription
    || t('rssAnomalies.previewFallback')
}

function detectedAt(value: string | undefined): string {
  if (!value) return t('rssAnomalies.noRecent')
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return t('rssAnomalies.noRecent')

  const parts = new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'America/Montevideo',
  }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(item => item.type === type)?.value ?? ''

  return locale.value === 'es'
    ? `${part('day')}/${part('month')}/${part('year')}, ${part('hour')}:${part('minute')}`
    : `${part('year')}-${part('month')}-${part('day')}, ${part('hour')}:${part('minute')}`
}

const listUrl = computed(() => {
  const query: Record<string, string | string[]> = { ...pageQuery.value, sort: 'recent' }
  delete query.focus
  if (focus.value === 'unexplained') query.ai = 'unexplained'
  else if (focus.value === 'uncertain') query.ai = 'uncertain'
  else if (focus.value === 'load-errors') query.category = ['error-carga', 'moneda-erronea']
  return localePath({ path: '/analytics/anomalies', query })
})

useHead(() => ({
  link: [{
    rel: 'alternate',
    type: 'application/rss+xml',
    title: t('rssAnomalies.feedTitle'),
    href: feedUrl.value,
  }],
}))

const orgLd = useOrgLd()
useSeo(() => ({
  title: t('seo.anomalyRss.title'),
  description: t('seo.anomalyRss.description'),
  path: '/analytics/rss-anomalias',
  kicker: 'RSS',
  jsonLd: [
    {
      '@context': 'https://schema.org',
      '@type': 'DataFeed',
      'name': t('rssAnomalies.feedTitle'),
      'description': t('seo.anomalyRss.description'),
      'url': generalFeedUrl,
      'creator': orgLd,
      'isAccessibleForFree': true,
    },
    orgLd,
  ],
}))
</script>

<template>
  <div class="u-container rss-page">
    <header class="hero">
      <div class="hero__copy">
        <NuxtLink
          :to="localePath('/analytics/anomalies')"
          class="back u-mono"
        >
          ← {{ t('rssAnomalies.back') }}
        </NuxtLink>
        <p class="u-eyebrow">
          {{ t('rssAnomalies.eyebrow') }}
        </p>
        <h1>{{ t('rssAnomalies.title') }}</h1>
        <p class="u-lead">
          {{ t('rssAnomalies.lead') }}
        </p>
        <p class="hero__privacy">
          {{ t('rssAnomalies.privacy') }}
        </p>
      </div>

      <aside
        class="signal"
        :aria-label="t('rssAnomalies.schedule.title')"
      >
        <div class="signal__top">
          <div
            class="signal__glyph"
            aria-hidden="true"
          >
            <span class="signal__dot" />
            <span class="signal__arc signal__arc--one" />
            <span class="signal__arc signal__arc--two" />
          </div>
          <div>
            <span class="signal__live u-mono">{{ t('rssAnomalies.schedule.live') }}</span>
            <strong>{{ t('rssAnomalies.schedule.title') }}</strong>
          </div>
        </div>
        <ol class="cadence">
          <li>
            <time class="u-mono">:05</time>
            <span>{{ t('rssAnomalies.schedule.hourly') }}</span>
          </li>
          <li>
            <time class="u-mono">04:15</time>
            <span>{{ t('rssAnomalies.schedule.daily') }}</span>
          </li>
          <li>
            <time class="u-mono">+ IA</time>
            <span>{{ t('rssAnomalies.schedule.ai') }}</span>
          </li>
        </ol>
      </aside>
    </header>

    <section class="builder">
      <div class="builder__form">
        <div class="section-head">
          <div>
            <p class="u-eyebrow">
              {{ t('rssAnomalies.builder.eyebrow') }}
            </p>
            <h2>{{ t('rssAnomalies.builder.title') }}</h2>
          </div>
          <button
            v-if="activeCount"
            class="clear u-mono"
            type="button"
            @click="clearAll"
          >
            {{ t('common.clearAll') }} ({{ activeCount }})
          </button>
        </div>

        <fieldset class="filter">
          <legend>{{ t('rssAnomalies.filters.rubro') }}</legend>
          <p class="filter__help">
            {{ t('rssAnomalies.filters.rubroHelp') }}
          </p>
          <AnomalyFacetAutocomplete
            :model-value="rubroName"
            field="rubroName"
            :placeholder="t('anomalies.filters.rubroPlaceholder')"
            @update:model-value="value => rubroName = value"
          />
        </fieldset>

        <div class="filter-grid">
          <fieldset class="filter">
            <legend>{{ t('anomalies.severity.label') }}</legend>
            <label class="select-wrap">
              <span class="sr-only">{{ t('anomalies.severity.label') }}</span>
              <select v-model="severity">
                <option value="">{{ t('rssAnomalies.filters.anySeverity') }}</option>
                <option
                  v-for="value in SEVERITIES.slice(1)"
                  :key="value"
                  :value="value"
                >
                  {{ t(`anomalies.severity.${value}`) }}
                </option>
              </select>
            </label>
          </fieldset>

          <fieldset class="filter">
            <legend>{{ t('rssAnomalies.filters.focus') }}</legend>
            <label class="select-wrap">
              <span class="sr-only">{{ t('rssAnomalies.filters.focus') }}</span>
              <select v-model="focus">
                <option value="">{{ t('rssAnomalies.filters.allFlags') }}</option>
                <option value="unexplained">{{ t('anomalies.ai.filter.unexplained') }}</option>
                <option value="load-errors">{{ t('rssAnomalies.filters.loadErrors') }}</option>
                <option value="uncertain">{{ t('anomalies.ai.filter.uncertain') }}</option>
              </select>
            </label>
          </fieldset>

          <fieldset class="filter">
            <legend>{{ t('anomalies.minZ.label') }}</legend>
            <label class="select-wrap">
              <span class="sr-only">{{ t('anomalies.minZ.label') }}</span>
              <select v-model.number="minZ">
                <option
                  v-for="value in MIN_Z_VALUES"
                  :key="value"
                  :value="value"
                >
                  {{ value ? t('anomalies.minZ.step', { z: value }) : t('anomalies.minZ.any') }}
                </option>
              </select>
            </label>
          </fieldset>
        </div>

        <details class="optional">
          <summary>
            <span>{{ t('rssAnomalies.filters.optional') }}</span>
            <span class="optional__hint">{{ t('rssAnomalies.filters.optionalHint') }}</span>
          </summary>
          <div class="optional__grid">
            <div class="filter">
              <label class="filter__label">{{ t('anomalies.filters.buyerLabel') }}</label>
              <AnomalyFacetAutocomplete
                :model-value="buyer"
                field="buyerName"
                :placeholder="t('anomalies.filters.buyerPlaceholder')"
                @update:model-value="value => buyer = value"
              />
            </div>
            <div class="filter">
              <label class="filter__label">{{ t('anomalies.supplierFilter') }}</label>
              <AnomalyFacetAutocomplete
                :model-value="supplier"
                field="supplierName"
                :placeholder="t('anomalies.filters.supplierPlaceholder')"
                @update:model-value="value => supplier = value"
              />
            </div>
          </div>
        </details>
      </div>

      <aside class="subscription">
        <p class="subscription__eyebrow u-mono">
          {{ t('rssAnomalies.subscription.eyebrow') }}
        </p>
        <h2>{{ t('rssAnomalies.subscription.title') }}</h2>
        <p class="subscription__count">
          <template v-if="previewPending">
            {{ t('common.loading') }}
          </template>
          <template v-else>
            <strong>{{ formatNumber(previewTotal) }}</strong>
            {{ t('rssAnomalies.subscription.matches') }}
          </template>
        </p>
        <p class="subscription__fresh u-mono">
          {{ t('rssAnomalies.subscription.latest') }}:
          <strong>{{ detectedAt(latestDetected) }}</strong>
        </p>

        <label
          class="url-label"
          for="rss-url"
        >{{ t('rssAnomalies.subscription.urlLabel') }}</label>
        <input
          id="rss-url"
          :value="feedUrl"
          class="url"
          type="url"
          readonly
          @focus="selectFeedUrl"
        >
        <div class="subscription__actions">
          <button
            class="copy"
            type="button"
            @click="copyFeedUrl"
          >
            {{ copyState === 'done'
              ? t('rssAnomalies.subscription.copied')
              : copyState === 'error'
                ? t('rssAnomalies.subscription.copyError')
                : t('rssAnomalies.subscription.copy') }}
          </button>
          <a
            class="open"
            :href="feedUrl"
            target="_blank"
            rel="noopener"
          >
            {{ t('rssAnomalies.subscription.open') }} ↗
          </a>
        </div>
        <p class="subscription__help">
          {{ t('rssAnomalies.subscription.help') }}
        </p>
        <a
          v-if="activeCount"
          class="general u-mono"
          :href="generalFeedUrl"
        >
          {{ t('rssAnomalies.subscription.general') }}
        </a>
      </aside>
    </section>

    <section class="preview">
      <div class="section-head">
        <div>
          <p class="u-eyebrow">
            {{ t('rssAnomalies.preview.eyebrow') }}
          </p>
          <h2>{{ t('rssAnomalies.preview.title') }}</h2>
        </div>
        <NuxtLink
          :to="listUrl"
          class="preview__all u-mono"
        >
          {{ t('rssAnomalies.preview.all') }} →
        </NuxtLink>
      </div>

      <div
        v-if="previewPending"
        class="preview__state"
      >
        {{ t('common.loading') }}
      </div>
      <div
        v-else-if="!previewRows.length"
        class="preview__state"
      >
        {{ t('rssAnomalies.preview.empty') }}
      </div>
      <ol
        v-else
        class="preview__list"
      >
        <li
          v-for="row in previewRows"
          :key="row._id"
        >
          <NuxtLink :to="localePath(`/contracts/${row.releaseId}`)">
            <span class="preview__severity u-mono">{{ t(`anomalies.severity.${row.severity}`) }}</span>
            <strong>{{ itemLabel(row) }}</strong>
            <span>{{ row.metadata?.buyerName }}</span>
            <time>{{ detectedAt(row.firstDetectedAt) }}</time>
          </NuxtLink>
        </li>
      </ol>
      <p class="preview__note">
        {{ t('rssAnomalies.preview.note') }}
      </p>
    </section>
  </div>
</template>

<style scoped>
.rss-page {
  padding-top: var(--s-7);
  padding-bottom: var(--s-9);
}

.hero {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(18rem, 0.75fr);
  gap: var(--s-7);
  align-items: stretch;
  margin-bottom: var(--s-8);
}

.hero__copy {
  max-width: 68ch;
}

.back {
  display: inline-block;
  margin-bottom: var(--s-6);
  color: var(--celeste-deep);
  font-size: var(--t-sm);
  text-decoration: none;
}

.back:hover,
.back:focus-visible {
  text-decoration: underline;
}

.hero h1 {
  max-width: 14ch;
  margin: var(--s-2) 0 var(--s-3);
  font-size: var(--t-3xl);
}

.hero__privacy {
  max-width: 58ch;
  margin-top: var(--s-4);
  color: var(--text-muted);
  font-size: var(--t-sm);
}

.signal {
  padding: var(--s-6);
  border-radius: var(--r-lg);
  color: var(--ink-fg);
  background: var(--ink);
  box-shadow: var(--shadow-2);
}

.signal__top {
  display: flex;
  gap: var(--s-4);
  align-items: center;
  padding-bottom: var(--s-5);
  border-bottom: 1px solid var(--ink-rule);
}

.signal__top strong {
  display: block;
  margin-top: var(--s-1);
  font-family: var(--font-display);
  font-size: var(--t-lg);
}

.signal__live {
  color: var(--ink-fg-dim);
  font-size: var(--t-xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.signal__glyph {
  position: relative;
  width: 4rem;
  height: 4rem;
  flex: 0 0 4rem;
  overflow: hidden;
}

.signal__dot,
.signal__arc {
  position: absolute;
  bottom: 0.45rem;
  left: 0.45rem;
}

.signal__dot {
  width: 0.75rem;
  height: 0.75rem;
  border-radius: 50%;
  background: var(--ink-alerta);
}

.signal__arc {
  border: 3px solid transparent;
  border-top-color: var(--ink-alerta);
  border-radius: 50%;
  transform: rotate(45deg);
  transform-origin: center;
}

.signal__arc--one {
  width: 2.25rem;
  height: 2.25rem;
  bottom: -0.3rem;
  left: -0.3rem;
}

.signal__arc--two {
  width: 4rem;
  height: 4rem;
  bottom: -1.2rem;
  left: -1.2rem;
}

.cadence {
  display: grid;
  gap: 0;
  margin: var(--s-4) 0 0;
  padding: 0;
  list-style: none;
}

.cadence li {
  display: grid;
  grid-template-columns: 4.5rem minmax(0, 1fr);
  gap: var(--s-3);
  padding: var(--s-3) 0;
  border-bottom: 1px solid var(--ink-rule);
  color: var(--ink-fg-dim);
  font-size: var(--t-sm);
}

.cadence li:last-child {
  border-bottom: 0;
}

.cadence time {
  color: var(--ink-fg);
  font-weight: 700;
}

.builder {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(19rem, 0.42fr);
  gap: var(--s-6);
  align-items: start;
  margin-bottom: var(--s-8);
}

.builder__form {
  min-width: 0;
  padding: var(--s-6);
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
  background: var(--surface);
  box-shadow: var(--shadow-1);
}

.section-head {
  display: flex;
  gap: var(--s-4);
  align-items: end;
  justify-content: space-between;
}

.section-head h2 {
  margin: var(--s-1) 0 0;
  font-size: var(--t-xl);
}

.clear {
  border: 0;
  color: var(--celeste-deep);
  background: transparent;
  cursor: pointer;
}

.clear:hover,
.clear:focus-visible {
  text-decoration: underline;
}

.filter {
  min-width: 0;
  margin: var(--s-6) 0 0;
  padding: 0;
  border: 0;
}

.filter legend,
.filter__label {
  display: block;
  margin-bottom: var(--s-2);
  color: var(--text);
  font-family: var(--font-mono);
  font-size: var(--t-sm);
  font-weight: 700;
}

.filter__help {
  margin: calc(var(--s-1) * -1) 0 var(--s-3);
  color: var(--text-muted);
  font-size: var(--t-sm);
}

.filter-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--s-4);
}

.select-wrap select {
  width: 100%;
  min-height: 2.75rem;
  padding: 0 var(--s-3);
  border: 1px solid var(--rule-strong);
  border-radius: var(--r-md);
  color: var(--text);
  background: var(--surface);
  font: inherit;
}

.select-wrap select:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--focus) 35%, transparent);
  outline-offset: 1px;
  border-color: var(--focus);
}

.optional {
  margin-top: var(--s-6);
  border-top: 1px solid var(--rule);
}

.optional summary {
  display: flex;
  gap: var(--s-3);
  align-items: baseline;
  padding: var(--s-4) 0 0;
  font-family: var(--font-mono);
  font-size: var(--t-sm);
  font-weight: 700;
  cursor: pointer;
}

.optional__hint {
  color: var(--text-muted);
  font-family: var(--font-body);
  font-weight: 400;
}

.optional__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--s-4);
}

.subscription {
  position: sticky;
  top: calc(var(--header-h) + var(--s-4));
  padding: var(--s-6);
  border: 1px solid var(--rule-strong);
  border-top: 4px solid var(--alerta);
  border-radius: var(--r-lg);
  background: var(--surface);
  box-shadow: var(--shadow-2);
}

.subscription__eyebrow {
  margin: 0 0 var(--s-2);
  color: var(--alerta);
  font-size: var(--t-xs);
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.subscription h2 {
  margin: 0;
  font-size: var(--t-xl);
}

.subscription__count {
  margin: var(--s-4) 0 var(--s-1);
  color: var(--text-muted);
}

.subscription__count strong {
  color: var(--text);
  font-size: var(--t-lg);
}

.subscription__fresh {
  margin: 0 0 var(--s-5);
  color: var(--text-muted);
  font-size: var(--t-xs);
}

.subscription__fresh strong {
  color: var(--text);
}

.url-label {
  display: block;
  margin-bottom: var(--s-2);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  font-weight: 700;
  text-transform: uppercase;
}

.url {
  width: 100%;
  min-height: 2.75rem;
  padding: 0 var(--s-3);
  border: 1px solid var(--rule);
  border-radius: var(--r-md);
  color: var(--text);
  background: var(--surface-sunken);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
}

.subscription__actions {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: var(--s-2);
  margin-top: var(--s-3);
}

.copy,
.open {
  display: inline-flex;
  min-height: 2.75rem;
  align-items: center;
  justify-content: center;
  padding: 0 var(--s-4);
  border-radius: var(--r-md);
  font-family: var(--font-mono);
  font-size: var(--t-sm);
  font-weight: 700;
  text-decoration: none;
}

.copy {
  border: 1px solid var(--cta-fill);
  color: var(--cta-fg);
  background: var(--cta-fill);
  cursor: pointer;
}

.open {
  border: 1px solid var(--rule-strong);
  color: var(--celeste-deep);
  background: var(--surface);
}

.copy:hover,
.open:hover {
  filter: brightness(0.96);
}

.copy:focus-visible,
.open:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--focus) 35%, transparent);
  outline-offset: 2px;
}

.subscription__help {
  margin: var(--s-4) 0 var(--s-3);
  color: var(--text-muted);
  font-size: var(--t-sm);
  line-height: 1.55;
}

.general {
  color: var(--celeste-deep);
  font-size: var(--t-xs);
}

.preview {
  padding-top: var(--s-7);
  border-top: 1px solid var(--rule-strong);
}

.preview__all {
  color: var(--celeste-deep);
  font-size: var(--t-sm);
  text-decoration: none;
}

.preview__all:hover {
  text-decoration: underline;
}

.preview__list {
  margin: var(--s-5) 0 0;
  padding: 0;
  border-top: 1px solid var(--rule);
  list-style: none;
}

.preview__list a {
  display: grid;
  grid-template-columns: 6rem minmax(0, 1.6fr) minmax(0, 1fr) auto;
  gap: var(--s-4);
  align-items: baseline;
  padding: var(--s-4) var(--s-2);
  border-bottom: 1px solid var(--rule);
  color: var(--text);
  text-decoration: none;
}

.preview__list a:hover {
  background: var(--surface);
}

.preview__severity {
  color: var(--alerta);
  font-size: var(--t-xs);
  font-weight: 700;
  text-transform: uppercase;
}

.preview__list strong {
  min-width: 0;
}

.preview__list span:not(.preview__severity),
.preview__list time {
  color: var(--text-muted);
  font-size: var(--t-sm);
}

.preview__state {
  margin-top: var(--s-5);
  padding: var(--s-6);
  border: 1px dashed var(--rule-strong);
  color: var(--text-muted);
  text-align: center;
}

.preview__note {
  max-width: 80ch;
  margin-top: var(--s-4);
  color: var(--text-muted);
  font-size: var(--t-sm);
}

@media (max-width: 960px) {
  .hero,
  .builder {
    grid-template-columns: 1fr;
  }

  .signal {
    max-width: 42rem;
  }

  .subscription {
    position: static;
  }

  .preview__list a {
    grid-template-columns: 5rem minmax(0, 1fr) auto;
  }

  .preview__list span:not(.preview__severity) {
    display: none;
  }
}

@media (max-width: 680px) {
  .rss-page {
    padding-top: var(--s-6);
  }

  .hero {
    gap: var(--s-5);
    margin-bottom: var(--s-7);
  }

  .signal,
  .builder__form,
  .subscription {
    padding: var(--s-5);
  }

  .filter-grid,
  .optional__grid {
    grid-template-columns: 1fr;
    gap: 0;
  }

  .section-head {
    align-items: start;
  }

  .subscription__actions {
    grid-template-columns: 1fr;
  }

  .preview__list a {
    grid-template-columns: 1fr auto;
    gap: var(--s-2);
  }

  .preview__severity {
    grid-column: 1 / -1;
  }

  .preview__all {
    max-width: 9rem;
    text-align: right;
  }
}
</style>
