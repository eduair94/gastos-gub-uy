<script setup lang="ts">
/**
 * Casinos del Estado — the comprehensive spending investigation. Overview of the
 * whole agency (what it buys, how it buys, who gets paid) built on capped figures
 * and contract counts, with the procurement-method map and a link to the cortesía
 * deep-dive. Data + bilingual copy from ~/data/investigaciones.
 */
import {
  DGC_METHODS,
  DGC_OPS_RUBROS,
  DGC_TOP_SUPPLIERS,
  RUBROS_MAP,
  excepcionTotal,
  invContent,
  licitadoTotal,
} from '~/data/investigaciones'

const { locale } = useI18n()
const localePath = useLocalePath()
const c = computed(() => invContent(locale.value))
const cc = computed(() => c.value.casinos)

useSeo(() => ({
  title: cc.value.title,
  description: cc.value.dek.slice(0, 155),
  path: '/investigaciones/casinos',
}))

const titn = (s: string) => s.replace(/\s+/g, ' ').trim().split(' ').map(w => w.length > 2 ? w[0] + w.slice(1).toLowerCase() : w).join(' ')

/** Operational rubros by contract count (the reliable magnitude). */
const opsItems = computed(() => DGC_OPS_RUBROS
  .slice()
  .sort((a, b) => b.lines - a.lines)
  .map(r => ({ label: locale.value === 'en' ? r.desc_en : r.desc_es, value: r.lines, color: 'gold' })))

/** Method mix — public tender in verde to make its rarity legible. */
const methodItems = computed(() => DGC_METHODS
  .slice()
  .sort((a, b) => b.n - a.n)
  .map(m => ({ label: (c.value.method as Record<string, string>)[m.key], value: m.n, color: m.key === 'publica' ? 'verde' : 'celeste' })))

/** The verified method map: verde = tendered, alerta = exception. */
const mapItems = computed(() => RUBROS_MAP
  .slice()
  .sort((a, b) => b.dgc - a.dgc)
  .map(r => ({ label: (c.value.rubro as Record<string, string>)[r.key], value: r.dgc, color: r.cat === 'competitivo' ? 'verde' : 'alerta', sub: r.verif })))

const supplierItems = computed(() => DGC_TOP_SUPPLIERS
  .slice(0, 10)
  .map(s => ({ label: titn(s.name), value: s.spend, color: 'gold', sub: `${s.awards} adj.` })))

const sourcesLicitado = computed(() => RUBROS_MAP.filter(r => r.cat === 'competitivo'))
const sourcesExcepcion = computed(() => RUBROS_MAP.filter(r => r.cat !== 'competitivo'))
const fichaUrl = (id: string) => `https://www.comprasestatales.gub.uy/consultas/detalle/id/${id}`
</script>

<template>
  <div class="inv">
    <!-- Cover -->
    <header class="inv-cover">
      <div class="u-container">
        <div class="inv-file">
          <span>EXPEDIENTE&nbsp; <b>{{ cc.fileOrg }}</b></span>
          <span>INCISO&nbsp; <b>{{ cc.fileInciso }}</b></span>
          <span>PERÍODO&nbsp; <b>{{ cc.filePeriod }}</b></span>
          <span>{{ c.common.source }}</span>
        </div>
        <p class="inv-kicker">
          {{ cc.kicker }}
        </p>
        <h1>{{ cc.title }}</h1>
        <p class="inv-dek">
          {{ cc.dek }}
        </p>
        <div class="inv-chips">
          <span
            v-for="ch in cc.chips"
            :key="ch"
            class="inv-chip"
          >{{ ch }}</span>
        </div>
      </div>
    </header>

    <!-- Stat tiles -->
    <section class="inv-sec inv-sec--alt">
      <div class="u-container">
        <div class="inv-tiles">
          <div class="inv-tile">
            <div class="inv-tile__n">
              11.630
            </div>
            <div class="inv-tile__l">
              {{ cc.statContracts }}
            </div>
          </div>
          <div class="inv-tile">
            <MoneyAmount
              :amount="15410928465"
              size="lg"
              align="start"
              :rule="false"
              compact
            />
            <div class="inv-tile__l">
              {{ cc.statCapped }}
            </div>
            <div class="inv-tile__s">
              {{ cc.statCappedSub }}
            </div>
          </div>
          <div class="inv-tile">
            <div class="inv-tile__n">
              770
            </div>
            <div class="inv-tile__l">
              {{ cc.statRubros }}
            </div>
          </div>
          <div class="inv-tile">
            <div class="inv-tile__n inv-tile__n--alerta">
              75%
            </div>
            <div class="inv-tile__l">
              {{ cc.statExcepcion }}
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Qué compra -->
    <section class="inv-sec">
      <div class="u-container">
        <div class="inv-head">
          <p class="u-eyebrow">
            {{ cc.queTag }}
          </p>
          <h2>{{ cc.queTitle }}</h2>
          <p>{{ cc.queIntro }}</p>
        </div>
        <div class="inv-cardc">
          <h3>{{ cc.queChart }}</h3>
          <p class="inv-cardsub">
            {{ c.common.dataNote }}
          </p>
          <div class="inv-scroll">
            <InvHBars
              :items="opsItems"
              format="count"
            />
          </div>
        </div>
      </div>
    </section>

    <!-- Cómo compra -->
    <section class="inv-sec inv-sec--alt">
      <div class="u-container">
        <div class="inv-head">
          <p class="u-eyebrow">
            {{ cc.comoTag }}
          </p>
          <h2>{{ cc.comoTitle }}</h2>
          <p>{{ cc.comoIntro }}</p>
        </div>
        <div class="inv-grid2">
          <div class="inv-cardc">
            <h3>{{ cc.comoChart }}</h3>
            <p class="inv-cardsub">
              {{ c.method.sinDato }}: 7.179
            </p>
            <div class="inv-scroll">
              <InvHBars
                :items="methodItems"
                format="count"
                :row-height="42"
              />
            </div>
          </div>
          <div class="inv-finding">
            <p class="inv-kicker">
              {{ cc.comoTag }}
            </p>
            <h3>{{ cc.comoFindingTitle }}</h3>
            <p>{{ cc.comoFinding }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- El mapa -->
    <section class="inv-sec">
      <div class="u-container">
        <div class="inv-head">
          <p class="u-eyebrow">
            {{ cc.mapaTag }}
          </p>
          <h2>{{ cc.mapaTitle }}</h2>
          <p>{{ cc.mapaIntro }}</p>
        </div>
        <div class="inv-cardc">
          <h3>{{ cc.mapaChart }}</h3>
          <div class="inv-scroll">
            <InvHBars
              :items="mapItems"
              format="moneyM"
              :row-height="46"
            />
          </div>
          <div class="inv-legend">
            <span><i style="background: var(--verde);" /> {{ c.cat.competitivo }}</span>
            <span><i style="background: var(--alerta);" /> {{ c.method.excepcion }} · Art. 33.3</span>
          </div>
        </div>
        <div
          class="inv-tiles inv-tiles--2"
          style="margin-top: var(--s-6);"
        >
          <div class="inv-tile">
            <div class="inv-tile__n inv-tile__n--alerta">
              {{ `$ ${Math.round(excepcionTotal / 1e6)} M` }}
            </div>
            <div class="inv-tile__l">
              {{ cc.mapaExcepcion }}
            </div>
          </div>
          <div class="inv-tile">
            <div class="inv-tile__n inv-tile__n--verde">
              {{ `$ ${Math.round(licitadoTotal / 1e6)} M` }}
            </div>
            <div class="inv-tile__l">
              {{ cc.mapaLicitado }}
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Proveedores -->
    <section class="inv-sec inv-sec--alt">
      <div class="u-container">
        <div class="inv-head">
          <p class="u-eyebrow">
            {{ cc.provTag }}
          </p>
          <h2>{{ cc.provTitle }}</h2>
          <p>{{ cc.provIntro }}</p>
        </div>
        <div class="inv-cardc">
          <h3>{{ cc.provChart }}</h3>
          <div class="inv-scroll">
            <InvHBars
              :items="supplierItems"
              format="moneyM"
              :row-height="36"
            />
          </div>
        </div>
        <p
          class="inv-note"
          style="margin-top: var(--s-4); max-width: 74ch;"
        >
          {{ cc.provNote }}
        </p>
      </div>
    </section>

    <!-- Deep-dive -->
    <section class="inv-sec">
      <div class="u-container">
        <NuxtLink
          :to="localePath('/investigaciones/casinos-cortesia')"
          class="inv-deep"
        >
          <p class="inv-deep__eyebrow">
            {{ cc.deepTag }}
          </p>
          <h3>{{ cc.deepTitle }}</h3>
          <p>{{ cc.deepDek }}</p>
          <span class="inv-deep__cta">{{ c.common.readMore }} →</span>
        </NuxtLink>
      </div>
    </section>

    <!-- Sources -->
    <section class="inv-sec inv-sec--alt">
      <div class="u-container">
        <div class="inv-head">
          <p class="u-eyebrow">
            {{ cc.sourcesTitle }}
          </p>
          <h2>{{ c.common.verified }}</h2>
        </div>
        <div class="inv-srcgroups">
          <div class="inv-srcgroup">
            <h4>{{ cc.sourcesLicitado }}</h4>
            <ul class="inv-srclist">
              <li
                v-for="r in sourcesLicitado"
                :key="r.code"
              >
                <a
                  :href="fichaUrl(r.id)"
                  target="_blank"
                  rel="noopener"
                >{{ (c.rubro as Record<string, string>)[r.key] }} — {{ r.verif }}</a>
                <div class="u">
                  id {{ r.id }}
                </div>
              </li>
            </ul>
          </div>
          <div class="inv-srcgroup">
            <h4>{{ cc.sourcesExcepcion }}</h4>
            <ul class="inv-srclist">
              <li
                v-for="r in sourcesExcepcion"
                :key="r.code"
              >
                <a
                  :href="fichaUrl(r.id)"
                  target="_blank"
                  rel="noopener"
                >{{ (c.rubro as Record<string, string>)[r.key] }} — {{ r.verif }}</a>
                <div class="u">
                  id {{ r.id }}
                </div>
              </li>
            </ul>
          </div>
          <div class="inv-srcgroup">
            <h4>{{ cc.sourcesNorm }}</h4>
            <ul class="inv-srclist">
              <li>
                <a
                  href="https://impo.com.uy/bases/tocaf-tcr/150-2012/33"
                  target="_blank"
                  rel="noopener"
                >TOCAF Art. 33 — causales de excepción (IMPO)</a>
              </li>
              <li>
                <a
                  href="https://www.gub.uy/ministerio-economia-finanzas/sites/ministerio-economia-finanzas/files/documentos/publicaciones/2022_MinisteriodeEconomiayFinanzas-DireccionGeneraldeCasinos.pdf"
                  target="_blank"
                  rel="noopener"
                >Auditoría Interna de la Nación — DGC 2022 (PDF)</a>
              </li>
              <li>
                <a
                  href="https://www.comprasestatales.gub.uy/consultas/buscar/tipo-pub/ADJ/inciso/5/ue/13/tipo-doc/C/filtro-cat/CAT/tipo-orden/DESC"
                  target="_blank"
                  rel="noopener"
                >Todas las adjudicaciones DGC (Inciso 05 / UE 013)</a>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>

    <!-- Disclaimer -->
    <section class="inv-sec">
      <div class="u-container">
        <div class="inv-disclaimer">
          <h3>{{ c.common.disclaimerTitle }}</h3>
          <p
            v-for="(p, i) in c.common.disclaimer"
            :key="i"
          >
            {{ p }}
          </p>
        </div>
      </div>
    </section>
  </div>
</template>
