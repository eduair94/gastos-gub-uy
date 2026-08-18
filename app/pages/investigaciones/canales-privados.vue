<script setup lang="ts">
/**
 * Canales 4, 10 y 12 — el ingreso publicado contra la pauta oficial que deja rastro.
 * Chrome estático alrededor de ~/data/investigaciones-canales. Los ingresos y resultados
 * son de los balances publicados por Gustavo Gómez (OBSERVACOM); la pauta sale de la base
 * del sitio, medida por RUT de proveedor. Las dos fuentes van separadas en la página, y
 * cada porcentaje divide pauta e ingreso del MISMO ejercicio.
 */
import { toQueryListParam } from '#shared/utils/query-list'
import {
  CAMPANA_2023,
  CANAL_BALANCES,
  CANAL_PAUTA,
  CANAL_PAUTA_REAL,
  CANAL_STATS,
  CANALES_SOURCES,
  HUECO,
  TURISMO_FICHAS,
  TURISMO_REPARTO,
  TURISMO_TOTAL,
  canalesContent,
} from '~/data/investigaciones-canales'

const { locale, t } = useI18n()
const localePath = useLocalePath()
const c = computed(() => canalesContent(locale.value))

const personLd = usePersonLd()
const orgLd = useOrgLd()
const breadcrumbLd = useBreadcrumbLd([
  { name: 'Investigaciones', path: '/investigaciones' },
  { name: c.value.title },
])

useSeo(() => ({
  title: c.value.title,
  description: c.value.dek.slice(0, 155),
  path: '/investigaciones/canales-privados',
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

const canalLabel = (key: string) => (c.value.canal as Record<string, string>)[key] ?? key

const headlineTiles = computed(() => [
  { amount: 2670764.75, label: c.value.tiles.c10, sub: c.value.tiles.c10Sub },
  { amount: 2592213.11, label: c.value.tiles.c12, sub: c.value.tiles.c12Sub },
  { amount: 3619213.11, label: c.value.tiles.c4, sub: c.value.tiles.c4Sub },
  { value: `${CANAL_STATS.perdidaVecesPauta}×`, label: c.value.tiles.perdida, sub: c.value.tiles.perdidaSub },
])

/** Balances: mayor ingreso primero, para que la tabla no dependa del orden del módulo. */
const balances = computed(() =>
  CANAL_BALANCES.slice().sort((a, b) => b.ingresos2025 - a.ingresos2025))

const balanceColumns = computed(() => [
  { key: 'canal', label: c.value.ctx.colCanal, primary: true, minWidth: '190px' },
  { key: 'ingresos2025', label: c.value.ctx.colIngresos, align: 'end' as const },
  { key: 'ingresosVarPct', label: c.value.ctx.colVar, align: 'end' as const, mono: true },
  { key: 'resultado2025', label: c.value.ctx.colResultado, align: 'end' as const },
  { key: 'close', label: c.value.ctx.colCierre, muted: true },
])

/** El cruce: una fila por canal, con la pauta del ejercicio y su parte del ingreso. */
const cruce = computed(() =>
  CANAL_PAUTA.map((p) => {
    const b = CANAL_BALANCES.find(x => x.key === p.key)!
    return { ...p, rut: b.rut, supplierId: b.supplierId, legal: b.legal, close: b.close }
  }).sort((a, b) => a.share2025 - b.share2025))

const cruceColumns = computed(() => [
  { key: 'canal', label: c.value.cruce.colCanal, primary: true, minWidth: '190px' },
  { key: 'rut', label: c.value.cruce.colRut, mono: true, nowrap: true, muted: true },
  { key: 'pauta2025', label: c.value.cruce.colPauta, align: 'end' as const },
  { key: 'share2025', label: c.value.cruce.colShare, align: 'end' as const, mono: true },
  { key: 'totalNominal', label: c.value.cruce.colTotal, align: 'end' as const },
  { key: 'contratos', label: c.value.cruce.colContratos, align: 'end' as const, mono: true },
])

/* Todas las barras van en oro: son dinero. El pico de 2014 se ve por su largo, y
   `--alerta` está reservado para anomalías, no para el máximo de una serie. */
const serieItems = computed(() =>
  CANAL_PAUTA_REAL.map(y => ({ label: String(y.year), value: y.value, color: 'gold' })))

const repartoColumns = computed(() => [
  { key: 'canal', label: c.value.reparto.colCanal, primary: true, minWidth: '190px' },
  { key: 'value', label: c.value.reparto.colMonto, align: 'end' as const },
  { key: 'share', label: c.value.reparto.colShare, align: 'end' as const, mono: true },
])

const campanaItems = computed(() => [
  { label: c.value.campana.barTres, value: CAMPANA_2023.tresCanales, color: 'gold', sub: `${CAMPANA_2023.tresCanalesPct}%` },
  { label: c.value.campana.barC5, value: CAMPANA_2023.canal5, color: 'celeste', sub: `${CAMPANA_2023.canal5Pct}%` },
  { label: c.value.campana.barResto, value: CAMPANA_2023.resto, color: 'neutral', sub: `${CAMPANA_2023.restoPct}%` },
])

const razones = computed(() => [
  { key: 'r1', title: c.value.trazar.r1t, body: c.value.trazar.r1 },
  { key: 'r2', title: c.value.trazar.r2t, body: c.value.trazar.r2 },
  { key: 'r3', title: c.value.trazar.r3t, body: c.value.trazar.r3 },
])

/** Las cuatro cifras de ANTEL, renderizadas del módulo y no repetidas en la prosa. */
const antelFacts = computed(() => [
  { key: 'adj', value: formatNumber(HUECO.antelAdjudicaciones), label: c.value.trazar.antelAdj },
  { key: 'lineas', value: formatNumber(HUECO.antelLineasPublicidad), label: c.value.trazar.antelLineas },
  { key: 'monto', amount: HUECO.antelPublicidadUYU, label: c.value.trazar.antelMonto },
  { key: 'tv', value: formatNumber(HUECO.antelTV), label: c.value.trazar.antelTv },
])

/** El filtro de proveedor del explorador toma ids cuando el valor trae una barra. */
const contractsLink = (supplierId: string) =>
  localePath(`/contracts?suppliers=${toQueryListParam(supplierId)}`)
</script>

<template>
  <div class="inv">
    <InvCover
      :fields="[
        { label: t('inv.file.expediente'), value: c.file.org },
        { value: c.file.inciso },
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

    <!-- El punto de partida: los balances -->
    <InvSection
      :eyebrow="c.ctx.tag"
      :title="c.ctx.title"
    >
      <div class="inv-prose">
        <p>{{ c.ctx.p1 }}</p>
        <p>{{ c.ctx.p2 }}</p>
        <p>{{ c.ctx.p3 }}</p>
      </div>

      <InvLedger
        :columns="balanceColumns"
        :rows="balances"
        row-key="key"
      >
        <template #cell:canal="{ row }">
          {{ canalLabel(row.key) }}
          <span class="cn-legal">{{ row.legal }}</span>
        </template>
        <!-- Cifra citada, no derivada: va en tinta y sin regla de magnitud. El oro
             queda para la pauta, que sí sale de la base (app/DESIGN.md). -->
        <template #cell:ingresos2025="{ row }">
          <span class="cn-quoted u-mono">{{ formatMoney(row.ingresos2025, 'UYU', { compact: true }) }}</span>
        </template>
        <template #cell:ingresosVarPct="{ row }">
          <span :class="row.ingresosVarPct < 0 ? 'cn-down' : 'cn-up'">
            {{ row.ingresosVarPct > 0 ? '+' : '' }}{{ row.ingresosVarPct }}%
          </span>
        </template>
        <template #cell:resultado2025="{ row }">
          <span
            class="cn-quoted u-mono"
            :class="{ 'cn-down': row.resultado2025 < 0 }"
          >
            {{ row.resultado2025 < 0 ? '−' : '' }}{{ formatMoney(Math.abs(row.resultado2025), 'UYU', { compact: true }) }}
          </span>
        </template>
      </InvLedger>

      <ReportedFigure
        :label="c.ctx.reportedLabel"
        :claim="c.ctx.reportedClaim"
        :source="c.ctx.reportedSource"
      />
    </InvSection>

    <!-- El cruce -->
    <InvSection
      alt
      :eyebrow="c.cruce.tag"
      :title="c.cruce.title"
      :dek="c.cruce.intro"
    >
      <InvLedger
        :columns="cruceColumns"
        :rows="cruce"
        row-key="key"
      >
        <!-- La ventana de Canal 4 no es el año calendario: se avisa en la fila, no sólo
             en el método, porque la columna dice «ejercicio 2025» para los tres. -->
        <template #cell:canal="{ row }">
          <NuxtLink :to="contractsLink(row.supplierId)">
            {{ canalLabel(row.key) }}
          </NuxtLink>
          <span
            v-if="row.close === 'junio'"
            class="cn-legal"
          >{{ c.cruce.ventanaJunio }}</span>
        </template>
        <template #cell:pauta2025="{ row }">
          <MoneyAmount
            :amount="row.pauta2025"
            compact
          />
        </template>
        <template #cell:share2025="{ row }">
          {{ row.share2025.toFixed(2).replace('.', ',') }}%
        </template>
        <template #cell:totalNominal="{ row }">
          <MoneyAmount
            :amount="row.totalNominal"
            compact
          />
        </template>
      </InvLedger>

      <InvFinding
        :kicker="c.cruce.tag"
        :body="[c.cruce.finding, c.cruce.finding2]"
      />
    </InvSection>

    <!-- La serie en pesos de hoy -->
    <InvSection
      :eyebrow="c.serie.tag"
      :title="c.serie.title"
      :dek="c.serie.intro"
    >
      <ChartBlock
        framed
        scroll
        :level="3"
        :title="c.serie.chart"
        :meta="CANAL_STATS.deflactor"
      >
        <InvHBars
          :items="serieItems"
          :label="c.serie.chart"
          format="moneyM"
          :row-height="30"
        />
      </ChartBlock>
      <InvFinding
        :kicker="c.serie.tag"
        :body="c.serie.finding"
      />
    </InvSection>

    <!-- Cómo se reparte -->
    <InvSection
      alt
      :eyebrow="c.reparto.tag"
      :title="c.reparto.title"
      :dek="c.reparto.intro"
    >
      <InvLedger
        :columns="repartoColumns"
        :rows="TURISMO_REPARTO"
        row-key="key"
      >
        <template #cell:canal="{ row }">
          {{ canalLabel(row.key) }}
        </template>
        <template #cell:value="{ row }">
          <MoneyAmount
            :amount="row.value"
            compact
          />
        </template>
        <template #cell:share="{ row }">
          {{ String(row.share).replace('.', ',') }}%
        </template>
      </InvLedger>

      <p class="cn-total">
        <MoneyAmount
          :amount="TURISMO_TOTAL"
          compact
          size="sm"
        />
      </p>

      <div class="cn-fichas chip-row">
        <NuxtLink
          v-for="f in TURISMO_FICHAS"
          :key="f.recordId"
          class="cn-ficha"
          :to="localePath(`/contracts/${f.recordId}`)"
        >
          {{ c.reparto.fichaLabel }} · {{ formatDate(f.adjudicada) }} →
        </NuxtLink>
      </div>

      <InvFinding
        :kicker="c.reparto.tag"
        :body="c.reparto.finding"
      />
    </InvSection>

    <!-- La concentración -->
    <InvSection
      :eyebrow="c.campana.tag"
      :title="c.campana.title"
      :dek="c.campana.intro"
    >
      <ChartBlock
        framed
        :level="3"
        :title="c.campana.chart"
      >
        <InvHBars
          :items="campanaItems"
          :label="c.campana.chart"
          format="moneyM"
          :row-height="52"
        />
      </ChartBlock>
      <InvFinding
        :kicker="c.campana.tag"
        :body="c.campana.finding"
      />
      <p class="cn-fichas chip-row">
        <NuxtLink
          class="cn-ficha"
          :to="localePath(`/contracts/${CAMPANA_2023.recordId}`)"
        >
          {{ c.campana.ficha }} →
        </NuxtLink>
      </p>
    </InvSection>

    <!-- Trazar el resto -->
    <InvSection
      alt
      :eyebrow="c.trazar.tag"
      :title="c.trazar.title"
    >
      <div class="inv-prose">
        <p>{{ c.trazar.p1 }}</p>
        <p>{{ c.trazar.p2 }}</p>
      </div>

      <ol class="cn-razones">
        <li
          v-for="(r, i) in razones"
          :key="r.key"
        >
          <span class="cn-razon-n u-mono">{{ i + 1 }}</span>
          <span class="cn-razon-b">
            <strong>{{ r.title }}</strong>
            <span>{{ r.body }}</span>
            <span
              v-if="r.key === 'r1'"
              class="cn-facts"
            >
              <span
                v-for="f in antelFacts"
                :key="f.key"
                class="cn-fact"
              >
                <MoneyAmount
                  v-if="f.amount !== undefined"
                  :amount="f.amount"
                  align="start"
                  size="sm"
                  :rule="false"
                />
                <span
                  v-else
                  class="cn-fact-n u-mono"
                >{{ f.value }}</span>
                <span class="cn-fact-l">{{ f.label }}</span>
              </span>
            </span>
          </span>
        </li>
      </ol>

      <div class="inv-prose">
        <p>{{ c.trazar.p3 }}</p>
      </div>

      <InvExplore
        :tag="c.explore.tag"
        :title="c.explore.title"
        :intro="c.explore.intro"
      >
        <v-btn
          :to="localePath('/pauta')"
          color="primary"
          variant="flat"
          prepend-icon="mdi-bullhorn-variant-outline"
          class="text-none"
        >
          {{ c.explore.pauta }}
        </v-btn>
        <v-btn
          v-for="p in CANAL_PAUTA"
          :key="p.key"
          :to="contractsLink(CANAL_BALANCES.find(b => b.key === p.key)!.supplierId)"
          variant="outlined"
          prepend-icon="mdi-file-document-multiple-outline"
          class="text-none"
        >
          {{ (c.explore as Record<string, string>)[p.key] }}
        </v-btn>
      </InvExplore>
    </InvSection>

    <!-- Método -->
    <InvSection
      :eyebrow="c.method.tag"
      :title="c.method.title"
    >
      <div class="inv-prose">
        <p>{{ c.method.p1 }}</p>
        <p>{{ c.method.p2 }}</p>
        <p>{{ c.method.p3 }}</p>
        <p>{{ c.method.p4 }}</p>
        <p>{{ c.method.p5 }}</p>
        <p>{{ c.method.p6 }}</p>
      </div>
    </InvSection>

    <!-- Fuentes -->
    <InvSection
      alt
      :eyebrow="c.sourcesTitle"
      :title="c.common.verified"
    >
      <InvSources :items="CANALES_SOURCES" />
    </InvSection>

    <!-- Uruguay Leaks: la composición del ingreso no está publicada; si alguien la tiene, hay canal. -->
    <InvSection>
      <LeakTip
        :subject="c.title"
        path="/investigaciones/canales-privados"
      />
    </InvSection>

    <InvSection>
      <InvDisclaimer
        :title="c.disclaimerTitle"
        :paragraphs="c.disclaimer"
      />
    </InvSection>
  </div>
</template>

<style scoped>
/* El nombre legal va debajo del nombre de aire: la tabla se lee por canal, pero el
   RUT y el proveedor del portal son los del titular. */
.cn-legal {
  display: block;
  font-size: var(--t-xs);
  color: var(--text-muted);
}

/* Las cifras de los balances son cita, no medición: tinta, sin oro y sin regla. */
.cn-quoted {
  font-size: var(--t-sm);
  color: var(--text);
}
.cn-down { color: var(--alerta); }
.cn-up { color: var(--text-muted); }

.cn-total {
  margin-top: var(--s-3);
  text-align: right;
  color: var(--text-muted);
  font-size: var(--t-xs);
}

.cn-fichas {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-3);
  margin-top: var(--s-3);
}
.cn-ficha { font-size: var(--t-sm); }

/* Las tres razones del hueco: numeradas, porque el texto las cuenta como tres.
   Respetan la medida de lectura: son prosa, no una tabla. */
.cn-razones {
  list-style: none;
  margin: var(--s-5) 0 var(--s-5);
  padding: 0;
  display: grid;
  gap: var(--s-4);
  max-width: var(--inv-measure);
}
.cn-razones li {
  display: flex;
  gap: var(--s-3);
  align-items: start;
}
.cn-razon-n {
  flex: 0 0 auto;
  color: var(--money);
  font-size: var(--t-sm);
  line-height: 1.6;
}
.cn-razon-b {
  display: grid;
  gap: var(--s-1);
}
.cn-razon-b strong { color: var(--text); }
.cn-razon-b > span { color: var(--text-muted); }

/* Las cifras de ANTEL: envuelven en el teléfono en vez de empujar la página. */
.cn-facts {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-3) var(--s-6);
  margin-top: var(--s-2);
}
.cn-fact {
  display: grid;
  gap: 2px;
}
/* Un conteo no es dinero, así que no lleva oro: el oro queda para el monto, que
   sí pasa por MoneyAmount. */
.cn-fact-n {
  color: var(--text);
  font-size: var(--t-md);
}
.cn-fact-l {
  font-size: var(--t-xs);
  color: var(--text-muted);
  max-width: 22ch;
}
</style>
