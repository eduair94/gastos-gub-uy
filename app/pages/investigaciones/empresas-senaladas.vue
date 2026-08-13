<script setup lang="ts">
/**
 * Empresas señaladas — el catálogo. Se parte de empresas señaladas por corrupción/
 * irregularidades con el Estado (prensa + Justicia) y se cruza contra la base de Compras
 * Estatales para ver si el señalamiento es verificable en los datos abiertos. Chrome estático
 * alrededor de ~/data/investigaciones-empresas (verificado caso por caso).
 */
import { EMP_CASES, EMP_OVERVIEW_STATS, empContent, type EmpCase, type EmpSector } from '~/data/investigaciones-empresas'

const { locale, t } = useI18n()
const localePath = useLocalePath()
const c = computed(() => empContent(locale.value))

const personLd = usePersonLd()
const orgLd = useOrgLd()
const breadcrumbLd = useBreadcrumbLd([
  { name: 'Investigaciones', path: '/investigaciones' },
  { name: c.value.title },
])

useSeo(() => ({
  title: c.value.title,
  description: c.value.dek.slice(0, 155),
  path: '/investigaciones/empresas-senaladas',
  type: 'article',
  kicker: 'Investigación',
  jsonLd: [
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      'headline': c.value.title,
      'description': c.value.dek.slice(0, 155),
      'author': personLd,
      'publisher': orgLd,
    },
    breadcrumbLd,
  ],
}))

const SECTOR_ORDER: EmpSector[] = ['salud', 'defensa', 'seguridad', 'energia', 'obra', 'intendencias', 'estafas']
const grouped = computed(() =>
  SECTOR_ORDER.map(s => ({ sector: s, cases: EMP_CASES.filter(k => k.sector === s) })).filter(g => g.cases.length))

const lang = <T,>(b: { es: T, en: T }) => (locale.value === 'en' ? b.en : b.es)
function supplierHref(k: EmpCase) {
  return k.db.inData && k.db.supplierId ? localePath(`/suppliers/${k.db.supplierId}`) : null
}

const headlineTiles = computed(() => [
  { value: EMP_OVERVIEW_STATS.companies, label: c.value.tiles.companies, sub: c.value.tiles.companiesSub },
  { value: EMP_OVERVIEW_STATS.inData, tone: 'verde' as const, label: c.value.tiles.inData, sub: c.value.tiles.inDataSub },
  { value: EMP_OVERVIEW_STATS.notInData, tone: 'alerta' as const, label: c.value.tiles.notInData, sub: c.value.tiles.notInDataSub },
  { value: EMP_OVERVIEW_STATS.condenas, tone: 'alerta' as const, label: c.value.tiles.condenas, sub: c.value.tiles.condenasSub },
])

/** The two deep-dives this catalogue opens into. Copy lives here rather than in
 *  the template, where no locale file could ever reach it. */
const DEEP_DIVES = [
  {
    path: '/investigaciones/asse-ambulancias',
    emoji: '🚑',
    eyebrow: { es: 'Salud · ASSE', en: 'Health · ASSE' },
    title: { es: 'ITHG: 5 fichas para US$ 20 millones', en: 'ITHG: 5 records for US$20 million' },
    dek: {
      es: 'Una proveedora marítima que concentró el 96% de los traslados de ASSE por compra directa. La base registra $33 M; el Tribunal de Cuentas, más de $2.000 M.',
      en: 'A maritime supplier that concentrated 96% of ASSE transfers by direct purchase. The data shows $33 M; the Tribunal de Cuentas, over $2,000 M.',
    },
  },
  {
    path: '/investigaciones/frigorifico-saturno',
    emoji: '🥩',
    eyebrow: { es: 'Defensa · FF.AA.', en: 'Defense · Armed forces' },
    title: { es: 'Saturno: la carne de los cuarteles', en: 'Saturno: the barracks’ meat' },
    dek: {
      es: '283 contratos por $1.140 M con las tres fuerzas y el INDA. En la Armada, un faltante de 57 toneladas terminó en la Fiscalía.',
      en: '283 contracts for $1,140 M with all three forces and INDA. In the Navy, a 57-tonne shortfall ended up with prosecutors.',
    },
  },
]

const SECTOR_LABEL = { es: 'Sector', en: 'Sector' }
const META_LABELS = {
  atStake: { es: 'En juego', en: 'At stake' },
  status: { es: 'Estado', en: 'Status' },
  inData: { es: 'En la base', en: 'In the data' },
  otherSide: { es: 'La otra campana', en: 'The other side' },
  sources: { es: 'Fuentes', en: 'Sources' },
}
</script>

<template>
  <div class="inv">
    <InvCover
      :fields="[
        { label: t('inv.file.expediente'), value: c.file.org },
        { value: c.file.tag },
        { label: t('inv.file.periodo'), value: c.file.period },
        { value: c.common.source },
      ]"
      :kicker="c.kicker"
      :title="c.title"
      :dek="c.dek"
      :chips="c.chips"
    />

    <InvSection alt>
      <InvTiles :items="headlineTiles" />
    </InvSection>

    <!-- Método -->
    <InvSection
      :eyebrow="c.method.tag"
      :title="c.method.title"
    >
      <div class="inv-prose">
        <p>{{ c.method.p1 }}</p>
        <p>{{ c.method.p2 }}</p>
      </div>
      <InvFinding
        :kicker="c.gap.tag"
        :title="c.gap.title"
        :body="c.gap.p"
      />
    </InvSection>

    <!-- Deep-dive CTAs -->
    <InvSection
      alt
      serie
      :tag="c.cta.tag"
      :title="c.cta.title"
      :dek="c.cta.intro"
    >
      <div class="inv-cards">
        <InvLinkCard
          v-for="d in DEEP_DIVES"
          :key="d.path"
          :to="localePath(d.path)"
          :emoji="d.emoji"
          :eyebrow="lang(d.eyebrow)"
          :title="lang(d.title)"
          :dek="lang(d.dek)"
          :cta="c.common.readMore"
        />
      </div>
    </InvSection>

    <!-- Catálogo por sector -->
    <InvSection
      v-for="(g, gi) in grouped"
      :key="g.sector"
      :alt="gi % 2 === 1"
      :eyebrow="lang(SECTOR_LABEL)"
      :title="(c.sector as Record<string, string>)[g.sector]"
    >
      <div class="emp-list">
        <article
          v-for="k in g.cases"
          :key="k.key"
          class="emp-card"
        >
          <header class="emp-card__head">
            <h3 class="emp-card__name">
              {{ k.company }}
            </h3>
            <div class="emp-badges">
              <span
                class="emp-flag"
                :class="`emp-flag--${k.flag}`"
              >{{ (c.flag as Record<string, string>)[k.flag] }}</span>
              <span
                class="emp-db"
                :class="k.db.inData ? 'emp-db--in' : 'emp-db--out'"
              >
                <template v-if="k.db.inData">✓ {{ c.common.inData }} · {{ k.db.contracts }} · {{ k.db.years }}</template>
                <template v-else>○ {{ c.common.notInData }}</template>
              </span>
            </div>
          </header>

          <p class="emp-card__alleg">
            {{ lang(k.allegation) }}
          </p>

          <div class="emp-meta">
            <div
              v-if="k.amount"
              class="emp-meta__row"
            >
              <span class="emp-meta__k">{{ lang(META_LABELS.atStake) }}</span>
              <span class="emp-meta__v u-mono">{{ lang(k.amount) }}</span>
            </div>
            <div class="emp-meta__row">
              <span class="emp-meta__k">{{ lang(META_LABELS.status) }}</span>
              <span class="emp-meta__v">{{ lang(k.status) }}</span>
            </div>
            <div class="emp-meta__row">
              <span class="emp-meta__k">{{ lang(META_LABELS.inData) }}</span>
              <span class="emp-meta__v emp-dbnote">{{ k.db.note ? lang(k.db.note) : (k.db.reason ? lang(k.db.reason) : '—') }}</span>
            </div>
          </div>

          <p class="emp-caveat">
            <span class="emp-caveat__tag">{{ lang(META_LABELS.otherSide) }}</span>
            {{ lang(k.caveat) }}
          </p>

          <footer class="emp-card__foot">
            <div class="emp-src">
              <span class="emp-src__lbl">{{ lang(META_LABELS.sources) }}:</span>
              <a
                v-for="s in k.sources"
                :key="s.url"
                :href="s.url"
                target="_blank"
                rel="noopener"
                class="emp-src__a"
              >{{ s.outlet }}</a>
            </div>
            <NuxtLink
              v-if="supplierHref(k)"
              :to="supplierHref(k)!"
              class="emp-profile u-mono"
            >{{ c.common.supplierProfile }} →</NuxtLink>
          </footer>
        </article>
      </div>
    </InvSection>

    <!-- Uruguay Leaks: lo que no está en los datos abiertos se manda a quien puede protegerlo. -->
    <InvSection>
      <LeakTip
        :subject="c.title"
        path="/investigaciones/empresas-senaladas"
      />
    </InvSection>

    <InvSection alt>
      <InvDisclaimer
        :title="c.disclaimerTitle"
        :paragraphs="c.disclaimer"
      />
    </InvSection>
  </div>
</template>

<style scoped>
.emp-list { display: flex; flex-direction: column; gap: var(--s-4); }
.emp-card {
  padding: var(--s-5) var(--s-5) var(--s-4);
  border: 1px solid var(--rule);
  border-left: 3px solid var(--rule-strong);
  border-radius: var(--r-lg);
  background: var(--surface);
}
.emp-card__head {
  display: flex; flex-wrap: wrap; gap: var(--s-2) var(--s-4);
  align-items: baseline; justify-content: space-between; margin-bottom: var(--s-3);
}
.emp-card__name { margin: 0; font-size: var(--t-lg); font-weight: 700; }
.emp-badges { display: flex; flex-wrap: wrap; gap: 6px; }
.emp-flag, .emp-db {
  font-family: var(--font-mono); font-size: 11px; padding: 2px 9px;
  border-radius: var(--r-full); border: 1px solid var(--rule); white-space: nowrap;
}
.emp-flag--condena { border-color: var(--alerta); color: var(--alerta); font-weight: 700; }
.emp-flag--procesamiento, .emp-flag--imputacion { border-color: color-mix(in srgb, var(--alerta) 60%, transparent); color: var(--alerta); }
/* Preliminary signal — celeste, like `observacion`. It used --sol/--money:
   gold is money and nothing else, and a denuncia is not a peso figure. */
.emp-flag--denuncia { border-color: color-mix(in srgb, var(--celeste) 55%, transparent); color: var(--celeste-deep); }
.emp-flag--investigacion { border-color: var(--rule-strong); color: var(--text); }
.emp-flag--observacion { border-color: color-mix(in srgb, var(--celeste) 55%, transparent); color: var(--celeste-deep); }
.emp-flag--periodistica { border-color: var(--rule); color: var(--text-muted); }
/* "Is it in the data" is coverage, not money — --verde is the presence token.
   (It was painting `var(--money, #1a7f4b)`: gold for a non-money badge, against
   an undefined token, so it fell back to a hex that ignores the theme.) */
.emp-db--in { border-color: color-mix(in srgb, var(--verde) 45%, transparent); color: var(--verde); }
.emp-db--out { border-color: color-mix(in srgb, var(--alerta) 35%, transparent); color: var(--text-muted); }

.emp-card__alleg { margin: 0 0 var(--s-3); font-size: var(--t-base); line-height: 1.6; }

.emp-meta { display: flex; flex-direction: column; gap: 6px; margin: 0 0 var(--s-3); }
.emp-meta__row { display: grid; grid-template-columns: 96px 1fr; gap: var(--s-3); align-items: start; }
.emp-meta__k {
  font-family: var(--font-mono); font-size: var(--t-xs); text-transform: uppercase;
  letter-spacing: 0.05em; color: var(--text-muted); padding-top: 2px;
}
.emp-meta__v { font-size: var(--t-sm); line-height: 1.5; }
.emp-dbnote { color: var(--text-muted); }

.emp-caveat {
  margin: 0 0 var(--s-3); padding: var(--s-3) var(--s-4);
  background: var(--surface-sunken); border-radius: var(--r-md);
  font-size: var(--t-sm); line-height: 1.55; color: var(--text-muted);
}
.emp-caveat__tag {
  display: inline-block; margin-right: 6px; font-family: var(--font-mono);
  font-size: var(--t-xs); text-transform: uppercase; letter-spacing: 0.05em; color: var(--celeste-deep);
}

.emp-card__foot {
  display: flex; flex-wrap: wrap; gap: var(--s-2) var(--s-4);
  align-items: center; justify-content: space-between;
  padding-top: var(--s-3); border-top: 1px solid color-mix(in srgb, var(--rule) 60%, transparent);
}
.emp-src { display: flex; flex-wrap: wrap; gap: 8px; align-items: baseline; font-size: var(--t-xs); }
.emp-src__lbl { font-family: var(--font-mono); text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); }
.emp-src__a { color: var(--celeste-deep); text-decoration: none; }
.emp-src__a:hover { text-decoration: underline; }
.emp-profile { color: var(--celeste-deep); text-decoration: none; font-size: var(--t-xs); white-space: nowrap; }
.emp-profile:hover { text-decoration: underline; }

@media (max-width: 560px) {
  .emp-meta__row { grid-template-columns: 1fr; gap: 1px; }
  .emp-meta__k { padding-top: 0; }
}
</style>
