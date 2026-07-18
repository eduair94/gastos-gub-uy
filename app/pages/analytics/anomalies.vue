<script setup lang="ts">
const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const router = useRouter()

const severity = ref((route.query.severity as string) ?? '')
// Second-stage AI triage filter: '' | unexplained | uncertain | explainable | unscored.
const ai = ref((route.query.ai as string) ?? '')
// Ordering, and the minimum price divergence (robust z-score) to show. Default:
// worst divergence first — the point of the page is the biggest overprices, and
// divergence is relative to each item's own recent baseline, so it ranks fairly
// across years without needing an inflation adjustment (every flag here is from
// the detector's trailing 24-month window anyway).
const sort = ref((route.query.sort as string) ?? 'divergence')
const minZ = ref(Number(route.query.minZ) || 0)
// Currency of the prices shown. USD and UYU amounts are never comparable by
// magnitude and we hold no historical FX rate, so keep one currency at a time
// when the reader cares about the amounts. Empty = all (each row is still
// labelled, and divergence is per-currency so mixing is safe to read).
const currency = ref((route.query.currency as string) ?? '')
// Advanced filters (multi-select): provider, buyer ("a quién le suministran") and SICE rubro.
// Each matches its metadata field exactly and is completed in-page via the typeahead panel
// below — the values that actually carry a flag, with counts. A URL value may arrive as a single
// string (an inbound ?supplier=NAME drill-down link) or a repeated param; normalise both to an
// array. Names contain commas, so multiples travel as repeated params, never comma-joined.
function toArr(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string' && x !== '')
  return typeof v === 'string' && v ? [v] : []
}
const supplier = ref<string[]>(toArr(route.query.supplier))
const buyer = ref<string[]>(toArr(route.query.buyer))
const rubroName = ref<string[]>(toArr(route.query.rubroName))
// One contract year — still a single drill-down from the recurrence-by-year chart, no in-page
// control, so it stays a clearable chip in the banner.
const year = ref((route.query.year as string) ?? '')
const page = ref(Number(route.query.page ?? 1))

/** The active single-value drill-downs, for the clearable banner (year only — the multi-select
 *  filters show their own removable chips inside the advanced panel). */
const drills = computed(() => [
  { key: 'year', label: t('common.year'), value: year },
].filter(d => d.value.value))

/** How many advanced (multi-select) filter values are active — drives the panel's count + clear. */
const advancedCount = computed(() => supplier.value.length + buyer.value.length + rubroName.value.length)

function clearAdvanced() {
  supplier.value = []
  buyer.value = []
  rubroName.value = []
}

const SORTS: Record<string, { sortBy: string, sortOrder: string }> = {
  divergence: { sortBy: 'divergence', sortOrder: 'desc' },
  amount: { sortBy: 'amount', sortOrder: 'desc' },
  severity: { sortBy: 'severity', sortOrder: 'desc' },
  recent: { sortBy: 'createdAt', sortOrder: 'desc' },
}
/** Minimum robust deviation: any, or ≥ N× the baseline spread. */
const MINZ_STEPS = [0, 10, 25, 50] as const
/** The currencies worth a filter (EUR has a single flag). */
const CURRENCIES = ['UYU', 'USD'] as const

// A page number from a different filter/sort set is meaningless.
watch([severity, ai, sort, minZ, currency, supplier, buyer, rubroName, year], () => {
  page.value = 1
})

watch([severity, ai, sort, minZ, currency, supplier, buyer, rubroName, year, page], () => {
  // Arrays serialise to repeated params (?supplier=A&supplier=B), never comma-joined —
  // supplier/buyer names contain commas.
  const q: Record<string, string | string[]> = {}
  if (severity.value) q.severity = severity.value
  if (ai.value) q.ai = ai.value
  if (sort.value !== 'divergence') q.sort = sort.value
  if (minZ.value > 0) q.minZ = String(minZ.value)
  if (currency.value) q.currency = currency.value
  if (supplier.value.length) q.supplier = supplier.value
  if (buyer.value.length) q.buyer = buyer.value
  if (rubroName.value.length) q.rubroName = rubroName.value
  if (year.value) q.year = year.value
  if (page.value > 1) q.page = String(page.value)
  router.replace({ query: q })
})

const { data: res, pending, error } = await useFetch<any>('/api/analytics/anomalies', {
  query: computed(() => ({
    limit: 20,
    page: page.value,
    ...(SORTS[sort.value] ?? SORTS.divergence),
    ...(severity.value ? { severity: severity.value } : {}),
    ...(ai.value ? { ai: ai.value } : {}),
    ...(minZ.value > 0 ? { minZ: minZ.value } : {}),
    ...(currency.value ? { currency: currency.value } : {}),
    ...(supplier.value.length ? { supplier: supplier.value } : {}),
    ...(buyer.value.length ? { buyer: buyer.value } : {}),
    ...(rubroName.value.length ? { rubroName: rubroName.value } : {}),
    ...(year.value ? { year: year.value } : {}),
  })),
})

const anomalies = computed(() => res.value?.data?.anomalies ?? [])
const pagination = computed(() => res.value?.data?.pagination ?? null)

// Only price_spike is ever generated, so severity is the only axis
// worth filtering on. Order is meaningful — worst first.
const SEVERITIES = ['critical', 'high', 'medium', 'low'] as const

// Second-stage AI triage buckets. 'unexplained' first — it is the point of the
// layer: the flags no legitimate explanation covers. See score-anomalies-ai.ts.
const AI_FILTERS = ['unexplained', 'uncertain', 'explainable', 'unscored'] as const

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

/** Robust price divergence (z-score) — how far above its baseline the price sits. */
function zScore(a: any): number | null {
  const z = a?.metadata?.zScore
  return typeof z === 'number' && Number.isFinite(z) ? z : null
}

/**
 * The second-stage AI verdict, when present. Advisory: it annotates the
 * statistical flag, never replaces it. `explainable: 'no'` is the real signal.
 * Now carries the journalist-facing detail: analysis, evidence, documents.
 */
function aiOf(a: any): {
  explainable: string
  category: string
  reason: string
  analysis?: string
  evidence?: string[]
  confidence: number
  usedFeatures?: number
  documents?: { type?: string, url: string, format?: string }[]
  model?: string
  scoredAt?: string
} | null {
  const v = a?.aiVerdict
  return v && typeof v.explainable === 'string' ? v : null
}

/** The verdict's confidence as a whole percent, or null. */
function aiConfidencePct(a: any): number | null {
  const c = aiOf(a)?.confidence
  return typeof c === 'number' && Number.isFinite(c) ? Math.round(c * 100) : null
}

/** Evidence bullet points the model returned. */
function aiEvidence(a: any): string[] {
  const e = aiOf(a)?.evidence
  return Array.isArray(e) ? e.filter(x => typeof x === 'string' && x.trim()) : []
}

/** Attached contract documents (resolutions, pliegos) — links a journalist can open. */
function aiDocs(a: any): { type?: string, url: string, format?: string }[] {
  const d = aiOf(a)?.documents
  return Array.isArray(d) ? d.filter(x => x && typeof x.url === 'string') : []
}

/** When the verdict was produced, as YYYY-MM-DD (UTC — deadlines here are Uruguayan wall-clock). */
function aiScoredAt(a: any): string | null {
  const s = aiOf(a)?.scoredAt
  if (!s) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

/**
 * The usual range, as one legible string.
 *
 * Interpolating the two figures either side of a bare en-dash produced
 * "$ 135–$ 102.275": no breathing room, the currency stated twice, and
 * the template's own newlines leaking in as stray spaces. Build it in
 * script instead — thin spaces around the dash, currency once, and
 * non-breaking so the range never wraps in half.
 */
const DASH = '\u2013'

function rangeLabel(a: any): string {
  const min = a?.expectedRange?.min
  const max = a?.expectedRange?.max
  if (!Number.isFinite(min) || !Number.isFinite(max)) return '—'

  const c = cur(a)
  const lo = formatMoney(min, c, { compact: true })
  const hi = formatMoney(max, c, { compact: true })

  // Drop the repeated symbol when both sides carry the same one:
  // "$ 135 – 102 mil" reads better than "$ 135 – $ 102 mil".
  const sym = lo.split(' ')[0]
  const hiShort = hi.startsWith(`${sym} `) ? hi.slice(sym.length + 1) : hi

  // Non-breaking throughout, written as an escape: a literal U+00A0 in
  // source is invisible to the next reader and trips no-irregular-whitespace.
  const NB = '\u00A0'
  return [lo, NB, DASH, NB, hiShort].join('').split(' ').join(NB)
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
      <div class="head__ctas">
        <NuxtLink
          :to="localePath('/analytics/unexplained')"
          class="head__cta"
        >
          {{ t('anomalies.seeUnexplained') }} →
        </NuxtLink>
        <NuxtLink
          :to="localePath('/analytics/proveedores-anomalias')"
          class="head__cta head__cta--alt"
        >
          {{ t('anomalies.seeProviders') }} →
        </NuxtLink>
      </div>
    </header>

    <!-- Drill-down banner for single-value scopes with no in-page control (currently the contract
         year, from the recurrence-by-year chart). Provider / buyer / rubro moved to the advanced
         filters panel below, where they show their own removable chips. Clearable. -->
    <div
      v-if="drills.length"
      class="supbar"
    >
      <span
        v-for="d in drills"
        :key="d.key"
        class="supbar__item"
      >
        <span class="supbar__l u-mono">{{ d.label }}</span>
        <strong class="supbar__n">{{ d.value.value }}</strong>
        <button
          class="supbar__x"
          type="button"
          :aria-label="t('common.clear')"
          @click="d.value.value = ''"
        >✕</button>
      </span>
    </div>

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

    <!-- Second-stage AI triage filter. Separate row because it is a different
         axis from severity: it splits the same flags by whether an LLM found a
         legitimate explanation, isolating the genuinely unexplained ones. -->
    <div
      class="aibar"
      role="group"
      :aria-label="t('anomalies.ai.label')"
    >
      <span class="aibar__l u-mono">{{ t('anomalies.ai.label') }}</span>
      <div class="chips">
        <button
          class="chip"
          :class="{ 'chip--on': !ai }"
          type="button"
          @click="ai = ''"
        >
          {{ t('anomalies.ai.filter.all') }}
        </button>
        <button
          v-for="f in AI_FILTERS"
          :key="f"
          class="chip"
          :class="[{ 'chip--on': ai === f }, f === 'unexplained' ? 'chip--critical' : '']"
          type="button"
          @click="ai = f"
        >
          {{ t(`anomalies.ai.filter.${f}`) }}
        </button>
      </div>
    </div>

    <!-- Ordering + minimum divergence — how a reader hunts the worst overprices. -->
    <div class="controls">
      <label class="controls__sort">
        <span class="controls__l u-mono">{{ t('anomalies.sort.label') }}</span>
        <select
          v-model="sort"
          class="controls__select"
        >
          <option value="divergence">
            {{ t('anomalies.sort.divergence') }}
          </option>
          <option value="amount">
            {{ t('anomalies.sort.amount') }}
          </option>
          <option value="severity">
            {{ t('anomalies.sort.severity') }}
          </option>
          <option value="recent">
            {{ t('anomalies.sort.recent') }}
          </option>
        </select>
      </label>

      <div
        class="controls__minz"
        role="group"
        :aria-label="t('anomalies.minZ.label')"
      >
        <span class="controls__l u-mono">{{ t('anomalies.minZ.label') }}</span>
        <button
          v-for="z in MINZ_STEPS"
          :key="z"
          class="chip chip--sm"
          :class="{ 'chip--on': minZ === z }"
          type="button"
          @click="minZ = z"
        >
          {{ z === 0 ? t('anomalies.minZ.any') : t('anomalies.minZ.step', { z }) }}
        </button>
      </div>

      <div
        class="controls__cur"
        role="group"
        :aria-label="t('anomalies.currency.label')"
      >
        <span class="controls__l u-mono">{{ t('anomalies.currency.label') }}</span>
        <button
          class="chip chip--sm"
          :class="{ 'chip--on': !currency }"
          type="button"
          @click="currency = ''"
        >
          {{ t('anomalies.currency.all') }}
        </button>
        <button
          v-for="cx in CURRENCIES"
          :key="cx"
          class="chip chip--sm"
          :class="{ 'chip--on': currency === cx }"
          type="button"
          @click="currency = cx"
        >
          {{ cx }}
        </button>
      </div>
    </div>

    <!-- Advanced filters. Typeaheads over the values that actually carry a flag (supplier, buyer,
         rubro) with their counts — so a reader can narrow to "this provider", "sold to this
         organism", or "in this rubro" in-page, not only via a query-param drill-down. Multi-select;
         each shows its own removable chips. Reuses the shared EntityAutocomplete (same core as the
         contracts filter rail). -->
    <section class="adv">
      <div class="adv__head">
        <span class="adv__t u-mono">{{ t('anomalies.filters.advanced') }}</span>
        <button
          v-if="advancedCount"
          class="adv__clear u-mono"
          type="button"
          @click="clearAdvanced"
        >
          {{ t('common.clearAll') }} ({{ advancedCount }})
        </button>
      </div>
      <div class="adv__grid">
        <div class="adv__field">
          <label class="adv__l u-mono">{{ t('filters.supplier') }}</label>
          <AnomalyFacetAutocomplete
            :model-value="supplier"
            field="supplierName"
            :placeholder="t('anomalies.filters.supplierPlaceholder')"
            @update:model-value="v => supplier = v"
          />
        </div>
        <div class="adv__field">
          <label class="adv__l u-mono">{{ t('anomalies.filters.buyerLabel') }}</label>
          <AnomalyFacetAutocomplete
            :model-value="buyer"
            field="buyerName"
            :placeholder="t('anomalies.filters.buyerPlaceholder')"
            @update:model-value="v => buyer = v"
          />
        </div>
        <div class="adv__field">
          <label class="adv__l u-mono">{{ t('provAnom.rubro.label') }}</label>
          <AnomalyFacetAutocomplete
            :model-value="rubroName"
            field="rubroName"
            :placeholder="t('anomalies.filters.rubroPlaceholder')"
            @update:model-value="v => rubroName = v"
          />
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
            class="flags__link u-splitrow"
          >
            <div class="flags__l">
              <div class="flags__tags">
                <span class="tag tag--alerta">{{ t(`anomalies.severity.${a.severity}`) }}</span>
                <span
                  v-if="zScore(a)"
                  class="flags__z u-mono"
                  :title="t('anomalies.zHelp')"
                >{{ t('anomalies.zBadge', { z: zScore(a)!.toFixed(0) }) }}</span>
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

              <!-- Advisory AI verdict, compact. Accent when unexplained (the real signal),
                 muted when the LLM found a plausible explanation. -->
              <p
                v-if="aiOf(a)"
                class="flags__ai"
                :class="`flags__ai--${aiOf(a)!.explainable}`"
              >
                <span class="flags__aiv">{{ t(`anomalies.ai.verdict.${aiOf(a)!.explainable}`) }}</span>
                <span class="flags__aicat">{{ t(`anomalies.ai.category.${aiOf(a)!.category}`) }}</span>
                <span
                  v-if="aiConfidencePct(a) !== null"
                  class="flags__aiconf u-mono"
                  :title="t('anomalies.confidence')"
                >{{ aiConfidencePct(a) }}%</span>
              </p>
              <p
                v-if="aiOf(a)?.reason"
                class="flags__air"
              >
                {{ aiOf(a)!.reason }}
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
                <span class="flags__range u-mono">{{ rangeLabel(a) }}</span>
              </div>
            </div>
          </NuxtLink>

          <!-- Journalist/researcher detail: the full AI analysis, the checkable
               evidence, the source documents, and the provenance. Kept OUTSIDE the
               NuxtLink so expanding it never navigates away. -->
          <v-expansion-panels
            v-if="aiOf(a) && (aiOf(a)!.analysis || aiEvidence(a).length || aiDocs(a).length)"
            class="aidet"
            variant="accordion"
            flat
          >
            <v-expansion-panel :ripple="false">
              <v-expansion-panel-title :ripple="false">
                {{ t('anomalies.ai.detailsToggle') }}
              </v-expansion-panel-title>
              <v-expansion-panel-text>
                <div class="aidet__b">
                  <p
                    v-if="aiOf(a)!.analysis"
                    class="aidet__analysis"
                  >
                    {{ aiOf(a)!.analysis }}
                  </p>

                  <div v-if="aiEvidence(a).length">
                    <p class="aidet__h">
                      {{ t('anomalies.ai.evidence') }}
                    </p>
                    <ul class="aidet__list">
                      <li
                        v-for="(e, i) in aiEvidence(a)"
                        :key="`e${i}`"
                      >
                        {{ e }}
                      </li>
                    </ul>
                  </div>

                  <div v-if="aiDocs(a).length">
                    <p class="aidet__h">
                      {{ t('anomalies.ai.documents') }}
                    </p>
                    <ul class="aidet__list">
                      <li
                        v-for="(d, i) in aiDocs(a)"
                        :key="`d${i}`"
                      >
                        <a
                          :href="d.url"
                          target="_blank"
                          rel="noopener nofollow"
                        >{{ d.type || t('anomalies.ai.document') }}</a>
                        <span
                          v-if="d.format"
                          class="aidet__fmt u-mono"
                        >{{ d.format }}</span>
                      </li>
                    </ul>
                  </div>

                  <p class="aidet__meta u-mono">
                    <span v-if="aiOf(a)!.usedFeatures">{{ t('anomalies.ai.usedFeatures', { n: aiOf(a)!.usedFeatures }) }} · </span>
                    <span>{{ aiOf(a)!.model }}</span>
                    <span v-if="aiScoredAt(a)"> · {{ aiScoredAt(a) }}</span>
                  </p>
                  <p class="aidet__note">
                    {{ t('anomalies.ai.note') }}
                  </p>
                </div>
              </v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>

          <!-- Community feedback: is this a real anomaly or a false positive?
               Kept OUTSIDE the NuxtLink so voting never navigates away. -->
          <AnomalyFeedback
            :anomaly-id="String(a._id)"
            :up="a.feedback?.up ?? 0"
            :down="a.feedback?.down ?? 0"
            :my-vote="a.feedback?.myVote ?? null"
            :my-comment="a.feedback?.myComment ?? null"
          />
        </li>
      </ul>
    </PaginatedList>
  </div>
</template>

<style scoped>
.page { padding-block: var(--s-6) var(--s-8); }

.head {
  max-width: 68ch;
  margin-bottom: var(--s-5);
}

.head h1 { margin: var(--s-2) 0 var(--s-3); }

.head__ctas {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2) var(--s-5);
  margin-top: var(--s-3);
}

.head__cta {
  display: inline-block;
  font-family: var(--font-mono);
  font-size: var(--t-sm);
  font-weight: 600;
  color: var(--alerta);
  text-decoration: none;
}

.head__cta--alt { color: var(--celeste-deep); }

.head__cta:hover { text-decoration: underline; }

/* ---- Provider drill-down banner ---- */
.supbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--s-2) var(--s-3);
  margin: var(--s-5) 0 var(--s-5);
  padding: var(--s-3) var(--s-4);
  border: 1px solid var(--rule);
  border-left: 3px solid var(--celeste);
  border-radius: var(--r-md);
  background: var(--surface);
}

.supbar__item {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  padding: var(--s-1) var(--s-1) var(--s-1) var(--s-3);
  border: 1px solid var(--rule);
  border-radius: var(--r-full);
  background: var(--surface-sunken);
}

.supbar__l {
  font-size: var(--t-xs);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.supbar__n {
  font-size: var(--t-sm);
  min-width: 0;
}

.supbar__x {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: 0;
  border-radius: var(--r-full);
  background: transparent;
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  line-height: 1;
  cursor: pointer;
}

.supbar__x:hover { color: #fff; background: var(--alerta); }

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

/* ---- AI triage filter bar ---- */
.aibar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--s-2) var(--s-3);
  margin: 0 0 var(--s-4);
}

.aibar__l {
  font-size: var(--t-xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
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

/* Layout (flex, top-alignment, grow/fixed split, responsive stack) comes
   from the shared .u-splitrow utility — see app/DESIGN.md. Only the row's
   own skin lives here. */
.flags__link {
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
  flex-wrap: wrap;
  gap: var(--s-2);
  margin-bottom: var(--s-2);
}

.flags__x {
  font-size: var(--t-xs);
  font-weight: 500;
  color: var(--text-muted);
}

.flags__z {
  font-size: var(--t-xs);
  font-weight: 700;
  color: var(--alerta);
}

/* ---- Controls: sort + minimum divergence ---- */
.controls {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--s-4) var(--s-6);
  margin-bottom: var(--s-5);
}

.controls__sort {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
}

.controls__l {
  font-size: var(--t-xs);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.controls__select {
  padding: var(--s-2) var(--s-3);
  border: 1px solid var(--rule-strong);
  border-radius: var(--r-md);
  background: var(--surface);
  color: var(--text);
  font-family: var(--font-body);
  font-size: var(--t-sm);
  font-weight: 600;
  cursor: pointer;
}

.controls__minz,
.controls__cur {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--s-2);
}

.chip--sm {
  padding: var(--s-1) var(--s-3);
  font-size: var(--t-xs);
}

/* ---- Advanced filters (supplier / buyer / rubro typeaheads) ---- */
.adv {
  margin-bottom: var(--s-6);
  padding: var(--s-4) var(--s-5);
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
  background: var(--surface);
}

.adv__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-3);
  margin-bottom: var(--s-3);
}

.adv__t {
  font-size: var(--t-xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.adv__clear {
  padding: var(--s-1) var(--s-3);
  border: 1px solid var(--rule-strong);
  border-radius: var(--r-full);
  background: transparent;
  color: var(--text-muted);
  font-size: var(--t-xs);
  cursor: pointer;
  transition: color var(--dur) var(--ease), border-color var(--dur) var(--ease);
}

.adv__clear:hover {
  color: var(--text);
  border-color: var(--text-muted);
}

.adv__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: var(--s-3) var(--s-4);
}

.adv__field {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  min-width: 0;
}

.adv__l {
  font-size: var(--t-xs);
  letter-spacing: 0.06em;
  text-transform: uppercase;
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

/* ---- AI verdict line ---- */
.flags__ai {
  display: flex;
  flex-wrap: wrap;
  /* Centre, not baseline: the bordered pills and the bare "95%" have
     different box heights, and baseline-aligning them left the percent
     sitting a few px below the pill caps. */
  align-items: center;
  gap: var(--s-1) var(--s-2);
  margin: var(--s-3) 0 0;
  font-size: var(--t-xs);
  line-height: 1.5;
}

.flags__aiv {
  flex: none;
  font-weight: 600;
  padding: 1px var(--s-2);
  border-radius: var(--r-full);
  border: 1px solid var(--rule);
  color: var(--text-muted);
}

.flags__air {
  /* A <p>: zero the UA block margin (it was leaking ~16px above and below
     the reason and pushing the card out) and set the gap in tokens. */
  margin: var(--s-2) 0 0;
  color: var(--text-muted);
  min-width: 0;
  /* Cap the measure so a long reason stays readable instead of running the
     full ~950px of the identity column on a wide screen. */
  max-width: 80ch;
  line-height: 1.55;
}

/* Unexplained = the real signal: accent it with the same "alerta" hue as the severity tag. */
.flags__ai--no .flags__aiv {
  color: var(--alerta);
  border-color: color-mix(in srgb, var(--alerta) 40%, transparent);
  background: color-mix(in srgb, var(--alerta) 10%, transparent);
}

.flags__ai--no .flags__air { color: var(--text); }

.flags__aicat {
  flex: none;
  font-size: var(--t-xs);
  color: var(--text-muted);
  padding: 1px var(--s-2);
  border-radius: var(--r-full);
  background: var(--surface-sunken);
}

.flags__aiconf {
  flex: none;
  font-size: var(--t-xs);
  color: var(--text-muted);
}

/* ---- Journalist detail: a Vuetify expansion panel, stripped of its card
   chrome so it reads as a continuation of the alert row, not a floating card
   (outside the row link, so opening it never navigates). ---- */
.aidet {
  border-top: 1px dashed var(--rule);
  font-size: var(--t-sm);
}

.aidet :deep(.v-expansion-panel),
.aidet :deep(.v-expansion-panels) {
  background: transparent;
  border-radius: 0;
}

.aidet :deep(.v-expansion-panel__shadow) { display: none; }
.aidet :deep(.v-expansion-panel::after) { display: none; }
.aidet :deep(.v-expansion-panel-title__overlay) { opacity: 0; }

.aidet :deep(.v-expansion-panel-title) {
  min-height: 0;
  padding: var(--s-3) var(--s-5);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

.aidet :deep(.v-expansion-panel-title:hover),
.aidet :deep(.v-expansion-panel-title--active) { color: var(--text); }

.aidet :deep(.v-expansion-panel-text__wrapper) {
  padding: 0 var(--s-5) var(--s-4);
}

.aidet__b {
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
}

.aidet__analysis {
  margin: 0;
  line-height: 1.6;
  color: var(--text);
}

.aidet__h {
  margin: 0 0 var(--s-1);
  font-size: var(--t-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
}

.aidet__list {
  margin: 0;
  padding-left: var(--s-4);
  display: flex;
  flex-direction: column;
  gap: 2px;
  line-height: 1.55;
}

.aidet__list a {
  color: var(--alerta);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.aidet__fmt {
  margin-left: var(--s-2);
  font-size: var(--t-xs);
  color: var(--text-muted);
}

.aidet__meta {
  margin: 0;
  font-size: var(--t-xs);
  color: var(--text-muted);
}

.aidet__note {
  margin: 0;
  font-size: var(--t-xs);
  color: var(--text-muted);
  font-style: italic;
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

/* ---- Responsive ---- */
/* The row itself stacks via .u-splitrow's own breakpoint; only the
   figures block needs page-specific treatment once stacked. */
@media (max-width: 760px) {
  .flags__r {
    justify-content: space-between;
    padding-top: var(--s-3);
    border-top: 1px dashed var(--rule);
  }

  .flags__fig { align-items: flex-start; }
}
</style>
