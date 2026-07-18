<script setup lang="ts">
/**
 * The decisive view: price flags no explanation covers.
 *
 * The statistical detector flags a unit price far above its category baseline;
 * the second-stage AI triage (score-anomalies-ai.ts) then reads the item, the
 * whole basket, the object of the purchase and the scraped características and
 * decides whether the gap has a legitimate explanation. What survives BOTH —
 * `aiVerdict.explainable === 'no'` — is the real signal: a genuine overprice
 * with no visible justification. This page showcases exactly those, worst
 * first, with the model's reason for each, for journalists and researchers.
 */
const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const router = useRouter()

const page = ref(Number(route.query.page ?? 1))
watch(page, () => {
  router.replace({ query: page.value > 1 ? { page: String(page.value) } : {} })
})

const { data: res, pending, error } = await useFetch<any>('/api/analytics/anomalies', {
  query: computed(() => ({
    ai: 'unexplained',
    sortBy: 'divergence',
    sortOrder: 'desc',
    page: page.value,
    limit: 20,
  })),
})

const flags = computed<any[]>(() => res.value?.data?.anomalies ?? [])
const pagination = computed(() => res.value?.data?.pagination ?? null)
const total = computed<number | null>(() => pagination.value?.total ?? null)

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
function zScore(a: any): number | null {
  const z = a?.metadata?.zScore
  return typeof z === 'number' && Number.isFinite(z) ? z : null
}
function baselineN(a: any): number | null {
  const n = a?.metadata?.baselineN
  return typeof n === 'number' && n > 0 ? n : null
}
function reason(a: any): string | null {
  const v = a?.aiVerdict
  return v && v.explainable === 'no' && typeof v.reason === 'string' ? v.reason : null
}

/**
 * The usual range as one legible, non-breaking string — mirrors the alerts
 * page so "$ 4 – 12" never wraps mid-figure and the currency is stated once.
 */
function rangeLabel(a: any): string {
  const min = a?.expectedRange?.min
  const max = a?.expectedRange?.max
  if (!Number.isFinite(min) || !Number.isFinite(max)) return '—'
  const c = cur(a)
  const lo = formatMoney(min, c, { compact: true })
  const hi = formatMoney(max, c, { compact: true })
  const sym = lo.split(' ')[0]
  const hiShort = hi.startsWith(`${sym} `) ? hi.slice(sym.length + 1) : hi
  const NB = ' '
  return [lo, NB, '–', NB, hiShort].join('').split(' ').join(NB)
}

useSeo(() => ({
  title: t('seo.unexplained.title'),
  description: t('seo.unexplained.description'),
  path: '/analytics/unexplained',
}))
</script>

<template>
  <div class="u-container page">
    <header class="hero">
      <p class="u-eyebrow hero__eyebrow">
        {{ t('unexplained.eyebrow') }}
      </p>
      <div class="hero__figure">
        <span class="hero__n u-mono">{{ total !== null ? formatNumber(total) : '—' }}</span>
        <h1 class="hero__t">
          {{ t('unexplained.title') }}
        </h1>
      </div>
      <p class="u-lead hero__lead">
        {{ t('unexplained.lead') }}
      </p>
    </header>

    <section class="method">
      <p class="method__b">
        {{ t('unexplained.method') }}
      </p>
      <NuxtLink
        :to="localePath('/analytics/anomalies')"
        class="method__link"
      >
        {{ t('unexplained.allAlerts') }} →
      </NuxtLink>
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
          {{ t('unexplained.empty.title') }}
        </h2>
        <p class="state__b">
          {{ t('unexplained.empty.body') }}
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
          <NuxtLink
            :to="localePath(`/contracts/${a.releaseId}`)"
            class="flag__link"
          >
            <div class="flag__rank u-mono">
              {{ (pagination?.page ? (pagination.page - 1) * 20 : 0) + i + 1 }}
            </div>

            <div class="flag__body">
              <div class="flag__tags">
                <span
                  class="tag"
                  :class="a.severity === 'critical' ? 'tag--alerta' : 'tag--warn'"
                >{{ t(`anomalies.severity.${a.severity}`) }}</span>
                <span
                  v-if="zScore(a)"
                  class="flag__z u-mono"
                  :title="t('anomalies.zHelp')"
                >{{ t('anomalies.zBadge', { z: zScore(a)!.toFixed(0) }) }}</span>
                <span
                  v-if="baselineN(a)"
                  class="flag__n u-mono"
                >{{ t('anomalies.baseline', { n: formatNumber(baselineN(a)) }) }}</span>
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
                <span
                  v-if="a.sourceYear ?? a.metadata?.year"
                  class="u-mono"
                > · {{ a.sourceYear ?? a.metadata?.year }}</span>
              </p>

              <div class="flag__money">
                <div class="flag__fig">
                  <span class="flag__figl">{{ t('anomalies.detected') }}</span>
                  <MoneyAmount
                    :amount="a.detectedValue"
                    :currency="cur(a)"
                    compact
                  />
                </div>
                <div class="flag__fig flag__fig--range">
                  <span class="flag__figl">{{ t('anomalies.expected') }}</span>
                  <span class="flag__range u-mono">{{ rangeLabel(a) }}</span>
                </div>
              </div>

              <p
                v-if="reason(a)"
                class="flag__verdict"
              >
                <span class="flag__verdictl">{{ t('unexplained.verdict') }}</span>
                {{ reason(a) }}
              </p>
            </div>

            <v-icon
              class="flag__chev"
              size="20"
            >
              mdi-chevron-right
            </v-icon>
          </NuxtLink>
        </li>
      </ol>
    </PaginatedList>

    <p class="disclaimer">
      {{ t('unexplained.disclaimer') }}
    </p>
  </div>
</template>

<style scoped>
.page { padding-block: var(--s-6) var(--s-8); }

/* ---- Hero ---- */
.hero {
  max-width: 72ch;
  margin-bottom: var(--s-6);
}

.hero__eyebrow { color: var(--alerta); }

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
  color: var(--alerta);
  font-variant-numeric: tabular-nums;
}

.hero__t {
  margin: 0;
  font-size: var(--t-xl);
}

.hero__lead { color: var(--text-muted); }

/* ---- Method note ---- */
.method {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--s-3);
  padding: var(--s-4) var(--s-5);
  border: 1px solid var(--rule);
  border-left: 3px solid var(--alerta);
  border-radius: var(--r-lg);
  background: var(--surface);
  margin-bottom: var(--s-6);
}

.method__b {
  margin: 0;
  font-size: var(--t-sm);
  line-height: 1.6;
  color: var(--text-muted);
  max-width: 80ch;
}

.method__link {
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--celeste-deep);
  text-decoration: none;
  white-space: nowrap;
}

.method__link:hover { text-decoration: underline; }

/* ---- The list ---- */
.flags {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
}

.flag__link {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: start;
  gap: var(--s-4);
  padding: var(--s-4) var(--s-5);
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
  text-decoration: none;
  color: inherit;
  transition: border-color var(--dur) var(--ease), box-shadow var(--dur) var(--ease);
}

.flag__link:hover {
  border-color: color-mix(in srgb, var(--alerta) 50%, var(--rule));
  box-shadow: var(--shadow-2);
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

.flag__z {
  font-size: var(--t-xs);
  font-weight: 700;
  color: var(--alerta);
}

.flag__n {
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

.flag__fig {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.flag__figl {
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.flag__range {
  font-size: var(--t-sm);
  color: var(--text-muted);
  white-space: nowrap;
}

.flag__verdict {
  margin: var(--s-2) 0 0;
  padding: var(--s-3);
  border-radius: var(--r-md);
  background: color-mix(in srgb, var(--alerta) 8%, transparent);
  font-size: var(--t-sm);
  line-height: 1.5;
}

.flag__verdictl {
  display: block;
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--alerta);
  margin-bottom: 2px;
}

.flag__chev {
  color: var(--text-muted);
  align-self: center;
}

.tag--warn {
  background: color-mix(in srgb, var(--sol) 22%, transparent);
  color: var(--money);
}

/* ---- States ---- */
.state {
  text-align: center;
  padding: var(--s-8) var(--s-4);
}

.state__t { margin: 0 0 var(--s-2); }
.state__b { margin: 0; color: var(--text-muted); }

.skeleton {
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
}

.skeleton__row {
  height: 130px;
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
  .flag__link {
    grid-template-columns: auto 1fr;
    gap: var(--s-3);
  }
  .flag__chev { display: none; }
}
</style>
