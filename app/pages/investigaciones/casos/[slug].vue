<script setup lang="ts">
/**
 * Caso detail — one questioned investment, with its sources and, when the open
 * data can see the money, the contract-by-contract cross-reference.
 *
 * The page has two bodies and the difference is editorial, not cosmetic:
 *
 *  • `crossRef` present → the same treatment a curro gets: totals, who was
 *    paid, what it bought, a year trend, the ledger, and a link that reopens
 *    the identical set in the public explorer.
 *  • `crossRef` null → the absence, stated. Most of Uruguay's largest
 *    questioned spending rides PPPs, trusts, state-to-state contracts or a
 *    state company's own budget, none of which publish awards on the
 *    Compras Estatales portal. A number invented to fill that hole would be
 *    the worst thing this page could contain.
 *
 * Chrome over /api/casos/[slug]; the dossier itself lives in
 * server/utils/casos/dossiers/.
 */
const { t, locale } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const slug = computed(() => String(route.params.slug))

const { data: res } = await useFetch<any>(() => `/api/casos/${slug.value}`)

const data = computed(() => res.value?.data ?? null)
const text = computed(() => (locale.value === 'en' ? data.value?.en : data.value?.es) ?? null)
const themeMeta = computed(() => data.value?.themeMeta ?? null)
const themeText = computed(() => (themeMeta.value ? (locale.value === 'en' ? themeMeta.value.en : themeMeta.value.es) : null))
const sources = computed<any[]>(() => data.value?.sources ?? [])
const related = computed<any[]>(() => data.value?.related ?? [])
const relatedItems = computed(() => related.value.map((r: any) => ({
  to: localePath(`/investigaciones/casos/${r.slug}`),
  emoji: r.emoji,
  label: (locale.value === 'en' ? r.en : r.es).title,
  status: r.status,
  statusLabel: t(`casos.status.${r.status}`),
})))

const crossRef = computed(() => data.value?.crossRef ?? null)
const kpis = computed(() => crossRef.value?.kpis ?? { total: 0, count: 0, suppliers: 0 })
const supplierBars = computed(() =>
  (crossRef.value?.suppliers ?? []).map((s: any) => ({ label: s.name, value: s.value, color: 'gold' })))
const categoryBars = computed(() =>
  (crossRef.value?.categories ?? []).map((c: any) => ({ label: c.name, value: c.value, color: 'celeste' })))
const buyerBars = computed(() =>
  (crossRef.value?.buyers ?? []).map((b: any) => ({ label: b.name, value: b.value, color: 'gold' })))
const byYear = computed(() =>
  (crossRef.value?.byYear ?? []).map((y: any) => ({ year: y.year, value: y.count })))
const ledger = computed<any[]>(() => crossRef.value?.ledger ?? [])

/**
 * The filter, in words. "What the state spent with these bodies" and "what
 * these bodies bought whose object mentions X" are different claims, and a
 * page that shows a total without saying which one it made is doing the
 * reader's arguing for them.
 */
const scopeParts = computed<string[]>(() => {
  const s = data.value?.scope
  if (!s) return []
  const out: string[] = []
  if (s.search) out.push(t('casos.crossRef.scopeSearch', { term: s.search }))
  if (s.suppliers?.length) out.push(t('casos.crossRef.scopeSuppliers', { list: s.suppliers.slice(0, 4).join(', ') }))
  if (s.buyerCount === 1) out.push(t('casos.crossRef.scopeBuyersOne'))
  else if (s.buyerCount > 1) out.push(t('casos.crossRef.scopeBuyers', { n: s.buyerCount }))
  if (s.yearFrom && s.yearTo) out.push(t('casos.crossRef.scopeYears', { from: s.yearFrom, to: s.yearTo }))
  return out.length ? out : [t('casos.crossRef.scopeAll')]
})

/**
 * No cross-reference, but the money DOES ride normal procurement — so the gap
 * is ours (no filter isolates this case), not the feed's.
 */
const isolationGap = computed(() => !crossRef.value && data.value?.feedCoverage === 'likely')

const explorerTo = computed(() => {
  const q = data.value?.explorerQuery
  if (!q) return null
  return { path: localePath('/contracts'), query: q }
})

const personLd = usePersonLd()
const orgLd = useOrgLd()
const breadcrumbLd = text.value
  ? useBreadcrumbLd([
      { name: t('nav.investigaciones'), path: '/investigaciones' },
      { name: t('casos.indexTitle'), path: '/investigaciones/casos' },
      { name: text.value.title },
    ])
  : null

useSeo(() => ({
  title: text.value ? text.value.title : t('seo.casos.title'),
  description: text.value?.dek ?? t('seo.casos.description'),
  path: `/investigaciones/casos/${slug.value}`,
  noindex: !data.value,
  // Only once the dossier resolved: a caso carries a free period label
  // ("2018–2024"), never an ISO date, so there is no honest publishedTime.
  ...(text.value
    ? {
        type: 'article' as const,
        kicker: 'Investigaciones',
        jsonLd: [
          {
            '@context': 'https://schema.org',
            '@type': 'Article',
            'headline': text.value.title,
            'description': text.value.dek,
            'author': personLd,
            'publisher': orgLd,
            'citation': sources.value.map((s: any) => ({
              '@type': 'CreativeWork',
              'name': s.title,
              'url': s.url,
              ...(s.outlet ? { publisher: { '@type': 'Organization', 'name': s.outlet } } : {}),
            })),
          },
          breadcrumbLd,
        ],
      }
    : {}),
}))
</script>

<template>
  <div class="caso">
    <template v-if="data">
      <!-- Hero -->
      <RecordHero
        :emoji="data.emoji"
        :title="text?.title ?? ''"
        :dek="text?.dek"
        :back-to="localePath('/investigaciones/casos')"
        :back-label="t('casos.backToAll')"
      >
        <template #eyebrow>
          <NuxtLink
            v-if="themeText"
            :to="localePath(`/investigaciones/temas/${data.theme}`)"
            class="hero__theme"
          >{{ themeText.label }}</NuxtLink>
          <span v-if="data.period">· {{ data.period }}</span>
        </template>
        <div class="hero__tags chip-row">
          <StatusChip
            :status="data.status"
            :label="t(`casos.status.${data.status}`)"
            on="ink"
          />
          <span class="kindchip">{{ t(`casos.kind.${data.statusKind}`) }}</span>
        </div>
      </RecordHero>

      <!-- What the sources published + who is involved -->
      <section class="u-container band">
        <ReportedFigure
          v-if="data.amountReported"
          class="band__fig"
          :label="t('casos.reportedLabel')"
          :claim="data.amountReported"
        />
        <div
          v-if="data.organisms?.length"
          class="band__who"
        >
          <p class="band__l">
            {{ t('casos.sec.organismos') }}
          </p>
          <p class="band__v">
            {{ data.organisms.join(' · ') }}
          </p>
        </div>
        <div
          v-if="data.suppliersNamed?.length"
          class="band__who"
        >
          <p class="band__l">
            {{ t('casos.sec.empresas') }}
          </p>
          <p class="band__v">
            {{ data.suppliersNamed.join(' · ') }}
          </p>
        </div>
      </section>

      <!-- Narrative + sources -->
      <section class="u-container narrative">
        <div class="narrative__main">
          <h2 class="narrative__h">
            {{ t('casos.sec.contexto') }}
          </h2>
          <p class="narrative__p">
            {{ text?.contexto }}
          </p>

          <h2 class="narrative__h">
            {{ t('casos.sec.hallazgo') }}
          </h2>
          <p class="narrative__p">
            {{ text?.hallazgo }}
          </p>

          <h2 class="narrative__h">
            {{ t('casos.sec.porQue') }}
          </h2>
          <p class="narrative__p">
            {{ text?.porQueImporta }}
          </p>

          <h2 class="narrative__h">
            {{ t('casos.sec.estado') }}
          </h2>
          <div class="statusbox">
            <StatusChip
              :status="data.status"
              :label="t(`casos.status.${data.status}`)"
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
            {{ t('casos.readInvestigation') }}
            <v-icon size="16">
              mdi-arrow-right
            </v-icon>
          </NuxtLink>
        </div>

        <SourceList
          :title="t('casos.sec.fuentes')"
          :sources="sources"
        >
          <template #footer>
            <span class="fbadge">{{ t(`casos.feed.${data.feedCoverage}`) }}</span>
            {{ t(`casos.feed.${data.feedCoverage}Desc`) }}
          </template>
        </SourceList>
      </section>

      <!-- Cross-reference, when the feed can see the money -->
      <template v-if="crossRef">
        <section class="u-container block">
          <div class="block__head">
            <h2>{{ t('casos.crossRef.title') }}</h2>
            <NuxtLink
              v-if="explorerTo"
              :to="explorerTo"
              class="block__all"
            >
              {{ t('casos.crossRef.explorer') }}
            </NuxtLink>
          </div>
          <p class="block__help">
            {{ t('casos.crossRef.help') }}
          </p>

          <p
            v-if="scopeParts.length"
            class="scope"
          >
            <span class="scope__l">{{ t('casos.crossRef.scopeLabel') }}</span>
            <span class="scope__v">{{ scopeParts.join(' · ') }}</span>
          </p>

          <div class="kpis">
            <div class="kpi kpi--money">
              <MoneyAmount
                :amount="kpis.total"
                size="xl"
                align="start"
              />
              <span class="kpi__l">{{ t('casos.crossRef.kpiTotal') }}</span>
            </div>
            <div class="kpi">
              <span class="kpi__n">{{ formatNumber(kpis.count) }}</span>
              <span class="kpi__l">{{ t('casos.crossRef.kpiCount') }}</span>
            </div>
            <div class="kpi">
              <span class="kpi__n">{{ formatNumber(kpis.suppliers) }}</span>
              <span class="kpi__l">{{ t('casos.crossRef.kpiSuppliers') }}</span>
            </div>
          </div>
        </section>

        <section class="u-container cols">
          <ChartBlock
            v-if="supplierBars.length"
            :title="t('casos.crossRef.suppliersTitle')"
            :help="t('casos.crossRef.suppliersHelp')"
          >
            <InvHBars
              :items="supplierBars"
              format="money"
              :row-height="30"
            />
          </ChartBlock>

          <ChartBlock
            v-if="buyerBars.length > 1"
            :title="t('casos.crossRef.buyersTitle')"
          >
            <InvHBars
              :items="buyerBars"
              format="money"
              :row-height="30"
            />
          </ChartBlock>

          <ChartBlock
            v-if="categoryBars.length"
            :title="t('casos.crossRef.categoriesTitle')"
            :help="t('casos.crossRef.categoriesHelp')"
          >
            <InvHBars
              :items="categoryBars"
              format="money"
              :row-height="30"
            />
          </ChartBlock>
        </section>

        <ChartBlock
          v-if="byYear.length > 1"
          class="u-container block"
          :title="t('casos.crossRef.byYearTitle')"
          :scroll="false"
        >
          <YearBars
            :data="byYear"
            unit="count"
            :height="150"
          />
        </ChartBlock>

        <section
          v-if="ledger.length"
          class="u-container block"
        >
          <div class="block__head">
            <h2>{{ t('casos.crossRef.ledgerTitle') }}</h2>
            <span class="block__meta u-mono">{{ t('casos.crossRef.ledgerCount', { n: ledger.length }) }}</span>
          </div>
          <p class="block__help">
            {{ t('casos.crossRef.ledgerHelp') }}
          </p>
          <ContractLedger
            :items="ledger"
            :empty-label="t('common.contract')"
          />
          <p class="ledger__foot">
            {{ t('casos.crossRef.ledgerNote') }}
            <span v-if="text?.caveat"> {{ text.caveat }}</span>
          </p>
        </section>
      </template>

      <!-- Or the absence, stated -->
      <section
        v-else
        class="u-container block"
      >
        <!-- Two different absences, and conflating them would be a lie in
             either direction: money that never enters the procurement record,
             versus money that does but which we could not isolate from
             everything else the same bodies buy. -->
        <div class="nodata">
          <h2 class="nodata__t">
            {{ isolationGap ? t('casos.noData.titleLikely') : t('casos.noData.title') }}
          </h2>
          <p class="nodata__b">
            {{ isolationGap ? t('casos.noData.bodyLikely') : t('casos.noData.body') }}
          </p>
          <template v-if="!isolationGap">
            <h3 class="nodata__s">
              {{ t('casos.noData.channelsTitle') }}
            </h3>
            <p class="nodata__b">
              {{ t('casos.noData.channels') }}
            </p>
          </template>
          <p
            v-if="text?.caveat"
            class="nodata__c"
          >
            {{ text.caveat }}
          </p>
          <!-- A dead end otherwise: the reader is told the data cannot answer
               this and handed nowhere to go. The explorer can at least answer
               the next question they will have. -->
          <NuxtLink
            :to="localePath('/contracts')"
            class="nodata__cta"
          >
            {{ t('casos.noData.explore') }}
            <v-icon size="16">
              mdi-arrow-right
            </v-icon>
          </NuxtLink>
        </div>
      </section>

      <!-- Read next -->
      <section
        v-if="related.length"
        class="u-container block"
      >
        <div class="block__head">
          <h2>{{ t('casos.relatedTitle') }}</h2>
          <NuxtLink
            :to="localePath('/investigaciones/casos')"
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
      :title="t('casos.notFound.title')"
      :body="t('casos.notFound.body')"
      :action-to="localePath('/investigaciones/casos')"
      :action-label="t('casos.notFound.action')"
    />
  </div>
</template>

<style scoped>
.caso { padding-bottom: var(--s-8); }

/* Lives here, not in <RecordHero>: the theme link and the kind chip are this
   page's own vocabulary. Both sit on the permanent --ink surface, so they use
   the fixed ink tokens rather than the paper ones. */
.hero__theme { color: inherit; text-decoration: none; }
.hero__theme:hover { text-decoration: underline; }
.hero__tags { margin-top: var(--s-5); }

.kindchip {
  display: inline-flex;
  align-items: center;
  padding: 2px var(--s-3);
  border: 1px solid var(--ink-rule);
  border-radius: var(--r-full);
  background: rgb(255 255 255 / 10%);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ink-fg);
}

/* Reported figure + who is involved */
.band {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: var(--s-4);
  margin-top: var(--s-6);
}
.band__fig { grid-column: 1 / -1; }
.band__who {
  padding: var(--s-4);
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
  min-width: 0;
}
.band__l {
  margin: 0 0 var(--s-1);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}
.band__v { margin: 0; font-size: var(--t-sm); line-height: 1.5; }

/* Narrative */
.narrative {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(0, 1fr);
  gap: var(--s-6);
  margin-top: var(--s-8);
}
.narrative__h { margin: 0 0 var(--s-3); font-size: var(--t-lg); }
.narrative__h + .narrative__p { margin-bottom: var(--s-6); }
.narrative__p { margin: 0 0 var(--s-6); font-size: var(--t-md); line-height: 1.65; color: var(--text); max-width: 72ch; }
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

.fbadge {
  display: inline-block;
  margin-right: var(--s-2);
  padding: 1px var(--s-2);
  border-radius: var(--r-full);
  background: var(--surface-sunken);
  border: 1px solid var(--rule);
  font-family: var(--font-mono);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--text);
}

/* Blocks */
.block { margin-top: var(--s-8); }
.block__head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--s-4); flex-wrap: wrap; margin-bottom: var(--s-2); }
.block__meta { font-size: var(--t-xs); color: var(--text-muted); }
.block__help { margin: 0 0 var(--s-5); max-width: 76ch; font-size: var(--t-sm); color: var(--text-muted); line-height: 1.55; }
.block__all { font-size: var(--t-sm); font-weight: 600; color: var(--celeste-deep); text-decoration: none; }
.block__all:hover { text-decoration: underline; }

.scope {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--s-2);
  margin: 0 0 var(--s-5);
  padding: var(--s-2) var(--s-3);
  background: var(--surface-sunken);
  border-left: 2px solid var(--celeste);
  border-radius: var(--r-sm);
  font-size: var(--t-xs);
  line-height: 1.5;
}
.scope__l {
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}
.scope__v { color: var(--text); min-width: 0; }

.kpis { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--s-4); }
.kpi {
  display: flex;
  flex-direction: column;
  gap: var(--s-1);
  padding: var(--s-4) var(--s-5);
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-1);
}
.kpi__n {
  font-family: var(--font-display);
  font-size: var(--t-2xl);
  font-weight: 700;
  font-stretch: 112%;
  line-height: 1;
  letter-spacing: -0.03em;
}
.kpi__l { font-size: var(--t-sm); color: var(--text-muted); }

.cols { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--s-6); margin-top: var(--s-8); }
/* min-width:0 on the ITEMS, not only minmax(0,…) on the tracks: a grid item
   defaults to min-width:auto and would otherwise adopt the chart's floor as its
   own minimum and drag the track past the viewport. */
.cols > * { min-width: 0; margin-top: 0; }

/* Ledger */
.ledger__foot { margin: var(--s-3) 0 0; font-size: var(--t-xs); color: var(--text-muted); line-height: 1.5; max-width: 84ch; }

/* The absence */
.nodata {
  padding: clamp(var(--s-5), 4vw, var(--s-6));
  background: var(--surface-sunken);
  border: 1px solid var(--rule);
  border-left: 3px solid var(--celeste);
  border-radius: var(--r-lg);
}
.nodata__t { margin: 0 0 var(--s-3); font-size: var(--t-lg); }
.nodata__s { margin: var(--s-5) 0 var(--s-2); font-size: var(--t-sm); }
.nodata__b { margin: 0; max-width: 78ch; font-size: var(--t-sm); color: var(--text-muted); line-height: 1.6; }
.nodata__c { margin: var(--s-4) 0 0; font-size: var(--t-xs); color: var(--text-muted); line-height: 1.5; }
.nodata__cta {
  display: inline-flex;
  align-items: center;
  gap: var(--s-1);
  margin-top: var(--s-5);
  font-size: var(--t-sm);
  font-weight: 600;
  color: var(--celeste-deep);
  text-decoration: none;
}
.nodata__cta:hover { text-decoration: underline; }

/* Related */
/* Buttons + not found */
@media (max-width: 900px) {
  .narrative { grid-template-columns: minmax(0, 1fr); }
  .cols { grid-template-columns: minmax(0, 1fr); gap: var(--s-8); }
}
@media (max-width: 640px) {
  .kpis { grid-template-columns: minmax(0, 1fr); }
}
</style>
