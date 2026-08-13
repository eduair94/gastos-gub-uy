<script setup lang="ts">
/**
 * Deep-dive: the "consumición de cortesía" (art. 79764). The dispersion scatter is
 * the signature — Código de Barras' flat 4× premium against the cloud. The ledger
 * lists all 63 lines, each linking to its record on the site. Data + copy from the module.
 */
import {
  CORTESIA_BASELINE,
  CORTESIA_CONTRACTS,
  VERIFIED_METHODS,
  invContent,
} from '~/data/investigaciones'

const { locale, t } = useI18n()
const localePath = useLocalePath()
const c = computed(() => invContent(locale.value))
const cx = computed(() => c.value.cortesia)

const personLd = usePersonLd()
const orgLd = useOrgLd()
const breadcrumbLd = useBreadcrumbLd([
  { name: 'Investigaciones', path: '/investigaciones' },
  { name: cx.value.title },
])

useSeo(() => ({
  title: cx.value.title,
  description: cx.value.dek.slice(0, 155),
  path: '/investigaciones/casinos-cortesia',
  type: 'article',
  kicker: 'Investigación',
  jsonLd: [
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      'headline': cx.value.title,
      'description': cx.value.dek.slice(0, 155),
      'author': personLd,
      'publisher': orgLd,
    },
    breadcrumbLd,
  ],
}))

const titn = (s: string) => s.replace(/\s+/g, ' ').trim().split(' ').map(w => w.length > 2 ? w[0] + w.slice(1).toLowerCase() : w).join(' ')

const scatterPoints = computed(() => CORTESIA_CONTRACTS
  .filter(c2 => c2.unit > 0)
  .map(c2 => ({
    x: Date.parse(`${c2.date}T00:00:00Z`),
    y: c2.unit,
    label: titn(c2.sup),
    qty: c2.qty,
    tot: c2.tot,
    hi: c2.sup === 'CODIGO DE BARRAS SRL',
  })))

const heroTiles = computed(() => cx.value.tiles.map(t2 => ({ value: t2.n, label: t2.l, sub: t2.s })))

const ledgerColumns = computed(() => [
  { key: 'date', label: cx.value.colDate, mono: true },
  { key: 'supName', label: cx.value.colSup, primary: true },
  { key: 'qty', label: cx.value.colQty, align: 'end' as const, mono: true },
  { key: 'unit', label: cx.value.colUnit, align: 'end' as const, mono: true },
  { key: 'tot', label: cx.value.colTot, align: 'end' as const },
  { key: 'method', label: cx.value.colMethod },
  { key: 'idc', label: cx.value.colFicha },
])

const SOURCE_GROUPS = [
  {
    title: 'Compras Estatales',
    items: [
      { label: 'Ficha ejemplo — Compra por Excepción 51/2025', url: 'https://www.comprasestatales.gub.uy/consultas/detalle/id/1307206' },
      { label: 'Adjudicaciones DGC (Inciso 05 / UE 013)', url: 'https://www.comprasestatales.gub.uy/consultas/buscar/tipo-pub/ADJ/inciso/5/ue/13/tipo-doc/C/filtro-cat/CAT/tipo-orden/DESC' },
    ],
  },
  {
    title: 'Normativa · prensa',
    items: [
      { label: 'TOCAF Art. 33 (IMPO)', url: 'https://impo.com.uy/bases/tocaf-tcr/150-2012/33' },
      { label: 'La explicación de Economía — El Observador (2021)', url: 'https://www.elobservador.com.uy/nota/la-explicacion-que-dio-economia-sobre-los-880-000-del-desayuno-merienda-de-casinos-2021315194155' },
    ],
  },
]

const ledger = computed(() => CORTESIA_CONTRACTS
  .slice()
  .sort((a, b) => (a.date < b.date ? -1 : 1))
  .map(c2 => ({
    ...c2,
    supName: titn(c2.sup),
    method: VERIFIED_METHODS[c2.idc],
    flag: c2.unit === 211749 || c2.qty === 0,
    flat: c2.unit === 211749,
    zero: c2.qty === 0,
  })))
</script>

<template>
  <div class="inv">
    <InvCover
      :fields="[
        { label: t('inv.file.articulo'), value: cx.fileArt },
        { label: t('inv.file.organismo'), value: cx.fileOrg },
        { label: t('inv.file.periodo'), value: cx.filePeriod },
        { value: c.common.source },
      ]"
      :kicker="cx.kicker"
      :title="cx.title"
      :dek="cx.dek"
      :chips="cx.chips"
    />

    <!-- Hero number + tiles -->
    <InvSection alt>
      <div class="inv-hero">
        <div>
          <p class="u-eyebrow">
            {{ cx.statTotal }}
          </p>
          <MoneyAmount
            :amount="58849923"
            size="xl"
            align="start"
            :rule="false"
          />
          <p class="inv-hero__usd">
            {{ cx.statTotalSub }}
          </p>
        </div>
        <InvTiles
          :columns="2"
          :items="heroTiles"
        />
      </div>
    </InvSection>

    <!-- Qué es -->
    <InvSection
      :eyebrow="cx.queTag"
      :title="cx.queTitle"
    >
      <div class="inv-prose">
        <p
          v-for="(p, i) in cx.que"
          :key="i"
        >
          {{ p }}
        </p>
      </div>
    </InvSection>

    <!-- Hallazgo central -->
    <InvSection
      alt
      :eyebrow="cx.hallazgoTag"
      :title="cx.hallazgoTitle"
    >
      <InvFinding
        :kicker="cx.hallazgoKicker"
        :title="cx.hallazgoH"
        :body="cx.hallazgoP"
        :law="cx.hallazgoLaw"
      >
        <div class="inv-contra">
          <div class="inv-contra__cell">
            <div class="inv-contra__h">
              {{ cx.contraA }}
            </div>
            <div class="inv-contra__b">
              {{ cx.contraAp }}
            </div>
          </div>
          <div class="inv-contra__vs">
            vs
          </div>
          <div class="inv-contra__cell">
            <div class="inv-contra__h">
              {{ cx.contraB }}
            </div>
            <div class="inv-contra__b">
              {{ cx.contraBp }}
            </div>
          </div>
        </div>
      </InvFinding>

      <div class="inv-balance">
        <div class="inv-balance__h">
          {{ cx.balanceH }}
        </div>
        <p
          v-for="(p, i) in cx.balance"
          :key="i"
        >
          {{ p }}
        </p>
      </div>
    </InvSection>

    <!-- Dispersión (signature) -->
    <InvSection
      :eyebrow="cx.scatterTag"
      :title="cx.scatterTitle"
      :dek="cx.scatterIntro"
    >
      <ChartBlock framed>
        <InvScatter
          :points="scatterPoints"
          :median="CORTESIA_BASELINE.p50"
          :y-max="220000"
          :median-label="c.chart.median"
          :unit-label="c.chart.unit"
        />
        <template #meta>
          <InvLegend
            :items="[
              { label: cx.scatterLegendRest, color: 'var(--money-rule)' },
              { label: cx.scatterLegendCdb, color: 'var(--alerta)' },
              { label: `${c.chart.median} $ 51.230`, color: 'var(--celeste)', shape: 'line' },
            ]"
          />
        </template>
      </ChartBlock>
    </InvSection>

    <!-- Observaciones -->
    <InvSection
      alt
      :eyebrow="cx.obsTag"
      :title="cx.obsTitle"
    >
      <div class="inv-obs-grid">
        <div
          v-for="o in cx.obs"
          :key="o.h"
          class="inv-obs"
        >
          <span class="inv-obs__tag">{{ o.tag }}</span>
          <h3>{{ o.h }}</h3>
          <p>{{ o.p }}</p>
        </div>
      </div>
    </InvSection>

    <!-- Ledger -->
    <InvSection
      :eyebrow="cx.ledgerTag"
      :title="cx.ledgerTitle"
      :dek="cx.ledgerIntro"
    >
      <InvLedger
        :columns="ledgerColumns"
        :rows="ledger"
        :row-key="(row) => row.ocid + row.date"
        :row-class="(row) => ({ rowflag: row.flag })"
        :min-width="760"
      >
        <template #cell:unit="{ row }">
          <span class="chip-row chip-row--baseline">
            <span>{{ formatMoney(row.unit, 'UYU') }}</span>
            <span
              v-if="row.flat"
              class="inv-warnpill"
            >{{ locale === 'en' ? 'flat' : 'fijo' }}</span>
          </span>
        </template>
        <template #cell:tot="{ row }">
          <span class="chip-row chip-row--baseline">
            <MoneyAmount
              :amount="row.tot"
              size="sm"
              compact
            />
            <span
              v-if="row.zero"
              class="inv-warnpill"
            >qty 0</span>
          </span>
        </template>
        <template #cell:method="{ row }">
          <span
            v-if="row.method"
            class="inv-badge inv-badge--exc"
          >{{ row.method }}</span>
          <span
            v-else
            class="inv-badge inv-badge--nd"
          >{{ cx.consultar }}</span>
        </template>
        <template #cell:idc="{ row }">
          <NuxtLink :to="localePath(`/contracts/adjudicacion-${row.idc}`)">
            {{ row.idc }} →
          </NuxtLink>
        </template>
      </InvLedger>
    </InvSection>

    <!-- Sources + back -->
    <InvSection
      alt
      :eyebrow="cx.sourcesTitle"
      :title="c.common.verified"
    >
      <InvSources :groups="SOURCE_GROUPS" />
      <p class="inv-note--spaced">
        <NuxtLink :to="localePath('/investigaciones/casinos')">
          ← {{ c.casinos.title }}
        </NuxtLink>
      </p>
    </InvSection>

    <!-- Uruguay Leaks: lo que no está en los datos abiertos se manda a quien puede protegerlo. -->
    <InvSection>
      <LeakTip
        :subject="cx.title"
        path="/investigaciones/casinos-cortesia"
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
