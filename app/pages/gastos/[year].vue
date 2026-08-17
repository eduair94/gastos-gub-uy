<script setup lang="ts">
/**
 * One year of state purchasing, as a page of its own.
 *
 * WHY THIS EXISTS. `spending_trend` already holds an article's worth of
 * verified material per year — a stored narrative, the additive bridge, the
 * eight buyers and eight rubros that moved the number, the largest single
 * contracts and the audit list of what was excluded. All 25 years rendered on
 * ONE url (/analytics/evolucion-gasto), which switches year client-side. A
 * reader searching "cuánto gastó el Estado uruguayo en 2024" had no page to
 * land on, and a crawler had one URL where there were 24 answers.
 *
 * Nothing here is computed or regenerated. The narrative is read verbatim from
 * the job's output: it is deterministic and stored, so the page must never
 * rewrite it — two renders of the same year have to say the same thing.
 *
 * /analytics/evolucion-gasto stays as it is. It is the comparison surface, this
 * is the per-year one, and they read the same collection.
 */
const route = useRoute()
const { t, locale } = useI18n()
const localePath = useLocalePath()
const config = useRuntimeConfig()

const year = computed(() => String(route.params.year ?? ''))

const { data: res, error } = await useFetch<any>(
  () => `/api/analytics/spending-trend/${year.value}`,
)

const y = computed<any | null>(() => res.value?.data ?? null)

/**
 * A 5xx is NOT a miss: a transient failure must never noindex a real year.
 * Only a 404, or an OK answer with no document, counts as gone.
 */
const errStatus = computed<number>(() =>
  (error.value as any)?.statusCode ?? (error.value as any)?.response?.status ?? 0,
)
const notFound = computed(() => errStatus.value === 404 || (!error.value && !y.value))

if (import.meta.server && notFound.value) {
  setResponseStatus(useRequestEvent()!, 404)
}

/**
 * 2002 is the first year of the series, so it has no previous year to be
 * compared against and no bridge. It is the ONLY year in that state. It stays
 * reachable and linked, but it is not asked to compete as a "why it moved"
 * page, because it cannot answer that question.
 */
const hasBridge = computed(() => !!y.value?.bridge)

/** Read verbatim from the stored field. Never regenerated here. */
const narrative = computed<string>(() =>
  (locale.value.startsWith('en') ? y.value?.narrativeEn : y.value?.narrativeEs) ?? '',
)

const bridgeSteps = computed(() => {
  const b = y.value?.bridge
  if (!b) return []
  const n = Number(year.value)
  return [
    { key: 'base', label: t('evolucion.bridge.base', { year: n - 1 }), value: b.base, kind: 'total' as const },
    { key: 'inflation', label: t('evolucion.bridge.inflation'), value: b.inflation, kind: 'inflation' as const, help: t('evolucion.bridge.inflationHelp') },
    { key: 'entrants', label: t('evolucion.bridge.entrants', { n: b.entrantBuyers }), value: b.entrants, kind: 'coverage' as const, help: t('evolucion.bridge.entrantsHelp') },
    { key: 'exits', label: t('evolucion.bridge.exits', { n: b.exitBuyers }), value: b.exits, kind: 'coverage' as const, help: t('evolucion.bridge.exitsHelp') },
    { key: 'panel', label: t('evolucion.bridge.panel', { n: b.panelBuyers }), value: b.panelDelta, kind: 'real' as const, help: t('evolucion.bridge.panelHelp') },
    { key: 'total', label: t('evolucion.bridge.total', { year: n }), value: b.total, kind: 'total' as const },
  ]
})

const buyerBars = computed(() =>
  (y.value?.topBuyers ?? []).map((b: any) => ({ label: b.label, value: b.delta, color: 'gold' })),
)
const categoryBars = computed(() =>
  (y.value?.topCategories ?? []).map((c: any) => ({ label: c.label, value: c.delta, color: 'celeste' })),
)

const events = computed<any[]>(() => y.value?.events ?? [])
const exclusions = computed<any[]>(() => y.value?.exclusions ?? [])

const pct = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : `${formatNumber(Math.round(v * 1000) / 10)}%`

const seoTitle = computed(() => t('gastosYear.seoTitle', { year: year.value }))
const seoDescription = computed(() =>
  narrative.value
    // The stored narrative already opens with the year and the headline figure,
    // so the first two sentences are the best description this page can have.
    ? narrative.value.split('. ').slice(0, 2).join('. ').slice(0, 300)
    : t('gastosYear.seoFallback', { year: year.value }),
)

const breadcrumbLd = useBreadcrumbLd([
  { name: t('nav.gastos'), path: '/gastos' },
  { name: year.value },
])
const orgLd = useOrgLd()
const personLd = usePersonLd()

useSeo(() => ({
  title: notFound.value ? t('gastosYear.notFound.title') : seoTitle.value,
  description: notFound.value ? t('gastosYear.notFound.body') : seoDescription.value,
  path: `/gastos/${year.value}`,
  // 2002 has no bridge, so it cannot answer the question this family exists to
  // answer. It stays reachable; it just does not compete for a result.
  noindex: notFound.value || !hasBridge.value,
  kicker: t('gastosYear.kicker'),
  stat: y.value ? formatMoney(y.value.nominalUyu, 'UYU', { compact: true }) : undefined,
  type: 'article',
  ...(y.value?.calculatedAt ? { article: { modifiedTime: new Date(y.value.calculatedAt).toISOString(), section: 'Gasto público' } } : {}),
  ...(notFound.value
    ? {}
    : {
        jsonLd: [
          {
            '@context': 'https://schema.org',
            '@type': 'Article',
            'headline': seoTitle.value,
            'description': seoDescription.value,
            'author': personLd,
            'publisher': orgLd,
            'url': `${config.public.siteUrl}/gastos/${year.value}`,
            'about': {
              '@type': 'Dataset',
              'name': t('gastosYear.datasetName', { year: year.value }),
              'creator': orgLd,
            },
            ...(y.value?.calculatedAt ? { dateModified: new Date(y.value.calculatedAt).toISOString() } : {}),
          },
          breadcrumbLd,
        ],
      }),
}))
</script>

<template>
  <div class="u-container page">
    <StatePanel
      v-if="notFound"
      :title="t('gastosYear.notFound.title')"
      :body="t('gastosYear.notFound.body')"
      :action-to="localePath('/analytics/evolucion-gasto')"
      :action-label="t('gastosYear.notFound.action')"
      level="h1"
    />

    <template v-else-if="y">
      <header class="head">
        <p class="u-eyebrow">
          {{ t('gastosYear.kicker') }}
        </p>
        <h1 class="head__year">
          {{ t('gastosYear.h1', { year: y.year }) }}
        </h1>
        <p
          v-if="y.partial"
          class="head__partial"
        >
          {{ t('gastosYear.partial', { year: y.year }) }}
        </p>
      </header>

      <!-- The stored narrative, verbatim. -->
      <p
        v-if="narrative"
        class="lede"
      >
        {{ narrative }}
      </p>

      <!-- ===== Headline figures ===== -->
      <section
        class="stats"
        :aria-label="t('gastosYear.kicker')"
      >
        <div class="stat stat--money">
          <MoneyAmount
            :amount="y.nominalUyu"
            compact
            size="lg"
            align="start"
          />
          <span class="stat__l">{{ t('gastosYear.nominal', { year: y.year }) }}</span>
        </div>
        <div class="stat stat--money">
          <MoneyAmount
            :amount="y.realUyu"
            compact
            size="lg"
            align="start"
          />
          <span class="stat__l">{{ t('gastosYear.real') }}</span>
        </div>
        <div class="stat">
          <span class="stat__n">{{ formatNumber(y.releases) }}</span>
          <span class="stat__l">{{ t('gastosYear.releases') }}</span>
        </div>
        <div class="stat">
          <span class="stat__n">{{ formatNumber(y.buyers) }}</span>
          <span class="stat__l">{{ t('gastosYear.buyers') }}</span>
        </div>
        <div class="stat">
          <span class="stat__n">{{ formatNumber(y.suppliers) }}</span>
          <span class="stat__l">{{ t('gastosYear.suppliers') }}</span>
        </div>
        <div class="stat">
          <span class="stat__n">{{ pct(y.pctOfGdp) }}</span>
          <span class="stat__l">{{ t('gastosYear.pctGdp') }}</span>
        </div>
      </section>

      <p class="basis">
        {{ t('gastosYear.basis') }}
      </p>

      <!-- ===== Why it moved ===== -->
      <ChartBlock
        v-if="bridgeSteps.length"
        class="block"
        :title="t('evolucion.bridge.title')"
        :help="t('evolucion.bridge.help')"
      >
        <BridgeWaterfall :steps="bridgeSteps" />
      </ChartBlock>
      <p
        v-else
        class="basis"
      >
        {{ t('evolucion.bridge.empty') }}
      </p>

      <!-- ===== Who moved it ===== -->
      <ChartBlock
        v-if="buyerBars.length"
        class="block"
        :title="t('evolucion.contrib.buyers')"
        :help="t('evolucion.contrib.buyersHelp')"
      >
        <SpendBars :items="buyerBars" />
      </ChartBlock>

      <ChartBlock
        v-if="categoryBars.length"
        class="block"
        :title="t('evolucion.contrib.categories')"
        :help="t('evolucion.contrib.categoriesHelp')"
      >
        <SpendBars :items="categoryBars" />
      </ChartBlock>

      <!-- ===== The single biggest contracts ===== -->
      <section
        v-if="events.length"
        class="block"
      >
        <h2 class="block__h">
          {{ t('evolucion.events.title', { year: y.year }) }}
        </h2>
        <p class="block__help">
          {{ t('evolucion.events.help') }}
        </p>
        <ul class="events">
          <li
            v-for="(e, i) in events"
            :key="`e-${i}`"
            class="events__i"
          >
            <NuxtLink
              :to="localePath(`/contracts/${encodeURIComponent(e.releaseId)}`)"
              class="events__t"
            >
              {{ e.title || t('evolucion.events.untitled') }}
            </NuxtLink>
            <span class="events__m">
              {{ e.buyerName }} · {{ e.supplierName }}
            </span>
            <span class="events__v">
              <MoneyAmount
                :amount="e.nominalUyu"
                compact
                size="sm"
                align="start"
              />
              <span class="events__s">{{ t('evolucion.events.share', { pct: pct(e.share) }) }}</span>
            </span>
          </li>
        </ul>
      </section>

      <!-- ===== What we left out, and why ===== -->
      <section
        v-if="exclusions.length"
        class="block"
      >
        <h2 class="block__h">
          {{ t('evolucion.audit.title') }}
        </h2>
        <ul class="events">
          <li
            v-for="(x, i) in exclusions"
            :key="`x-${i}`"
            class="events__i"
          >
            <NuxtLink
              :to="localePath(`/contracts/${encodeURIComponent(x.releaseId)}`)"
              class="events__t"
            >
              {{ x.title || t('evolucion.events.untitled') }}
            </NuxtLink>
            <span class="events__m">
              {{ x.buyerName }} · {{ t(`evolucion.audit.reasons.${x.reason}`) }}
            </span>
            <span class="events__v">
              <MoneyAmount
                :amount="x.nominalUyu"
                compact
                size="sm"
                align="start"
              />
            </span>
          </li>
        </ul>
      </section>

      <!-- ===== Neighbours + the comparison surface ===== -->
      <nav
        class="yearnav"
        :aria-label="t('gastosYear.kicker')"
      >
        <NuxtLink
          v-if="y.prevYear"
          class="yearnav__l"
          :to="localePath(`/gastos/${y.prevYear}`)"
        >
          <v-icon size="16">
            mdi-chevron-left
          </v-icon> {{ y.prevYear }}
        </NuxtLink>
        <span v-else />

        <NuxtLink
          class="yearnav__all"
          :to="localePath('/analytics/evolucion-gasto')"
        >
          {{ t('gastosYear.compareAll') }}
        </NuxtLink>

        <NuxtLink
          v-if="y.nextYear"
          class="yearnav__l"
          :to="localePath(`/gastos/${y.nextYear}`)"
        >
          {{ y.nextYear }} <v-icon size="16">
            mdi-chevron-right
          </v-icon>
        </NuxtLink>
        <span v-else />
      </nav>
    </template>
  </div>
</template>

<style scoped>
.page { padding-block: var(--s-6) var(--s-8); }

.head__year {
  margin: var(--s-2) 0 0;
  font-family: var(--font-display);
  font-size: var(--t-2xl);
  line-height: 1.1;
}

.head__partial {
  margin: var(--s-2) 0 0;
  font-size: var(--t-sm);
  color: var(--alerta);
}

/* The stored narrative. Primary text; the measure cap sits on the <p> itself. */
.lede {
  margin: var(--s-5) 0 0;
  max-width: 68ch;
  font-size: var(--t-md);
  line-height: 1.6;
  color: var(--text);
}

.stats {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: var(--s-4);
  margin: var(--s-6) 0 0;
}

.stat {
  display: flex;
  flex-direction: column;
  gap: var(--s-1);
  padding: var(--s-3) var(--s-4);
  border-left: 2px solid var(--rule);
  /* Without this a grid item refuses to shrink below its content and the peso
     figure pushes the whole document sideways on a phone. */
  min-width: 0;
}

.stat--money { border-left-color: var(--money-rule); }

.stat__n {
  font-family: var(--font-mono);
  font-size: var(--t-lg);
  font-weight: 600;
}

.stat__l {
  font-size: var(--t-xs);
  color: var(--text-muted);
}

.basis {
  margin: var(--s-5) 0 0;
  padding: var(--s-3) var(--s-4);
  max-width: 90ch;
  background: var(--surface-sunken);
  border: 1px solid var(--rule);
  border-radius: var(--r-md);
  font-size: var(--t-sm);
  color: var(--text-muted);
  line-height: 1.5;
}

.block { margin-top: var(--s-7); }

.block__h {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--t-lg);
}

.block__help {
  margin: var(--s-2) 0 0;
  max-width: 80ch;
  font-size: var(--t-sm);
  color: var(--text-muted);
}

.events {
  margin: var(--s-4) 0 0;
  padding: 0;
  list-style: none;
  border-top: 1px solid var(--rule);
}

.events__i {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--s-1) var(--s-4);
  padding: var(--s-3) 0;
  border-bottom: 1px solid var(--rule);
}

.events__t {
  grid-column: 1;
  color: var(--celeste-deep);
  font-weight: 600;
  text-decoration: none;
}

.events__t:hover { text-decoration: underline; }

.events__m {
  grid-column: 1;
  font-size: var(--t-xs);
  color: var(--text-muted);
}

.events__v {
  grid-column: 2;
  grid-row: 1 / span 2;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--s-1);
  text-align: right;
}

.events__s {
  font-size: var(--t-xs);
  color: var(--text-muted);
  white-space: nowrap;
}

.yearnav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-4);
  margin-top: var(--s-7);
  padding-top: var(--s-5);
  border-top: 1px solid var(--rule);
}

.yearnav__l,
.yearnav__all {
  display: inline-flex;
  align-items: center;
  gap: var(--s-1);
  padding: var(--s-2) var(--s-4);
  border: 1px solid var(--rule-strong);
  border-radius: var(--r-md);
  background: var(--surface);
  color: var(--text);
  font-weight: 600;
  font-size: var(--t-sm);
  text-decoration: none;
}

.yearnav__l:hover,
.yearnav__all:hover { background: var(--surface-sunken); }

@media (max-width: 900px) {
  .stats { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}

@media (max-width: 560px) {
  .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }

  /* A compacted peso figure still needs more than half a 360px viewport, so the
     two money tiles take the full row instead of overflowing the document.
     Measured at 360px: 19px of horizontal overflow before this rule. */
  .stat--money { grid-column: 1 / -1; }

  .events__i { grid-template-columns: minmax(0, 1fr); }

  .events__v {
    grid-column: 1;
    grid-row: auto;
    align-items: flex-start;
    text-align: left;
  }
}
</style>
