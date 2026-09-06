<script setup lang="ts">
/**
 * Los talleres de la Intendencia de Soriano.
 *
 * La pieza tiene dos fuentes y el orden de las secciones es el argumento: primero lo que midió el
 * pedido de informes (el gasto y el camión), después lo que medimos nosotros (que ese gasto no
 * está en el registro público). Invertir ese orden dejaría el cero sin la cifra que lo hace
 * relevante, y el cero solo no es noticia: hay intendencias que publican poco y nadie las mira.
 *
 * Cada sección declara de qué fuente sale. No se mezclan en un mismo párrafo.
 */
import { invContent } from '~/data/investigaciones'
import { CAMION, CORPUS, INFORME, INTENDENCIAS, OTROS_TALLERES, REPARACIONES, RUPE_MATCHES, SOR_SOURCES, TALLERES, TCR, sorContent } from '~/data/investigaciones-soriano'

const { locale, t } = useI18n()
const c = computed(() => invContent(locale.value))
const cx = computed(() => sorContent(locale.value))

const personLd = usePersonLd()
const orgLd = useOrgLd()
const breadcrumbLd = useBreadcrumbLd([
  { name: 'Investigaciones', path: '/investigaciones' },
  { name: cx.value.title },
])

useSeo(() => ({
  title: cx.value.title,
  description: cx.value.dek.slice(0, 155),
  path: '/investigaciones/soriano-talleres',
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

const heroTiles = computed(() => [
  { amount: INFORME.totalUyu, label: cx.value.tiles[0]!.l, sub: cx.value.tiles[0]!.s },
  { value: nf.value.format(CAMION.entradas), label: cx.value.tiles[1]!.l, sub: cx.value.tiles[1]!.s, tone: 'alerta' as const },
  { value: nf.value.format(INFORME.talleres), label: cx.value.tiles[2]!.l, sub: cx.value.tiles[2]!.s },
  { value: nf.value.format(INFORME.flota), label: cx.value.tiles[3]!.l, sub: cx.value.tiles[3]!.s },
])

// El renglón de "los otros 32" es una resta contra un total redondeado: va último, marcado, y
// nunca participa del ranking.
const tallerRows = computed(() => [
  ...TALLERES.map(taller => ({ ...taller, rest: false })),
  { key: 'otros', name: cx.value.otrosLabel, uyu: OTROS_TALLERES.uyuAprox, rest: true },
])
const tallerColumns = computed(() => [
  { key: 'name', label: cx.value.colTaller, primary: true, minWidth: '220px' },
  { key: 'uyu', label: cx.value.colMonto, align: 'end' as const },
])

type RepKey = keyof typeof cx.value.repLabels
const repBars = computed(() => REPARACIONES.map(r => ({
  label: cx.value.repLabels[r.key as RepKey],
  value: r.n,
  color: r.key === 'resto' ? 'neutral' : 'celeste',
})))

const intendenciaRows = computed(() => INTENDENCIAS.map(i => ({
  ...i,
  pct: i.records > 0 ? Math.round((i.awards / i.records) * 100) : 0,
})))
// Tres columnas, no cuatro: en móvil la tabla se reflowa a tarjetas y cada columna suma un
// renglón por fila. La proporción viaja DENTRO de la celda de adjudicaciones, que es donde se
// lee, en vez de abrir una cuarta columna que estiraba la sección a 5.000px de alto.
const intendenciaColumns = computed(() => [
  { key: 'name', label: cx.value.colIntendencia, primary: true, minWidth: '180px' },
  { key: 'records', label: cx.value.colRegistros, align: 'end' as const, mono: true },
  { key: 'awards', label: cx.value.colAdjudicaciones, align: 'end' as const, mono: true, minWidth: '160px' },
])

const rupeColumns = computed(() => [
  { key: 'prensa', label: cx.value.colPrensa, primary: true, minWidth: '180px' },
  { key: 'rupe', label: cx.value.colRupe, minWidth: '240px' },
  { key: 'rut', label: cx.value.colRut, mono: true, nowrap: true },
  { key: 'domicilio', label: cx.value.colDomicilio, muted: true, minWidth: '200px' },
])

const sourceGroups = computed(() => SOR_SOURCES.map(g => ({
  title: g.key === 'prensa' ? cx.value.srcPrensa : cx.value.srcOficial,
  items: g.items,
})))

const leakFacts = computed(() => [
  `La Intendencia de Soriano pagó $${nf.value.format(INFORME.totalUyu)} a ${INFORME.talleres} talleres privados entre enero de 2021 y febrero de 2026, según su respuesta a un pedido de informes.`,
  `El camión ${CAMION.matricula} entró ${CAMION.entradas} veces al taller ${CAMION.taller} en 66 meses.`,
  `La Intendencia publicó ${CORPUS.sorianoAdjudicaciones} adjudicaciones en el portal de compras del Estado desde 2021, sobre ${CORPUS.sorianoRegistros2021} registros propios.`,
])
</script>

<template>
  <div class="inv">
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

    <InvSection alt>
      <InvTiles :items="heroTiles" />
    </InvSection>

    <!-- Fuente 1: el pedido de informes -->
    <InvSection
      :eyebrow="cx.informeTag"
      :title="cx.informeTitle"
    >
      <div class="inv-prose">
        <p
          v-for="(p, i) in cx.informe"
          :key="i"
        >
          {{ p }}
        </p>
      </div>

      <InvLedger
        :columns="tallerColumns"
        :rows="tallerRows"
        row-key="key"
        :row-class="r => ({ 'sor-rest': r.rest })"
        :min-width="420"
      >
        <template #cell:uyu="{ row }">
          <MoneyAmount
            :amount="row.uyu"
            compact
          />
        </template>
      </InvLedger>

      <p class="inv-note">
        {{ cx.informeNota }}
      </p>
    </InvSection>

    <!-- El camión, que es el hecho que hizo pública la cifra -->
    <InvSection
      alt
      :eyebrow="cx.camionTag"
      :title="cx.camionTitle"
    >
      <div class="sor-plate">
        <span class="sor-plate__band">Uruguay</span>
        <span class="sor-plate__num">{{ CAMION.matricula }}</span>
      </div>

      <div class="inv-prose">
        <p
          v-for="(p, i) in cx.camion"
          :key="i"
        >
          {{ p }}
        </p>
      </div>

      <InvHBars
        :items="repBars"
        format="count"
        :label="cx.camionTitle"
      />
      <p class="inv-note">
        {{ cx.repNota }}
      </p>

      <blockquote class="sor-quote">
        <p>{{ cx.camionQuote }}</p>
        <cite>{{ cx.camionQuoteWho }}</cite>
      </blockquote>
    </InvSection>

    <!-- Fuente 2: nuestra medición. El cero es el giro de la pieza. -->
    <InvSection
      :eyebrow="cx.ceroTag"
      :title="cx.ceroTitle"
    >
      <div class="inv-hero">
        <div>
          <p class="u-eyebrow">
            {{ cx.ceroHead }}
          </p>
          <p class="sor-zero">
            {{ CORPUS.sorianoAdjudicaciones }}
          </p>
          <p class="inv-hero__usd">
            {{ cx.ceroSub }}
          </p>
        </div>
      </div>

      <div class="inv-prose">
        <p
          v-for="(p, i) in cx.cero"
          :key="i"
        >
          {{ p }}
        </p>
      </div>
    </InvSection>

    <InvSection
      alt
      :eyebrow="cx.compTag"
      :title="cx.compTitle"
      :dek="cx.compIntro"
    >
      <InvLedger
        :columns="intendenciaColumns"
        :rows="intendenciaRows"
        row-key="key"
        :row-class="r => ({ 'sor-focus': r.key === 'soriano' })"
        :min-width="560"
      >
        <template #cell:records="{ row }">
          {{ nf.format(row.records) }}
        </template>
        <template #cell:awards="{ row }">
          <span class="sor-ratio">
            <span class="sor-ratio__n">{{ nf.format(row.awards) }}</span>
            <span class="sor-ratio__track">
              <span
                class="sor-ratio__fill"
                :class="{ 'sor-ratio__fill--zero': row.awards === 0 }"
                :style="{ width: `${Math.max(row.pct, 1)}%` }"
              />
            </span>
            <span class="sor-ratio__pct">{{ row.pct }}%</span>
          </span>
        </template>
      </InvLedger>

      <p class="inv-note">
        {{ cx.compNota }}
      </p>
    </InvSection>

    <!-- Quiénes son, con el límite del cruce a la vista -->
    <InvSection
      :eyebrow="cx.rupeTag"
      :title="cx.rupeTitle"
      :dek="cx.rupeIntro"
    >
      <InvLedger
        :columns="rupeColumns"
        :rows="RUPE_MATCHES"
        row-key="key"
        :min-width="640"
      />

      <p class="inv-note">
        {{ cx.rupeNota }}
      </p>

      <div class="inv-prose">
        <p>{{ cx.rupeExtra }}</p>
      </div>
    </InvSection>

    <!-- El Tribunal de Cuentas, con la advertencia antes que el número -->
    <InvSection
      alt
      :eyebrow="cx.tcrTag"
      :title="cx.tcrTitle"
    >
      <InvTiles
        :columns="2"
        :items="[
          { value: nf.format(TCR.resoluciones), label: cx.tcrTag, sub: `${TCR.desde}–${TCR.hasta}` },
          { value: nf.format(TCR.gastosObservados), label: cx.tcrFindingKicker, sub: cx.tcrTitle, tone: 'alerta' },
        ]"
      />

      <div class="inv-prose">
        <p
          v-for="(p, i) in cx.tcr"
          :key="i"
        >
          {{ p }}
        </p>
      </div>

      <InvFinding
        :kicker="cx.tcrFindingKicker"
        :body="cx.tcrFindingBody"
      />
    </InvSection>

    <InvSection
      :eyebrow="cx.ctxTag"
      :title="cx.ctxTitle"
    >
      <div class="inv-prose">
        <p
          v-for="(p, i) in cx.ctx"
          :key="i"
        >
          {{ p }}
        </p>
      </div>
    </InvSection>

    <InvSection
      alt
      :eyebrow="c.common.method ?? 'Método'"
      :title="cx.limitesTitle"
    >
      <ul class="sor-list sor-list--muted">
        <li
          v-for="(l, i) in cx.limites"
          :key="i"
        >
          {{ l }}
        </li>
      </ul>
    </InvSection>

    <InvSection :title="cx.faltaTitle">
      <ul class="sor-list">
        <li
          v-for="(f, i) in cx.falta"
          :key="i"
        >
          {{ f }}
        </li>
      </ul>
      <p class="inv-note">
        {{ cx.faltaNota }}
      </p>
    </InvSection>

    <InvSection>
      <LeakTip
        :subject="cx.title"
        path="/investigaciones/soriano-talleres"
        :facts="leakFacts"
      />
    </InvSection>

    <InvSection
      alt
      :eyebrow="cx.sourcesTag"
      :title="cx.sourcesTitle"
      :dek="cx.sourcesP"
    >
      <InvSources :groups="sourceGroups" />
    </InvSection>

    <InvSection>
      <InvDisclaimer
        :title="c.common.disclaimerTitle"
        :paragraphs="c.common.disclaimer"
      />
    </InvSection>
  </div>
</template>

<style scoped lang="scss">
/* El cero se escribe con cuerpo de titular, pero NO en oro: no es plata, es una ausencia. */
.sor-zero {
  font-family: var(--font-display);
  font-size: clamp(3.5rem, 12vw, 7rem);
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.04em;
  margin: var(--s-3) 0 0;
  color: var(--celeste-deep);
}

/* La matrícula del camión, dibujada como matrícula: es el identificador del hecho. */
.sor-plate {
  display: inline-flex;
  align-items: stretch;
  border: 2px solid var(--ink);
  border-radius: var(--r-sm);
  overflow: hidden;
  font-family: var(--font-mono);
  margin-bottom: var(--s-5);
  background: var(--surface);
}

.sor-plate__band {
  background: var(--ink);
  color: var(--ink-fg);
  font-size: 0.6rem;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  display: flex;
  align-items: center;
  padding: 0 var(--s-2);
}

.sor-plate__num {
  font-size: 1.15rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  padding: var(--s-2) var(--s-3);
  color: var(--text);
}

.sor-quote {
  margin: var(--s-6) 0 0;
  padding-left: var(--s-4);
  border-left: 3px solid var(--rule-strong);
  max-width: var(--inv-measure);
}

.sor-quote p {
  margin: 0;
  font-size: 1.08rem;
  line-height: 1.5;
}

.sor-quote cite {
  display: block;
  margin-top: var(--s-2);
  font-family: var(--font-mono);
  font-size: 0.78rem;
  font-style: normal;
  color: var(--text-muted);
}

.sor-list {
  margin: 0;
  padding-left: var(--s-5);
  display: grid;
  gap: var(--s-3);
  max-width: var(--inv-measure);
  line-height: 1.55;
}

.sor-list--muted {
  color: var(--text-muted);
}

/* La proporción de adjudicaciones publicadas. La barra es marca, no texto: el número va al lado. */
.sor-ratio {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  justify-content: flex-end;
  width: 100%;
}

.sor-ratio__track {
  flex: 1 1 auto;
  min-width: 32px;
  max-width: 72px;
  height: 8px;
  background: var(--surface-sunken);
  border-radius: var(--r-sm);
  overflow: hidden;
}

.sor-ratio__fill {
  display: block;
  height: 100%;
  background: var(--celeste);
}

.sor-ratio__fill--zero {
  background: var(--alerta);
}

.sor-ratio__n,
.sor-ratio__pct {
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.sor-ratio__pct {
  min-width: 4ch;
  color: var(--text-muted);
}

:deep(.sor-focus) {
  background: var(--celeste-wash);
}

:deep(.sor-rest) {
  color: var(--text-muted);
}
</style>
