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
      <section class="chero">
        <div class="chero__in u-container">
          <NuxtLink
            :to="localePath('/curros')"
            class="chero__back"
          >
            <v-icon size="16">
              mdi-arrow-left
            </v-icon>
            {{ t('curros.backToAll') }}
          </NuxtLink>
          <p class="u-eyebrow chero__eyebrow">
            <span class="chero__emoji">{{ data.emoji }}</span>
            {{ t('curros.eyebrow') }}<span v-if="data.period"> · {{ data.period }}</span>
          </p>
          <h1 class="chero__title">
            {{ text?.title }}
          </h1>
          <p class="chero__dek">
            {{ text?.dek }}
          </p>
          <div class="chero__tags">
            <StatusChip
              :status="data.status"
              :label="statusLabel(data.status)"
              on="ink"
            />
          </div>
        </div>
      </section>

      <!-- KPIs -->
      <section class="u-container kpis">
        <div class="kpi kpi--money">
          <MoneyAmount
            :amount="kpis.total"
            size="xl"
            align="start"
          />
          <span class="kpi__l">{{ t('curros.kpi.total') }}</span>
        </div>
        <div class="kpi">
          <span class="kpi__n">{{ formatNumber(kpis.count) }}</span>
          <span class="kpi__l">{{ t('curros.kpi.count') }}</span>
        </div>
        <div class="kpi">
          <span class="kpi__n">{{ formatNumber(kpis.suppliers) }}</span>
          <span class="kpi__l">{{ t('curros.kpi.suppliers') }}</span>
        </div>
        <!-- The press figure closes the band rather than sitting in the hero:
             the point of the page is the distance between it and the computed
             total two cells up, and that comparison is made by adjacency. -->
        <ReportedFigure
          v-if="data.amountReported"
          class="kpis__reported"
          :label="t('curros.reportedLabel')"
          :claim="data.amountReported"
        />
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
        <aside class="sources">
          <h3 class="sources__h">
            {{ t('curros.sourcesTitle') }}
          </h3>
          <ul class="sources__list">
            <li
              v-for="(s, idx) in sources"
              :key="idx"
              class="sources__item"
            >
              <a
                :href="s.url"
                target="_blank"
                rel="noopener noreferrer"
                class="sources__link"
              >
                <span class="sources__outlet">{{ s.outlet }}<span
                  v-if="s.date"
                  class="sources__date"
                > · {{ s.date }}</span></span>
                <span class="sources__title">{{ s.title }}</span>
              </a>
            </li>
          </ul>
        </aside>
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
        <ol class="ledger">
          <li
            v-for="c in ledger"
            :key="c.id"
            class="ledger__row"
          >
            <NuxtLink
              :to="localePath(`/contracts/${c.id}`)"
              class="ledger__link"
            >
              <span class="ledger__text">
                <span class="ledger__what u-truncate">{{ c.title || t('common.contract') }}</span>
                <span class="ledger__who u-truncate">{{ c.supplier || c.buyerName }}<span v-if="c.date"> · {{ formatDate(c.date) }}</span></span>
              </span>
              <MoneyAmount
                :amount="c.amount"
                compact
                size="sm"
              />
            </NuxtLink>
          </li>
        </ol>
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
        <div class="rel">
          <NuxtLink
            v-for="r in related"
            :key="r.slug"
            :to="localePath(`/curros/${r.slug}`)"
            class="relcard"
          >
            <span class="relcard__emoji">{{ r.emoji }}</span>
            <span class="relcard__t">{{ (locale === 'en' ? r.en : r.es).title }}</span>
            <StatusChip
              :status="r.status"
              :label="statusLabel(r.status)"
              variant="micro"
            />
          </NuxtLink>
        </div>
      </section>
    </template>

    <!-- Not found -->
    <section
      v-else
      class="u-container notfound"
    >
      <h1 class="notfound__t">
        {{ t('curros.notFound.title') }}
      </h1>
      <p class="notfound__b">
        {{ t('curros.notFound.body') }}
      </p>
      <NuxtLink
        :to="localePath('/curros')"
        class="btn btn--primary"
      >
        {{ t('curros.notFound.action') }}
      </NuxtLink>
    </section>
  </div>
</template>

<style scoped>
.curro { padding-bottom: var(--s-8); }

.chero {
  background:
    radial-gradient(1000px 340px at 88% -20%, color-mix(in srgb, var(--ink-alerta) 20%, transparent), transparent 70%),
    var(--ink);
  color: var(--ink-fg);
  border-bottom: 1px solid var(--rule);
}
.chero__in { padding-block: clamp(var(--s-6), 5vw, var(--s-8)); }
.chero__back {
  display: inline-flex;
  align-items: center;
  gap: var(--s-1);
  margin-bottom: var(--s-4);
  color: var(--ink-fg-dim);
  font-size: var(--t-sm);
  font-weight: 600;
  text-decoration: none;
}
.chero__back:hover { color: #fff; }
.chero__eyebrow { color: var(--sol); display: flex; align-items: center; gap: var(--s-2); }
.chero__emoji { font-size: 1.15em; }
.chero__title {
  margin: var(--s-3) 0 0;
  max-width: 22ch;
  font-family: var(--font-display);
  font-size: clamp(26px, 5vw, var(--t-3xl));
  font-stretch: 112%;
  line-height: 1.05;
  letter-spacing: -0.02em;
  color: #fff;
  text-wrap: balance;
}
.chero__dek {
  margin: var(--s-4) 0 0;
  max-width: 62ch;
  font-size: var(--t-md);
  line-height: 1.55;
  color: var(--ink-fg-dim);
}
.chero__tags { display: flex; flex-wrap: wrap; gap: var(--s-2); margin-top: var(--s-5); }

/* KPIs */
.kpis {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--s-4);
  margin-top: calc(var(--s-6) * -1);
  position: relative;
  z-index: 1;
}
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
/* Spans the band: it annotates all three figures, it is not a fourth one. */
.kpis__reported { grid-column: 1 / -1; }

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

.sources {
  align-self: start;
  padding: var(--s-4);
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-1);
}
.sources__h { margin: 0 0 var(--s-3); font-size: var(--t-sm); text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted); }
.sources__list { margin: 0; padding: 0; list-style: none; }
.sources__item + .sources__item { border-top: 1px solid var(--rule); }
.sources__link { display: flex; flex-direction: column; gap: 2px; padding: var(--s-3) 0; text-decoration: none; color: inherit; }
.sources__link:hover .sources__title { color: var(--celeste-deep); text-decoration: underline; }
.sources__outlet { font-size: var(--t-xs); font-weight: 700; color: var(--text); }
.sources__date { color: var(--text-muted); font-weight: 400; }
.sources__title { font-size: var(--t-sm); color: var(--text-muted); line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }

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
.ledger { margin: 0; padding: 0; list-style: none; border: 1px solid var(--rule); border-radius: var(--r-lg); background: var(--surface); overflow: hidden; }
.ledger__row + .ledger__row { border-top: 1px solid var(--rule); }
.ledger__link { display: flex; align-items: center; justify-content: space-between; gap: var(--s-4); padding: var(--s-3) var(--s-4); text-decoration: none; color: inherit; transition: background var(--dur) var(--ease); }
.ledger__link:hover { background: var(--surface-sunken); }
.ledger__text { display: flex; flex-direction: column; min-width: 0; gap: 1px; }
.ledger__what { font-size: var(--t-sm); font-weight: 600; }
.ledger__who { font-size: var(--t-xs); color: var(--text-muted); }
.ledger__foot { margin: var(--s-3) 0 0; font-size: var(--t-xs); color: var(--text-muted); line-height: 1.5; max-width: 80ch; }

/* Related */
.rel { display: flex; flex-wrap: wrap; gap: var(--s-3); }
.relcard { display: inline-flex; align-items: center; gap: var(--s-2); padding: var(--s-3) var(--s-4); border: 1px solid var(--rule); border-radius: var(--r-md); background: var(--surface); color: var(--text); font-size: var(--t-sm); font-weight: 600; text-decoration: none; transition: border-color var(--dur) var(--ease), background var(--dur) var(--ease); }
.relcard:hover { border-color: var(--celeste); background: var(--surface-sunken); }
.relcard__emoji { font-size: 1.2em; }

/* Buttons + not found */
.btn { display: inline-flex; align-items: center; gap: var(--s-2); padding: var(--s-3) var(--s-5); border-radius: var(--r-full); font-size: var(--t-sm); font-weight: 600; text-decoration: none; }
.btn--primary { background: var(--cta-fill); color: var(--cta-fg); }
.btn--primary:hover { filter: brightness(1.06); }
.notfound { padding-block: var(--s-9); text-align: center; }
.notfound__t { font-size: var(--t-2xl); margin: 0 0 var(--s-2); }
.notfound__b { color: var(--text-muted); margin: 0 0 var(--s-5); }

@media (max-width: 900px) {
  .narrative { grid-template-columns: minmax(0, 1fr); }
  /* `1fr` here is `minmax(auto, 1fr)`, whose auto floor is the chart's
     min-width — which is what made this page scroll sideways on a phone
     despite the chart having its own scroller. Always minmax(0, …). */
  .cols { grid-template-columns: minmax(0, 1fr); gap: var(--s-8); }
}
@media (max-width: 640px) {
  .kpis { grid-template-columns: minmax(0, 1fr); margin-top: var(--s-5); }
}
</style>
