<script setup lang="ts">
/**
 * El suicidio en Uruguay: lo que el Estado mide y lo que el Estado compra.
 *
 * ORDEN DE LA PÁGINA, Y POR QUÉ ES ESE. Las líneas de ayuda van PRIMERO, antes de cualquier
 * cifra. Quien llega buscando ayuda no puede tener que bajar cuatro secciones para
 * encontrarla, y la OMS pide exactamente eso. Recién después vienen la serie oficial, la
 * medición propia sobre el corpus y la política.
 *
 * La serie va antes que las compras. Invertir ese orden convertiría un problema de salud
 * pública en un problema de compras públicas, que no es lo que muestra el dato.
 *
 * COMUNICACIÓN RESPONSABLE. Sin métodos, sin casos individuales, sin cifra presentada como
 * récord. El único método nombrado es el objetivo 6 de la Estrategia Nacional, al nivel de
 * política pública en que lo escribe el documento oficial.
 */
import { invContent } from '~/data/investigaciones'
import {
  AYUDA,
  COMPARADORES,
  COMPRAS,
  CORPUS,
  DENOMINADOR,
  ESTRATEGIA_HORAS,
  INE_MAX,
  NORMAS,
  RATE_2025_OLD_BASE,
  SERIE,
  SU_SOURCES,
  ULTIMO_RECURSO,
  VIOLENTAS,
  suContent,
} from '~/data/investigaciones-suicidios'

const { locale, t } = useI18n()
const c = computed(() => invContent(locale.value))
const cx = computed(() => suContent(locale.value))

const personLd = usePersonLd()
const orgLd = useOrgLd()
const breadcrumbLd = useBreadcrumbLd([
  { name: 'Investigaciones', path: '/investigaciones' },
  { name: cx.value.title },
])

useSeo(() => ({
  title: cx.value.title,
  description: cx.value.dek.slice(0, 155),
  path: '/investigaciones/suicidios',
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

const nf = computed(() => new Intl.NumberFormat(locale.value === 'en' ? 'en-US' : 'es-UY'))
const heroTiles = computed(() => cx.value.tiles.map(x => ({ value: x.n, label: x.l, sub: x.s })))

/* ── La serie ─────────────────────────────────────────────────────────────── */
const serieLabels = computed(() => SERIE.map(p => String(p.year)))
const serieSeries = computed(() => [{
  label: cx.value.serieLabel,
  values: SERIE.map(p => p.rate),
  colorVar: 'alerta',
  fallback: '#b2423b',
}])

/* ── El denominador ───────────────────────────────────────────────────────── */
const denomColumns = computed(() => [
  { key: 'year', label: cx.value.denomColYear, primary: true, mono: true },
  { key: 'implied', label: cx.value.denomColImplied, align: 'end' as const, mono: true },
])

/* ── Las tres muertes violentas ───────────────────────────────────────────────
 * Dos años y tres causas. Una línea con dos puntos no dibuja una tendencia:
 * dibuja un segmento y engaña. Va como cuadro, que es lo que el dato es. */
const violentasRows = computed(() => (['suicidio', 'transito', 'homicidio'] as const).map(k => ({
  key: k,
  causa: cx.value.violentasLabels[k],
  y2019: VIOLENTAS[0]![k],
  y2020: VIOLENTAS[1]![k],
})))
const violentasColumns = computed(() => [
  { key: 'causa', label: cx.value.violentasColCausa, primary: true, minWidth: '200px' },
  { key: 'y2019', label: '2019', align: 'end' as const, mono: true },
  { key: 'y2020', label: '2020', align: 'end' as const, mono: true },
])
const rateFmt = computed(() => new Intl.NumberFormat(locale.value === 'en' ? 'en-US' : 'es-UY', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))

/* ── Las siete compras ────────────────────────────────────────────────────── */
type CompraKey = keyof typeof cx.value.comprasItems
const comprasRows = computed(() => COMPRAS.map(x => ({
  ...x,
  yearLabel: x.awardYear ? `${x.year} → ${x.awardYear}` : String(x.year),
  object: cx.value.comprasItems[x.key as CompraKey],
})))
const comprasColumns = computed(() => [
  { key: 'yearLabel', label: cx.value.comprasCols.year, mono: true, nowrap: true },
  { key: 'buyer', label: cx.value.comprasCols.buyer, primary: true, minWidth: '190px' },
  { key: 'object', label: cx.value.comprasCols.object, minWidth: '240px' },
  { key: 'supplier', label: cx.value.comprasCols.supplier, minWidth: '170px' },
  { key: 'award', label: cx.value.comprasCols.award, align: 'end' as const },
])

/* ── Los comparadores ─────────────────────────────────────────────────────── */
type CmpKey = keyof typeof cx.value.contrasteLabels
const comparadorBars = computed(() => COMPARADORES.map(x => ({
  label: cx.value.contrasteLabels[x.key as CmpKey],
  value: x.ocids,
})))

/* ── Último Recurso ───────────────────────────────────────────────────────── */
type OngKey = keyof typeof cx.value.ongItems
const ongRows = computed(() => ULTIMO_RECURSO.rows.map(r => ({
  ...r,
  object: cx.value.ongItems[r.key as OngKey],
})))
const ongColumns = computed(() => [
  { key: 'year', label: cx.value.ongCols.year, mono: true, nowrap: true },
  { key: 'buyer', label: cx.value.ongCols.buyer, primary: true, minWidth: '180px' },
  { key: 'object', label: cx.value.ongCols.object, minWidth: '240px' },
  { key: 'uyu', label: cx.value.ongCols.uyu, align: 'end' as const },
])

/* ── Las horas de la Estrategia ───────────────────────────────────────────── */
type RoleKey = keyof typeof cx.value.estrategiaRoles
const horasRows = computed(() => ESTRATEGIA_HORAS.map(h => ({
  ...h,
  role: cx.value.estrategiaRoles[h.key as RoleKey],
})))
const horasColumns = computed(() => [
  { key: 'role', label: cx.value.estrategiaColRole, primary: true, minWidth: '280px' },
  { key: 'hours', label: cx.value.estrategiaColHours, align: 'end' as const, mono: true },
])

/* ── La cronología normativa ──────────────────────────────────────────────── */
type NormaKey = keyof typeof cx.value.normas
const normas = computed(() => NORMAS.map(n => ({ ...n, text: cx.value.normas[n.key as NormaKey] })))

/* ── Las líneas de ayuda ──────────────────────────────────────────────────── */
type AyudaKey = keyof typeof cx.value.ayudaLabels
const ayuda = computed(() => AYUDA.map(a => ({ ...a, label: cx.value.ayudaLabels[a.key as AyudaKey] })))

const sourceGroups = computed(() => SU_SOURCES.map(g => ({
  title: g.key === 'oficial' ? cx.value.srcOficial : cx.value.srcPrensa,
  items: g.items,
})))

const leakFacts = computed(() => [
  'En 1.639.165 compras del Estado desde 2002, sólo siete mencionan el suicidio.',
  'La mayor es de 2016: Sanidad Policial adjudicó a Último Recurso una línea telefónica de prevención por 24 meses y 4.540.800 pesos.',
  'La Estrategia Nacional de Prevención del Suicidio 2021-2025 no tiene presupuesto asignado: pide 76 horas semanales de perfiles a tiempo parcial.',
])
</script>

<template>
  <div class="inv">
    <!-- Las líneas de ayuda van primero, y eso incluye la portada. Nada se pone antes de esto. -->
    <InvSection
      alt
      :eyebrow="cx.ayudaTag"
      :title="cx.ayudaTitle"
      :dek="cx.ayudaP"
    >
      <ul class="su-help">
        <li
          v-for="a in ayuda"
          :key="a.key"
        >
          <b class="su-help__n">{{ a.phone }}</b>
          <span>{{ a.label }}</span>
        </li>
      </ul>
      <p class="inv-note">
        {{ cx.ayudaNota }}
      </p>
    </InvSection>

    <InvCover
      tone="celeste"
      :fields="[
        { label: t('inv.file.alcance'), value: cx.fileScope },
        { label: t('inv.file.periodo'), value: cx.filePeriod },
        { value: cx.fileSource },
      ]"
      :kicker="cx.kicker"
      :title="cx.title"
      :dek="cx.dek"
      :chips="cx.chips"
    />

    <!-- El siete, como titular -->
    <InvSection>
      <div class="inv-hero">
        <div>
          <p class="u-eyebrow">
            {{ cx.statHead }}
          </p>
          <p class="su-seven">
            {{ CORPUS.suicidOcids }}
          </p>
          <p class="inv-hero__usd">
            {{ cx.statSub }}
          </p>
        </div>
        <InvTiles
          :columns="2"
          :items="heroTiles"
        />
      </div>
    </InvSection>

    <!-- La serie oficial -->
    <InvSection
      alt
      :eyebrow="cx.serieTag"
      :title="cx.serieTitle"
    >
      <div class="inv-prose">
        <p
          v-for="(p, i) in cx.serie"
          :key="i"
        >
          {{ p }}
        </p>
      </div>

      <ChartBlock
        :title="cx.serieChart"
        :help="cx.serieChartHelp"
        :scroll="false"
      >
        <TrendLines
          :labels="serieLabels"
          :series="serieSeries"
          format="plain"
          :decimals="2"
          :unit="cx.serieUnit"
          :label="cx.serieChart"
        />
      </ChartBlock>
    </InvSection>

    <!-- El denominador: cálculo propio -->
    <InvSection
      :eyebrow="cx.denomTag"
      :title="cx.denomTitle"
    >
      <div class="inv-prose">
        <p
          v-for="(p, i) in cx.denom"
          :key="i"
        >
          {{ p }}
        </p>
      </div>

      <InvLedger
        :columns="denomColumns"
        :rows="DENOMINADOR"
        row-key="year"
        :min-width="420"
        :row-class="(row: any) => (row.implied > INE_MAX.people ? 'rowflag' : undefined)"
      >
        <template #cell:implied="{ row }">
          {{ nf.format(row.implied) }}
        </template>
      </InvLedger>
      <p class="inv-note">
        {{ cx.denomNote }} · INE {{ INE_MAX.year }}: {{ nf.format(INE_MAX.people) }} · 2025 sobre la base de 2024: {{ RATE_2025_OLD_BASE }}
      </p>
    </InvSection>

    <!-- La escala frente a las otras muertes violentas -->
    <InvSection
      alt
      :eyebrow="cx.violentasTag"
      :title="cx.violentasTitle"
    >
      <div class="inv-prose">
        <p
          v-for="(p, i) in cx.violentas"
          :key="i"
        >
          {{ p }}
        </p>
      </div>

      <InvLedger
        :columns="violentasColumns"
        :rows="violentasRows"
        row-key="key"
        :min-width="440"
        :row-class="(row: any) => (row.key === 'suicidio' ? 'rowflag' : undefined)"
      >
        <template #cell:y2019="{ row }">
          {{ rateFmt.format(row.y2019) }}
        </template>
        <template #cell:y2020="{ row }">
          {{ rateFmt.format(row.y2020) }}
        </template>
      </InvLedger>
      <p class="inv-note">
        {{ cx.violentasChart }} · {{ cx.serieUnit }}
      </p>
    </InvSection>

    <!-- Las siete compras -->
    <InvSection
      :eyebrow="cx.comprasTag"
      :title="cx.comprasTitle"
    >
      <div class="inv-prose">
        <p
          v-for="(p, i) in cx.compras"
          :key="i"
        >
          {{ p }}
        </p>
      </div>

      <InvLedger
        :columns="comprasColumns"
        :rows="comprasRows"
        row-key="ocid"
        :min-width="780"
      >
        <template #cell:supplier="{ row }">
          {{ row.supplier ?? '—' }}
        </template>
        <template #cell:award="{ row }">
          <MoneyAmount
            v-if="row.award !== null"
            :amount="row.award"
            size="sm"
          />
          <span
            v-else
            class="su-nd"
          >{{ cx.comprasSinAdj }}</span>
        </template>
      </InvLedger>
      <p class="inv-note">
        {{ cx.comprasNota }}
      </p>
    </InvSection>

    <!-- El contraste con otros temas medidos igual -->
    <InvSection
      alt
      :eyebrow="cx.contrasteTag"
      :title="cx.contrasteTitle"
    >
      <div class="inv-prose">
        <p
          v-for="(p, i) in cx.contraste"
          :key="i"
        >
          {{ p }}
        </p>
      </div>

      <ChartBlock :title="cx.contrasteChart">
        <InvHBars
          :items="comparadorBars"
          format="count"
          :row-height="34"
          :label="cx.contrasteChart"
        />
      </ChartBlock>
    </InvSection>

    <!-- El proveedor -->
    <InvSection
      :eyebrow="cx.ongTag"
      :title="cx.ongTitle"
    >
      <div class="inv-prose">
        <p
          v-for="(p, i) in cx.ong"
          :key="i"
        >
          {{ p }}
        </p>
      </div>

      <InvLedger
        :columns="ongColumns"
        :rows="ongRows"
        :row-key="(row: any, i: number) => `${row.key}-${i}`"
        :min-width="640"
      >
        <template #cell:uyu="{ row }">
          <MoneyAmount
            :amount="row.uyu"
            size="sm"
          />
        </template>
      </InvLedger>
    </InvSection>

    <!-- La estrategia y sus horas -->
    <InvSection
      alt
      :eyebrow="cx.estrategiaTag"
      :title="cx.estrategiaTitle"
    >
      <div class="inv-prose">
        <p
          v-for="(p, i) in cx.estrategia"
          :key="i"
        >
          {{ p }}
        </p>
      </div>

      <InvLedger
        :columns="horasColumns"
        :rows="horasRows"
        row-key="key"
        :min-width="480"
      />
      <p class="inv-note">
        {{ cx.estrategiaHorasNota }}
      </p>

      <InvFinding
        :kicker="cx.estrategiaFindingKicker"
        :body="cx.estrategiaFinding"
      />
    </InvSection>

    <!-- La cronología de lo que sí existe -->
    <InvSection
      :eyebrow="cx.normasTag"
      :title="cx.normasTitle"
      :dek="cx.normasIntro"
    >
      <ol class="su-tl">
        <li
          v-for="n in normas"
          :key="n.key"
          class="su-tl__item"
        >
          <div class="su-tl__head">
            <time class="u-mono">{{ n.date }}</time>
            <a
              class="inv-badge inv-badge--ok"
              :href="n.url"
              target="_blank"
              rel="noopener noreferrer"
            >{{ c.common.official }}</a>
          </div>
          <p>{{ n.text }}</p>
        </li>
      </ol>
    </InvSection>

    <!-- Los intentos -->
    <InvSection
      alt
      :eyebrow="cx.intentosTag"
      :title="cx.intentosTitle"
    >
      <div class="inv-prose">
        <p
          v-for="(p, i) in cx.intentos"
          :key="i"
        >
          {{ p }}
        </p>
      </div>
    </InvSection>

    <!-- Los límites, con el mismo peso que los hallazgos -->
    <InvSection
      :eyebrow="c.common.method ?? 'Método'"
      :title="cx.limitesTitle"
    >
      <ul class="su-limits">
        <li
          v-for="(l, i) in cx.limites"
          :key="i"
        >
          {{ l }}
        </li>
      </ul>
    </InvSection>

    <InvSection alt>
      <LeakTip
        :subject="cx.title"
        path="/investigaciones/suicidios"
        :facts="leakFacts"
      />
    </InvSection>

    <InvSection
      :eyebrow="cx.sourcesTag"
      :title="cx.sourcesTitle"
      :dek="cx.sourcesP"
    >
      <InvSources :groups="sourceGroups" />
    </InvSection>

    <InvSection alt>
      <InvDisclaimer
        :title="c.common.disclaimerTitle"
        :paragraphs="c.common.disclaimer"
      />
    </InvSection>
  </div>
</template>

<style scoped lang="scss">
/* El siete es el titular. No va en oro: no es plata, es un conteo. */
.su-seven {
  font-family: var(--font-display);
  font-size: clamp(3.5rem, 12vw, 7rem);
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.04em;
  margin: var(--s-3) 0 0;
  color: var(--alerta);
}

/* Las líneas de ayuda: número grande, etiqueta al lado. En teléfono se apilan,
   y el número queda arriba porque es lo único que hace falta leer. */
.su-help {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--s-4);
  max-width: 74ch;
}

.su-help li {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--s-2) var(--s-4);
  border-top: 1px solid var(--rule);
  padding-top: var(--s-3);
}

.su-help__n {
  font-family: var(--font-display);
  font-size: clamp(1.4rem, 5vw, 1.9rem);
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--celeste-deep);
  white-space: nowrap;
}

.su-help li span {
  color: var(--text-muted);
  font-size: 0.92rem;
  line-height: 1.5;
}

.su-tl {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--s-5);
  max-width: 78ch;
}

.su-tl__item {
  border-top: 1px solid var(--rule);
  padding-top: var(--s-4);
}

.su-tl__head {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2) var(--s-3);
  align-items: baseline;
  margin-bottom: var(--s-2);
}

.su-tl__head time {
  font-size: 0.82rem;
  color: var(--text-muted);
}

.su-tl__item p {
  margin: 0;
  max-width: 72ch;
  line-height: 1.6;
}

.su-limits {
  margin: 0;
  padding-left: var(--s-5);
  display: grid;
  gap: var(--s-3);
  max-width: 74ch;
  color: var(--text-muted);
}

.su-nd {
  color: var(--text-muted);
  font-size: 0.85rem;
}
</style>
