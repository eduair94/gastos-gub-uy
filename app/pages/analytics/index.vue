<script setup lang="ts">
/**
 * Analytics hub — one navigable front door to every detection/analysis surface.
 *
 * The six analytics pages used to sit flat in the top nav with no landing that
 * grouped them. This is that landing: a card per tool, plus the report guide.
 * Two cheap counts (unexplained, errores-carga) are fetched to give the two
 * action-oriented cards a live figure; everything else is static chrome.
 */
const { t } = useI18n()
const localePath = useLocalePath()
const siteUrl = useRuntimeConfig().public.siteUrl as string

// Cheap live counts (limit=1 → pagination.total, an indexed countDocuments). Kept
// off the render path with lazy fetches so the hub paints immediately.
const { data: unexpRes } = await useFetch<any>('/api/analytics/anomalies', {
  query: { ai: 'unexplained', limit: 1 },
  lazy: true,
})
const { data: cargaRes } = await useFetch<any>('/api/analytics/anomalies', {
  query: { ai: 'explainable', category: 'error-carga,moneda-erronea', limit: 1 },
  lazy: true,
})
const counts = computed<Record<string, number | null>>(() => ({
  unexplained: unexpRes.value?.data?.pagination?.total ?? null,
  erroresCarga: cargaRes.value?.data?.pagination?.total ?? null,
}))

const cards = computed(() => [
  { key: 'alertas', to: '/analytics/anomalies', icon: 'mdi-flag-outline', emoji: '🚩' },
  { key: 'unexplained', to: '/analytics/unexplained', icon: 'mdi-help-rhombus-outline', emoji: '🔎' },
  { key: 'erroresCarga', to: '/analytics/errores-carga', icon: 'mdi-database-alert-outline', emoji: '🧾', feature: true },
  { key: 'providerAnomalies', to: '/analytics/proveedores-anomalias', icon: 'mdi-account-alert-outline', emoji: '🏢' },
  { key: 'providerLoadErrors', to: '/analytics/proveedores-errores-carga', icon: 'mdi-clipboard-alert-outline', emoji: '🧮' },
  { key: 'intendencias', to: '/analytics/intendencias', icon: 'mdi-city-variant-outline', emoji: '🏙️' },
  { key: 'organismos', to: '/analytics/organismos', icon: 'mdi-finance', emoji: '🏛️' },
  { key: 'mapa', to: '/analytics/mapa', icon: 'mdi-view-grid-outline', emoji: '🗺️' },
  { key: 'estadisticas', to: '/estadisticas', icon: 'mdi-chart-box-outline', emoji: '📊' },
])

const orgLd = useOrgLd()

useSeo(() => ({
  title: t('seo.analyticsHub.title'),
  description: t('seo.analyticsHub.description'),
  path: '/analytics',
  kicker: 'Análisis',
  jsonLd: [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      'name': t('seo.analyticsHub.title'),
      'description': t('seo.analyticsHub.description'),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      'itemListElement': cards.value.map((c, i) => ({
        '@type': 'ListItem',
        'position': i + 1,
        'name': t(`analyticsHub.cards.${c.key}.title`),
        'url': `${siteUrl}${c.to}`,
      })),
    },
    orgLd,
  ],
}))
</script>

<template>
  <div class="hub">
    <header class="hub-hero">
      <div class="u-container">
        <p class="hub-kicker">
          {{ t('analyticsHub.kicker') }}
        </p>
        <h1>{{ t('analyticsHub.title') }}</h1>
        <p class="hub-dek">
          {{ t('analyticsHub.dek') }}
        </p>
      </div>
    </header>

    <section class="hub-sec">
      <div class="u-container">
        <div class="hub-cards">
          <NuxtLink
            v-for="c in cards"
            :key="c.key"
            :to="localePath(c.to)"
            class="hub-card"
            :class="{ 'hub-card--feature': c.feature }"
          >
            <div class="hub-card__top">
              <span class="hub-card__emoji">{{ c.emoji }}</span>
              <span
                v-if="counts[c.key] != null"
                class="hub-card__count u-mono"
              >{{ formatNumber(counts[c.key]!) }}</span>
            </div>
            <h3 class="hub-card__title">
              {{ t(`analyticsHub.cards.${c.key}.title`) }}
            </h3>
            <p class="hub-card__dek">
              {{ t(`analyticsHub.cards.${c.key}.dek`) }}
            </p>
            <span class="hub-card__cta">{{ t('common.viewDetail') }} →</span>
          </NuxtLink>
        </div>

        <!-- The report guide sits apart: it's a how-to, not a data surface. -->
        <NuxtLink
          :to="localePath('/analytics/como-reportar')"
          class="hub-guide"
        >
          <span class="hub-guide__emoji">✉️</span>
          <span class="hub-guide__text">
            <span class="hub-guide__title">{{ t('analyticsHub.cards.comoReportar.title') }}</span>
            <span class="hub-guide__dek">{{ t('analyticsHub.cards.comoReportar.dek') }}</span>
          </span>
          <v-icon
            size="20"
            class="hub-guide__chev"
          >
            mdi-chevron-right
          </v-icon>
        </NuxtLink>
      </div>
    </section>
  </div>
</template>

<style scoped>
.hub-hero {
  padding-block: var(--s-7) var(--s-5);
  border-bottom: 1px solid var(--rule);
  background: var(--surface);
}

.hub-kicker {
  margin: 0 0 var(--s-2);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--celeste-deep);
}

.hub-hero h1 {
  margin: 0 0 var(--s-3);
  font-size: var(--t-2xl);
  line-height: 1.12;
  max-width: 22ch;
}

.hub-dek {
  margin: 0;
  max-width: 68ch;
  font-size: var(--t-md);
  line-height: 1.6;
  color: var(--text-muted);
}

.hub-sec { padding-block: var(--s-6) var(--s-8); }

.hub-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: var(--s-4);
}

.hub-card {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  padding: var(--s-5);
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
  background: var(--surface);
  text-decoration: none;
  color: inherit;
  transition: border-color var(--dur) var(--ease), box-shadow var(--dur) var(--ease), transform var(--dur) var(--ease);
}

.hub-card:hover {
  border-color: color-mix(in srgb, var(--celeste) 50%, var(--rule));
  box-shadow: var(--shadow-2);
  transform: translateY(-2px);
}

.hub-card--feature {
  border-color: color-mix(in srgb, var(--celeste) 40%, var(--rule));
  background: color-mix(in srgb, var(--celeste) 6%, var(--surface));
}

.hub-card__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-3);
}

.hub-card__emoji { font-size: 1.6rem; line-height: 1; }

.hub-card__count {
  font-size: var(--t-lg);
  font-weight: 700;
  color: var(--celeste-deep);
  font-variant-numeric: tabular-nums;
}

.hub-card__title {
  margin: var(--s-2) 0 0;
  font-size: var(--t-md);
  line-height: 1.2;
}

.hub-card__dek {
  margin: 0;
  font-size: var(--t-sm);
  line-height: 1.5;
  color: var(--text-muted);
  flex: 1;
}

.hub-card__cta {
  margin-top: var(--s-2);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--celeste-deep);
}

.hub-guide {
  display: flex;
  align-items: center;
  gap: var(--s-4);
  margin-top: var(--s-4);
  padding: var(--s-4) var(--s-5);
  border: 1px dashed var(--rule-strong, var(--rule));
  border-radius: var(--r-lg);
  background: var(--surface-sunken);
  text-decoration: none;
  color: inherit;
  transition: border-color var(--dur) var(--ease);
}

.hub-guide:hover { border-color: var(--celeste); }

.hub-guide__emoji { font-size: 1.5rem; flex: none; }

.hub-guide__text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.hub-guide__title { font-weight: 700; font-size: var(--t-md); }
.hub-guide__dek { font-size: var(--t-sm); color: var(--text-muted); }
.hub-guide__chev { margin-left: auto; color: var(--text-muted); flex: none; }

@media (max-width: 560px) {
  .hub-hero h1 { font-size: var(--t-xl); }
}
</style>
