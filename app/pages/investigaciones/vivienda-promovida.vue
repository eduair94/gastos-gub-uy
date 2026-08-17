<script setup lang="ts">
/**
 * Vivienda promovida — la investigación sobre lo que el Estado NO compra.
 *
 * EL ORDEN DE LA PÁGINA ES EL ARGUMENTO. Primero la ausencia (por qué esta pieza no termina en
 * un buscador, como todas las demás), después la norma, después lo construido, y recién ahí el
 * dinero. Poner el dinero primero convertiría una discusión sobre diseño de política en una
 * denuncia, y el artículo 4 de la ley faculta expresamente al Poder Ejecutivo a otorgar los
 * beneficios: no hay nada que denunciar.
 *
 * LAS DOS SECCIONES QUE NO SE RECORTAN son «Dónde las fuentes no cierran» y «Lo que no se puede
 * afirmar». Son la mitad del valor de la pieza: sin ellas, un lector no puede distinguir lo que
 * medimos de lo que nos gustaría medir.
 *
 * TRAMPA DE MAQUETA, verificada. El 25% de Ciudad de la Costa y el par 2.845 / 2.411 de
 * departamentos NUNCA pueden quedar en el mismo bloque visual. Por eso el gráfico por
 * departamento vive en su propia sección, separado de los párrafos de la localidad. Ver la
 * cabecera de app/data/investigaciones-vivienda.ts.
 */
import {
  VP_BY_TYPE, VP_COMPOSICION, VP_COSTA, VP_ENTRE_TODOS, VP_ESTUDIO_CAUSAL, VP_FECOVI,
  VP_FUNNEL, VP_MEASURED_ON, VP_POR_DEPARTAMENTO, VP_PRICES_MVD, VP_STOCK, VP_TAX_LINES,
  vpContent, vpSources,
} from '~/data/investigaciones-vivienda'
import { invContent } from '~/data/investigaciones'

const { locale, t } = useI18n()
const c = computed(() => vpContent(locale.value))
const common = computed(() => invContent(locale.value))
const l = computed(() => c.value.labels)

const personLd = usePersonLd()
const orgLd = useOrgLd()
const breadcrumbLd = useBreadcrumbLd([
  { name: 'Investigaciones', path: '/investigaciones' },
  { name: c.value.titulo },
])

useSeo(() => ({
  title: c.value.titulo,
  description: c.value.bajada.slice(0, 155),
  path: '/investigaciones/vivienda-promovida',
  type: 'article',
  kicker: c.value.kicker,
  jsonLd: [
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      'headline': c.value.titulo,
      'description': c.value.bajada.slice(0, 155),
      'author': personLd,
      'publisher': orgLd,
      'dateModified': VP_MEASURED_ON,
    },
    breadcrumbLd,
  ],
}))

const nf = computed(() => new Intl.NumberFormat(locale.value === 'en' ? 'en-US' : 'es-UY'))
function n(x: number): string { return nf.value.format(x) }

const heroTiles = computed(() => [
  { key: 'promovidas', value: n(VP_STOCK.viviendasPromovidas), label: locale.value === 'en' ? 'Homes promoted' : 'Viviendas promovidas' },
  { key: 'terminadas', value: n(VP_STOCK.terminadas), label: locale.value === 'en' ? 'Finished' : 'Terminadas' },
  { key: 'contratos', value: '0', label: locale.value === 'en' ? 'Contracts in the procurement record' : 'Contratos en el registro de compras' },
  { key: 'total', value: locale.value === 'en' ? 'None' : 'Ninguno', label: locale.value === 'en' ? 'Consolidated cost published' : 'Costo total publicado' },
])

/** El embudo. Cada peldaño lleva su fecha de corte porque los cortes son distintos. */
const funnelBars = computed(() => VP_FUNNEL.map(s => ({
  label: `${l.value[s.key] ?? s.key} · ${s.cut}`,
  value: s.n,
})))

const deptBars = computed(() => VP_POR_DEPARTAMENTO.map(d => ({
  label: l.value[d.key] ?? d.key,
  value: d.usd,
})))

const typeBars = computed(() => VP_BY_TYPE.map(x => ({
  label: l.value[x.key] ?? x.key,
  value: x.usd,
})))

const compBars = computed(() => [
  { label: l.value.monoambiente, value: VP_COMPOSICION.monoambiente },
  { label: l.value.uno, value: VP_COMPOSICION.unDormitorio },
  { label: l.value.resto, value: VP_COMPOSICION.resto },
])

/** La serie de precios, como tabla: las dos monedas y el metraje conviven mejor así que en un eje. */
const priceColumns = computed(() => [
  { key: 'period', label: locale.value === 'en' ? 'Half-year' : 'Semestre' },
  { key: 'usd', label: `${l.value.usd} / m²`, align: 'end' as const },
  { key: 'ui', label: `${l.value.ui} / m²`, align: 'end' as const },
  { key: 'm2', label: 'm²', align: 'end' as const },
  { key: 'n', label: locale.value === 'en' ? 'Cases' : 'Casos', align: 'end' as const },
  { key: 'report', label: locale.value === 'en' ? 'Report' : 'Informe' },
])

const priceRows = computed(() => VP_PRICES_MVD.map(r => ({
  ...r,
  usd: n(r.usd),
  ui: n(r.ui),
  n: n(r.n) + (r.thin ? ' ⚠' : '') + (r.partial ? ' ◑' : ''),
})))

const leakFacts = computed(() => [
  `${n(VP_STOCK.viviendasPromovidas)} ${locale.value === 'en' ? 'homes promoted, ' : 'viviendas promovidas, '}${n(VP_STOCK.terminadas)} ${locale.value === 'en' ? 'finished' : 'terminadas'}`,
  locale.value === 'en'
    ? 'The tax office publishes five separate lines and no consolidated total for Law 18.795'
    : 'La DGI publica cinco líneas separadas y ningún total consolidado de la Ley 18.795',
  locale.value === 'en'
    ? 'The Housing Ministry answered a member of parliament that it could only report VAT'
    : 'El Ministerio de Vivienda le contestó a un diputado que sólo podía informar el IVA',
])

/** La cifra de FECOVI va con su autoría pegada: es elaboración propia, no dato oficial. */
const fecoviLine = computed(() => locale.value === 'en'
  ? `A July 2025 paper by Cooperativa Comuna, commissioned by the FECOVI board, estimates the regime's share of forgone revenue in 2023 at US$ ${n(VP_FECOVI.renunciaUsd2023 / 1e6)} million — ${VP_FECOVI.pctEjecucionVivienda}% of the direct budget execution of the housing programme area, which it puts at US$ ${n(VP_FECOVI.ejecucionDirectaUsd2023 / 1e6)} million. It is the authors' own calculation on tax office, central bank and budget office data, not an official figure.`
  : `Un documento de julio de 2025 de Cooperativa Comuna, elaborado a pedido del Consejo Directivo de FECOVI, estima en US$ ${n(VP_FECOVI.renunciaUsd2023 / 1e6)} millones la parte de la renuncia fiscal que corresponde al régimen en 2023: un ${VP_FECOVI.pctEjecucionVivienda}% de la ejecución presupuestal directa del área programática de vivienda, que ubica en US$ ${n(VP_FECOVI.ejecucionDirectaUsd2023 / 1e6)} millones. Es elaboración propia sobre datos de DGI, BCU y OPP, no una cifra oficial.`)
</script>

<template>
  <div class="inv">
    <InvCover
      tone="celeste"
      :kicker="c.kicker"
      :title="c.titulo"
      :dek="c.bajada"
      :fields="[
        { label: t('inv.file.alcance'), value: c.scope },
        { label: t('inv.file.periodo'), value: '2011 – 2026' },
        { value: c.origin },
      ]"
    />

    <InvSection alt>
      <InvTiles
        :columns="4"
        :items="heroTiles"
      />
      <div class="inv-prose vp-intro">
        <p
          v-for="(p, i) in c.portada.parrafos"
          :key="i"
        >
          {{ p }}
        </p>
      </div>
    </InvSection>

    <!-- La ausencia va PRIMERO. Es el método de la pieza, no un descargo del final. -->
    <InvSection
      :eyebrow="common.common.method ?? 'Método'"
      :title="c.ausencia.titulo"
    >
      <div class="inv-prose">
        <p
          v-for="(p, i) in c.ausencia.parrafos"
          :key="i"
        >
          {{ p }}
        </p>
      </div>
    </InvSection>

    <InvSection
      alt
      :title="c.regimen.titulo"
    >
      <div class="inv-prose">
        <p
          v-for="(p, i) in c.regimen.parrafos"
          :key="i"
        >
          {{ p }}
        </p>
      </div>
    </InvSection>

    <InvSection
      :title="c.construido.titulo"
      :dek="c.construido.dek"
    >
      <div class="inv-prose">
        <p
          v-for="(p, i) in c.construido.parrafos"
          :key="i"
        >
          {{ p }}
        </p>
      </div>

      <ChartBlock
        :title="l.funnel"
        :help="l.funnelHelp"
        :level="3"
      >
        <InvHBars
          :items="funnelBars"
          format="count"
          :label="l.funnel"
        />
      </ChartBlock>
    </InvSection>

    <!-- El dinero. Cinco líneas separadas y ninguna suma. -->
    <InvSection
      alt
      :title="c.fiscal.titulo"
      :dek="c.fiscal.dek"
    >
      <div class="inv-prose">
        <p
          v-for="(p, i) in c.fiscal.parrafos"
          :key="i"
        >
          {{ p }}
        </p>
      </div>

      <ChartBlock
        :title="l.taxChart"
        :help="l.taxHelp"
        :level="3"
      >
        <div class="vp-tax">
          <section
            v-for="line in VP_TAX_LINES"
            :key="line.key"
            class="vp-tax__line"
          >
            <h4 class="vp-tax__h">
              {{ l[line.key] }}
              <span class="vp-tax__code">{{ line.dgiCode }}</span>
            </h4>
            <div
              v-for="s in line.series"
              :key="s.edition"
              class="vp-tax__ed"
            >
              <span class="vp-tax__edname">{{ s.edition }}</span>
              <span
                v-for="p in s.points"
                :key="p.year"
                class="vp-tax__pt"
                :class="{ 'vp-tax__pt--proj': p.projected }"
              >
                <span class="vp-tax__y">{{ p.year }}</span>
                <span class="vp-tax__v">{{ n(p.value) }}</span>
              </span>
            </div>
          </section>
        </div>
      </ChartBlock>

      <div class="inv-prose">
        <p>{{ fecoviLine }}</p>
      </div>
    </InvSection>

    <InvSection
      :title="c.producto.titulo"
      :dek="c.producto.dek"
    >
      <div class="inv-prose">
        <p
          v-for="(p, i) in c.producto.parrafos"
          :key="i"
        >
          {{ p }}
        </p>
      </div>

      <ChartBlock
        :title="l.compChart"
        :help="l.compHelp"
        :level="3"
      >
        <InvHBars
          :items="compBars"
          format="count"
          :label="l.compChart"
        />
      </ChartBlock>

      <ChartBlock
        :title="l.typeChart"
        :help="l.typeHelp"
        :level="3"
      >
        <InvHBars
          :items="typeBars"
          format="count"
          :label="l.typeChart"
        />
      </ChartBlock>
    </InvSection>

    <InvSection
      alt
      :title="c.precio.titulo"
      :dek="c.precio.dek"
    >
      <div class="inv-prose">
        <p
          v-for="(p, i) in c.precio.parrafos"
          :key="i"
        >
          {{ p }}
        </p>
      </div>

      <ChartBlock
        :title="l.priceChart"
        :help="l.priceHelp"
        :level="3"
      >
        <InvLedger
          :columns="priceColumns"
          :rows="priceRows"
          row-key="period"
          :min-width="620"
        />
      </ChartBlock>

      <InvFinding
        :kicker="VP_ESTUDIO_CAUSAL.revista"
        :body="[
          locale === 'en'
            ? `The only peer-reviewed causal study measures a ${VP_ESTUDIO_CAUSAL.efectoPct}% rise in the price of nearby existing housing, fading about ${VP_ESTUDIO_CAUSAL.distanciaMetros} metres from the boundary. Its price data run to ${VP_ESTUDIO_CAUSAL.datosHasta}.`
            : `El único estudio causal arbitrado mide una suba de ${VP_ESTUDIO_CAUSAL.efectoPct}% en el precio de la vivienda existente cercana, que se desvanece a unos ${VP_ESTUDIO_CAUSAL.distanciaMetros} metros de la frontera. Sus datos de precios llegan hasta ${VP_ESTUDIO_CAUSAL.datosHasta}.`,
        ]"
      />
    </InvSection>

    <!--
      Ciudad de la Costa. El gráfico POR DEPARTAMENTO vive en su propia sección, más abajo:
      juntar el 25% de la localidad con el par 2.845 / 2.411 de departamentos le muestra al
      lector un error de aritmética que no existe.
    -->
    <InvSection
      :title="c.costa.titulo"
      :dek="c.costa.dek"
    >
      <div class="inv-prose">
        <p
          v-for="(p, i) in c.costa.parrafos"
          :key="i"
        >
          {{ p }}
        </p>
      </div>

      <InvTiles
        :columns="4"
        :items="[
          { key: 'brecha', value: `${VP_COSTA.brechaLocalidadUsd}%`, label: locale === 'en' ? 'Gap vs Montevideo, per m², in dollars' : 'Brecha con Montevideo, por m², en dólares' },
          { key: 'antes', value: `${VP_COSTA.brechaAnteriorUsd}%`, label: locale === 'en' ? 'The same gap in the previous report' : 'La misma brecha en el informe anterior' },
          { key: 'decl', value: `${VP_COSTA.pctDeclaracionesCanelones2025}%`, label: locale === 'en' ? 'Share of Canelones 2025 sale declarations' : 'De las declaraciones de venta de Canelones 2025' },
          { key: 'fiscal', value: locale === 'en' ? 'None' : 'Ninguno', label: locale === 'en' ? 'Official tax figure for the locality' : 'Dato fiscal oficial de la localidad' },
        ]"
      />
    </InvSection>

    <InvSection alt>
      <ChartBlock
        :title="l.deptChart"
        :help="l.deptHelp"
        :level="3"
      >
        <InvHBars
          :items="deptBars"
          format="count"
          :label="l.deptChart"
        />
      </ChartBlock>
    </InvSection>

    <InvSection :title="c.entreTodos.titulo">
      <div class="inv-prose">
        <p
          v-for="(p, i) in c.entreTodos.parrafos"
          :key="i"
        >
          {{ p }}
        </p>
      </div>

      <InvTiles
        :columns="4"
        :items="[
          { key: 'proy', value: n(VP_ENTRE_TODOS.proyectosIngresados), label: locale === 'en' ? 'Projects entered' : 'Proyectos ingresados' },
          { key: 'term', value: n(VP_ENTRE_TODOS.terminadas2022a2024), label: locale === 'en' ? 'Homes finished 2022–2024' : 'Viviendas terminadas 2022–2024' },
          { key: 'siga', value: n(VP_ENTRE_TODOS.garantiasSiga), label: locale === 'en' ? 'State guarantees granted' : 'Garantías estatales otorgadas' },
          { key: 'dev', value: `US$ ${n(VP_ENTRE_TODOS.devueltoRentasGeneralesUsd / 1e6)} M`, label: locale === 'en' ? 'Returned to general revenue in 2024' : 'Devueltos a rentas generales en 2024' },
        ]"
      />
    </InvSection>

    <!-- Las contradicciones van en el cuerpo. Muestran cómo se lee una fuente oficial. -->
    <InvSection
      alt
      :title="c.contradicciones.titulo"
      :dek="c.contradicciones.dek"
    >
      <div class="vp-contra">
        <section
          v-for="(p, i) in c.contradicciones.puntos"
          :key="i"
          class="vp-contra__i"
        >
          <h3 class="vp-contra__t">
            {{ p.t }}
          </h3>
          <p class="vp-contra__d">
            {{ p.d }}
          </p>
        </section>
      </div>
    </InvSection>

    <!-- La sección que no se recorta. -->
    <InvSection
      :title="c.noSePuede.titulo"
      :dek="c.noSePuede.dek"
    >
      <div class="vp-gaps">
        <section
          v-for="(g, i) in c.noSePuede.grupos"
          :key="i"
          class="vp-gaps__g"
        >
          <h3 class="vp-gaps__h">
            {{ g.titulo }}
          </h3>
          <ul class="vp-gaps__l">
            <li
              v-for="(p, j) in g.puntos"
              :key="j"
            >
              {{ p }}
            </li>
          </ul>
        </section>
      </div>
    </InvSection>

    <InvSection
      alt
      :title="c.cierre.titulo"
    >
      <div class="inv-prose">
        <p
          v-for="(p, i) in c.cierre.parrafos"
          :key="i"
        >
          {{ p }}
        </p>
      </div>
    </InvSection>

    <InvSection>
      <LeakTip
        :subject="c.titulo"
        path="/investigaciones/vivienda-promovida"
        :facts="leakFacts"
      />
    </InvSection>

    <InvSection
      alt
      :title="c.fuentesTitulo"
    >
      <InvSources :items="vpSources()" />
    </InvSection>

    <InvSection>
      <InvDisclaimer
        :title="common.common.disclaimerTitle"
        :paragraphs="common.common.disclaimer"
      />
    </InvSection>
  </div>
</template>

<style scoped lang="scss">
.vp-intro { margin-top: var(--s-6); }

/* Las cinco líneas de la DGI, cada una con sus ediciones. Nunca una suma. */
.vp-tax {
  display: grid;
  gap: var(--s-5);
}

.vp-tax__h {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--s-2);
  margin: 0 0 var(--s-2);
  font-size: 1rem;
}

.vp-tax__code {
  font-family: var(--font-mono, monospace);
  font-size: .74rem;
  color: var(--muted);
}

.vp-tax__ed {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--s-2);
  padding: var(--s-2) 0;
  border-top: 1px solid var(--rule);
}

.vp-tax__edname {
  min-width: 84px;
  font-size: .74rem;
  color: var(--muted);
}

.vp-tax__pt {
  display: grid;
  gap: 1px;
  padding: 2px var(--s-2);
  border: 1px solid var(--rule);
  border-radius: 4px;
}

/* La proyección se distingue del dato estimado: titular con una proyección es el error. */
.vp-tax__pt--proj {
  border-style: dashed;
  opacity: .72;
}

.vp-tax__y {
  font-size: .7rem;
  color: var(--muted);
}

.vp-tax__v {
  font-variant-numeric: tabular-nums;
  font-size: .82rem;
  color: var(--gold);
}

.vp-contra {
  display: grid;
  gap: var(--s-4);
}

.vp-contra__t {
  margin: 0 0 var(--s-1);
  font-size: 1rem;
}

.vp-contra__d {
  margin: 0;
  color: var(--muted);
  line-height: 1.6;
}

.vp-gaps {
  display: grid;
  gap: var(--s-5);
}

.vp-gaps__h {
  margin: 0 0 var(--s-2);
  font-size: .82rem;
  letter-spacing: .06em;
  text-transform: uppercase;
  color: var(--muted);
}

.vp-gaps__l {
  margin: 0;
  padding-left: var(--s-4);
  display: grid;
  gap: var(--s-2);
  line-height: 1.6;
}

@media (min-width: 720px) {
  .vp-gaps { grid-template-columns: 1fr 1fr; }
  .vp-contra { grid-template-columns: 1fr 1fr; }
}
</style>
