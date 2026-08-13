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

const { locale, t } = useI18n()
const localePath = useLocalePath()
const c = computed(() => invContent(locale.value))
const cc = computed(() => c.value.casinos)

const personLd = usePersonLd()
const orgLd = useOrgLd()
const breadcrumbLd = useBreadcrumbLd([
  { name: t('nav.investigaciones'), path: '/investigaciones' },
  { name: cc.value.title },
])

// No reliable single ISO date on this page's data: `filePeriod` ("2002–2026")
// is a coverage range, not a publish/modify timestamp, so `article` is
// omitted rather than inventing one — see useSeo's SeoArticle contract.
useSeo(() => ({
  title: cc.value.title,
  description: cc.value.dek.slice(0, 155),
  path: '/investigaciones/casinos',
  type: 'article',
  kicker: 'Investigación',
  jsonLd: [
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      'headline': cc.value.title,
      'description': cc.value.dek.slice(0, 155),
      'author': personLd,
      'publisher': orgLd,
    },
    breadcrumbLd,
  ],
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

const fichaUrl = (id: string) => `https://www.comprasestatales.gub.uy/consultas/detalle/id/${id}`
const rubroLabel = (key: string) => (c.value.rubro as Record<string, string>)[key] ?? key

/** Verified rubros, split by how they were bought — each row links to its ficha. */
function rubroSources(competitivo: boolean) {
  return RUBROS_MAP
    .filter(r => (r.cat === 'competitivo') === competitivo)
    .map(r => ({ label: `${rubroLabel(r.key)} — ${r.verif}`, url: fichaUrl(r.id), note: `id ${r.id}` }))
}

const sourceGroups = computed(() => [
  { title: cc.value.sourcesLicitado, items: rubroSources(true) },
  { title: cc.value.sourcesExcepcion, items: rubroSources(false) },
  {
    title: cc.value.sourcesNorm,
    items: [
      { label: 'TOCAF Art. 33 — causales de excepción (IMPO)', url: 'https://impo.com.uy/bases/tocaf-tcr/150-2012/33' },
      { label: 'Auditoría Interna de la Nación — DGC 2022 (PDF)', url: 'https://www.gub.uy/ministerio-economia-finanzas/sites/ministerio-economia-finanzas/files/documentos/publicaciones/2022_MinisteriodeEconomiayFinanzas-DireccionGeneraldeCasinos.pdf' },
      { label: 'Todas las adjudicaciones DGC (Inciso 05 / UE 013)', url: 'https://www.comprasestatales.gub.uy/consultas/buscar/tipo-pub/ADJ/inciso/5/ue/13/tipo-doc/C/filtro-cat/CAT/tipo-orden/DESC' },
    ],
  },
])

const headlineTiles = computed(() => [
  { value: '11.630', label: cc.value.statContracts },
  { amount: 15410928465, label: cc.value.statCapped, sub: cc.value.statCappedSub },
  { value: '770', label: cc.value.statRubros },
  { value: '75%', tone: 'alerta' as const, label: cc.value.statExcepcion },
])

const mapaTiles = computed(() => [
  { value: `$ ${Math.round(excepcionTotal / 1e6)} M`, tone: 'alerta' as const, label: cc.value.mapaExcepcion },
  { value: `$ ${Math.round(licitadoTotal / 1e6)} M`, tone: 'verde' as const, label: cc.value.mapaLicitado },
])
</script>

<template>
  <div class="inv">
    <InvCover
      :fields="[
        { label: t('inv.file.expediente'), value: cc.fileOrg },
        { label: t('inv.file.inciso'), value: cc.fileInciso },
        { label: t('inv.file.periodo'), value: cc.filePeriod },
        { value: c.common.source },
      ]"
      :kicker="cc.kicker"
      :title="cc.title"
      :dek="cc.dek"
      :chips="cc.chips"
    />

    <InvSection alt>
      <InvTiles :items="headlineTiles" />
    </InvSection>

    <!-- Qué compra -->
    <InvSection
      :eyebrow="cc.queTag"
      :title="cc.queTitle"
      :dek="cc.queIntro"
    >
      <ChartBlock
        framed
        :level="3"
        :title="cc.queChart"
        :help="c.common.dataNote"
      >
        <InvHBars
          :items="opsItems"
          format="count"
        />
      </ChartBlock>
    </InvSection>

    <!-- Cómo compra -->
    <InvSection
      alt
      :eyebrow="cc.comoTag"
      :title="cc.comoTitle"
      :dek="cc.comoIntro"
    >
      <div class="inv-grid2">
        <ChartBlock
          framed
          :level="3"
          :title="cc.comoChart"
          :help="`${c.method.sinDato}: 7.179`"
        >
          <InvHBars
            :items="methodItems"
            format="count"
            :row-height="42"
          />
        </ChartBlock>
        <InvFinding
          :kicker="cc.comoTag"
          :title="cc.comoFindingTitle"
          :body="cc.comoFinding"
        />
      </div>
    </InvSection>

    <!-- El mapa -->
    <InvSection
      :eyebrow="cc.mapaTag"
      :title="cc.mapaTitle"
      :dek="cc.mapaIntro"
    >
      <ChartBlock
        framed
        :level="3"
        :title="cc.mapaChart"
      >
        <InvHBars
          :items="mapItems"
          format="moneyM"
          :row-height="46"
        />
        <template #meta>
          <InvLegend
            :items="[
              { label: c.cat.competitivo, color: 'var(--verde)' },
              { label: `${c.method.excepcion} · Art. 33.3`, color: 'var(--alerta)' },
            ]"
          />
        </template>
      </ChartBlock>
      <InvTiles
        spaced
        :columns="2"
        :items="mapaTiles"
      />
    </InvSection>

    <!-- Proveedores -->
    <InvSection
      alt
      :eyebrow="cc.provTag"
      :title="cc.provTitle"
      :dek="cc.provIntro"
    >
      <ChartBlock
        framed
        :level="3"
        :title="cc.provChart"
      >
        <InvHBars
          :items="supplierItems"
          format="moneyM"
          :row-height="36"
        />
      </ChartBlock>
      <p class="inv-note inv-note--spaced">
        {{ cc.provNote }}
      </p>
    </InvSection>

    <!-- Deep-dive -->
    <InvSection>
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
    </InvSection>

    <!-- Fuentes -->
    <InvSection
      alt
      :eyebrow="cc.sourcesTitle"
      :title="c.common.verified"
    >
      <InvSources :groups="sourceGroups" />
    </InvSection>

    <!-- Uruguay Leaks: lo que no está en los datos abiertos se manda a quien puede protegerlo. -->
    <InvSection>
      <LeakTip
        :subject="cc.title"
        path="/investigaciones/casinos"
      />
    </InvSection>

    <InvSection>
      <InvDisclaimer
        :title="c.common.disclaimerTitle"
        :paragraphs="c.common.disclaimer"
      />
    </InvSection>
  </div>
</template>
