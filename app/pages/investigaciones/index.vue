<script setup lang="ts">
/**
 * Investigations hub — the front door to the data-journalism pieces.
 * Content (bilingual) and figures come from ~/data/investigaciones; the page is
 * chrome around them. Static by design: an investigation is a verified snapshot.
 *
 * The card grid is DECLARED, not written out: every card used to be twenty-odd
 * lines of hand-copied markup, so adding a piece meant copying a block and
 * hoping it matched the last one. Add an entry to `SERIES` instead.
 */
import { invContent } from '~/data/investigaciones'

const { t, locale } = useI18n()
const localePath = useLocalePath()

const c = computed(() => invContent(locale.value).hub)
const siteUrl = useRuntimeConfig().public.siteUrl as string
const orgLd = useOrgLd()

// The dossier collection is the one part of this hub that is not static copy:
// it grows every time a caso is added, so the hub asks the API for the roster
// instead of hard-coding fourteen counts that would go stale on the next entry.
// `summary=1` returns the themes and the totals WITHOUT the ~100 cards, which
// this page does not render.
const { data: casosRes } = await useFetch<any>('/api/casos?summary=1')
const casoThemes = computed<any[]>(() => casosRes.value?.data?.themes ?? [])
const casoTotal = computed<number>(() => casosRes.value?.data?.totalAll ?? 0)
const casoSources = computed<number>(() => casosRes.value?.data?.sourceTotal ?? 0)
function casoThemeText(th: any) {
  return locale.value === 'en' ? th.en : th.es
}

const readMore = computed(() => c.value.readMore ?? t('common.viewDetail'))

/** The published series, in the order the hub argues them. One entry per card. */
const series = computed(() => [
  {
    key: 'casinos',
    tag: c.value.serieTag,
    title: c.value.serieTitle,
    intro: c.value.serieIntro,
    cards: [
      { path: '/investigaciones/casinos', emoji: '🏛️', ...c.value.cardCasinos },
      { path: '/investigaciones/casinos-cortesia', emoji: '🎰', ...c.value.cardCortesia },
    ],
  },
  {
    key: 'intendencias',
    tag: c.value.serieTag,
    title: c.value.serieImTitle,
    intro: c.value.serieImIntro,
    cards: [
      { path: '/investigaciones/intendencia-montevideo', emoji: '🏙️', ...c.value.cardIm },
      { path: '/investigaciones/tv-ciudad', emoji: '📺', ...c.value.cardTvciudad },
    ],
  },
  {
    key: 'empresas',
    tag: c.value.serieTag,
    title: c.value.serieEmpTitle,
    intro: c.value.serieEmpIntro,
    cards: [
      { path: '/investigaciones/empresas-senaladas', emoji: '🏢', ...c.value.cardEmpresas },
      { path: '/investigaciones/asse-ambulancias', emoji: '🚑', ...c.value.cardAsse },
      { path: '/investigaciones/frigorifico-saturno', emoji: '🥩', ...c.value.cardSaturno },
      { path: '/investigaciones/gasto-en-genero', emoji: '⚖️', ...c.value.cardGenero },
      { path: '/investigaciones/hallazgos', emoji: '🔎', ...c.value.cardHallazgos },
      { path: '/investigaciones/datacenter-google', emoji: '🗄️', ...c.value.cardDatacenter },
      { path: '/investigaciones/competencia-aparente', emoji: '🤝', ...c.value.cardCompetencia },
      { path: '/investigaciones/mensajes-del-estado', emoji: '📣', ...c.value.cardMensajes },
    ],
  },
  {
    key: 'pais',
    tag: c.value.serieTag,
    title: c.value.seriePaisTitle,
    intro: c.value.seriePaisIntro,
    cards: [
      { path: '/investigaciones/mejor-o-peor', emoji: '📉', ...c.value.cardMejorPeor },
    ],
  },
])

useSeo(() => ({
  title: c.value.title,
  description: c.value.dek.slice(0, 155),
  path: '/investigaciones',
  kicker: 'Investigaciones',
  jsonLd: [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      'name': c.value.title,
      'description': c.value.dek.slice(0, 155),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      // Mirrors the investigation cards actually rendered below, in the same order.
      'itemListElement': [
        { name: t('casos.hub.title'), url: `${siteUrl}/investigaciones/casos` },
        ...series.value.flatMap(s => s.cards.map(card => ({ name: card.title, url: `${siteUrl}${card.path}` }))),
      ].map((it, i) => ({
        '@type': 'ListItem',
        'position': i + 1,
        'name': it.name,
        'url': it.url,
      })),
    },
    orgLd,
  ],
}))
</script>

<template>
  <div class="inv">
    <!-- Hero -->
    <header class="inv-hubhero">
      <div class="u-container">
        <p class="inv-kicker">
          {{ c.kicker }}
        </p>
        <h1>{{ c.title }}</h1>
        <p class="inv-dek">
          {{ c.dek }}
        </p>
        <div class="inv-hubstats">
          <div
            v-for="s in c.stats"
            :key="s.l"
            class="inv-hubstat"
          >
            <b>{{ s.n }}</b>
            <span>{{ s.l }}</span>
          </div>
        </div>
      </div>
    </header>

    <!-- Serie: the dossier collection. First, because it is the widest door:
         fourteen subjects and a hundred-odd files, against one long-form piece
         per card below. Plain (not --alt) so the section rhythm below it is
         unchanged: the next section is the one that carries the tint. -->
    <InvSection
      serie
      :tag="t('casos.hub.tag')"
      :title="t('casos.hub.title')"
      :dek="t('casos.hub.intro')"
    >
      <div class="casohub">
        <NuxtLink
          v-for="th in casoThemes"
          :key="th.key"
          :to="localePath(`/investigaciones/temas/${th.key}`)"
          class="casohub__chip"
        >
          <span class="casohub__emoji">{{ th.emoji }}</span>
          <span class="casohub__label">{{ casoThemeText(th).label }}</span>
          <span class="casohub__n u-mono">{{ th.count }}</span>
        </NuxtLink>
      </div>

      <div class="casohub__foot">
        <NuxtLink
          :to="localePath('/investigaciones/casos')"
          class="casohub__cta"
        >
          {{ t('casos.hub.cta', { n: casoTotal }) }}
          <v-icon size="16">
            mdi-arrow-right
          </v-icon>
        </NuxtLink>
        <span class="casohub__meta u-mono">{{ t('casos.sourcesTotal', { n: casoSources }) }}</span>
      </div>
    </InvSection>

    <!-- The published series -->
    <InvSection
      v-for="(s, i) in series"
      :key="s.key"
      serie
      :alt="i % 2 === 0"
      :tag="s.tag"
      :title="s.title"
      :dek="s.intro"
    >
      <div class="inv-cards">
        <InvLinkCard
          v-for="card in s.cards"
          :key="card.path"
          :to="localePath(card.path)"
          :emoji="card.emoji"
          :eyebrow="card.eyebrow"
          :title="card.title"
          :dek="card.dek"
          :tags="card.tags"
          :cta="readMore"
        />
      </div>
    </InvSection>

    <!-- How -->
    <InvSection
      alt
      serie
      :tag="c.methodTag"
      :title="c.methodTitle"
    >
      <div class="inv-how">
        <div
          v-for="h in c.how"
          :key="h.h"
          class="inv-howitem"
        >
          <p class="n">
            {{ h.n }}
          </p>
          <h3>{{ h.h }}</h3>
          <p>{{ h.p }}</p>
        </div>
      </div>
    </InvSection>

    <!-- Soon -->
    <InvSection
      serie
      :tag="c.soonTag"
      :title="c.soonTitle"
    >
      <div class="inv-cards">
        <InvLinkCard
          v-for="s in c.soon"
          :key="s.title"
          :emoji="s.emoji"
          :eyebrow="s.eyebrow"
          :title="s.title"
          :dek="s.dek"
        />
      </div>
    </InvSection>
  </div>
</template>
