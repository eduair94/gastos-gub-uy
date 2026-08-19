<script setup lang="ts">
/**
 * Recopilatorio detail — an event, resolved live into totals, who got paid,
 * what it was spent on, a year trend and the full ledger. The set of contracts
 * is defined server-side (server/utils/recopilatorios.ts); this page is pure
 * chrome over /api/recopilatorios/[slug].
 */
const { t, locale } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const slug = computed(() => String(route.params.slug))

const { data: res, error } = await useFetch<any>(() => `/api/recopilatorios/${slug.value}`)

/**
 * WARNING: an unknown slug must answer 404, not 200.
 *
 * This used to be an empty `if` whose only effect was a comment. The template's
 * not-found block looked right to a reader, but the response stayed HTTP 200
 * with `index, follow` and the generic "Recopilatorios" title, so any invented
 * slug was an indexable page.
 *
 * A 5xx is NOT a miss — a transient failure must never noindex a live one.
 */
const errStatus = computed<number>(() =>
  (error.value as any)?.statusCode ?? (error.value as any)?.response?.status ?? 0,
)
const notFound = computed(() => errStatus.value === 404 || (!error.value && !res.value?.data))

if (import.meta.server && notFound.value) {
  setResponseStatus(useRequestEvent()!, 404)
}

const data = computed(() => res.value?.data ?? null)
const text = computed(() => (locale.value === 'en' ? data.value?.en : data.value?.es) ?? null)
const kpis = computed(() => data.value?.kpis ?? { total: 0, count: 0, suppliers: 0 })

const supplierBars = computed(() =>
  (data.value?.suppliers ?? []).map((s: any) => ({ label: s.name, value: s.value, color: 'gold' })))
const categoryBars = computed(() =>
  (data.value?.categories ?? []).map((c: any) => ({ label: c.name, value: c.value, color: 'celeste' })))
const byYear = computed(() =>
  (data.value?.byYear ?? []).map((y: any) => ({ year: y.year, value: y.count })))
const ledger = computed<any[]>(() => data.value?.ledger ?? [])
const related = computed<any[]>(() => data.value?.related ?? [])

function relText(r: any) {
  return locale.value === 'en' ? r.en : r.es
}

const personLd = usePersonLd()
const orgLd = useOrgLd()
const breadcrumbLd = text.value
  ? useBreadcrumbLd([
      { name: 'Recopilatorios', path: '/recopilatorios' },
      { name: text.value.title },
    ])
  : null

useSeo(() => ({
  title: text.value ? t('seo.recopDetail.title', { title: text.value.title }) : t('seo.recop.title'),
  description: text.value?.dek ?? t('seo.recop.description'),
  path: `/recopilatorios/${slug.value}`,
  noindex: notFound.value,
  kicker: 'Recopilatorio',
  // Only the resolved compilation gets the rich article treatment — mirrors
  // how title/description above fall back while `data` is loading or 404s.
  // `data.period` (e.g. "2015–2026") is a free display label, not an ISO
  // date, so no article.publishedTime/modifiedTime is claimed here.
  ...(text.value
    ? {
        type: 'article' as const,
        jsonLd: [
          {
            '@context': 'https://schema.org',
            '@type': 'Article',
            'headline': text.value.title,
            'description': text.value.dek,
            'author': personLd,
            'publisher': orgLd,
          },
          breadcrumbLd,
        ],
      }
    : {}),
}))
</script>

<template>
  <div class="recop">
    <template v-if="data">
      <!-- Hero -->
      <section class="rhero">
        <div class="rhero__in u-container">
          <NuxtLink
            :to="localePath('/recopilatorios')"
            class="rhero__back"
          >
            <v-icon size="16">
              mdi-arrow-left
            </v-icon>
            {{ t('recop.backToAll') }}
          </NuxtLink>
          <p class="u-eyebrow rhero__eyebrow">
            <span class="rhero__emoji">{{ data.emoji }}</span>
            {{ t('recop.eyebrow') }}<span v-if="data.period"> · {{ data.period }}</span>
          </p>
          <h1 class="rhero__title">
            {{ text?.title }}
          </h1>
          <p class="rhero__dek">
            {{ text?.dek }}
          </p>
        </div>
      </section>

      <!-- KPIs -->
      <section class="u-container">
        <StatBand
          :columns="3"
          :items="[
            { key: 'total', money: kpis.total, label: t('recop.kpi.total') },
            { key: 'count', value: formatNumber(kpis.count), label: t('recop.kpi.count') },
            { key: 'suppliers', value: formatNumber(kpis.suppliers), label: t('recop.kpi.suppliers') },
          ]"
        >
          <template #value="{ item }">
            <MoneyAmount
              v-if="item.money != null"
              :amount="item.money"
              size="xl"
              align="start"
            />
            <template v-else>
              {{ item.value }}
            </template>
          </template>
        </StatBand>
      </section>

      <!-- Breakdown charts -->
      <section class="u-container cols">
        <ChartBlock
          :title="t('recop.suppliersTitle')"
          :help="t('recop.suppliersHelp')"
        >
          <InvHBars
            :items="supplierBars"
            format="money"
            :row-height="30"
          />
        </ChartBlock>

        <ChartBlock
          v-if="categoryBars.length"
          :title="t('recop.categoriesTitle')"
          :help="t('recop.categoriesHelp')"
        >
          <InvHBars
            :items="categoryBars"
            format="money"
            :row-height="30"
          />
        </ChartBlock>
      </section>

      <!-- Year trend -->
      <ChartBlock
        v-if="byYear.length > 1"
        class="u-container block"
        :title="t('recop.byYearTitle')"
        :scroll="false"
      >
        <YearBars
          :data="byYear"
          unit="count"
          :height="150"
        />
      </ChartBlock>

      <!-- Ledger -->
      <section class="u-container block">
        <div class="block__head">
          <h2>{{ t('recop.ledgerTitle') }}</h2>
          <span class="block__meta u-mono">{{ t('recop.ledgerCount', { n: ledger.length }) }}</span>
        </div>
        <p class="block__help">
          {{ t('recop.ledgerHelp') }}
        </p>
        <ContractLedger
          :items="ledger"
          :empty-label="t('common.contract')"
        />
        <p
          v-if="data.meta"
          class="ledger__foot"
        >
          {{ t('recop.ledgerNote') }}
          <span v-if="text?.note"> {{ text.note }}</span>
        </p>
      </section>

      <!-- Related -->
      <section
        v-if="related.length"
        class="u-container block"
      >
        <div class="block__head">
          <h2>{{ t('recop.relatedTitle') }}</h2>
          <NuxtLink
            :to="localePath('/recopilatorios')"
            class="block__all"
          >
            {{ t('common.viewAll') }}
          </NuxtLink>
        </div>
        <div class="rel">
          <NuxtLink
            v-for="r in related"
            :key="r.slug"
            :to="localePath(`/recopilatorios/${r.slug}`)"
            class="relcard"
          >
            <span class="relcard__emoji">{{ r.emoji }}</span>
            <span class="relcard__t">{{ relText(r).title }}</span>
            <v-icon
              size="16"
              class="relcard__arrow"
            >
              mdi-arrow-right
            </v-icon>
          </NuxtLink>
        </div>
      </section>
    </template>

    <!-- Not found -->
    <NotFoundPanel
      v-else
      :title="t('recop.notFound.title')"
      :body="t('recop.notFound.body')"
      :action-to="localePath('/recopilatorios')"
      :action-label="t('recop.notFound.action')"
    />
  </div>
</template>

<style scoped>
.recop { padding-bottom: var(--s-8); }

/* Hero */
.rhero {
  background:
    radial-gradient(1000px 340px at 88% -20%, color-mix(in srgb, var(--sol) 15%, transparent), transparent 70%),
    var(--ink);
  color: var(--ink-fg);
  border-bottom: 1px solid var(--rule);
}

.rhero__in {
  padding-block: clamp(var(--s-6), 5vw, var(--s-8));
}

.rhero__back {
  display: inline-flex;
  align-items: center;
  gap: var(--s-1);
  margin-bottom: var(--s-4);
  color: #b9c8d4;
  font-size: var(--t-sm);
  font-weight: 600;
  text-decoration: none;
}

.rhero__back:hover { color: #fff; }

.rhero__eyebrow { color: var(--sol); display: flex; align-items: center; gap: var(--s-2); }
.rhero__emoji { font-size: 1.15em; }

.rhero__title {
  margin: var(--s-3) 0 0;
  max-width: 20ch;
  font-family: var(--font-display);
  font-size: clamp(26px, 5vw, var(--t-3xl));
  font-stretch: 112%;
  line-height: 1.05;
  letter-spacing: -0.02em;
  color: #fff;
  text-wrap: balance;
}

.rhero__dek {
  margin: var(--s-4) 0 0;
  max-width: 60ch;
  font-size: var(--t-md);
  line-height: 1.55;
  color: #b9c8d4;
}

/* KPIs */
/* Blocks */
.block { margin-top: var(--s-8); }

.block__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--s-4);
  margin-bottom: var(--s-2);
}

.block__meta { font-size: var(--t-xs); color: var(--text-muted); }

.block__help {
  margin: 0 0 var(--s-4);
  max-width: 70ch;
  font-size: var(--t-sm);
  color: var(--text-muted);
}

.block__all {
  font-size: var(--t-sm);
  font-weight: 600;
  color: var(--celeste-deep);
  text-decoration: none;
}

.block__all:hover { text-decoration: underline; }

.cols {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--s-6);
  margin-top: var(--s-8);
}

/* min-width:0 on the items, not just minmax(0,…) on the tracks: a grid item
   defaults to `min-width: auto` and would adopt the chart's floor as its own
   minimum, widening the track past the viewport whichever media query is live. */
.cols > * { min-width: 0; margin-top: 0; }

/* Ledger */
.ledger__foot {
  margin: var(--s-3) 0 0;
  font-size: var(--t-xs);
  color: var(--text-muted);
  line-height: 1.5;
  max-width: 80ch;
}

/* Related */
.rel { display: flex; flex-wrap: wrap; gap: var(--s-3); }

.relcard {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  padding: var(--s-3) var(--s-4);
  border: 1px solid var(--rule);
  border-radius: var(--r-md);
  background: var(--surface);
  color: var(--text);
  font-size: var(--t-sm);
  font-weight: 600;
  text-decoration: none;
  transition: border-color var(--dur) var(--ease), background var(--dur) var(--ease);
}

.relcard:hover { border-color: var(--celeste); background: var(--surface-sunken); }
.relcard__emoji { font-size: 1.2em; }
.relcard__arrow { color: var(--celeste-deep); }

/* Buttons + not found */
@media (max-width: 900px) {
  /* Never bare `1fr` around a chart: that is `minmax(auto, 1fr)`, and the auto
     floor is the chart's own min-width, which scrolls the whole page sideways. */
  .cols { grid-template-columns: minmax(0, 1fr); gap: var(--s-8); }
}

@media (max-width: 640px) {
}
</style>
