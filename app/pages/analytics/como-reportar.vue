<script setup lang="ts">
/**
 * How to report a data-load error. Static bilingual guide.
 *
 * Procurement data is entered by each buying agency (SICE) and published by ACCE
 * on comprasestatales.gub.uy. This site detects likely load errors but does not
 * store or forward reports — corrections happen at the source. The guide names who
 * corrects the data, the steps, what to attach, and where to write. It deliberately
 * does not assert a specific email address (which we can't verify): it points at the
 * buying agency's own channel and the platform's public contact area.
 */
const { t } = useI18n()
const localePath = useLocalePath()

const steps = computed(() => [
  t('comoReportar.step1'),
  t('comoReportar.step2'),
  t('comoReportar.step3'),
  t('comoReportar.step4'),
  t('comoReportar.step5'),
])

const orgLd = useOrgLd()

useSeo(() => ({
  title: t('seo.comoReportar.title'),
  description: t('seo.comoReportar.description'),
  path: '/analytics/como-reportar',
  kicker: 'Cómo reportar',
  jsonLd: {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    'name': t('seo.comoReportar.title'),
    'description': t('seo.comoReportar.description'),
    'isPartOf': orgLd,
  },
}))
</script>

<template>
  <v-container class="report-page">
    <v-btn
      :to="localePath('/analytics/errores-carga')"
      class="report-back"
      variant="text"
      size="small"
    >
      <span aria-hidden="true">←</span>
      {{ t('nav.erroresCarga') }}
    </v-btn>

    <header class="hero">
      <v-row align="start">
        <v-col
          cols="12"
          md="8"
          lg="7"
        >
          <p class="u-eyebrow hero__eyebrow">
            {{ t('comoReportar.eyebrow') }}
          </p>
          <h1 class="hero__title">
            {{ t('comoReportar.title') }}
          </h1>
          <p class="u-lead hero__lead">
            {{ t('comoReportar.dek') }}
          </p>
        </v-col>

        <v-col
          cols="12"
          md="4"
          lg="4"
          offset-lg="1"
        >
          <v-card
            class="source-card"
            variant="outlined"
          >
            <v-card-title class="source-card__title">
              {{ t('comoReportar.whoTitle') }}
            </v-card-title>
            <v-card-text class="source-card__body">
              {{ t('comoReportar.whoBody') }}
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
    </header>

    <section class="process-section">
      <v-row align="start">
        <v-col
          cols="12"
          lg="4"
        >
          <div class="process-heading">
            <p class="u-eyebrow process-heading__eyebrow">
              {{ t('comoReportar.eyebrow') }}
            </p>
            <h2 class="process-heading__title">
              {{ t('comoReportar.stepsTitle') }}
            </h2>
          </div>
        </v-col>

        <v-col
          cols="12"
          lg="8"
        >
          <v-list
            tag="ol"
            class="steps-list"
          >
            <v-list-item
              v-for="(step, index) in steps"
              :key="index"
              tag="li"
              class="step-item"
            >
              <template #prepend>
                <v-avatar
                  class="step-item__number u-mono"
                  size="36"
                >
                  {{ index + 1 }}
                </v-avatar>
              </template>

              <v-list-item-title class="step-item__text">
                {{ step }}
              </v-list-item-title>
            </v-list-item>
          </v-list>
        </v-col>
      </v-row>
    </section>

    <v-row
      class="information-row"
      align="stretch"
    >
      <v-col
        cols="12"
        md="6"
      >
        <v-card
          class="information-card"
          variant="outlined"
          height="100%"
        >
          <v-card-title class="information-card__title">
            {{ t('comoReportar.attachTitle') }}
          </v-card-title>
          <v-card-text class="information-card__body">
            {{ t('comoReportar.attachBody') }}
          </v-card-text>
        </v-card>
      </v-col>

      <v-col
        cols="12"
        md="6"
      >
        <v-card
          class="information-card"
          variant="outlined"
          height="100%"
        >
          <v-card-title class="information-card__title">
            {{ t('comoReportar.contactsTitle') }}
          </v-card-title>
          <v-card-text class="information-card__body">
            <p>{{ t('comoReportar.contactsBody') }}</p>
            <v-btn
              href="https://www.comprasestatales.gub.uy"
              target="_blank"
              rel="noopener external"
              class="official-link"
              variant="outlined"
              color="primary"
              append-icon="mdi-open-in-new"
            >
              {{ t('comoReportar.officialLink') }}
            </v-btn>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <v-alert
      class="disclaimer"
      variant="tonal"
      color="primary"
      :icon="false"
    >
      {{ t('comoReportar.disclaimer') }}
    </v-alert>
  </v-container>
</template>

<style scoped>
.report-page {
  padding-block: var(--s-5) var(--s-8);
}

.report-back {
  margin: 0 0 var(--s-5) calc(var(--s-3) * -1);
  font-family: var(--font-mono);
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--celeste-deep) !important;
}

.report-back span {
  margin-right: var(--s-2);
  font-size: var(--t-md);
}

.hero {
  margin-bottom: var(--s-8);
}

.hero__eyebrow,
.process-heading__eyebrow {
  color: var(--celeste-deep);
}

.hero__title {
  max-width: 16ch;
  margin: var(--s-2) 0 var(--s-4);
  font-size: clamp(var(--t-2xl), 5vw, var(--t-3xl));
  line-height: 1.04;
}

.hero__lead {
  max-width: 66ch;
  color: var(--text-muted);
}

.source-card,
.information-card {
  border-color: var(--rule);
  background: var(--surface);
}

.source-card {
  border-top: 4px solid var(--celeste);
}

.source-card__title,
.information-card__title {
  padding: var(--s-5) var(--s-5) var(--s-2);
  font-family: var(--font-display);
  font-size: var(--t-lg);
  font-weight: 700;
  line-height: 1.2;
  white-space: normal;
}

.source-card__body,
.information-card__body {
  padding: 0 var(--s-5) var(--s-5);
  font-size: var(--t-sm);
  line-height: 1.65;
  color: var(--text-muted);
}

.process-section {
  padding-block: var(--s-7);
  border-block: 1px solid var(--rule);
}

.process-heading__eyebrow {
  margin-bottom: var(--s-2);
}

.process-heading__title {
  max-width: 12ch;
  margin: 0;
  font-size: var(--t-2xl);
  line-height: 1.08;
}

.steps-list {
  display: grid;
  gap: var(--s-3);
  padding: 0;
  background: transparent;
}

.step-item {
  min-height: 0;
  padding: var(--s-4) var(--s-5);
  border: 1px solid var(--rule);
  border-left: 3px solid var(--celeste);
  border-radius: var(--r-md);
  background: var(--surface);
}

.step-item__number {
  margin-right: var(--s-4);
  background: var(--surface-sunken);
  color: var(--celeste-deep);
  font-size: var(--t-sm);
  font-weight: 700;
}

.step-item__text {
  overflow: visible;
  font-size: var(--t-sm);
  line-height: 1.6;
  text-overflow: initial;
  white-space: normal;
}

.information-row {
  margin-top: var(--s-7);
}

.information-card__body p {
  margin: 0;
}

.official-link {
  margin-top: var(--s-4);
}

.disclaimer {
  margin-top: var(--s-6);
  font-size: var(--t-sm);
  line-height: 1.55;
}

@media (min-width: 1280px) {
  .process-heading {
    position: sticky;
    top: calc(var(--s-7) + 64px);
  }
}

@media (max-width: 599px) {
  .report-page {
    padding-inline: var(--s-4);
  }

  .hero {
    margin-bottom: var(--s-6);
  }

  .hero__title {
    font-size: var(--t-2xl);
  }

  .process-section {
    padding-block: var(--s-5);
  }

  .process-heading__title {
    max-width: none;
    font-size: var(--t-xl);
  }

  .step-item {
    padding: var(--s-4);
  }

  .step-item__number {
    margin-right: var(--s-3);
  }

  .information-row {
    margin-top: var(--s-5);
  }

  .official-link {
    width: 100%;
  }
}
</style>
