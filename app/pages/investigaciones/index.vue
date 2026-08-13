<script setup lang="ts">
/**
 * Investigations hub — the front door to the data-journalism pieces.
 * Content (bilingual) and figures come from ~/data/investigaciones; the page is
 * chrome around them. Static by design: an investigation is a verified snapshot.
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
        { name: c.value.cardCasinos.title, url: `${siteUrl}/investigaciones/casinos` },
        { name: c.value.cardCortesia.title, url: `${siteUrl}/investigaciones/casinos-cortesia` },
        { name: c.value.cardIm.title, url: `${siteUrl}/investigaciones/intendencia-montevideo` },
        { name: c.value.cardTvciudad.title, url: `${siteUrl}/investigaciones/tv-ciudad` },
        { name: c.value.cardEmpresas.title, url: `${siteUrl}/investigaciones/empresas-senaladas` },
        { name: c.value.cardAsse.title, url: `${siteUrl}/investigaciones/asse-ambulancias` },
        { name: c.value.cardSaturno.title, url: `${siteUrl}/investigaciones/frigorifico-saturno` },
        { name: c.value.cardMejorPeor.title, url: `${siteUrl}/investigaciones/mejor-o-peor` },
        { name: c.value.cardGenero.title, url: `${siteUrl}/investigaciones/gasto-en-genero` },
        { name: c.value.cardMensajes.title, url: `${siteUrl}/investigaciones/mensajes-del-estado` },
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
    <section class="inv-sec">
      <div class="u-container">
        <div class="inv-serie">
          <span class="inv-serie__tag">{{ t('casos.hub.tag') }}</span>
          <h2>{{ t('casos.hub.title') }}</h2>
        </div>
        <p
          class="inv-prose"
          style="margin-bottom: var(--s-6); color: var(--text-muted);"
        >
          {{ t('casos.hub.intro') }}
        </p>

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
      </div>
    </section>

    <!-- Serie: Casinos -->
    <section class="inv-sec inv-sec--alt">
      <div class="u-container">
        <div class="inv-serie">
          <span class="inv-serie__tag">{{ c.serieTag }}</span>
          <h2>{{ c.serieTitle }}</h2>
        </div>
        <p
          class="inv-prose"
          style="margin-bottom: var(--s-7); color: var(--text-muted);"
        >
          {{ c.serieIntro }}
        </p>

        <div class="inv-cards">
          <!-- Comprehensive -->
          <NuxtLink
            :to="localePath('/investigaciones/casinos')"
            class="inv-icard"
          >
            <div class="inv-icard__top">
              <div>
                <p class="inv-icard__eyebrow">
                  {{ c.cardCasinos.eyebrow }}
                </p>
                <h3 class="inv-icard__title">
                  {{ c.cardCasinos.title }}
                </h3>
              </div>
              <div class="inv-icard__emoji">
                🏛️
              </div>
            </div>
            <div class="inv-icard__body">
              <p class="inv-icard__dek">
                {{ c.cardCasinos.dek }}
              </p>
              <div class="inv-icard__tags">
                <span
                  v-for="tg in c.cardCasinos.tags"
                  :key="tg"
                  class="inv-tagpill"
                >{{ tg }}</span>
              </div>
            </div>
            <div class="inv-icard__cta">
              {{ c.readMore ?? t('common.viewDetail') }} →
            </div>
          </NuxtLink>

          <!-- Cortesía deep-dive -->
          <NuxtLink
            :to="localePath('/investigaciones/casinos-cortesia')"
            class="inv-icard"
          >
            <div class="inv-icard__top">
              <div>
                <p class="inv-icard__eyebrow">
                  {{ c.cardCortesia.eyebrow }}
                </p>
                <h3 class="inv-icard__title">
                  {{ c.cardCortesia.title }}
                </h3>
              </div>
              <div class="inv-icard__emoji">
                🎰
              </div>
            </div>
            <div class="inv-icard__body">
              <p class="inv-icard__dek">
                {{ c.cardCortesia.dek }}
              </p>
              <div class="inv-icard__tags">
                <span
                  v-for="tg in c.cardCortesia.tags"
                  :key="tg"
                  class="inv-tagpill"
                >{{ tg }}</span>
              </div>
            </div>
            <div class="inv-icard__cta">
              {{ c.readMore }} →
            </div>
          </NuxtLink>
        </div>
      </div>
    </section>

    <!-- Serie: Intendencias -->
    <section class="inv-sec">
      <div class="u-container">
        <div class="inv-serie">
          <span class="inv-serie__tag">{{ c.serieTag }}</span>
          <h2>{{ c.serieImTitle }}</h2>
        </div>
        <p
          class="inv-prose"
          style="margin-bottom: var(--s-7); color: var(--text-muted);"
        >
          {{ c.serieImIntro }}
        </p>

        <div class="inv-cards">
          <NuxtLink
            :to="localePath('/investigaciones/intendencia-montevideo')"
            class="inv-icard"
          >
            <div class="inv-icard__top">
              <div>
                <p class="inv-icard__eyebrow">
                  {{ c.cardIm.eyebrow }}
                </p>
                <h3 class="inv-icard__title">
                  {{ c.cardIm.title }}
                </h3>
              </div>
              <div class="inv-icard__emoji">
                🏙️
              </div>
            </div>
            <div class="inv-icard__body">
              <p class="inv-icard__dek">
                {{ c.cardIm.dek }}
              </p>
              <div class="inv-icard__tags">
                <span
                  v-for="tg in c.cardIm.tags"
                  :key="tg"
                  class="inv-tagpill"
                >{{ tg }}</span>
              </div>
            </div>
            <div class="inv-icard__cta">
              {{ c.readMore ?? t('common.viewDetail') }} →
            </div>
          </NuxtLink>

          <NuxtLink
            :to="localePath('/investigaciones/tv-ciudad')"
            class="inv-icard"
          >
            <div class="inv-icard__top">
              <div>
                <p class="inv-icard__eyebrow">
                  {{ c.cardTvciudad.eyebrow }}
                </p>
                <h3 class="inv-icard__title">
                  {{ c.cardTvciudad.title }}
                </h3>
              </div>
              <div class="inv-icard__emoji">
                📺
              </div>
            </div>
            <div class="inv-icard__body">
              <p class="inv-icard__dek">
                {{ c.cardTvciudad.dek }}
              </p>
              <div class="inv-icard__tags">
                <span
                  v-for="tg in c.cardTvciudad.tags"
                  :key="tg"
                  class="inv-tagpill"
                >{{ tg }}</span>
              </div>
            </div>
            <div class="inv-icard__cta">
              {{ c.readMore ?? t('common.viewDetail') }} →
            </div>
          </NuxtLink>
        </div>
      </div>
    </section>

    <!-- Serie: Empresas señaladas -->
    <section class="inv-sec inv-sec--alt">
      <div class="u-container">
        <div class="inv-serie">
          <span class="inv-serie__tag">{{ c.serieTag }}</span>
          <h2>{{ c.serieEmpTitle }}</h2>
        </div>
        <p
          class="inv-prose"
          style="margin-bottom: var(--s-7); color: var(--text-muted);"
        >
          {{ c.serieEmpIntro }}
        </p>

        <div class="inv-cards">
          <NuxtLink
            :to="localePath('/investigaciones/empresas-senaladas')"
            class="inv-icard"
          >
            <div class="inv-icard__top">
              <div>
                <p class="inv-icard__eyebrow">
                  {{ c.cardEmpresas.eyebrow }}
                </p>
                <h3 class="inv-icard__title">
                  {{ c.cardEmpresas.title }}
                </h3>
              </div>
              <div class="inv-icard__emoji">
                🏢
              </div>
            </div>
            <div class="inv-icard__body">
              <p class="inv-icard__dek">
                {{ c.cardEmpresas.dek }}
              </p>
              <div class="inv-icard__tags">
                <span
                  v-for="tg in c.cardEmpresas.tags"
                  :key="tg"
                  class="inv-tagpill"
                >{{ tg }}</span>
              </div>
            </div>
            <div class="inv-icard__cta">
              {{ c.readMore ?? t('common.viewDetail') }} →
            </div>
          </NuxtLink>

          <NuxtLink
            :to="localePath('/investigaciones/asse-ambulancias')"
            class="inv-icard"
          >
            <div class="inv-icard__top">
              <div>
                <p class="inv-icard__eyebrow">
                  {{ c.cardAsse.eyebrow }}
                </p>
                <h3 class="inv-icard__title">
                  {{ c.cardAsse.title }}
                </h3>
              </div>
              <div class="inv-icard__emoji">
                🚑
              </div>
            </div>
            <div class="inv-icard__body">
              <p class="inv-icard__dek">
                {{ c.cardAsse.dek }}
              </p>
              <div class="inv-icard__tags">
                <span
                  v-for="tg in c.cardAsse.tags"
                  :key="tg"
                  class="inv-tagpill"
                >{{ tg }}</span>
              </div>
            </div>
            <div class="inv-icard__cta">
              {{ c.readMore ?? t('common.viewDetail') }} →
            </div>
          </NuxtLink>

          <NuxtLink
            :to="localePath('/investigaciones/frigorifico-saturno')"
            class="inv-icard"
          >
            <div class="inv-icard__top">
              <div>
                <p class="inv-icard__eyebrow">
                  {{ c.cardSaturno.eyebrow }}
                </p>
                <h3 class="inv-icard__title">
                  {{ c.cardSaturno.title }}
                </h3>
              </div>
              <div class="inv-icard__emoji">
                🥩
              </div>
            </div>
            <div class="inv-icard__body">
              <p class="inv-icard__dek">
                {{ c.cardSaturno.dek }}
              </p>
              <div class="inv-icard__tags">
                <span
                  v-for="tg in c.cardSaturno.tags"
                  :key="tg"
                  class="inv-tagpill"
                >{{ tg }}</span>
              </div>
            </div>
            <div class="inv-icard__cta">
              {{ c.readMore ?? t('common.viewDetail') }} →
            </div>
          </NuxtLink>

          <NuxtLink
            :to="localePath('/investigaciones/gasto-en-genero')"
            class="inv-icard"
          >
            <div class="inv-icard__top">
              <div>
                <p class="inv-icard__eyebrow">
                  {{ c.cardGenero.eyebrow }}
                </p>
                <h3 class="inv-icard__title">
                  {{ c.cardGenero.title }}
                </h3>
              </div>
              <div class="inv-icard__emoji">
                ⚖️
              </div>
            </div>
            <div class="inv-icard__body">
              <p class="inv-icard__dek">
                {{ c.cardGenero.dek }}
              </p>
              <div class="inv-icard__tags">
                <span
                  v-for="tg in c.cardGenero.tags"
                  :key="tg"
                  class="inv-tagpill"
                >{{ tg }}</span>
              </div>
            </div>
            <div class="inv-icard__cta">
              {{ c.readMore ?? t('common.viewDetail') }} →
            </div>
          </NuxtLink>

          <NuxtLink
            :to="localePath('/investigaciones/mensajes-del-estado')"
            class="inv-icard"
          >
            <div class="inv-icard__top">
              <div>
                <p class="inv-icard__eyebrow">
                  {{ c.cardMensajes.eyebrow }}
                </p>
                <h3 class="inv-icard__title">
                  {{ c.cardMensajes.title }}
                </h3>
              </div>
              <div class="inv-icard__emoji">
                📣
              </div>
            </div>
            <div class="inv-icard__body">
              <p class="inv-icard__dek">
                {{ c.cardMensajes.dek }}
              </p>
              <div class="inv-icard__tags">
                <span
                  v-for="tg in c.cardMensajes.tags"
                  :key="tg"
                  class="inv-tagpill"
                >{{ tg }}</span>
              </div>
            </div>
            <div class="inv-icard__cta">
              {{ c.readMore ?? t('common.viewDetail') }} →
            </div>
          </NuxtLink>
        </div>
      </div>
    </section>

    <!-- Serie: El país en números -->
    <section class="inv-sec">
      <div class="u-container">
        <div class="inv-serie">
          <span class="inv-serie__tag">{{ c.serieTag }}</span>
          <h2>{{ c.seriePaisTitle }}</h2>
        </div>
        <p
          class="inv-prose"
          style="margin-bottom: var(--s-7); color: var(--text-muted);"
        >
          {{ c.seriePaisIntro }}
        </p>

        <div class="inv-cards">
          <NuxtLink
            :to="localePath('/investigaciones/mejor-o-peor')"
            class="inv-icard"
          >
            <div class="inv-icard__top">
              <div>
                <p class="inv-icard__eyebrow">
                  {{ c.cardMejorPeor.eyebrow }}
                </p>
                <h3 class="inv-icard__title">
                  {{ c.cardMejorPeor.title }}
                </h3>
              </div>
              <div class="inv-icard__emoji">
                📉
              </div>
            </div>
            <div class="inv-icard__body">
              <p class="inv-icard__dek">
                {{ c.cardMejorPeor.dek }}
              </p>
              <div class="inv-icard__tags">
                <span
                  v-for="tg in c.cardMejorPeor.tags"
                  :key="tg"
                  class="inv-tagpill"
                >{{ tg }}</span>
              </div>
            </div>
            <div class="inv-icard__cta">
              {{ c.readMore ?? t('common.viewDetail') }} →
            </div>
          </NuxtLink>
        </div>
      </div>
    </section>

    <!-- How -->
    <section class="inv-sec inv-sec--alt">
      <div class="u-container">
        <div class="inv-serie">
          <span class="inv-serie__tag">{{ c.methodTag }}</span>
          <h2>{{ c.methodTitle }}</h2>
        </div>
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
      </div>
    </section>

    <!-- Soon -->
    <section class="inv-sec">
      <div class="u-container">
        <div class="inv-serie">
          <span class="inv-serie__tag">{{ c.soonTag }}</span>
          <h2>{{ c.soonTitle }}</h2>
        </div>
        <div class="inv-cards">
          <div
            v-for="s in c.soon"
            :key="s.title"
            class="inv-icard inv-soon"
          >
            <div class="inv-icard__top">
              <div>
                <p class="inv-icard__eyebrow">
                  {{ s.eyebrow }}
                </p>
                <h3 class="inv-icard__title">
                  {{ s.title }}
                </h3>
              </div>
              <div class="inv-icard__emoji">
                {{ s.emoji }}
              </div>
            </div>
            <div class="inv-icard__body">
              <p class="inv-icard__dek">
                {{ s.dek }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
