<script setup lang="ts">
const { t } = useI18n()
const localePath = useLocalePath()

useSeo({
  title: t('developers.title'),
  description: t('developers.lead'),
  path: '/developers',
})

const curlExample = `curl -H "x-api-key: gk_live_xxx" \\
  "https://gastos.gub.uy/api/open-calls?limit=5"`

const integrations = computed(() => [
  { icon: 'mdi-lightning-bolt-outline', title: t('developers.zapierTitle'), body: t('developers.zapierBody') },
  { icon: 'mdi-webhook', title: t('developers.webhooksTitle'), body: t('developers.webhooksBody') },
  { icon: 'mdi-robot-outline', title: t('developers.mcpTitle'), body: t('developers.mcpBody') },
])
</script>

<template>
  <div class="u-container dev">
    <header class="dev__head">
      <p class="u-eyebrow">
        {{ t('developers.eyebrow') }}
      </p>
      <h1 class="u-hero">
        {{ t('developers.title') }}
      </h1>
      <p class="dev__lead">
        {{ t('developers.lead') }}
      </p>
      <div class="dev__cta">
        <a
          href="/docs"
          class="dev__btn dev__btn--primary"
        >
          <v-icon size="18">
            mdi-book-open-variant
          </v-icon>
          {{ t('developers.docsCta') }}
        </a>
        <NuxtLink
          :to="localePath('/app/api-keys')"
          class="dev__btn"
        >
          <v-icon size="18">
            mdi-key-variant
          </v-icon>
          {{ t('developers.step1Cta') }}
        </NuxtLink>
      </div>
    </header>

    <section class="dev__steps">
      <div class="panel dev__step">
        <h2 class="dev__stepTitle">
          {{ t('developers.step1Title') }}
        </h2>
        <p>{{ t('developers.step1Body') }}</p>
        <NuxtLink
          :to="localePath('/app/api-keys')"
          class="dev__link"
        >
          {{ t('developers.step1Cta') }} →
        </NuxtLink>
      </div>
      <div class="panel dev__step">
        <h2 class="dev__stepTitle">
          {{ t('developers.step2Title') }}
        </h2>
        <p>{{ t('developers.step2Body') }}</p>
        <pre class="dev__code"><code>{{ curlExample }}</code></pre>
      </div>
      <div class="panel dev__step">
        <h2 class="dev__stepTitle">
          {{ t('developers.step3Title') }}
        </h2>
        <p>{{ t('developers.step3Body') }}</p>
        <a
          href="/docs"
          class="dev__link"
        >{{ t('developers.docsCta') }} →</a>
      </div>
    </section>

    <section class="dev__section">
      <h2 class="u-eyebrow">
        {{ t('developers.sectionIntegrations') }}
      </h2>
      <div class="dev__grid">
        <div
          v-for="card in integrations"
          :key="card.title"
          class="panel dev__card"
        >
          <v-icon
            size="26"
            class="dev__cardIcon"
          >
            {{ card.icon }}
          </v-icon>
          <h3 class="dev__cardTitle">
            {{ card.title }}
          </h3>
          <p>{{ card.body }}</p>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.dev { padding-block: var(--s-7) var(--s-9); max-width: 980px; }
.dev__head { margin-bottom: var(--s-7); max-width: 720px; }
.dev__lead { color: var(--text-muted); font-size: var(--t-lg); margin-top: var(--s-3); }
.dev__cta { display: flex; flex-wrap: wrap; gap: var(--s-3); margin-top: var(--s-5); }
.dev__btn { display: inline-flex; align-items: center; gap: var(--s-2); height: 42px; padding: 0 var(--s-4); border: 1px solid var(--rule); border-radius: var(--r-md); color: var(--text); text-decoration: none; font-weight: 600; font-size: var(--t-sm); }
.dev__btn:hover { border-color: var(--rule-strong); }
.dev__btn--primary { background: var(--cta-fill); color: var(--cta-fg); border-color: var(--cta-fill); }
.dev__btn--primary:hover { filter: brightness(1.06); }
.dev__steps { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: var(--s-4); margin-bottom: var(--s-7); }
.dev__step { padding: var(--s-5); display: flex; flex-direction: column; gap: var(--s-3); }
.dev__stepTitle { margin: 0; font-size: var(--t-base); font-weight: 700; }
.dev__step p { margin: 0; color: var(--text-muted); font-size: var(--t-sm); }
.dev__code { margin: 0; padding: var(--s-3); background: var(--surface-sunken); border: 1px solid var(--rule); border-radius: var(--r-md); overflow-x: auto; }
.dev__code code { font-family: var(--font-mono); font-size: var(--t-xs); color: var(--text); white-space: pre; }
.dev__link { color: var(--celeste-deep); text-decoration: none; font-size: var(--t-sm); font-weight: 600; margin-top: auto; }
.dev__link:hover { text-decoration: underline; }
.dev__section { margin-top: var(--s-4); }
.dev__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: var(--s-4); margin-top: var(--s-4); }
.dev__card { padding: var(--s-5); }
.dev__cardIcon { color: var(--celeste-deep); margin-bottom: var(--s-2); }
.dev__cardTitle { margin: 0 0 var(--s-2); font-size: var(--t-base); font-weight: 700; }
.dev__card p { margin: 0; color: var(--text-muted); font-size: var(--t-sm); }
</style>
