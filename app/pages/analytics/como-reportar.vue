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

useSeo(() => ({
  title: t('seo.comoReportar.title'),
  description: t('seo.comoReportar.description'),
  path: '/analytics/como-reportar',
}))
</script>

<template>
  <div class="u-container page">
    <header class="hero">
      <p class="u-eyebrow hero__eyebrow">
        {{ t('comoReportar.eyebrow') }}
      </p>
      <h1 class="hero__t">
        {{ t('comoReportar.title') }}
      </h1>
      <p class="u-lead hero__lead">
        {{ t('comoReportar.dek') }}
      </p>
      <NuxtLink
        :to="localePath('/analytics/errores-carga')"
        class="hero__back"
      >
        ← {{ t('nav.erroresCarga') }}
      </NuxtLink>
    </header>

    <section class="block">
      <h2 class="block__t">
        {{ t('comoReportar.whoTitle') }}
      </h2>
      <p class="block__b">
        {{ t('comoReportar.whoBody') }}
      </p>
    </section>

    <section class="block">
      <h2 class="block__t">
        {{ t('comoReportar.stepsTitle') }}
      </h2>
      <ol class="steps">
        <li
          v-for="(s, i) in steps"
          :key="i"
          class="step"
        >
          <span class="step__n u-mono">{{ i + 1 }}</span>
          <span class="step__b">{{ s }}</span>
        </li>
      </ol>
    </section>

    <div class="cols">
      <section class="block">
        <h2 class="block__t">
          {{ t('comoReportar.attachTitle') }}
        </h2>
        <p class="block__b">
          {{ t('comoReportar.attachBody') }}
        </p>
      </section>

      <section class="block">
        <h2 class="block__t">
          {{ t('comoReportar.contactsTitle') }}
        </h2>
        <p class="block__b">
          {{ t('comoReportar.contactsBody') }}
        </p>
        <a
          href="https://www.comprasestatales.gub.uy"
          target="_blank"
          rel="noopener external"
          class="block__link"
        >
          <v-icon size="16">mdi-open-in-new</v-icon>
          {{ t('comoReportar.officialLink') }}
        </a>
      </section>
    </div>

    <p class="disclaimer">
      {{ t('comoReportar.disclaimer') }}
    </p>
  </div>
</template>

<style scoped>
.page { padding-block: var(--s-6) var(--s-8); max-width: 80ch; }

.hero { margin-bottom: var(--s-7); }
.hero__eyebrow { color: var(--celeste-deep); }
.hero__t { margin: var(--s-2) 0 var(--s-3); font-size: var(--t-2xl); line-height: 1.15; }
.hero__lead { color: var(--text-muted); }

.hero__back {
  display: inline-block;
  margin-top: var(--s-4);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--celeste-deep);
  text-decoration: none;
}

.hero__back:hover { text-decoration: underline; }

.block { margin-bottom: var(--s-6); }

.block__t {
  margin: 0 0 var(--s-2);
  font-size: var(--t-lg);
}

.block__b {
  margin: 0;
  font-size: var(--t-md);
  line-height: 1.6;
  color: var(--text-muted);
}

.cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--s-5) var(--s-6);
}

.steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
}

.step {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--s-3);
  align-items: start;
  padding: var(--s-4);
  border: 1px solid var(--rule);
  border-left: 3px solid var(--celeste);
  border-radius: var(--r-md);
  background: var(--surface);
}

.step__n {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--surface-sunken);
  color: var(--celeste-deep);
  font-weight: 700;
  font-size: var(--t-sm);
}

.step__b {
  font-size: var(--t-sm);
  line-height: 1.55;
}

.block__link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: var(--s-3);
  font-size: var(--t-sm);
  font-weight: 600;
  color: var(--celeste-deep);
  text-decoration: none;
}

.block__link:hover { text-decoration: underline; }

.disclaimer {
  margin: var(--s-6) 0 0;
  padding-top: var(--s-5);
  border-top: 1px solid var(--rule);
  font-size: var(--t-xs);
  color: var(--text-muted);
  font-style: italic;
}

@media (max-width: 620px) {
  .cols { grid-template-columns: 1fr; }
}
</style>
