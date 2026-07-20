<script setup lang="ts">
/**
 * Empresas señaladas — el catálogo. Se parte de empresas señaladas por corrupción/
 * irregularidades con el Estado (prensa + Justicia) y se cruza contra la base de Compras
 * Estatales para ver si el señalamiento es verificable en los datos abiertos. Chrome estático
 * alrededor de ~/data/investigaciones-empresas (verificado caso por caso).
 */
import { EMP_CASES, EMP_OVERVIEW_STATS, empContent, type EmpCase, type EmpSector } from '~/data/investigaciones-empresas'

const { locale } = useI18n()
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
</script>

<template>
  <div class="inv">
    <!-- Cover -->
    <header class="inv-cover">
      <div class="u-container">
        <div class="inv-file">
          <span>EXPEDIENTE&nbsp; <b>{{ c.file.org }}</b></span>
          <span>{{ c.file.tag }}</span>
          <span>PERÍODO&nbsp; <b>{{ c.file.period }}</b></span>
          <span>{{ c.common.source }}</span>
        </div>
        <p class="inv-kicker">
          {{ c.kicker }}
        </p>
        <h1>{{ c.title }}</h1>
        <p class="inv-dek">
          {{ c.dek }}
        </p>
        <div class="inv-chips">
          <span
            v-for="ch in c.chips"
            :key="ch"
            class="inv-chip"
          >{{ ch }}</span>
        </div>
      </div>
    </header>

    <!-- Tiles -->
    <section class="inv-sec inv-sec--alt">
      <div class="u-container">
        <div class="inv-tiles">
          <div class="inv-tile">
            <div class="inv-tile__n">
              {{ EMP_OVERVIEW_STATS.companies }}
            </div>
            <div class="inv-tile__l">
              {{ c.tiles.companies }}
            </div>
            <div class="inv-tile__s">
              {{ c.tiles.companiesSub }}
            </div>
          </div>
          <div class="inv-tile">
            <div class="inv-tile__n emp-good">
              {{ EMP_OVERVIEW_STATS.inData }}
            </div>
            <div class="inv-tile__l">
              {{ c.tiles.inData }}
            </div>
            <div class="inv-tile__s">
              {{ c.tiles.inDataSub }}
            </div>
          </div>
          <div class="inv-tile">
            <div class="inv-tile__n emp-warn">
              {{ EMP_OVERVIEW_STATS.notInData }}
            </div>
            <div class="inv-tile__l">
              {{ c.tiles.notInData }}
            </div>
            <div class="inv-tile__s">
              {{ c.tiles.notInDataSub }}
            </div>
          </div>
          <div class="inv-tile">
            <div class="inv-tile__n emp-cond">
              {{ EMP_OVERVIEW_STATS.condenas }}
            </div>
            <div class="inv-tile__l">
              {{ c.tiles.condenas }}
            </div>
            <div class="inv-tile__s">
              {{ c.tiles.condenasSub }}
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Método -->
    <section class="inv-sec">
      <div class="u-container">
        <div class="inv-head">
          <p class="u-eyebrow">
            {{ c.method.tag }}
          </p>
          <h2>{{ c.method.title }}</h2>
        </div>
        <div class="inv-prose">
          <p>{{ c.method.p1 }}</p>
          <p>{{ c.method.p2 }}</p>
        </div>
        <div
          class="inv-finding"
          style="margin-top: var(--s-6);"
        >
          <p class="inv-kicker">
            {{ c.gap.tag }}
          </p>
          <h3 style="margin: 0 0 6px;">
            {{ c.gap.title }}
          </h3>
          <p>{{ c.gap.p }}</p>
        </div>
      </div>
    </section>

    <!-- Deep-dive CTAs -->
    <section class="inv-sec inv-sec--alt">
      <div class="u-container">
        <div class="inv-serie">
          <span class="inv-serie__tag">{{ c.cta.tag }}</span>
          <h2>{{ c.cta.title }}</h2>
        </div>
        <p
          class="inv-prose"
          style="margin-bottom: var(--s-6); color: var(--text-muted);"
        >
          {{ c.cta.intro }}
        </p>
        <div class="inv-cards">
          <NuxtLink
            :to="localePath('/investigaciones/asse-ambulancias')"
            class="inv-icard"
          >
            <div class="inv-icard__top">
              <div>
                <p class="inv-icard__eyebrow">
                  {{ lang({ es: 'Salud · ASSE', en: 'Health · ASSE' }) }}
                </p>
                <h3 class="inv-icard__title">
                  {{ lang({ es: 'ITHG: 5 fichas para US$ 20 millones', en: 'ITHG: 5 records for US$20 million' }) }}
                </h3>
              </div>
              <div class="inv-icard__emoji">
                🚑
              </div>
            </div>
            <div class="inv-icard__body">
              <p class="inv-icard__dek">
                {{ lang({ es: 'Una proveedora marítima que concentró el 96% de los traslados de ASSE por compra directa. La base registra $33 M; el Tribunal de Cuentas, más de $2.000 M.', en: 'A maritime supplier that concentrated 96% of ASSE transfers by direct purchase. The data shows $33 M; the Tribunal de Cuentas, over $2,000 M.' }) }}
              </p>
            </div>
            <div class="inv-icard__cta">
              {{ c.common.readMore }} →
            </div>
          </NuxtLink>

          <NuxtLink
            :to="localePath('/investigaciones/frigorifico-saturno')"
            class="inv-icard"
          >
            <div class="inv-icard__top">
              <div>
                <p class="inv-icard__eyebrow">
                  {{ lang({ es: 'Defensa · FF.AA.', en: 'Defense · Armed forces' }) }}
                </p>
                <h3 class="inv-icard__title">
                  {{ lang({ es: 'Saturno: la carne de los cuarteles', en: 'Saturno: the barracks’ meat' }) }}
                </h3>
              </div>
              <div class="inv-icard__emoji">
                🥩
              </div>
            </div>
            <div class="inv-icard__body">
              <p class="inv-icard__dek">
                {{ lang({ es: '283 contratos por $1.140 M con las tres fuerzas y el INDA. En la Armada, un faltante de 57 toneladas terminó en la Fiscalía.', en: '283 contracts for $1,140 M with all three forces and INDA. In the Navy, a 57-tonne shortfall ended up with prosecutors.' }) }}
              </p>
            </div>
            <div class="inv-icard__cta">
              {{ c.common.readMore }} →
            </div>
          </NuxtLink>
        </div>
      </div>
    </section>

    <!-- Catálogo por sector -->
    <section
      v-for="(g, gi) in grouped"
      :key="g.sector"
      class="inv-sec"
      :class="{ 'inv-sec--alt': gi % 2 === 1 }"
    >
      <div class="u-container">
        <div class="inv-head">
          <p class="u-eyebrow">
            {{ lang({ es: 'Sector', en: 'Sector' }) }}
          </p>
          <h2>{{ (c.sector as Record<string, string>)[g.sector] }}</h2>
        </div>

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
                <span class="emp-meta__k">{{ lang({ es: 'En juego', en: 'At stake' }) }}</span>
                <span class="emp-meta__v u-mono">{{ lang(k.amount) }}</span>
              </div>
              <div class="emp-meta__row">
                <span class="emp-meta__k">{{ lang({ es: 'Estado', en: 'Status' }) }}</span>
                <span class="emp-meta__v">{{ lang(k.status) }}</span>
              </div>
              <div class="emp-meta__row">
                <span class="emp-meta__k">{{ lang({ es: 'En la base', en: 'In the data' }) }}</span>
                <span class="emp-meta__v emp-dbnote">{{ k.db.note ? lang(k.db.note) : (k.db.reason ? lang(k.db.reason) : '—') }}</span>
              </div>
            </div>

            <p class="emp-caveat">
              <span class="emp-caveat__tag">{{ lang({ es: 'La otra campana', en: 'The other side' }) }}</span>
              {{ lang(k.caveat) }}
            </p>

            <footer class="emp-card__foot">
              <div class="emp-src">
                <span class="emp-src__lbl">{{ lang({ es: 'Fuentes', en: 'Sources' }) }}:</span>
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
      </div>
    </section>

    <!-- Disclaimer -->
    <section class="inv-sec inv-sec--alt">
      <div class="u-container">
        <div class="inv-disclaimer">
          <h3>{{ c.disclaimerTitle }}</h3>
          <p
            v-for="(p, i) in c.disclaimer"
            :key="i"
          >
            {{ p }}
          </p>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* A count of companies found in the data — presence, not pesos. Not gold. */
.emp-good { color: var(--verde); }
.emp-warn { color: var(--alerta); }
.emp-cond { color: var(--alerta); }

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
