<script setup lang="ts">
/**
 * Proveedores detrás de las alertas sin explicación.
 *
 * Cross-references the flags the AI could not explain (aiVerdict.explainable = 'no', the same set
 * as /analytics/anomalies?ai=unexplained) against the providers that receive them. Reads the
 * precomputed provider_anomaly_stats + summary (rebuilt every 24h by cross-provider-anomalies.ts);
 * nothing is aggregated on the request path. Each provider row drills back to its own flags on the
 * anomalies page by name.
 */
const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const router = useRouter()

// Ordering: most flags first (the point of the page — who repeats), then biggest estimated
// overprice, then worst price divergence.
const sort = ref((route.query.sort as string) ?? 'flags')
// Minimum flags — isolate providers that repeat rather than a single one-off flag.
const minFlags = ref(Number(route.query.minFlags) || 0)
const rubro = ref((route.query.rubro as string) ?? '')
const currency = ref((route.query.currency as string) ?? '')
// Only the captive providers — every flag from a single buyer (the strongest pattern signal).
const captive = ref(route.query.captive === 'true')
const page = ref(Number(route.query.page ?? 1))

const SORTS: Record<string, { sortBy: string, sortOrder: string }> = {
  flags: { sortBy: 'flags', sortOrder: 'desc' },
  overprice: { sortBy: 'overprice', sortOrder: 'desc' },
  worstZ: { sortBy: 'worstZ', sortOrder: 'desc' },
}
/** Minimum flags: any, or ≥ N. */
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

const { data: res, pending, error } = await useFetch<any>('/api/analytics/provider-anomalies', {
  query: computed(() => ({
    limit: 20,
    page: page.value,
    ...(SORTS[sort.value] ?? SORTS.flags),
    ...(minFlags.value > 0 ? { minFlags: minFlags.value } : {}),
    ...(rubro.value ? { rubro: rubro.value } : {}),
    ...(currency.value ? { currency: currency.value } : {}),
    ...(captive.value ? { captive: 'true' } : {}),
  })),
})

const providers = computed(() => res.value?.data?.providers ?? [])
const summary = computed(() => res.value?.data?.summary ?? null)
const pagination = computed(() => res.value?.data?.pagination ?? null)

/** Rubro filter options — the SICE top levels actually present, most frequent first. */
const rubroOptions = computed<string[]>(() =>
  (summary.value?.rubroTotals ?? []).slice(0, 6).map((r: any) => r.rubro).filter((r: string) => r && r !== '—'))

/** A rubro label, humanised (the join sentinel becomes "sin rubro"). */
function rubroLabel(r?: string): string {
  return !r || r === '—' ? t('provAnom.rubroUnknown') : r
}
/** Share of all flags in the dominant rubro, as a whole percent. */
const topRubroPct = computed<number | null>(() => {
  const s = summary.value
  if (!s?.flagTotal || !s?.rubroTotals?.length) return null
  return Math.round((s.rubroTotals[0].count / s.flagTotal) * 100)
})

/** The provider's flags on the anomalies page — the drill-down (by name, the only supplier key). */
function drillTo(name: string) {
  return localePath({ path: '/analytics/anomalies', query: { ai: 'unexplained', supplier: name } })
}
/** Robust divergence badge; the detector caps the z-score at 1000. */
function zBadge(z?: number): string {
  if (!z || z <= 0) return '—'
  return z >= 1000 ? t('provAnom.zCapped') : t('anomalies.zBadge', { z: String(z) })
}
function topRubroOf(p: any): string {
  return rubroLabel(p?.rubros?.[0]?.rubro)
}

// ---- Chart data (all from the stable summary, independent of the table's paging) --------------
const provBars = computed(() =>
  (summary.value?.topProviders ?? []).map((p: any) => ({
    label: p.supplierName,
    value: p.flagCount,
    color: 'alerta',
    sub: p.captive ? t('provAnom.captiveTag') : undefined,
  })))
const buyerBars = computed(() =>
  (summary.value?.topBuyers ?? []).slice(0, 10).map((b: any) => ({
    label: b.buyerName,
    value: b.count,
    color: 'celeste',
    sub: t('provAnom.buyerSub', { n: b.providerCount }),
  })))
const rubroBars = computed(() =>
  (summary.value?.rubroTotals ?? []).slice(0, 6).map((r: any) => ({
    label: rubroLabel(r.rubro),
    value: r.count,
    color: 'celeste',
  })))
const yearData = computed(() =>
  (summary.value?.yearTotals ?? []).map((y: any) => ({ year: y.year, value: y.count })))
const topPairs = computed(() => (summary.value?.topPairs ?? []).slice(0, 8))

useSeo(() => ({
  title: t('seo.providerAnomalies.title'),
  description: t('seo.providerAnomalies.description'),
  path: '/analytics/proveedores-anomalias',
}))
</script>

<template>
  <div class="u-container page">
    <header class="head">
      <p class="u-eyebrow">
        {{ t('home.eyebrow') }}
      </p>
      <h1>{{ t('provAnom.title') }}</h1>
      <p class="u-lead">
        {{ t('provAnom.lead') }}
      </p>
      <NuxtLink
        :to="localePath('/analytics/anomalies?ai=unexplained')"
        class="head__cta"
      >
        {{ t('provAnom.seeFlags') }} →
      </NuxtLink>
    </header>

    <section class="method">
      <h2 class="method__t">
        {{ t('provAnom.method.title') }}
      </h2>
      <p class="method__b">
        {{ t('provAnom.method.body') }}
      </p>
      <p class="method__n">
        {{ t('provAnom.method.overprice') }}
      </p>
      <p
        v-if="summary && summary.clampedFlags > 0"
        class="method__n"
      >
        {{ t('provAnom.method.clamped', { n: summary.clampedFlags }) }}
      </p>
      <p class="method__n">
        {{ t('anomalies.disclaimer') }}
      </p>
    </section>

    <!-- KPI summary — the headline before the detail. -->
    <section
      v-if="summary"
      class="kpis"
    >
      <div class="kpi">
        <span class="kpi__n u-mono kpi__n--alert">{{ formatNumber(summary.flagTotal) }}</span>
        <span class="kpi__l">{{ t('provAnom.kpi.flags') }}</span>
      </div>
      <div class="kpi">
        <span class="kpi__n u-mono">{{ formatNumber(summary.providerCount) }}</span>
        <span class="kpi__l">{{ t('provAnom.kpi.providers') }}</span>
      </div>
      <div class="kpi">
        <span class="kpi__n u-mono">{{ formatNumber(summary.captiveCount) }}</span>
        <span class="kpi__l">{{ t('provAnom.kpi.captive') }}</span>
      </div>
      <div class="kpi">
        <span class="kpi__n u-mono">{{ topRubroPct !== null ? `${topRubroPct}%` : '—' }}</span>
        <span class="kpi__l">{{ t('provAnom.kpi.topRubro') }}</span>
      </div>
    </section>

    <!-- Controls -->
    <div class="controls">
      <label class="controls__sort">
        <span class="controls__l u-mono">{{ t('anomalies.sort.label') }}</span>
        <select
          v-model="sort"
          class="controls__select"
        >
          <option value="flags">
            {{ t('provAnom.sort.flags') }}
          </option>
          <option value="overprice">
            {{ t('provAnom.sort.overprice') }}
          </option>
          <option value="worstZ">
            {{ t('provAnom.sort.worstZ') }}
          </option>
        </select>
      </label>

      <div
        class="controls__grp"
        role="group"
        :aria-label="t('provAnom.minFlags.label')"
      >
        <span class="controls__l u-mono">{{ t('provAnom.minFlags.label') }}</span>
        <button
          v-for="n in MINFLAGS_STEPS"
          :key="n"
          class="chip chip--sm"
          :class="{ 'chip--on': minFlags === n }"
          type="button"
          @click="minFlags = n"
        >
          {{ n === 0 ? t('anomalies.minZ.any') : t('provAnom.minFlags.step', { n }) }}
        </button>
      </div>

      <button
        class="chip chip--sm chip--captive"
        :class="{ 'chip--on': captive }"
        type="button"
        :title="t('provAnom.captiveHelp')"
        @click="captive = !captive"
      >
        {{ t('provAnom.captiveOnly') }}
      </button>

      <div
        v-if="rubroOptions.length"
        class="controls__grp"
        role="group"
        :aria-label="t('provAnom.rubro.label')"
      >
        <span class="controls__l u-mono">{{ t('provAnom.rubro.label') }}</span>
        <button
          class="chip chip--sm"
          :class="{ 'chip--on': !rubro }"
          type="button"
          @click="rubro = ''"
        >
          {{ t('common.total') }}
        </button>
        <button
          v-for="r in rubroOptions"
          :key="r"
          class="chip chip--sm"
          :class="{ 'chip--on': rubro === r }"
          type="button"
          @click="rubro = r"
        >
          {{ rubroLabel(r) }}
        </button>
      </div>

      <div
        class="controls__grp"
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

    <!-- Watchlist -->
    <PaginatedList
      v-model:page="page"
      :total-pages="pagination?.totalPages ?? 1"
    >
      <div
        v-if="error"
        class="state"
      >
        <h2 class="state__t">
          {{ t('provAnom.notReady.title') }}
        </h2>
        <p class="state__b">
          {{ t('provAnom.notReady.body') }}
        </p>
      </div>

      <div
        v-else-if="pending && !providers.length"
        class="skeleton"
      >
        <div
          v-for="i in 8"
          :key="i"
          class="skeleton__row"
        />
      </div>

      <div
        v-else-if="!providers.length"
        class="state"
      >
        <h2 class="state__t">
          {{ t('provAnom.empty.title') }}
        </h2>
        <p class="state__b">
          {{ t('provAnom.empty.body') }}
        </p>
        <button
          v-if="minFlags || rubro || currency || captive"
          class="state__a"
          type="button"
          @click="minFlags = 0; rubro = ''; currency = ''; captive = false"
        >
          {{ t('common.clearAll') }}
        </button>
      </div>

      <div
        v-else
        class="tablecard"
      >
        <div class="tscroll">
          <table class="wl">
            <thead>
              <tr>
                <th class="wl__rank">
                  #
                </th>
                <th>{{ t('provAnom.col.provider') }}</th>
                <th class="wl__num">
                  {{ t('provAnom.col.flags') }}
                </th>
                <th class="wl__num">
                  {{ t('provAnom.col.overprice') }}
                </th>
                <th class="wl__num">
                  {{ t('provAnom.col.worstZ') }}
                </th>
                <th>{{ t('provAnom.col.topBuyer') }}</th>
                <th aria-hidden="true" />
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(p, i) in providers"
                :key="p._id"
              >
                <td class="wl__rank u-mono">
                  {{ (pagination ? (pagination.page - 1) * pagination.limit : 0) + i + 1 }}
                </td>
                <td class="wl__prov">
                  <NuxtLink
                    :to="drillTo(p.supplierName)"
                    class="wl__provlink"
                  >
                    {{ p.supplierName }}
                  </NuxtLink>
                  <div class="wl__tags">
                    <span
                      v-if="p.captive"
                      class="tag tag--captive"
                      :title="t('provAnom.captiveHelp')"
                    >{{ t('provAnom.captiveBadge', { n: p.topBuyerCount }) }}</span>
                    <span class="tag">{{ topRubroOf(p) }}</span>
                    <span
                      v-if="p.firstYear"
                      class="tag tag--year u-mono"
                    >{{ p.firstYear === p.lastYear ? p.firstYear : `${p.firstYear}–${p.lastYear}` }}</span>
                  </div>
                </td>
                <td class="wl__num">
                  <span class="wl__flags">
                    <span class="wl__stripe" />
                    <span class="wl__flagn u-mono">{{ p.flagCount }}</span>
                  </span>
                </td>
                <td class="wl__num">
                  <MoneyAmount
                    :amount="p.primaryOverprice"
                    :currency="p.primaryCurrency"
                    compact
                  />
                </td>
                <td class="wl__num">
                  <span class="wl__z u-mono">{{ zBadge(p.worstZ) }}</span>
                </td>
                <td class="wl__buyer">
                  <span class="wl__buyern">{{ p.topBuyer }}</span>
                  <span
                    v-if="p.buyerCount > 1"
                    class="wl__buyerc u-mono"
                  >{{ t('provAnom.ofBuyers', { n: p.buyerCount }) }}</span>
                </td>
                <td class="wl__go">
                  <NuxtLink
                    :to="drillTo(p.supplierName)"
                    class="wl__golink u-mono"
                  >
                    {{ t('provAnom.seeItsFlags') }} →
                  </NuxtLink>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </PaginatedList>

    <!-- Pattern panels -->
    <section
      v-if="summary"
      class="patterns"
    >
      <div class="patterns__head">
        <h2>{{ t('provAnom.patterns.title') }}</h2>
        <p class="patterns__note">
          {{ t('provAnom.patterns.note') }}
        </p>
      </div>

      <div class="pgrid">
        <div class="panel">
          <h3 class="panel__t">
            {{ t('provAnom.panel.concentration') }}
          </h3>
          <p class="panel__s">
            {{ t('provAnom.panel.concentrationSub') }}
          </p>
          <div class="chartscroll">
            <InvHBars
              :items="provBars"
              format="count"
              :row-height="30"
            />
          </div>
        </div>

        <div class="panel">
          <h3 class="panel__t">
            {{ t('provAnom.panel.buyers') }}
          </h3>
          <p class="panel__s">
            {{ t('provAnom.panel.buyersSub') }}
          </p>
          <div class="chartscroll">
            <InvHBars
              :items="buyerBars"
              format="count"
              :row-height="30"
            />
          </div>
        </div>

        <div class="panel">
          <h3 class="panel__t">
            {{ t('provAnom.panel.pairs') }}
          </h3>
          <p class="panel__s">
            {{ t('provAnom.panel.pairsSub') }}
          </p>
          <ul class="pairs">
            <li
              v-for="(pr, i) in topPairs"
              :key="i"
              class="pair"
            >
              <div class="pair__flow">
                <span class="pair__s">{{ pr.supplierName }}</span>
                <span class="pair__b">→ {{ pr.buyerName }}</span>
              </div>
              <span class="pair__c u-mono">{{ pr.count }}</span>
            </li>
          </ul>
        </div>

        <div class="panel">
          <h3 class="panel__t">
            {{ t('provAnom.panel.rubro') }}
          </h3>
          <p class="panel__s">
            {{ t('provAnom.panel.rubroSub') }}
          </p>
          <div class="chartscroll">
            <InvHBars
              :items="rubroBars"
              format="count"
              :row-height="30"
            />
          </div>
          <h3 class="panel__t panel__t--sub">
            {{ t('provAnom.panel.recurrence') }}
          </h3>
          <YearBars
            :data="yearData"
            unit="count"
            :height="150"
          />
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.page { padding-block: var(--s-6) var(--s-8); }

.head { max-width: 72ch; margin-bottom: var(--s-5); }
.head h1 { margin: var(--s-2) 0 var(--s-3); }
.head__cta {
  display: inline-block;
  margin-top: var(--s-3);
  font-family: var(--font-mono);
  font-size: var(--t-sm);
  font-weight: 600;
  color: var(--alerta);
  text-decoration: none;
}
.head__cta:hover { text-decoration: underline; }

/* ---- Method ---- */
.method {
  padding: var(--s-4) var(--s-5);
  border: 1px solid var(--rule);
  border-left: 3px solid var(--alerta);
  border-radius: var(--r-lg);
  background: var(--surface);
  max-width: 82ch;
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
.method__b { margin: 0 0 var(--s-2); font-size: var(--t-sm); line-height: 1.6; }
.method__n { margin: 0 0 var(--s-1); font-size: var(--t-xs); color: var(--text-muted); line-height: 1.55; }
.method__n:last-child { margin-bottom: 0; }

/* ---- KPIs ---- */
.kpis {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--s-3);
  margin: var(--s-6) 0 var(--s-5);
}
.kpi {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  padding: var(--s-4);
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
  background: var(--surface);
}
.kpi__n { font-size: var(--t-2xl); line-height: 1; font-weight: 700; letter-spacing: -0.02em; }
.kpi__n--alert { color: var(--alerta); }
.kpi__l {
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
}

/* ---- Controls ---- */
.controls {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--s-3) var(--s-5);
  margin-bottom: var(--s-5);
}
.controls__sort { display: inline-flex; align-items: center; gap: var(--s-2); }
.controls__grp { display: inline-flex; align-items: center; flex-wrap: wrap; gap: var(--s-2); }
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
.chip:hover { color: var(--text); border-color: var(--rule-strong); }
.chip--on { background: var(--ink); border-color: var(--ink); color: #fff; }
.chip--sm { padding: var(--s-1) var(--s-3); font-size: var(--t-xs); }
.chip--captive.chip--on { background: var(--alerta); border-color: var(--alerta); }

/* ---- Watchlist table ---- */
.tablecard {
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
  overflow: hidden;
}
.tscroll { overflow-x: auto; }
.wl { width: 100%; border-collapse: collapse; font-size: var(--t-sm); min-width: 720px; }
.wl thead th {
  text-align: left;
  padding: var(--s-3) var(--s-4);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  background: var(--surface-sunken);
  border-bottom: 1px solid var(--rule);
  white-space: nowrap;
}
.wl tbody td { padding: var(--s-3) var(--s-4); border-bottom: 1px solid var(--rule); vertical-align: top; }
.wl tbody tr:last-child td { border-bottom: 0; }
.wl tbody tr:hover { background: var(--surface-sunken); }
.wl__num { text-align: right; white-space: nowrap; }
.wl thead .wl__num { text-align: right; }
.wl__rank { width: 40px; color: var(--text-muted); }
.wl__prov { min-width: 220px; }
.wl__provlink { font-weight: 600; color: inherit; text-decoration: none; }
.wl__provlink:hover { color: var(--alerta); }
.wl__tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
.tag {
  font-family: var(--font-mono);
  font-size: 11px;
  padding: 1px 7px;
  border-radius: var(--r-full);
  border: 1px solid var(--rule);
  color: var(--text-muted);
  white-space: nowrap;
}
.tag--captive {
  color: var(--alerta);
  border-color: color-mix(in srgb, var(--alerta) 40%, transparent);
  background: color-mix(in srgb, var(--alerta) 10%, transparent);
  font-weight: 600;
}
.tag--year { border-style: dashed; }
.wl__flags { display: inline-flex; align-items: center; gap: var(--s-2); }
.wl__stripe { width: 4px; height: 18px; border-radius: 2px; background: var(--alerta); opacity: 0.85; }
.wl__flagn { font-weight: 700; font-size: var(--t-md); }
.wl__z { font-weight: 700; color: var(--alerta); }
.wl__buyer { min-width: 180px; }
.wl__buyern { display: block; }
.wl__buyerc { font-size: var(--t-xs); color: var(--text-muted); }
.wl__go { text-align: right; }
.wl__golink { color: var(--celeste-deep); text-decoration: none; font-size: var(--t-xs); white-space: nowrap; }
.wl__golink:hover { text-decoration: underline; }

/* ---- States ---- */
.state {
  padding: var(--s-8) var(--s-5);
  text-align: center;
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
}
.state__t { margin: 0 0 var(--s-2); font-size: var(--t-lg); }
.state__b { margin: 0 auto var(--s-4); max-width: 52ch; color: var(--text-muted); font-size: var(--t-sm); }
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
  height: 58px;
  background: linear-gradient(90deg, var(--surface) 25%, var(--surface-sunken) 37%, var(--surface) 63%);
  background-size: 400% 100%;
  animation: shimmer 1.4s ease infinite;
}
@keyframes shimmer {
  0% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}

/* ---- Pattern panels ---- */
.patterns { margin-top: var(--s-7); }
.patterns__head { margin-bottom: var(--s-4); }
.patterns__head h2 { margin: 0 0 var(--s-1); }
.patterns__note { margin: 0; color: var(--text-muted); font-size: var(--t-sm); }
.pgrid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-4); }
.panel {
  padding: var(--s-5);
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
  background: var(--surface);
  min-width: 0;
}
.panel__t { margin: 0 0 var(--s-1); font-size: var(--t-lg); }
.panel__t--sub { margin-top: var(--s-5); font-size: var(--t-md); }
.panel__s { margin: 0 0 var(--s-4); color: var(--text-muted); font-size: var(--t-sm); }
/* Wide charts (InvHBars has a min-width) scroll inside their own container so the
   page body never scrolls sideways — the DESIGN.md quality floor. */
.chartscroll { overflow-x: auto; }

/* captive / repeat pairs list */
.pairs { margin: 0; padding: 0; list-style: none; }
.pair {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  padding: var(--s-3) 0;
  border-top: 1px dashed var(--rule);
}
.pair:first-child { border-top: 0; }
.pair__flow { min-width: 0; flex: 1; }
.pair__s { display: block; font-weight: 600; font-size: var(--t-sm); }
.pair__b { display: block; font-size: var(--t-xs); color: var(--text-muted); }
.pair__c { flex: none; font-weight: 700; color: var(--alerta); }

@media (max-width: 820px) {
  .kpis { grid-template-columns: repeat(2, 1fr); }
  .pgrid { grid-template-columns: 1fr; }
}
</style>
