<script setup lang="ts">
/**
 * Curro detail — a documented case, resolved live into totals, who got paid,
 * what it was spent on, a year trend and the full ledger, framed by its legal
 * status, its hallazgo and its sources. The set of contracts is defined
 * server-side (server/utils/curros.ts); this page is chrome over
 * /api/curros/[slug]. The money is a cross-reference (see `caveat`), never a
 * verdict.
 */
const { t, locale } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const slug = computed(() => String(route.params.slug))

const { data: res, error } = await useFetch<any>(() => `/api/curros/${slug.value}`)

/**
 * WARNING: an unknown slug must answer 404, not 200.
 *
 * The <NotFoundPanel> rendered from a null `data` looked right to a reader but
 * the response was still HTTP 200 with `index, follow` and the generic
 * "Curros en evidencia" title, so any invented slug was an indexable page.
 *
 * A 5xx is NOT a miss — a transient failure must never noindex a live case.
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
const sources = computed<any[]>(() => data.value?.sources ?? [])

const supplierBars = computed(() =>
  (data.value?.suppliers ?? []).map((s: any) => ({ label: s.name, value: s.value, color: 'gold' })))
const categoryBars = computed(() =>
  (data.value?.categories ?? []).map((c: any) => ({ label: c.name, value: c.value, color: 'celeste' })))
const byYear = computed(() =>
  (data.value?.byYear ?? []).map((y: any) => ({ year: y.year, value: y.count })))
const ledger = computed<any[]>(() => data.value?.ledger ?? [])
const related = computed<any[]>(() => data.value?.related ?? [])
const relatedItems = computed(() => related.value.map((r: any) => ({
  to: localePath(`/curros/${r.slug}`),
  emoji: r.emoji,
  label: (locale.value === 'en' ? r.en : r.es).title,
  status: r.status,
  statusLabel: statusLabel(r.status),
})))

function statusLabel(s: string) {
  return t(`curros.status.${s}`)
}

const personLd = usePersonLd()
const orgLd = useOrgLd()
const breadcrumbLd = text.value
  ? useBreadcrumbLd([
      { name: t('nav.curros'), path: '/curros' },
      { name: text.value.title },
    ])
  : null

useSeo(() => ({
  title: text.value ? t('seo.currosDetail.title', { title: text.value.title }) : t('seo.curros.title'),
  description: text.value?.dek ?? t('seo.curros.description'),
  path: `/curros/${slug.value}`,
  noindex: notFound.value,
  // Only once the case has actually resolved (text.value is null while
  // loading or on an unknown slug) — otherwise there is no headline/dek to
  // put in an Article node. Cases carry a free period label ("2010–2011"),
  // never a real ISO date, so there is no honest publishedTime/modifiedTime
  // to emit here.
  ...(text.value
    ? {
        type: 'article' as const,
        kicker: 'Curro',
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
  <div class="curro">
    <template v-if="data">
      <!-- Hero -->
      <RecordHero
        tone="alerta"
        :emoji="data.emoji"
        :eyebrow="t('curros.eyebrow')"
        :title="text?.title ?? ''"
        :dek="text?.dek"
        :back-to="localePath('/curros')"
        :back-label="t('curros.backToAll')"
      >
        <template #eyebrow>
          <span v-if="data.period">· {{ data.period }}</span>
        </template>
        <div class="hero__tags">
          <StatusChip
            :status="data.status"
            :label="statusLabel(data.status)"
            on="ink"
          />
        </div>
      </RecordHero>

      <!-- KPIs -->
      <section class="u-container">
        <StatBand
          :columns="3"
          :items="[
            { key: 'total', money: kpis.total, label: t('curros.kpi.total') },
            { key: 'count', value: formatNumber(kpis.count), label: t('curros.kpi.count') },
            { key: 'suppliers', value: formatNumber(kpis.suppliers), label: t('curros.kpi.suppliers') },
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
          <!-- La cifra de prensa cierra la banda en vez de vivir en el hero: el
               punto de la página es la distancia entre ella y el total calculado
               dos celdas más arriba, y esa comparación se hace por vecindad. -->
          <template
            v-if="data.amountReported"
            #after
          >
            <ReportedFigure
              :label="t('curros.reportedLabel')"
              :claim="data.amountReported"
            />
          </template>
        </StatBand>
      </section>

      <!-- Hallazgo + status -->
      <section class="u-container narrative">
        <div class="narrative__main">
          <h2 class="narrative__h">
            {{ t('curros.hallazgoTitle') }}
          </h2>
          <p class="narrative__p">
            {{ text?.hallazgo }}
          </p>
          <div class="statusbox">
            <StatusChip
              :status="data.status"
              :label="statusLabel(data.status)"
            />
            <p class="statusbox__note">
              {{ text?.statusNote }}
            </p>
          </div>
          <NuxtLink
            v-if="data.investigationPath"
            :to="localePath(data.investigationPath)"
            class="narrative__inv"
          >
            <v-icon size="16">
              mdi-file-document-outline
            </v-icon>
            {{ t('curros.readInvestigation') }}
            <v-icon size="16">
              mdi-arrow-right
            </v-icon>
          </NuxtLink>
        </div>

        <!-- Sources -->
        <SourceList
          :title="t('curros.sourcesTitle')"
          :sources="sources"
        />
      </section>

      <!-- Breakdown charts -->
      <section class="u-container cols">
        <ChartBlock
          v-if="supplierBars.length"
          :title="t('curros.suppliersTitle')"
          :help="t('curros.suppliersHelp')"
        >
          <InvHBars
            :items="supplierBars"
            format="money"
            :row-height="30"
          />
        </ChartBlock>

        <ChartBlock
          v-if="categoryBars.length"
          :title="t('curros.categoriesTitle')"
          :help="t('curros.categoriesHelp')"
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
        :title="t('curros.byYearTitle')"
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
          <h2>{{ t('curros.ledgerTitle') }}</h2>
          <span class="block__meta u-mono">{{ t('curros.ledgerCount', { n: ledger.length }) }}</span>
        </div>
        <p class="block__help">
          {{ t('curros.ledgerHelp') }}
        </p>
        <ContractLedger
          :items="ledger"
          :empty-label="t('common.contract')"
        />
        <p class="ledger__foot">
          {{ t('curros.ledgerNote') }}
          <span v-if="text?.caveat"> {{ text.caveat }}</span>
        </p>
      </section>

      <!-- Related -->
      <section
        v-if="related.length"
        class="u-container block"
      >
        <div class="block__head">
          <h2>{{ t('curros.relatedTitle') }}</h2>
          <NuxtLink
            :to="localePath('/curros')"
            class="block__all"
          >
            {{ t('common.viewAll') }}
          </NuxtLink>
        </div>
        <RelatedRail :items="relatedItems" />
      </section>
    </template>

    <!-- Not found -->
    <NotFoundPanel
      v-else
      :title="t('curros.notFound.title')"
      :body="t('curros.notFound.body')"
      :action-to="localePath('/curros')"
      :action-label="t('curros.notFound.action')"
    />
  </div>
</template>

<style scoped>
.curro { padding-bottom: var(--s-8); }

/* Page-owned: the status chip row is this surface's vocabulary, not the
   shared header's. It sits on the permanent --ink surface, hence `on="ink"`. */
.hero__tags { display: flex; flex-wrap: wrap; gap: var(--s-2); margin-top: var(--s-5); }

/* Narrative + sources */
.narrative {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(0, 1fr);
  gap: var(--s-6);
  margin-top: var(--s-8);
}
.narrative__h { margin: 0 0 var(--s-3); font-size: var(--t-lg); }
.narrative__p { margin: 0 0 var(--s-5); font-size: var(--t-md); line-height: 1.6; color: var(--text); max-width: 70ch; }
.statusbox {
  display: flex;
  align-items: flex-start;
  gap: var(--s-3);
  padding: var(--s-4);
  background: var(--surface-sunken);
  border: 1px solid var(--rule);
  border-left: 3px solid var(--celeste);
  border-radius: var(--r-md);
}
.statusbox__note { margin: 0; font-size: var(--t-sm); line-height: 1.55; color: var(--text-muted); }
.narrative__inv {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  margin-top: var(--s-5);
  font-size: var(--t-sm);
  font-weight: 600;
  color: var(--celeste-deep);
  text-decoration: none;
}
.narrative__inv:hover { text-decoration: underline; }

/* Blocks */
.block { margin-top: var(--s-8); }
.block__head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--s-4); margin-bottom: var(--s-2); }
.block__meta { font-size: var(--t-xs); color: var(--text-muted); }
.block__help { margin: 0 0 var(--s-4); max-width: 70ch; font-size: var(--t-sm); color: var(--text-muted); }
.block__all { font-size: var(--t-sm); font-weight: 600; color: var(--celeste-deep); text-decoration: none; }
.block__all:hover { text-decoration: underline; }
.cols { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--s-6); margin-top: var(--s-8); }
/* min-width:0 on the items, not just minmax(0,…) on the tracks: a grid item
   defaults to `min-width: auto`, so it adopts the chart's floor as its own
   minimum and drags the track past the viewport no matter which media query
   is live. Belt and braces, because this is the bug that shipped. */
.cols > * { min-width: 0; margin-top: 0; }

/* Ledger */
.ledger__foot { margin: var(--s-3) 0 0; font-size: var(--t-xs); color: var(--text-muted); line-height: 1.5; max-width: 80ch; }

/* Related */
/* Buttons + not found */
@media (max-width: 900px) {
  .narrative { grid-template-columns: minmax(0, 1fr); }
  /* `1fr` here is `minmax(auto, 1fr)`, whose auto floor is the chart's
     min-width — which is what made this page scroll sideways on a phone
     despite the chart having its own scroller. Always minmax(0, …). */
  .cols { grid-template-columns: minmax(0, 1fr); gap: var(--s-8); }
}
@media (max-width: 640px) {
}
</style>
