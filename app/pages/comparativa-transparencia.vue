<script setup lang="ts">
/**
 * Comparativa · Quién más vigila al Estado uruguayo.
 *
 * Hermana de /comparativa (servicios de alertas), pero con una diferencia que manda
 * sobre todo el diseño de la página: acá conlatuya ESTÁ en la tabla. Por eso:
 *
 *   - El aviso de parte interesada va arriba de todo, antes de la matriz, no al pie.
 *   - La guía «¿qué necesitás?» es lo primero después del aviso, y varias de sus
 *     respuestas son un enlace a otro sitio. Es el bloque más útil de la página y el
 *     que demuestra que la comparativa no es un folleto nuestro.
 *   - Cada ficha lleva sus limitaciones. La nuestra lleva cuatro.
 *
 * Nota de diseño: los precios son tarifas de suscripción de plataformas privadas, NO
 * gasto público — van en celeste. El oro queda reservado al dinero del Estado.
 * Datos y fuentes: ~/data/comparativa-transparencia.
 */
import {
  PLATFORMS, DIMENSIONS, DECISION_GUIDE, METHODOLOGY, SELF_DISCLOSURE, INTERNATIONAL, VERIFIED_ON,
  type Platform, type Tri, type Capabilities,
} from '~/data/comparativa-transparencia'

const { t, locale } = useI18n()
const localePath = useLocalePath()

type L = 'es' | 'en'
function bi(x: { es: string, en: string }): string {
  return x[locale.value as L] ?? x.es
}

const us = computed(() => PLATFORMS.filter(p => p.group === 'nosotros'))
const civic = computed(() => PLATFORMS.filter(p => p.group === 'ciudadana'))
const official = computed(() => PLATFORMS.filter(p => p.group === 'oficial'))

// La matriz compara sólo lo comparable: nosotros y la sociedad civil. Los sitios del
// Estado son la fuente, no un competidor — una columna "¿código abierto?" sobre ARCE
// no dice nada útil. Van en fichas, abajo.
const comparable = computed(() => [...us.value, ...civic.value])

const matrixHeaders = computed(() => [
  {
    title: t('plataformas.dimensionLabel'),
    key: 'dimension',
    sortable: false,
    width: 200,
    minWidth: 180,
    align: 'start' as const,
  },
  ...comparable.value.map(p => ({
    title: p.name,
    key: p.id,
    sortable: false,
    minWidth: 128,
    align: 'center' as const,
  })),
])

const matrixItems = computed(() => DIMENSIONS.map(d => ({
  key: d.key,
  dimension: d,
})))

function capability(p: Platform, key: string): Tri {
  return p.capabilities[key as keyof Capabilities] ?? 'desconocido'
}
function triIcon(v: Tri): string {
  if (v === 'si') return 'mdi-check-circle'
  if (v === 'parcial') return 'mdi-circle-slice-4'
  if (v === 'no') return 'mdi-minus-circle-outline'
  return 'mdi-help-circle-outline'
}
function triClass(v: Tri): string {
  if (v === 'si') return 'tri tri--yes'
  if (v === 'parcial') return 'tri tri--half'
  if (v === 'no') return 'tri tri--no'
  return 'tri tri--unk'
}
function triLabel(v: Tri): string {
  return t(`plataformas.tri.${v === 'si' ? 'yes' : v === 'no' ? 'no' : v === 'parcial' ? 'partial' : 'unknown'}`)
}
function accessLabel(p: Platform): string {
  return t(`plataformas.access.${p.access}`)
}
// La guía con su plataforma ya resuelta, para que la plantilla no tenga que
// desreferenciar un opcional. Un id que no exista se cae acá y no renderiza una
// tarjeta rota; el test lo prohíbe de entrada.
const guide = computed(() =>
  DECISION_GUIDE
    .map(g => ({ ...g, platform: PLATFORMS.find(p => p.id === g.platformId) }))
    .filter((g): g is typeof g & { platform: Platform } => Boolean(g.platform)),
)
function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '')
  }
  catch {
    return url
  }
}

const orgLd = useOrgLd()
useSeo(() => ({
  title: t('seo.plataformas.title'),
  description: t('seo.plataformas.description'),
  path: '/comparativa-transparencia',
  kicker: 'Comparativa',
  jsonLd: {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    'name': t('seo.plataformas.title'),
    'description': t('seo.plataformas.description'),
    'publisher': orgLd,
  },
}))
</script>

<template>
  <div>
    <section class="chero">
      <v-container class="chero__in u-container">
        <p class="u-eyebrow">
          {{ t('plataformas.eyebrow') }}
        </p>
        <h1 class="chero__title">
          {{ t('plataformas.title') }}
        </h1>
        <p class="chero__lead">
          {{ t('plataformas.lead') }}
        </p>
        <p class="chero__verified">
          <v-icon size="15">
            mdi-check-decagram-outline
          </v-icon>
          {{ t('plataformas.verifiedLabel', { date: VERIFIED_ON }) }}
        </p>
      </v-container>
    </section>

    <v-container class="u-container cmp__body">
      <!-- Aviso de parte interesada: primero, no al pie -->
      <section class="mb-6 mb-md-8">
        <v-card class="disc">
          <p class="disc__badge">
            <v-icon size="15">
              mdi-scale-balance
            </v-icon>
            {{ t('plataformas.disclosureTitle') }}
          </p>
          <p class="disc__body">
            {{ bi(SELF_DISCLOSURE) }}
          </p>
        </v-card>
      </section>

      <!-- Guía por necesidad -->
      <section class="mb-6 mb-md-8">
        <h2 class="cmp__h ma-0 mb-2">
          {{ t('plataformas.guideTitle') }}
        </h2>
        <p class="cmp__help u-muted ma-0 mb-4">
          {{ t('plataformas.guideHelp') }}
        </p>
        <v-row>
          <v-col
            v-for="(g, i) in guide"
            :key="i"
            cols="12"
            md="6"
          >
            <v-card
              tag="article"
              height="100%"
              border
              rounded="md"
              class="gcard pa-4"
              :class="{ 'gcard--us': g.platform.isUs }"
            >
              <p class="gcard__need">
                {{ bi(g.need) }}
              </p>
              <p class="gcard__answer">
                <v-icon size="16">
                  mdi-arrow-right
                </v-icon>
                <NuxtLink
                  v-if="g.platform.isUs"
                  :to="localePath('/')"
                >{{ g.platform.name }}</NuxtLink>
                <a
                  v-else
                  :href="g.platform.url"
                  target="_blank"
                  rel="noopener nofollow"
                >{{ g.platform.name }}</a>
              </p>
              <p class="gcard__why">
                {{ bi(g.why) }}
              </p>
            </v-card>
          </v-col>
        </v-row>
      </section>

      <!-- Matriz -->
      <section class="mb-6 mb-md-8">
        <h2 class="cmp__h ma-0 mb-2">
          {{ t('plataformas.matrixTitle') }}
        </h2>
        <p class="cmp__help u-muted ma-0 mb-4">
          {{ t('plataformas.matrixHelp') }}
        </p>
        <v-card
          border
          class="cmp__tablewrap cmp__matrix"
        >
          <v-data-table
            :headers="matrixHeaders"
            :items="matrixItems"
            item-value="key"
            :items-per-page="-1"
            mobile-breakpoint="md"
            hide-default-footer
          >
            <template #item.dimension="{ item }">
              <span class="cmp__dim">
                {{ bi(item.dimension.label) }}
                <span
                  v-if="item.dimension.help"
                  class="cmp__dimhelp"
                >{{ bi(item.dimension.help) }}</span>
              </span>
            </template>

            <template
              v-for="p in comparable"
              #[`header.${p.id}`]
              :key="`head-${p.id}`"
            >
              <NuxtLink
                v-if="p.isUs"
                :to="localePath('/')"
              >
                {{ p.name }}
              </NuxtLink>
              <a
                v-else
                :href="p.url"
                target="_blank"
                rel="noopener nofollow"
              >{{ p.name }}</a>
            </template>

            <template
              v-for="p in comparable"
              #[`item.${p.id}`]="{ item }"
              :key="`cell-${p.id}`"
            >
              <span
                v-if="item.key === 'access'"
                class="cmp__cell"
              >{{ accessLabel(p) }}</span>
              <v-icon
                v-else
                :class="triClass(capability(p, item.key))"
                :aria-label="triLabel(capability(p, item.key))"
                :title="triLabel(capability(p, item.key))"
                role="img"
                size="20"
              >
                {{ triIcon(capability(p, item.key)) }}
              </v-icon>
            </template>
          </v-data-table>
        </v-card>
        <p class="cmp__note u-muted ma-0 mt-3">
          {{ t('plataformas.matrixNote') }}
        </p>
      </section>

      <!-- Fichas -->
      <section
        v-for="block in [
          { key: 'us', items: us },
          { key: 'civic', items: civic },
          { key: 'official', items: official },
        ]"
        :key="block.key"
        class="mb-6 mb-md-8"
      >
        <h2 class="cmp__h ma-0 mb-2">
          {{ t(`plataformas.group.${block.key}`) }}
        </h2>
        <p class="cmp__help u-muted ma-0 mb-4">
          {{ t(`plataformas.groupHelp.${block.key}`) }}
        </p>
        <v-row>
          <v-col
            v-for="p in block.items"
            :key="p.id"
            cols="12"
            md="6"
          >
            <v-card
              tag="article"
              height="100%"
              border
              rounded="md"
              class="pcard pa-4"
              :class="{ 'pcard--us': p.isUs }"
            >
              <header class="pcard__head">
                <h3>
                  <NuxtLink
                    v-if="p.isUs"
                    :to="localePath('/')"
                  >
                    {{ p.name }}
                  </NuxtLink>
                  <a
                    v-else
                    :href="p.url"
                    target="_blank"
                    rel="noopener nofollow"
                  >{{ p.name }}</a>
                </h3>
                <v-chip
                  class="pcard__access"
                  :class="`pcard__access--${p.access}`"
                  size="x-small"
                >
                  {{ accessLabel(p) }}
                </v-chip>
              </header>

              <p class="pcard__tag">
                {{ bi(p.tagline) }}
              </p>

              <p
                v-if="p.isUs"
                class="pcard__usflag"
              >
                <v-icon size="14">
                  mdi-alert-circle-outline
                </v-icon>
                {{ t('plataformas.usFlag') }}
              </p>

              <dl class="pcard__facts">
                <dt>{{ t('plataformas.operator') }}</dt>
                <dd>{{ bi(p.operator) }}</dd>
                <dt>{{ t('plataformas.scope') }}</dt>
                <dd>{{ bi(p.scope) }}</dd>
                <dt>{{ t('plataformas.price') }}</dt>
                <dd>
                  <span class="pcard__price">{{ bi(p.priceText) }}</span>
                  <span
                    v-if="p.currencyUnlabeled"
                    class="pcard__flag"
                  >{{ t('plataformas.currencyUnlabeled') }}</span>
                </dd>
              </dl>

              <ul
                v-if="p.metrics.length"
                class="pcard__metrics"
              >
                <li
                  v-for="(m, i) in p.metrics"
                  :key="i"
                >
                  <span class="pcard__mval">{{ m.value }}</span>
                  <span class="pcard__mlabel">{{ bi(m.label) }}</span>
                  <span class="pcard__msrc">{{ bi(m.source) }}</span>
                </li>
              </ul>

              <p class="pcard__best">
                <strong>{{ t('plataformas.bestFor') }}</strong>
                {{ bi(p.bestFor) }}
              </p>

              <p class="pcard__limitsh">
                {{ t('plataformas.limits') }}
              </p>
              <ul class="pcard__limits">
                <li
                  v-for="(l, i) in p.limits"
                  :key="i"
                >
                  {{ bi(l) }}
                </li>
              </ul>

              <p class="pcard__src u-muted">
                {{ t('plataformas.sourcesLabel') }}
                <a
                  v-for="s in p.sources"
                  :key="s"
                  :href="s"
                  target="_blank"
                  rel="noopener nofollow"
                >{{ hostOf(s) }}</a>
              </p>
            </v-card>
          </v-col>
        </v-row>
      </section>

      <!-- Referencias internacionales -->
      <section class="mb-6 mb-md-8">
        <h2 class="cmp__h ma-0 mb-2">
          {{ t('plataformas.worldTitle') }}
        </h2>
        <p class="cmp__help u-muted ma-0 mb-4">
          {{ t('plataformas.worldHelp') }}
        </p>
        <v-row>
          <v-col
            v-for="r in INTERNATIONAL"
            :key="r.url"
            cols="12"
            sm="6"
            md="4"
          >
            <v-card
              tag="article"
              height="100%"
              border
              rounded="md"
              class="mcard pa-4"
            >
              <h4>
                <a
                  :href="r.url"
                  target="_blank"
                  rel="noopener nofollow"
                >{{ r.name }}</a>
              </h4>
              <p class="mcard__country">
                {{ bi(r.country) }}
              </p>
              <p>{{ bi(r.what) }}</p>
            </v-card>
          </v-col>
        </v-row>
      </section>

      <!-- Metodología -->
      <section class="cmp__method mb-6 mb-md-8">
        <h2 class="cmp__h ma-0 mb-2">
          {{ t('plataformas.methodologyTitle') }}
        </h2>
        <ul class="cmp__methodlist">
          <li
            v-for="(m, i) in METHODOLOGY"
            :key="i"
          >
            {{ bi(m) }}
          </li>
        </ul>
        <p class="cmp__back">
          <NuxtLink :to="localePath('/comparativa')">
            {{ t('plataformas.backToAlertas') }}
          </NuxtLink>
        </p>
      </section>
    </v-container>
  </div>
</template>

<style scoped>
.chero { border-bottom: 1px solid var(--rule); padding: var(--s-7) 0 var(--s-6); }
.chero__in { padding-block: 0; }
.chero__title { font-size: clamp(1.7rem, 6vw, var(--t-3xl)); line-height: 1.1; margin: var(--s-2) 0 var(--s-3); }
.chero__lead { font-size: var(--t-lg); line-height: 1.5; max-width: 62ch; color: var(--text-muted); }
.chero__verified {
  display: inline-flex; align-items: center; gap: var(--s-1);
  margin-top: var(--s-4); font-family: var(--font-mono); font-size: var(--t-xs);
  text-transform: uppercase; letter-spacing: 0.05em; color: var(--verde);
}
.cmp__body { padding-block: var(--s-6) var(--s-8); }
.cmp__h { font-size: var(--t-xl); }
.cmp__help { max-width: 70ch; }
.cmp__note { max-width: 80ch; font-size: var(--t-xs); }

/* Aviso de parte interesada */
.disc { border: 2px solid var(--celeste); border-radius: var(--r-lg); padding: var(--s-5); background: var(--celeste-wash); }
.disc__badge {
  display: inline-flex; align-items: center; gap: var(--s-1); margin: 0 0 var(--s-2);
  font-family: var(--font-mono); font-size: var(--t-xs); text-transform: uppercase;
  letter-spacing: 0.05em; color: var(--celeste-deep); font-weight: 700;
}
.disc__body { margin: 0; line-height: 1.6; max-width: 88ch; }

/* Guía por necesidad */
.gcard__need { font-weight: 600; line-height: 1.4; margin: 0 0 var(--s-2); }
.gcard__answer { display: flex; align-items: center; gap: var(--s-1); margin: 0 0 var(--s-2); }
.gcard__answer a { color: var(--celeste-deep); font-weight: 700; text-decoration: none; }
.gcard__answer a:hover { text-decoration: underline; }
.gcard__why { font-size: var(--t-sm); line-height: 1.45; color: var(--text-muted); margin: 0; }
.gcard--us { border-color: var(--rule-strong); }

/* Matriz */
.cmp__tablewrap { overflow: hidden; }
.cmp__matrix :deep(.v-data-table__th) {
  background: var(--surface-sunken);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.cmp__matrix :deep(.v-data-table__th a) { color: var(--text); text-decoration: none; }
.cmp__matrix :deep(.v-data-table__th a:hover) { color: var(--celeste-deep); text-decoration: underline; }
.cmp__matrix :deep(.v-data-table__td) { font-size: var(--t-sm); vertical-align: middle; }
.cmp__dim { display: block; text-align: left; font-weight: 600; }
.cmp__dimhelp { display: block; font-weight: 400; font-size: var(--t-xs); color: var(--text-muted); margin-top: 2px; }
.cmp__cell { font-variant-numeric: tabular-nums; }
.tri--yes { color: var(--verde); }
.tri--half { color: var(--celeste-deep); }
.tri--no { color: var(--text-muted); }
.tri--unk { color: var(--text-muted); opacity: 0.6; }

/* Fichas */
.pcard--us { border-color: var(--celeste); box-shadow: 0 0 0 1px var(--celeste); }
.pcard__head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-start; gap: var(--s-2); }
.pcard__head h3 { font-size: var(--t-lg); margin: 0; }
.pcard__head a { color: var(--text); text-decoration: none; }
.pcard__head a:hover { text-decoration: underline; }
.pcard__access { flex: 0 0 auto; font-family: var(--font-mono); text-transform: uppercase; letter-spacing: 0.05em; }
.pcard__access--libre { color: var(--verde); }
.pcard__access--freemium { background: var(--celeste-wash); color: var(--celeste-deep); }
.pcard__access--registro { background: var(--celeste-wash); color: var(--celeste-deep); }
.pcard__access--oficial { background: var(--surface-sunken); color: var(--text-muted); }
.pcard__tag { font-size: var(--t-sm); margin: var(--s-2) 0 var(--s-2); }
.pcard__usflag {
  display: flex; align-items: flex-start; gap: var(--s-1);
  font-size: var(--t-xs); color: var(--celeste-deep); font-style: italic;
  margin: 0 0 var(--s-3);
}
.pcard__facts { margin: 0 0 var(--s-3); }
.pcard__facts dt {
  font-family: var(--font-mono); font-size: var(--t-xs); text-transform: uppercase;
  letter-spacing: 0.04em; color: var(--text-muted); margin-top: var(--s-2);
}
.pcard__facts dd { margin: 2px 0 0; font-size: var(--t-sm); line-height: 1.45; }
.pcard__price { font-weight: 600; color: var(--celeste-deep); }
.pcard__flag { display: block; font-size: 10px; color: var(--text-muted); font-style: italic; }
.pcard__metrics { list-style: none; padding: 0; margin: 0 0 var(--s-3); }
.pcard__metrics li { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--s-2); padding: var(--s-1) 0; border-bottom: 1px dashed var(--rule); }
.pcard__mval { font-family: var(--font-mono); font-weight: 700; font-variant-numeric: tabular-nums; }
.pcard__mlabel { font-size: var(--t-sm); }
.pcard__msrc { font-size: 10px; color: var(--text-muted); font-style: italic; }
.pcard__best { font-size: var(--t-sm); line-height: 1.5; margin: 0 0 var(--s-3); }
.pcard__best strong { display: block; color: var(--verde); }
.pcard__limitsh {
  font-family: var(--font-mono); font-size: var(--t-xs); text-transform: uppercase;
  letter-spacing: 0.04em; color: var(--text-muted); margin: 0 0 var(--s-1);
}
.pcard__limits { margin: 0 0 var(--s-3); padding-left: var(--s-4); }
.pcard__limits li { font-size: var(--t-xs); color: var(--text-muted); line-height: 1.45; margin-bottom: var(--s-1); }
.pcard__src { font-size: var(--t-xs); }
.pcard__src a { margin-right: var(--s-1); color: var(--celeste-deep); overflow-wrap: anywhere; }

/* Referencias del mundo */
.mcard h4 { font-size: var(--t-base); margin: 0 0 var(--s-1); }
.mcard h4 a { color: var(--text); text-decoration: none; }
.mcard h4 a:hover { text-decoration: underline; }
.mcard__country {
  font-family: var(--font-mono); font-size: var(--t-xs); text-transform: uppercase;
  letter-spacing: 0.05em; color: var(--text-muted); margin: 0 0 var(--s-2);
}
.mcard p { font-size: var(--t-sm); line-height: 1.45; margin: 0; }

/* Metodología */
.cmp__methodlist { max-width: 80ch; padding-left: var(--s-4); }
.cmp__methodlist li { line-height: 1.6; margin-bottom: var(--s-2); }
.cmp__back { margin-top: var(--s-4); }
.cmp__back a { color: var(--celeste-deep); font-weight: 600; }

/* Responsive */
@media (max-width: 959px) {
  .cmp__matrix :deep(.v-table__wrapper > table) { display: block; }
  .cmp__matrix :deep(.v-table__wrapper > table > tbody) {
    display: flex;
    flex-direction: column;
    gap: var(--s-3);
    padding: var(--s-3);
  }
  .cmp__matrix :deep(.v-data-table__tr--mobile) {
    display: block;
    overflow: hidden;
    border: 1px solid var(--rule);
    border-radius: var(--r-md);
    background: var(--surface);
  }
  .cmp__matrix :deep(.v-data-table__tr--mobile > .v-data-table__td) {
    min-height: 0 !important;
    padding: var(--s-2) var(--s-3) !important;
    border: 0 !important;
    border-top: 1px solid var(--rule) !important;
  }
  .cmp__matrix :deep(.v-data-table__tr--mobile > .v-data-table__td:first-child) {
    border-top: 0 !important;
    background: var(--surface-sunken);
  }
  .cmp__matrix :deep(.v-data-table__td-title) {
    flex: 0 0 38%;
    font-family: var(--font-mono);
    font-size: var(--t-xs);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-muted);
  }
  .cmp__matrix :deep(.v-data-table__td-value) {
    min-width: 0;
    overflow-wrap: anywhere;
    text-align: right;
  }
  .cmp__matrix .cmp__dim { text-align: right; }
}

@media (max-width: 640px) {
  .chero { padding: var(--s-6) 0 var(--s-5); }
  .chero__lead { font-size: var(--t-base); }
  .cmp__body { padding-block: var(--s-5) var(--s-7); }
  .disc { padding: var(--s-4); }
}
</style>
