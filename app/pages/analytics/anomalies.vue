<script setup lang="ts">
const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const router = useRouter()

const severity = ref((route.query.severity as string) ?? '')
const page = ref(Number(route.query.page ?? 1))

// A page number from a different filter set is meaningless.
watch([severity], () => {
  page.value = 1
})

watch([severity, page], () => {
  const q: Record<string, string> = {}
  if (severity.value) q.severity = severity.value
  if (page.value > 1) q.page = String(page.value)
  router.replace({ query: q })
})

// Worst first. Sorting by recency led with whatever the detector last
// wrote — typically "low" rows where someone paid below the usual range,
// which is the least useful thing to show a reader on arrival.
const { data: res, pending, error } = await useFetch<any>('/api/analytics/anomalies', {
  query: computed(() => ({
    limit: 20,
    page: page.value,
    sortBy: 'severity',
    sortOrder: 'desc',
    ...(severity.value ? { severity: severity.value } : {}),
  })),
})

const anomalies = computed(() => res.value?.data?.anomalies ?? [])
const pagination = computed(() => res.value?.data?.pagination ?? null)

// Only price_spike is ever generated, so severity is the only axis
// worth filtering on. Order is meaningful — worst first.
const SEVERITIES = ['critical', 'high', 'medium', 'low'] as const

/**
 * Never derive a "times over average" ratio from `expectedRange`.
 *
 * The collection holds records from two generators with incompatible
 * range semantics: the current detector (src/jobs/detect-anomalies.ts)
 * stores p25/p95 percentiles, while ~918 legacy rows from the retired
 * mean/stddev detector store avg*0.5 / avg*2. One formula cannot read
 * both, and guessing produced nonsense like "0.4× the average" on rows
 * that were flagged for being far ABOVE it.
 *
 * Everything below is a stored field. The concrete comparison — what was
 * paid against the usual range, over how many comparable items — tells
 * the story without inventing a statistic.
 */
function itemLabel(a: any): string {
  const cls = a?.metadata?.itemClassification?.description
  if (cls && cls !== 'Unknown') return cls
  const d = a?.metadata?.itemDescription
  return d && d !== 'Unknown' ? d : (a?.metadata?.buyerName ?? '—')
}

/** The record's own currency. The retired detector stamped UYU on everything. */
function cur(a: any): string {
  return a?.currency ?? a?.metadata?.currency ?? 'UYU'
}

function baselineN(a: any): number | null {
  const n = a?.metadata?.baselineN
  return typeof n === 'number' && n > 0 ? n : null
}

function unitName(a: any): string | null {
  return a?.metadata?.itemUnit?.name ?? null
}

useSeo(() => ({
  title: t('seo.anomalies.title'),
  description: t('seo.anomalies.description'),
  path: '/analytics/anomalies',
}))
</script>

<template>
  <div class="u-container page">
    <header class="head">
      <p class="u-eyebrow">
        {{ t('home.eyebrow') }}
      </p>
      <h1>{{ t('anomalies.title') }}</h1>
      <p class="u-lead">
        {{ t('anomalies.lead') }}
      </p>
    </header>

    <!-- The method, stated plainly. A flag that doesn't explain itself
         is just an accusation. -->
    <section class="method">
      <h2 class="method__t">
        {{ t('anomalies.method.title') }}
      </h2>
      <p class="method__b">
        {{ t('anomalies.method.body') }}
      </p>
      <p class="method__n">
        {{ t('anomalies.method.scope') }}
      </p>
      <p class="method__n">
        {{ t('anomalies.disclaimer') }}
      </p>
    </section>

    <div class="bar">
      <div
        class="chips"
        role="group"
        :aria-label="t('anomalies.severity.label')"
      >
        <button
          class="chip"
          :class="{ 'chip--on': !severity }"
          type="button"
          @click="severity = ''"
        >
          {{ t('common.total') }}
        </button>
        <button
          v-for="s in SEVERITIES"
          :key="s"
          class="chip"
          :class="[{ 'chip--on': severity === s }, `chip--${s}`]"
          type="button"
          :title="t(`anomalies.severityHelp.${s}`)"
          @click="severity = s"
        >
          {{ t(`anomalies.severity.${s}`) }}
        </button>
      </div>
      <p
        v-if="pagination"
        class="bar__n u-mono"
      >
        {{ formatNumber(pagination.total) }}
      </p>
    </div>

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
      v-else-if="pending && !anomalies.length"
      class="skeleton"
    >
      <div
        v-for="i in 6"
        :key="i"
        class="skeleton__row"
      />
    </div>

    <div
      v-else-if="!anomalies.length"
      class="state"
    >
      <h2 class="state__t">
        {{ t('anomalies.empty.title') }}
      </h2>
      <p class="state__b">
        {{ t('anomalies.empty.body') }}
      </p>
      <button
        v-if="severity"
        class="state__a"
        type="button"
        @click="severity = ''"
      >
        {{ t('common.clearAll') }}
      </button>
    </div>

    <ul
      v-else
      class="flags"
    >
      <li
        v-for="a in anomalies"
        :key="a._id"
        class="flags__row"
      >
        <NuxtLink
          :to="localePath(`/contracts/${a.releaseId}`)"
          class="flags__link"
        >
          <div class="flags__l">
            <div class="flags__tags">
              <span class="tag tag--alerta">{{ t(`anomalies.severity.${a.severity}`) }}</span>
              <span
                v-if="baselineN(a)"
                class="flags__x u-mono"
              >
                {{ t('anomalies.baseline', { n: formatNumber(baselineN(a)) }) }}
              </span>
            </div>
            <p class="flags__what">
              {{ itemLabel(a) }}
              <span
                v-if="unitName(a)"
                class="flags__unit u-mono"
              >{{ unitName(a) }}</span>
            </p>
            <p class="flags__who">
              {{ a.metadata?.buyerName }}
              <span v-if="a.metadata?.supplierName"> · {{ a.metadata.supplierName }}</span>
              <span
                v-if="a.sourceYear ?? a.metadata?.year"
                class="u-mono"
              > · {{ a.sourceYear ?? a.metadata?.year }}</span>
            </p>
          </div>

          <div class="flags__r">
            <div class="flags__fig">
              <span class="flags__figl">{{ t('anomalies.detected') }}</span>
              <MoneyAmount
                :amount="a.detectedValue"
                :currency="cur(a)"
                compact
              />
            </div>
            <div class="flags__fig flags__fig--exp">
              <span class="flags__figl">{{ t('anomalies.expected') }}</span>
              <span class="flags__range u-mono">
                {{ formatMoney(a.expectedRange?.min, cur(a), { compact: true }) }}–{{
                  formatMoney(a.expectedRange?.max, cur(a), { compact: true }) }}
              </span>
            </div>
          </div>
        </NuxtLink>
      </li>
    </ul>

    <nav
      v-if="pagination && pagination.totalPages > 1"
      class="pager"
      :aria-label="t('common.page')"
    >
      <button
        class="pager__b"
        type="button"
        :disabled="page <= 1"
        @click="page = Math.max(1, page - 1)"
      >
        <v-icon size="16">
          mdi-chevron-left
        </v-icon>
        {{ t('common.previous') }}
      </button>
      <span class="pager__n">
        {{ t('common.page') }} <strong>{{ page }}</strong> {{ t('common.of') }} {{ formatNumber(pagination.totalPages) }}
      </span>
      <button
        class="pager__b"
        type="button"
        :disabled="page >= pagination.totalPages"
        @click="page = page + 1"
      >
        {{ t('common.next') }}
        <v-icon size="16">
          mdi-chevron-right
        </v-icon>
      </button>
    </nav>
  </div>
</template>

<style scoped>
.page { padding-block: var(--s-6) var(--s-8); }

.head {
  max-width: 68ch;
  margin-bottom: var(--s-5);
}

.head h1 { margin: var(--s-2) 0 var(--s-3); }

/* ---- Method ---- */
.method {
  padding: var(--s-4) var(--s-5);
  border: 1px solid var(--rule);
  border-left: 3px solid var(--alerta);
  border-radius: var(--r-lg);
  background: var(--surface);
  max-width: 80ch;
}

.method__t {
  margin: 0 0 var(--s-2);
  font-size: var(--t-sm);
  font-family: var(--font-mono);
  font-weight: 500;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.method__b {
  margin: 0 0 var(--s-2);
  font-size: var(--t-sm);
  line-height: 1.6;
}

.method__n {
  margin: 0;
  font-size: var(--t-xs);
  color: var(--text-muted);
  line-height: 1.55;
}

/* ---- Filter bar ---- */
.bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-4);
  margin: var(--s-6) 0 var(--s-3);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2);
}

.chip {
  padding: var(--s-2) var(--s-3);
  border: 1px solid var(--rule);
  border-radius: var(--r-full);
  background: var(--surface);
  color: var(--text-muted);
  font-family: var(--font-body);
  font-size: var(--t-sm);
  font-weight: 500;
  cursor: pointer;
  transition: border-color var(--dur) var(--ease), color var(--dur) var(--ease);
}

.chip:hover {
  color: var(--text);
  border-color: var(--rule-strong);
}

.chip--on {
  background: var(--ink);
  border-color: var(--ink);
  color: #fff;
}

.bar__n {
  font-size: var(--t-sm);
  color: var(--text-muted);
}

/* ---- Flags ---- */
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
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-5);
  padding: var(--s-4) var(--s-5);
  text-decoration: none;
  color: inherit;
  transition: background var(--dur) var(--ease);
}

.flags__link:hover { background: var(--surface-sunken); }

.flags__l { min-width: 0; }

.flags__tags {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  margin-bottom: var(--s-2);
}

.flags__x {
  font-size: var(--t-xs);
  font-weight: 500;
  color: var(--text-muted);
}

.flags__unit {
  margin-left: var(--s-2);
  font-size: var(--t-xs);
  font-weight: 400;
  color: var(--text-muted);
}

.flags__what {
  margin: 0;
  font-size: var(--t-sm);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
}

.flags__who {
  margin: 2px 0 0;
  font-size: var(--t-xs);
  color: var(--text-muted);
}

.flags__r {
  display: flex;
  align-items: flex-start;
  gap: var(--s-5);
  flex: none;
}

.flags__fig {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}

.flags__figl {
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.flags__range {
  font-size: var(--t-xs);
  color: var(--text-muted);
  white-space: nowrap;
}

/* ---- States ---- */
.state {
  padding: var(--s-8) var(--s-5);
  text-align: center;
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
}

.state__t { margin: 0 0 var(--s-2); font-size: var(--t-lg); }

.state__b {
  margin: 0 auto var(--s-4);
  max-width: 46ch;
  color: var(--text-muted);
  font-size: var(--t-sm);
}

.state__a {
  padding: var(--s-2) var(--s-5);
  border: 0;
  border-radius: var(--r-md);
  background: var(--ink);
  color: #fff;
  font-family: var(--font-body);
  font-weight: 600;
  font-size: var(--t-sm);
  cursor: pointer;
}

.skeleton {
  display: flex;
  flex-direction: column;
  gap: 1px;
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
  overflow: hidden;
}

.skeleton__row {
  height: 82px;
  background: linear-gradient(90deg, var(--surface) 25%, var(--surface-sunken) 37%, var(--surface) 63%);
  background-size: 400% 100%;
  animation: shimmer 1.4s ease infinite;
}

@keyframes shimmer {
  0% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}

/* ---- Pager ---- */
.pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--s-4);
  margin-top: var(--s-5);
}

.pager__b {
  display: inline-flex;
  align-items: center;
  gap: var(--s-1);
  padding: var(--s-2) var(--s-4);
  border: 1px solid var(--rule-strong);
  border-radius: var(--r-md);
  background: var(--surface);
  color: var(--text);
  font-family: var(--font-body);
  font-size: var(--t-sm);
  font-weight: 600;
  cursor: pointer;
}

.pager__b:disabled { opacity: 0.4; cursor: not-allowed; }
.pager__b:not(:disabled):hover { background: var(--surface-sunken); }

.pager__n {
  font-family: var(--font-mono);
  font-size: var(--t-sm);
  color: var(--text-muted);
}

/* ---- Responsive ---- */
@media (max-width: 760px) {
  .flags__link {
    flex-direction: column;
    align-items: stretch;
    gap: var(--s-3);
  }

  .flags__r {
    justify-content: space-between;
    padding-top: var(--s-3);
    border-top: 1px dashed var(--rule);
  }

  .flags__fig { align-items: flex-start; }
}
</style>
