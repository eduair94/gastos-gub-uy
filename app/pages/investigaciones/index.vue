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

useSeo(() => ({
  title: c.value.title,
  description: c.value.dek.slice(0, 155),
  path: '/investigaciones',
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
        </div>
      </div>
    </section>

    <!-- How -->
    <section class="inv-sec">
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
