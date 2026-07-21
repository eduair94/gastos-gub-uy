<script setup lang="ts">
/**
 * Comparativa de servicios de alertas de licitaciones en Uruguay. Recurso neutral
 * para proveedores del Estado: matriz objetiva con fuentes + fecha, gráficos de
 * precio de entrada (por moneda, sin convertir), fichas por proveedor, y un bloque
 * editorial ROTULADO con la recomendación a ProveedorUY. Datos: ~/data/comparativa-alertas.
 *
 * Nota de diseño: los precios son tarifas comerciales de SaaS, NO gasto público,
 * así que se muestran en celeste — el oro queda reservado para el dinero del Estado.
 */
import {
  PROVIDERS, DIMENSIONS, ESTABLISHED, METHODOLOGY, NEUTRALITY, RECOMMENDATION, VERIFIED_ON,
  USD_UYU_REF, toPesos,
  type Provider, type Tri, type Currency,
} from '~/data/comparativa-alertas'

const { t, locale } = useI18n()
const localePath = useLocalePath()

type L = 'es' | 'en'
function bi(x: { es: string, en: string }): string {
  return x[locale.value as L] ?? x.es
}

const core = computed(() => PROVIDERS.filter(p => p.group === 'core'))
const opaque = computed(() => PROVIDERS.filter(p => p.group === 'opaque'))
const regional = computed(() => PROVIDERS.filter(p => p.group === 'regional'))
const outOfScope = computed(() => PROVIDERS.filter(p => p.group === 'outOfScope'))
const unverified = computed(() => PROVIDERS.filter(p => p.group === 'unverified'))
const recommended = computed(() => PROVIDERS.find(p => p.id === RECOMMENDATION.providerId))

// Approximate peso amount for a USD/EUR figure (empty for pesos/unknown). The
// original currency is always shown alongside — this is a clearly-labeled,
// referential conversion, not a claim of an exact price.
function pesoText(amount: number, currency: Currency): string {
  if (amount <= 0 || currency === 'UYU' || currency === 'UNKNOWN') return ''
  return `≈ $U ${formatNumber(toPesos(amount, currency))}`
}

// One unified entry-price comparison, everything normalized to pesos so USD and
// peso plans sit on the same scale. Cheapest first. The bar's tooltip keeps the
// original price. Core UY-native services with a public paid plan.
const unifiedBars = computed(() =>
  core.value
    .filter(p => p.entryPaid)
    .map(p => ({
      label: p.name,
      value: toPesos(p.entryPaid!.amount, p.entryPaid!.currency),
      sub: p.entryPaid!.text,
      color: 'celeste',
    }))
    .sort((a, b) => a.value - b.value),
)

const TRI_DIMS = new Set(['aiPliego', 'legalAdvisory', 'bidTooling', 'api', 'freeTier'])
const matrixHeaders = computed(() => [
  {
    title: t('comparativa.functionLabel'),
    key: 'dimension',
    sortable: false,
    width: 190,
    minWidth: 170,
    align: 'start' as const,
  },
  ...core.value.map(p => ({
    title: p.name,
    key: p.id,
    sortable: false,
    minWidth: 116,
    align: 'center' as const,
  })),
])

const matrixItems = computed(() => DIMENSIONS.map(d => ({
  key: d.key,
  dimension: d,
  ...Object.fromEntries(core.value.map(p => [
    p.id,
    TRI_DIMS.has(d.key) ? triValue(p, d.key) : textValue(p, d.key),
  ])),
})))

function triValue(p: Provider, key: string): Tri {
  if (key === 'aiPliego') return p.features.aiPliego
  if (key === 'legalAdvisory') return p.features.legalAdvisory
  if (key === 'bidTooling') return p.features.bidTooling
  if (key === 'api') return p.features.api
  if (key === 'freeTier') return p.hasFreeTier ? 'si' : 'no'
  return 'desconocido'
}
function established(p: Provider): { year: number | null, basis: string } {
  const e = ESTABLISHED[p.id]
  return { year: e?.year ?? null, basis: e ? bi(e.basis) : '' }
}
function textValue(p: Provider, key: string): string {
  if (key === 'countryFocus') return bi(p.countryFocus)
  if (key === 'established') {
    const y = established(p).year
    return y ? String(y) : t('comparativa.noDate')
  }
  if (key === 'entryPaid') {
    if (!p.entryPaid) return t('comparativa.consultar')
    const approx = pesoText(p.entryPaid.amount, p.entryPaid.currency)
    return approx ? `${p.entryPaid.text} (${approx})` : p.entryPaid.text
  }
  if (key === 'alertChannels') {
    const c = ['Email']
    if (p.features.whatsappTelegram === 'si') c.push('WhatsApp')
    return c.join(' + ')
  }
  return ''
}
function triIcon(v: Tri): string {
  return v === 'si' ? 'mdi-check-circle' : v === 'no' ? 'mdi-minus-circle-outline' : 'mdi-help-circle-outline'
}
function triClass(v: Tri): string {
  return v === 'si' ? 'tri tri--yes' : v === 'no' ? 'tri tri--no' : 'tri tri--unk'
}
function triLabel(v: Tri): string {
  return v === 'si'
    ? t('comparativa.tri.yes')
    : v === 'no'
      ? t('comparativa.tri.no')
      : t('comparativa.tri.unknown')
}
function firstCaveat(p: Provider): string {
  return p.caveats && p.caveats.length ? bi(p.caveats[0]!) : bi(p.ux)
}

const orgLd = useOrgLd()
useSeo(() => ({
  title: t('seo.comparativa.title'),
  description: t('seo.comparativa.description'),
  path: '/comparativa',
  kicker: 'Comparativa',
  jsonLd: {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    'name': t('seo.comparativa.title'),
    'description': t('seo.comparativa.description'),
    'isPartOf': orgLd,
  },
}))
</script>

<template>
  <div class="cmp">
    <!-- Hero -->
    <section class="chero">
      <v-container class="chero__in u-container">
        <p class="u-eyebrow">
          {{ t('comparativa.eyebrow') }}
        </p>
        <h1 class="chero__title">
          {{ t('comparativa.title') }}
        </h1>
        <p class="chero__lead">
          {{ t('comparativa.lead') }}
        </p>
        <p class="chero__verified">
          <v-icon size="15">
            mdi-check-decagram-outline
          </v-icon>
          {{ t('comparativa.verifiedLabel', { date: VERIFIED_ON }) }}
        </p>
      </v-container>
    </section>

    <v-container class="u-container cmp__body">
      <!-- Objective matrix -->
      <section class="cmp__sec">
        <h2 class="cmp__h">
          {{ t('comparativa.matrixTitle') }}
        </h2>
        <p class="cmp__help u-muted">
          {{ t('comparativa.matrixHelp') }}
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
              v-for="p in core"
              #[`header.${p.id}`]
              :key="`head-${p.id}`"
            >
              <a
                :href="p.url"
                target="_blank"
                rel="noopener nofollow"
              >{{ p.name }}</a>
            </template>

            <template
              v-for="p in core"
              #[`item.${p.id}`]="{ item }"
              :key="`cell-${p.id}`"
            >
              <v-icon
                v-if="TRI_DIMS.has(item.key)"
                :class="triClass(triValue(p, item.key))"
                :aria-label="triLabel(triValue(p, item.key))"
                :title="triLabel(triValue(p, item.key))"
                role="img"
                size="20"
              >
                {{ triIcon(triValue(p, item.key)) }}
              </v-icon>
              <span
                v-else
                class="cmp__cell"
              >{{ textValue(p, item.key) }}</span>
            </template>
          </v-data-table>
        </v-card>
        <p class="cmp__note u-muted">
          {{ t('comparativa.priceCaveat') }}
        </p>
      </section>

      <!-- Unified entry-price comparison, normalized to pesos -->
      <section class="cmp__sec">
        <h2 class="cmp__h">
          {{ t('comparativa.chartsTitle') }}
        </h2>
        <ChartBlock
          :title="t('comparativa.chartUnified')"
          :help="t('comparativa.chartHelp')"
          :meta="t('comparativa.chartMeta', { rate: USD_UYU_REF, date: VERIFIED_ON })"
        >
          <InvHBars
            :items="unifiedBars"
            format="money"
            :row-height="36"
          />
        </ChartBlock>
        <p class="cmp__note u-muted">
          {{ t('comparativa.chartNote') }}
        </p>
      </section>

      <!-- Editorial recommendation (labeled opinion) -->
      <section
        v-if="recommended"
        class="cmp__sec"
      >
        <v-card class="reco">
          <div class="reco__head">
            <span class="reco__badge">
              <v-icon size="15">
                mdi-star-outline
              </v-icon>
              {{ bi(RECOMMENDATION.title) }}
            </span>
            <span class="reco__disc">{{ bi(RECOMMENDATION.disclosure) }}</span>
          </div>
          <h3 class="reco__name">
            <a
              :href="recommended.url"
              target="_blank"
              rel="noopener nofollow"
            >{{ recommended.name }}</a>
          </h3>
          <p class="reco__body">
            {{ bi(RECOMMENDATION.body) }}
          </p>
          <p class="reco__caveat">
            <v-icon size="15">
              mdi-information-outline
            </v-icon>
            {{ bi(RECOMMENDATION.caveat) }}
          </p>
          <v-btn
            :href="recommended.url"
            target="_blank"
            rel="noopener nofollow"
            color="primary"
            append-icon="mdi-arrow-right"
            class="reco__cta"
          >
            {{ t('comparativa.visitSiteNamed', { name: recommended.name }) }}
          </v-btn>
        </v-card>
      </section>

      <!-- Provider cards: core + opaque -->
      <section class="cmp__sec">
        <h2 class="cmp__h">
          {{ t('comparativa.providersTitle') }}
        </h2>
        <v-row class="cmp__cards">
          <v-col
            v-for="p in [...core, ...opaque]"
            :key="p.id"
            cols="12"
            md="6"
          >
            <v-card
              tag="article"
              height="100%"
              class="pcard"
              :class="{ 'pcard--reco': p.id === RECOMMENDATION.providerId }"
            >
              <header class="pcard__head">
                <h3>
                  <a
                    :href="p.url"
                    target="_blank"
                    rel="noopener nofollow"
                  >{{ p.name }}</a>
                </h3>
                <v-chip
                  class="pcard__conf"
                  :class="`pcard__conf--${p.confidence}`"
                  size="x-small"
                >
                  {{ t(`comparativa.confidence.${p.confidence}`) }}
                </v-chip>
              </header>
              <p class="pcard__tag">
                {{ bi(p.tagline) }}
              </p>
              <p class="pcard__focus u-muted">
                {{ bi(p.countryFocus) }}
              </p>
              <p class="pcard__age u-muted">
                <v-icon size="13">
                  mdi-calendar-clock
                </v-icon>
                <span>{{ established(p).year ? t('comparativa.onlineSince', { year: established(p).year }) : t('comparativa.noDate') }}</span>
                <span class="pcard__agebasis">· {{ established(p).basis }}</span>
              </p>

              <ul class="pcard__plans">
                <li
                  v-for="pl in p.plans"
                  :key="pl.name"
                >
                  <span class="pcard__plan">{{ pl.name }}</span>
                  <span class="pcard__price">{{ pl.priceText }}</span>
                  <span
                    v-if="pesoText(pl.amount, pl.currency)"
                    class="pcard__approx"
                  >{{ pesoText(pl.amount, pl.currency) }}</span>
                  <span
                    v-if="pl.currencyInferred"
                    class="pcard__flag"
                  >{{ t('comparativa.currencyInferred') }}</span>
                </li>
              </ul>

              <div class="pcard__feats">
                <v-chip
                  v-if="p.features.aiPliego === 'si'"
                  class="chipf"
                  size="x-small"
                >
                  {{ t('comparativa.featAi') }}
                </v-chip>
                <v-chip
                  v-if="p.features.legalAdvisory === 'si'"
                  class="chipf chipf--legal"
                  size="x-small"
                >
                  {{ t('comparativa.featLegal') }}
                </v-chip>
                <v-chip
                  v-if="p.features.bidTooling === 'si'"
                  class="chipf"
                  size="x-small"
                >
                  {{ t('comparativa.featBid') }}
                </v-chip>
                <v-chip
                  v-if="p.features.whatsappTelegram === 'si'"
                  class="chipf"
                  size="x-small"
                >
                  WhatsApp
                </v-chip>
                <v-chip
                  v-if="p.features.api === 'si'"
                  class="chipf"
                  size="x-small"
                >
                  API
                </v-chip>
              </div>

              <p class="pcard__row">
                <strong>{{ t('comparativa.coverageLabel') }}:</strong> {{ bi(p.coverage) }}
              </p>
              <p class="pcard__row">
                <strong>{{ t('comparativa.legalLabel') }}:</strong> {{ bi(p.legalValidation) }}
              </p>

              <ul
                v-if="p.caveats?.length"
                class="pcard__caveats"
              >
                <li
                  v-for="(c, i) in p.caveats"
                  :key="i"
                >
                  {{ bi(c) }}
                </li>
              </ul>

              <p class="pcard__src u-muted">
                {{ t('comparativa.sourcesLabel') }}:
                <a
                  v-for="(s, i) in p.sources"
                  :key="i"
                  :href="s"
                  target="_blank"
                  rel="noopener nofollow"
                >[{{ i + 1 }}]</a>
              </p>

              <v-btn
                v-if="p.reachable"
                class="pcard__visit"
                :href="p.url"
                target="_blank"
                rel="noopener nofollow"
                variant="text"
                color="primary"
                size="small"
                append-icon="mdi-open-in-new"
              >
                {{ t('comparativa.visitSite') }}
              </v-btn>
            </v-card>
          </v-col>
        </v-row>
      </section>

      <!-- Regional aggregators -->
      <section class="cmp__sec">
        <h2 class="cmp__h">
          {{ t('comparativa.regionalTitle') }}
        </h2>
        <p class="cmp__help u-muted">
          {{ t('comparativa.regionalLead') }}
        </p>
        <v-row class="cmp__mini">
          <v-col
            v-for="p in regional"
            :key="p.id"
            cols="12"
            sm="6"
            lg="4"
          >
            <v-card
              tag="article"
              height="100%"
              class="mcard"
            >
              <h4>
                <a
                  :href="p.url"
                  target="_blank"
                  rel="noopener nofollow"
                >{{ p.name }}</a>
              </h4>
              <p class="u-muted">
                {{ bi(p.countryFocus) }}
              </p>
              <p>{{ bi(p.ux) }}</p>
              <p class="mcard__price">
                {{ p.entryPaid ? p.entryPaid.text : t('comparativa.consultar') }}
                <span
                  v-if="p.entryPaid && pesoText(p.entryPaid.amount, p.entryPaid.currency)"
                  class="mcard__approx"
                >{{ pesoText(p.entryPaid.amount, p.entryPaid.currency) }}</span>
              </p>
              <v-btn
                class="mcard__visit"
                :href="p.url"
                target="_blank"
                rel="noopener nofollow"
                variant="text"
                color="primary"
                size="small"
                append-icon="mdi-arrow-right"
              >
                {{ t('comparativa.visitSite') }}
              </v-btn>
            </v-card>
          </v-col>
        </v-row>
      </section>

      <!-- Out of scope + unverified -->
      <section class="cmp__sec">
        <v-row class="cmp__sec--notes">
          <v-col
            cols="12"
            md="6"
          >
            <v-card
              class="notecard"
              height="100%"
            >
              <h3>{{ t('comparativa.outOfScopeTitle') }}</h3>
              <p
                v-for="p in outOfScope"
                :key="p.id"
              >
                <strong>{{ p.name }}</strong> — {{ firstCaveat(p) }}
              </p>
            </v-card>
          </v-col>
          <v-col
            cols="12"
            md="6"
          >
            <v-card
              class="notecard"
              height="100%"
            >
              <h3>{{ t('comparativa.unverifiedTitle') }}</h3>
              <p
                v-for="p in unverified"
                :key="p.id"
              >
                <strong>{{ p.name }}</strong> — {{ firstCaveat(p) }}
              </p>
            </v-card>
          </v-col>
        </v-row>
      </section>

      <!-- Methodology + neutrality -->
      <section class="cmp__sec cmp__method">
        <h2 class="cmp__h">
          {{ t('comparativa.methodologyTitle') }}
        </h2>
        <p>{{ bi(METHODOLOGY) }}</p>
        <p class="cmp__neutral">
          <v-icon size="16">
            mdi-scale-balance
          </v-icon>
          {{ bi(NEUTRALITY) }}
        </p>
        <p class="cmp__back">
          <NuxtLink :to="localePath('/llamados')">
            {{ t('comparativa.backToLlamados') }}
          </NuxtLink>
        </p>
      </section>
    </v-container>
  </div>
</template>

<style scoped>
.chero { border-bottom: 1px solid var(--rule); padding: var(--s-7) 0 var(--s-6); }
.chero__in { padding-block: 0; }
.chero__title { font-size: var(--t-3xl); line-height: 1.1; margin: var(--s-2) 0 var(--s-3); }
.chero__lead { font-size: var(--t-lg); line-height: 1.5; max-width: 62ch; color: var(--text-muted); }
.chero__verified {
  display: inline-flex; align-items: center; gap: var(--s-1);
  margin-top: var(--s-4); font-family: var(--font-mono); font-size: var(--t-xs);
  text-transform: uppercase; letter-spacing: 0.05em; color: var(--verde);
}
.cmp__body { padding-block: var(--s-6) var(--s-8); }
.cmp__sec { margin-bottom: var(--s-8); }
.cmp__h { font-size: var(--t-xl); margin: 0 0 var(--s-2); }
.cmp__help { margin: 0 0 var(--s-4); max-width: 70ch; }
.cmp__note { font-size: var(--t-xs); margin: var(--s-3) 0 0; max-width: 80ch; }

/* Matrix */
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
.tri--no { color: var(--text-muted); }
.tri--unk { color: var(--text-muted); opacity: 0.6; }

/* Recommendation */
.reco { border: 2px solid var(--celeste); border-radius: var(--r-lg); padding: var(--s-5); background: var(--celeste-wash); }
.reco__head { display: flex; flex-wrap: wrap; gap: var(--s-2) var(--s-4); align-items: center; justify-content: space-between; margin-bottom: var(--s-2); }
.reco__badge {
  display: inline-flex; align-items: center; gap: var(--s-1);
  font-family: var(--font-mono); font-size: var(--t-xs); text-transform: uppercase; letter-spacing: 0.05em;
  color: var(--celeste-deep); font-weight: 700;
}
.reco__disc { font-size: var(--t-xs); color: var(--text-muted); font-style: italic; }
.reco__name { font-size: var(--t-xl); margin: 0 0 var(--s-2); }
.reco__name a { color: var(--text); text-decoration: none; }
.reco__name a:hover { text-decoration: underline; }
.reco__body { line-height: 1.6; margin: 0 0 var(--s-3); }
.reco__caveat { display: flex; gap: var(--s-2); font-size: var(--t-sm); color: var(--text-muted); margin: 0; }

/* Provider cards */
.cmp__cards, .cmp__mini, .cmp__sec--notes { margin-top: calc(var(--s-2) * -1); }
.pcard { border: 1px solid var(--rule); border-radius: var(--r-md); padding: var(--s-4); background: var(--surface); }
.pcard--reco { border-color: var(--celeste); box-shadow: 0 0 0 1px var(--celeste); }
.pcard__head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-start; gap: var(--s-2); }
.pcard__head h3 { font-size: var(--t-lg); margin: 0; }
.pcard__head a { color: var(--text); text-decoration: none; }
.pcard__head a:hover { text-decoration: underline; }
.pcard__conf { flex: 0 0 auto; font-family: var(--font-mono); text-transform: uppercase; letter-spacing: 0.05em; }
.pcard__conf--alta { color: var(--verde); }
.pcard__conf--media { background: var(--celeste-wash); color: var(--celeste-deep); }
.pcard__conf--baja { background: var(--surface-sunken); color: var(--text-muted); }
.pcard__tag { font-size: var(--t-sm); margin: var(--s-2) 0 var(--s-1); }
.pcard__focus { font-size: var(--t-xs); margin: 0 0 var(--s-1); }
.pcard__age { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; font-size: var(--t-xs); margin: 0 0 var(--s-3); }
.pcard__agebasis { opacity: 0.75; }
.pcard__plans { list-style: none; margin: 0 0 var(--s-3); padding: 0; }
.pcard__plans li { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--s-2); padding: var(--s-1) 0; border-bottom: 1px dashed var(--rule); }
.pcard__plan { font-family: var(--font-mono); font-size: var(--t-xs); text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted); min-width: 84px; }
.pcard__price { font-weight: 600; color: var(--celeste-deep); }
.pcard__flag { font-size: 10px; color: var(--text-muted); font-style: italic; }
.pcard__feats { display: flex; flex-wrap: wrap; gap: var(--s-1); margin: 0 0 var(--s-3); }
.chipf { color: var(--text-muted); }
.chipf--legal { color: var(--verde); font-weight: 600; }
.pcard__row { font-size: var(--t-sm); line-height: 1.45; margin: 0 0 var(--s-2); }
.pcard__caveats { margin: 0 0 var(--s-2); padding-left: var(--s-4); }
.pcard__caveats li { font-size: var(--t-xs); color: var(--text-muted); line-height: 1.4; margin-bottom: var(--s-1); }
.pcard__src { font-size: var(--t-xs); }
.pcard__src a { margin-right: var(--s-1); color: var(--celeste-deep); }

/* Mini cards (regional) */
.mcard { border: 1px solid var(--rule); border-radius: var(--r-md); padding: var(--s-3); }
.mcard h4 { font-size: var(--t-base); margin: 0 0 var(--s-1); }
.mcard h4 a { color: var(--text); text-decoration: none; }
.mcard h4 a:hover { text-decoration: underline; }
.mcard p { font-size: var(--t-sm); line-height: 1.4; margin: 0 0 var(--s-1); }
.mcard__price { font-weight: 600; color: var(--celeste-deep); font-size: var(--t-sm); }

/* Notes */
.notecard { border: 1px dashed var(--rule); border-radius: var(--r-md); padding: var(--s-4); background: var(--surface-sunken); }
.notecard h3 { font-size: var(--t-base); margin: 0 0 var(--s-2); }
.notecard p { font-size: var(--t-sm); line-height: 1.45; margin: 0 0 var(--s-2); }

/* Method */
.cmp__method p { line-height: 1.6; max-width: 80ch; margin: 0 0 var(--s-3); }
.cmp__neutral { display: flex; gap: var(--s-2); font-size: var(--t-sm); color: var(--text-muted); }
.cmp__back { margin-top: var(--s-4); }
.cmp__back a { color: var(--celeste-deep); font-weight: 600; }

/* Peso-approx + visit links */
.pcard__approx, .mcard__approx { font-size: var(--t-xs); color: var(--text-muted); font-weight: 400; }
.pcard__visit { margin-top: var(--s-3); }
.mcard__visit { margin-top: var(--s-1); }
.reco__cta { margin-top: var(--s-4); }

/* Responsive */
.chero__title { font-size: clamp(1.7rem, 6vw, var(--t-3xl)); }
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
  .cmp__sec { margin-bottom: var(--s-6); }
  .reco { padding: var(--s-4); }
}
</style>
