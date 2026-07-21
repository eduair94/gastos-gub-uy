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
  PROVIDERS, DIMENSIONS, METHODOLOGY, NEUTRALITY, RECOMMENDATION, VERIFIED_ON,
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
function triValue(p: Provider, key: string): Tri {
  if (key === 'aiPliego') return p.features.aiPliego
  if (key === 'legalAdvisory') return p.features.legalAdvisory
  if (key === 'bidTooling') return p.features.bidTooling
  if (key === 'api') return p.features.api
  if (key === 'freeTier') return p.hasFreeTier ? 'si' : 'no'
  return 'desconocido'
}
function textValue(p: Provider, key: string): string {
  if (key === 'countryFocus') return bi(p.countryFocus)
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
      <div class="chero__in u-container">
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
      </div>
    </section>

    <div class="u-container cmp__body">
      <!-- Objective matrix -->
      <section class="cmp__sec">
        <h2 class="cmp__h">
          {{ t('comparativa.matrixTitle') }}
        </h2>
        <p class="cmp__help u-muted">
          {{ t('comparativa.matrixHelp') }}
        </p>
        <div class="u-scroll-x cmp__tablewrap">
          <table class="cmp__table">
            <thead>
              <tr>
                <th class="cmp__dim">
                  &nbsp;
                </th>
                <th
                  v-for="p in core"
                  :key="p.id"
                  scope="col"
                >
                  <a
                    :href="p.url"
                    target="_blank"
                    rel="noopener nofollow"
                  >{{ p.name }}</a>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="d in DIMENSIONS"
                :key="d.key"
              >
                <th
                  scope="row"
                  class="cmp__dim"
                >
                  {{ bi(d.label) }}
                  <span
                    v-if="d.help"
                    class="cmp__dimhelp"
                  >{{ bi(d.help) }}</span>
                </th>
                <td
                  v-for="p in core"
                  :key="p.id + d.key"
                >
                  <v-icon
                    v-if="TRI_DIMS.has(d.key)"
                    :class="triClass(triValue(p, d.key))"
                    size="20"
                  >
                    {{ triIcon(triValue(p, d.key)) }}
                  </v-icon>
                  <span
                    v-else
                    class="cmp__cell"
                  >{{ textValue(p, d.key) }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
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
        <div class="reco">
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
          <a
            class="reco__cta"
            :href="recommended.url"
            target="_blank"
            rel="noopener nofollow"
          >
            {{ t('comparativa.visitSiteNamed', { name: recommended.name }) }}
            <v-icon size="16">
              mdi-arrow-right
            </v-icon>
          </a>
        </div>
      </section>

      <!-- Provider cards: core + opaque -->
      <section class="cmp__sec">
        <h2 class="cmp__h">
          {{ t('comparativa.providersTitle') }}
        </h2>
        <div class="cmp__cards">
          <article
            v-for="p in [...core, ...opaque]"
            :key="p.id"
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
              <span
                class="pcard__conf"
                :class="`pcard__conf--${p.confidence}`"
              >{{ t(`comparativa.confidence.${p.confidence}`) }}</span>
            </header>
            <p class="pcard__tag">
              {{ bi(p.tagline) }}
            </p>
            <p class="pcard__focus u-muted">
              {{ bi(p.countryFocus) }}
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
              <span
                v-if="p.features.aiPliego === 'si'"
                class="chipf"
              >{{ t('comparativa.featAi') }}</span>
              <span
                v-if="p.features.legalAdvisory === 'si'"
                class="chipf chipf--legal"
              >{{ t('comparativa.featLegal') }}</span>
              <span
                v-if="p.features.bidTooling === 'si'"
                class="chipf"
              >{{ t('comparativa.featBid') }}</span>
              <span
                v-if="p.features.whatsappTelegram === 'si'"
                class="chipf"
              >WhatsApp</span>
              <span
                v-if="p.features.api === 'si'"
                class="chipf"
              >API</span>
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

            <a
              v-if="p.reachable"
              class="pcard__visit"
              :href="p.url"
              target="_blank"
              rel="noopener nofollow"
            >
              {{ t('comparativa.visitSite') }}
              <v-icon size="14">
                mdi-open-in-new
              </v-icon>
            </a>
          </article>
        </div>
      </section>

      <!-- Regional aggregators -->
      <section class="cmp__sec">
        <h2 class="cmp__h">
          {{ t('comparativa.regionalTitle') }}
        </h2>
        <p class="cmp__help u-muted">
          {{ t('comparativa.regionalLead') }}
        </p>
        <div class="cmp__mini">
          <article
            v-for="p in regional"
            :key="p.id"
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
            <a
              class="mcard__visit"
              :href="p.url"
              target="_blank"
              rel="noopener nofollow"
            >{{ t('comparativa.visitSite') }} →</a>
          </article>
        </div>
      </section>

      <!-- Out of scope + unverified -->
      <section class="cmp__sec cmp__sec--notes">
        <div class="notecard">
          <h3>{{ t('comparativa.outOfScopeTitle') }}</h3>
          <p
            v-for="p in outOfScope"
            :key="p.id"
          >
            <strong>{{ p.name }}</strong> — {{ firstCaveat(p) }}
          </p>
        </div>
        <div class="notecard">
          <h3>{{ t('comparativa.unverifiedTitle') }}</h3>
          <p
            v-for="p in unverified"
            :key="p.id"
          >
            <strong>{{ p.name }}</strong> — {{ firstCaveat(p) }}
          </p>
        </div>
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
    </div>
  </div>
</template>

<style scoped>
.chero { border-bottom: 1px solid var(--rule); padding: var(--s-7) 0 var(--s-6); }
.chero__title { font-size: var(--t-3xl); line-height: 1.1; margin: var(--s-2) 0 var(--s-3); }
.chero__lead { font-size: var(--t-lg); line-height: 1.5; max-width: 62ch; color: var(--text-muted); }
.chero__verified {
  display: inline-flex; align-items: center; gap: var(--s-1);
  margin-top: var(--s-4); font-family: var(--font-mono); font-size: var(--t-xs);
  text-transform: uppercase; letter-spacing: 0.05em; color: var(--verde);
}
.cmp__body { padding: var(--s-6) 0 var(--s-8); }
.cmp__sec { margin-bottom: var(--s-8); }
.cmp__h { font-size: var(--t-xl); margin: 0 0 var(--s-2); }
.cmp__help { margin: 0 0 var(--s-4); max-width: 70ch; }
.cmp__note { font-size: var(--t-xs); margin: var(--s-3) 0 0; max-width: 80ch; }

/* Matrix */
.cmp__tablewrap { border: 1px solid var(--rule); border-radius: var(--r-md); }
.cmp__table { border-collapse: collapse; width: 100%; min-width: 720px; font-size: var(--t-sm); }
.cmp__table th, .cmp__table td { padding: var(--s-3); text-align: center; border-bottom: 1px solid var(--rule); vertical-align: middle; }
.cmp__table thead th { position: sticky; top: 0; background: var(--surface); font-family: var(--font-mono); font-size: var(--t-xs); text-transform: uppercase; letter-spacing: 0.04em; }
.cmp__table thead th a { color: var(--text); text-decoration: none; }
.cmp__table thead th a:hover { color: var(--celeste-deep); text-decoration: underline; }
.cmp__dim { text-align: left !important; font-weight: 600; background: var(--surface-sunken); min-width: 150px; }
.cmp__dimhelp { display: block; font-weight: 400; font-size: var(--t-xs); color: var(--text-muted); margin-top: 2px; }
.cmp__cell { font-variant-numeric: tabular-nums; }
.tri--yes { color: var(--verde); }
.tri--no { color: var(--grafito, #9aa7b1); }
.tri--unk { color: var(--text-muted); opacity: 0.6; }

/* Charts */
.cmp__charts { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: var(--s-4); }

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
.cmp__cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: var(--s-4); }
.pcard { border: 1px solid var(--rule); border-radius: var(--r-md); padding: var(--s-4); background: var(--surface); }
.pcard--reco { border-color: var(--celeste); box-shadow: 0 0 0 1px var(--celeste); }
.pcard__head { display: flex; justify-content: space-between; align-items: baseline; gap: var(--s-2); }
.pcard__head h3 { font-size: var(--t-lg); margin: 0; }
.pcard__head a { color: var(--text); text-decoration: none; }
.pcard__head a:hover { text-decoration: underline; }
.pcard__conf { font-family: var(--font-mono); font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; padding: 2px 6px; border-radius: 999px; }
.pcard__conf--alta { background: var(--verde-wash, #e7f1ec); color: var(--verde); }
.pcard__conf--media { background: var(--celeste-wash); color: var(--celeste-deep); }
.pcard__conf--baja { background: var(--surface-sunken); color: var(--text-muted); }
.pcard__tag { font-size: var(--t-sm); margin: var(--s-2) 0 var(--s-1); }
.pcard__focus { font-size: var(--t-xs); margin: 0 0 var(--s-3); }
.pcard__plans { list-style: none; margin: 0 0 var(--s-3); padding: 0; }
.pcard__plans li { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--s-2); padding: var(--s-1) 0; border-bottom: 1px dashed var(--rule); }
.pcard__plan { font-family: var(--font-mono); font-size: var(--t-xs); text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted); min-width: 84px; }
.pcard__price { font-weight: 600; color: var(--celeste-deep); }
.pcard__flag { font-size: 10px; color: var(--text-muted); font-style: italic; }
.pcard__feats { display: flex; flex-wrap: wrap; gap: var(--s-1); margin: 0 0 var(--s-3); }
.chipf { font-size: 11px; padding: 2px 8px; border-radius: 999px; background: var(--surface-sunken); color: var(--text-muted); }
.chipf--legal { background: var(--verde-wash, #e7f1ec); color: var(--verde); font-weight: 600; }
.pcard__row { font-size: var(--t-sm); line-height: 1.45; margin: 0 0 var(--s-2); }
.pcard__caveats { margin: 0 0 var(--s-2); padding-left: var(--s-4); }
.pcard__caveats li { font-size: var(--t-xs); color: var(--text-muted); line-height: 1.4; margin-bottom: var(--s-1); }
.pcard__src { font-size: var(--t-xs); }
.pcard__src a { margin-right: var(--s-1); color: var(--celeste-deep); }

/* Mini cards (regional) */
.cmp__mini { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: var(--s-3); }
.mcard { border: 1px solid var(--rule); border-radius: var(--r-md); padding: var(--s-3); }
.mcard h4 { font-size: var(--t-base); margin: 0 0 var(--s-1); }
.mcard h4 a { color: var(--text); text-decoration: none; }
.mcard h4 a:hover { text-decoration: underline; }
.mcard p { font-size: var(--t-sm); line-height: 1.4; margin: 0 0 var(--s-1); }
.mcard__price { font-weight: 600; color: var(--celeste-deep); font-size: var(--t-sm); }

/* Notes */
.cmp__sec--notes { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: var(--s-4); }
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
.pcard__visit, .mcard__visit {
  display: inline-flex; align-items: center; gap: 4px;
  margin-top: var(--s-3); font-size: var(--t-sm); font-weight: 600; color: var(--celeste-deep); text-decoration: none;
}
.pcard__visit:hover, .mcard__visit:hover { text-decoration: underline; }
.mcard__visit { margin-top: var(--s-1); font-size: var(--t-xs); }
.reco__cta {
  display: inline-flex; align-items: center; gap: var(--s-1);
  margin-top: var(--s-4); padding: var(--s-2) var(--s-4); border-radius: var(--r-md);
  background: var(--celeste); color: #fff; text-decoration: none; font-weight: 600; font-size: var(--t-sm);
  transition: background 0.15s ease;
}
.reco__cta:hover { background: var(--celeste-deep); }

/* Responsive */
.chero__title { font-size: clamp(1.7rem, 6vw, var(--t-3xl)); }
@media (max-width: 640px) {
  .chero { padding: var(--s-6) 0 var(--s-5); }
  .chero__lead { font-size: var(--t-base); }
  .cmp__body { padding: var(--s-5) 0 var(--s-7); }
  .cmp__sec { margin-bottom: var(--s-6); }
  .reco { padding: var(--s-4); }
  .cmp__cards, .cmp__mini { grid-template-columns: 1fr; }
}
</style>
