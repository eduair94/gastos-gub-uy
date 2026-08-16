<script setup lang="ts">
/**
 * «La cuadrilla de Antel»: tercerización de la obra de fibra, y el precio del dicho.
 *
 * EL ORDEN DE LA PÁGINA ES EL ARGUMENTO. Primero la afirmación textual, después la mitad que se
 * verifica, después la cuenta que desarma la otra mitad, y recién ahí lo que NO se puede saber.
 * Mover «lo que no se puede saber» al final convertiría una respuesta en una acusación: el lector
 * cerraría la página creyendo que hay un precio oculto probado, que es exactamente lo que no hay.
 *
 * LA CUENTA SE MUESTRA, NO SE AFIRMA. Los tres pasos van en tarjetas numeradas con su nota al pie,
 * porque el valor de la pieza está en que el lector pueda rehacerla, no en que nos crea.
 *
 * ORO SÓLO EN LOS MONTOS (app/DESIGN.md). El techo por soldadura NO es oro: es una cota, no plata
 * gastada, y pintarlo de oro lo leería como un precio real.
 */
import { ANTEL_FTTH, ANTEL_MEASURED_ON, ANTEL_OFERENTES, antelContent } from '~/data/investigaciones-antel'
import { invContent } from '~/data/investigaciones'

const { locale, t } = useI18n()
const localePath = useLocalePath()
const c = computed(() => antelContent(locale.value))
const common = computed(() => invContent(locale.value))

const personLd = usePersonLd()
const orgLd = useOrgLd()
const breadcrumbLd = useBreadcrumbLd([
  { name: 'Investigaciones', path: '/investigaciones' },
  { name: c.value.titulo },
])

useSeo(() => ({
  title: c.value.titulo,
  description: c.value.bajada.slice(0, 155),
  path: '/investigaciones/antel-cuadrillas',
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
      'dateModified': ANTEL_MEASURED_ON,
    },
    breadcrumbLd,
  ],
}))

/**
 * Rótulos de la plantilla. Viven acá y no en el módulo de datos porque ese archivo se regenera
 * desde el material de medición y una etiqueta escrita ahí se perdería.
 */
const LABELS = {
  es: {
    sources: 'Fuentes',
    claim: 'La afirmación',
    schedule: 'El rubro, tal como figura en la planilla de cotización',
    code: 'Código',
    item: 'Ítem',
    unit: 'Unidad',
    qty: 'Cantidad en la planilla',
    org: 'Organismo',
    records: 'Registros',
    named: 'Con adjudicatario',
    share: 'Proporción',
    tender: 'La licitación que sostiene esta nota',
    bidders: 'Las ocho ofertas, según el acta',
    officialFile: 'Ficha oficial de la compra',
    pliego: 'Pliego de condiciones (ZIP)',
    acta: 'Acta de adjudicación (PDF)',
    related: 'La ficha de las siete licitaciones de 2021 y la alerta del Tribunal de Cuentas',
  },
  en: {
    sources: 'Sources',
    claim: 'The claim',
    schedule: 'The line item, as it appears in the price schedule',
    code: 'Code',
    item: 'Item',
    unit: 'Unit',
    qty: 'Quantity in the schedule',
    org: 'Agency',
    records: 'Records',
    named: 'With a named winner',
    share: 'Share',
    tender: 'The tender this piece rests on',
    bidders: 'The eight bids, per the award resolution',
    officialFile: 'Official procurement record',
    pliego: 'Tender conditions (ZIP)',
    acta: 'Award resolution (PDF)',
    related: 'Our file on the seven 2021 tenders and the Court of Audit alert',
  },
} as const

const l = computed(() => LABELS[locale.value === 'en' ? 'en' : 'es'])

const heroTiles = computed(() =>
  c.value.portada.cifras.map(x => ({ value: x.valor, label: x.etiqueta, sub: x.sub })),
)

const leakFacts = computed(() => [
  'De los 164 llamados de obra de red que Antel publicó desde 2008, seis tienen adjudicatario publicado y uno solo es la obra de red en sí.',
  'Antel publica el nombre de la empresa adjudicataria en el 3,3% de sus registros (250 de 7.582). OSE publica el 82,7%; ANCAP, el 72,0%.',
  'Antel tiene 538 registros que publican un monto sin decir a quién se le adjudicó: 11.641 millones de pesos, casi cinco veces los 2.426 millones que sí llevan nombre.',
  'La obra de fibra al hogar de todo el país se adjudicó en marzo de 2026 al consorcio ORITECNO + CIETEL por 95.508.755 pesos sin impuestos, sobre ocho ofertas.',
])
</script>

<template>
  <div class="inv">
    <InvCover
      tone="sol"
      :kicker="c.kicker"
      :title="c.titulo"
      :dek="c.bajada"
      :fields="[
        { label: t('inv.file.alcance'), value: c.alcance },
        { label: t('inv.file.periodo'), value: '2008 – 2026' },
        { value: c.origen },
      ]"
    />

    <!-- Las cifras de conjunto -->
    <InvSection alt>
      <InvTiles
        :columns="4"
        :items="heroTiles"
      />
      <div class="inv-prose an-intro">
        <p
          v-for="(p, i) in c.portada.parrafos"
          :key="i"
        >
          {{ p }}
        </p>
      </div>
    </InvSection>

    <!-- La afirmación, textual y separada del resto -->
    <InvSection :title="c.afirmacion.titulo">
      <blockquote class="an-claim">
        <p class="inv-kicker">
          {{ l.claim }}
        </p>
        <p class="an-claim__t">
          {{ c.afirmacion.dicho }}
        </p>
      </blockquote>
      <div class="inv-prose">
        <p
          v-for="(p, i) in c.afirmacion.parrafos"
          :key="i"
        >
          {{ p }}
        </p>
      </div>
    </InvSection>

    <!-- Mitad 1: sí es tercerizada, y está en el pliego -->
    <InvSection
      alt
      :eyebrow="'1'"
      :title="c.tercerizada.titulo"
    >
      <div class="inv-prose">
        <p
          v-for="(p, i) in c.tercerizada.parrafos"
          :key="i"
        >
          {{ p }}
        </p>
      </div>

      <div class="an-clauses">
        <figure
          v-for="cl in c.tercerizada.clausulas"
          :key="cl.cita"
          class="an-clause"
        >
          <figcaption class="an-clause__c">
            {{ cl.cita }}
          </figcaption>
          <blockquote>{{ cl.texto }}</blockquote>
        </figure>
      </div>

      <InvFinding :body="[c.tercerizada.matiz]" />
    </InvSection>

    <!-- Mitad 2: la cuenta -->
    <InvSection
      :eyebrow="'2'"
      :title="c.aritmetica.titulo"
    >
      <div class="inv-prose">
        <p
          v-for="(p, i) in c.aritmetica.parrafos"
          :key="i"
        >
          {{ p }}
        </p>
      </div>

      <!-- El rubro, con la forma de la planilla -->
      <div class="an-rubro">
        <p class="inv-kicker">
          {{ l.schedule }}
        </p>
        <dl class="an-rubro__g">
          <div>
            <dt>{{ l.code }}</dt>
            <dd class="u-mono">
              {{ c.aritmetica.rubro.codigo }}
            </dd>
          </div>
          <div>
            <dt>{{ l.item }}</dt>
            <dd>{{ c.aritmetica.rubro.item }}</dd>
          </div>
          <div>
            <dt>{{ l.unit }}</dt>
            <dd class="u-mono">
              {{ c.aritmetica.rubro.unidad }}
            </dd>
          </div>
          <div>
            <dt>{{ l.qty }}</dt>
            <dd class="u-mono an-rubro__q">
              {{ c.aritmetica.rubro.cantidad }}
            </dd>
          </div>
        </dl>
      </div>

      <!-- Los tres pasos, para que el lector pueda rehacer la cuenta -->
      <ol class="an-steps">
        <li
          v-for="(s, i) in c.aritmetica.pasos"
          :key="i"
          class="an-step"
        >
          <p class="an-step__l">
            {{ s.label }}
          </p>
          <p class="an-step__v u-mono">
            {{ s.valor }}
          </p>
          <p class="an-step__n">
            {{ s.nota }}
          </p>
        </li>
      </ol>

      <InvFinding :body="[c.aritmetica.veredicto]" />
    </InvSection>

    <!-- Lo que no se puede saber. Va antes del hallazgo de transparencia, no al final. -->
    <InvSection
      alt
      :title="c.noSePuede.titulo"
    >
      <div class="inv-prose">
        <p
          v-for="(p, i) in c.noSePuede.parrafos"
          :key="i"
        >
          {{ p }}
        </p>
      </div>
    </InvSection>

    <!-- El hallazgo propio -->
    <InvSection :title="c.cobertura.titulo">
      <div class="inv-prose">
        <p
          v-for="(p, i) in c.cobertura.parrafos"
          :key="i"
        >
          {{ p }}
        </p>
      </div>

      <div class="an-tablewrap">
        <table class="an-table">
          <thead>
            <tr>
              <th scope="col">
                {{ l.org }}
              </th>
              <th scope="col">
                {{ l.records }}
              </th>
              <th scope="col">
                {{ l.named }}
              </th>
              <th scope="col">
                {{ l.share }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="f in c.cobertura.filas"
              :key="f.ente"
              :class="{ 'an-table__hi': f.destacar }"
            >
              <th scope="row">
                {{ f.ente }}
              </th>
              <td class="u-mono">
                {{ f.releases }}
              </td>
              <td class="u-mono">
                {{ f.conAdj }}
              </td>
              <td class="u-mono">
                {{ f.pct }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p class="an-note">
        {{ c.cobertura.nota }}
      </p>
    </InvSection>

    <!-- La licitación, con sus enlaces primarios -->
    <InvSection
      alt
      :title="l.tender"
    >
      <div class="an-tender">
        <p class="an-tender__h">
          {{ ANTEL_FTTH.llamado }}
        </p>
        <p class="an-tender__r">
          {{ ANTEL_FTTH.resolucion }}
        </p>
        <ul class="an-bidders">
          <li
            v-for="b in ANTEL_OFERENTES"
            :key="b"
          >
            {{ b }}
          </li>
        </ul>
        <p class="an-tender__c">
          {{ l.bidders }}
        </p>
      </div>

      <InvSources
        :items="[
          { label: l.officialFile, url: ANTEL_FTTH.fichaUrl },
          { label: l.pliego, url: ANTEL_FTTH.pliegoUrl },
          { label: l.acta, url: ANTEL_FTTH.actaUrl },
        ]"
      />
    </InvSection>

    <!-- El antecedente de 2021 -->
    <InvSection :title="c.antecedente.titulo">
      <div class="inv-prose">
        <p
          v-for="(p, i) in c.antecedente.parrafos"
          :key="i"
        >
          {{ p }}
        </p>
      </div>
      <p class="an-related">
        <NuxtLink :to="localePath('/investigaciones/casos/licitaciones-fibra-optica-alerta-colusion')">
          {{ l.related }}
        </NuxtLink>
      </p>
    </InvSection>

    <!-- Los límites, con el mismo peso que los hallazgos -->
    <InvSection
      alt
      :title="c.limites.titulo"
    >
      <ul class="an-limits">
        <li
          v-for="(p, i) in c.limites.puntos"
          :key="i"
        >
          {{ p }}
        </li>
      </ul>
    </InvSection>

    <InvSection>
      <LeakTip
        :subject="c.titulo"
        path="/investigaciones/antel-cuadrillas"
        :facts="leakFacts"
      />
    </InvSection>

    <InvSection
      alt
      :title="l.sources"
    >
      <InvSources :items="c.fuentes" />
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
.an-intro { margin-top: var(--s-6); }

/* La afirmación, citada. No lleva oro: no es plata, es un dicho. */
.an-claim {
  margin: 0 0 var(--s-6);
  padding: var(--s-4) var(--s-5);
  border: 1px solid var(--rule);
  border-left: 3px solid var(--rule-strong);
  border-radius: 0 var(--r-md) var(--r-md) 0;
  background: var(--surface);
  min-width: 0;
}

.an-claim__t {
  margin: var(--s-2) 0 0;
  font-size: var(--t-md);
  line-height: 1.55;
  font-style: italic;
  overflow-wrap: anywhere;
}

/* Las cláusulas del pliego, citadas textualmente. */
.an-clauses {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: var(--s-4);
  margin-top: var(--s-6);
}

.an-clause {
  margin: 0;
  padding: var(--s-4) var(--s-5);
  border: 1px solid var(--rule);
  border-radius: var(--r-md);
  background: var(--surface);
  min-width: 0;
}

.an-clause__c {
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  font-weight: 600;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: var(--s-2);
}

.an-clause blockquote {
  margin: 0;
  font-size: 0.95rem;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

/* El rubro con la forma de la planilla. */
.an-rubro {
  margin-top: var(--s-6);
  padding: var(--s-4) var(--s-5);
  border: 1px solid var(--rule);
  border-radius: var(--r-md);
  background: var(--surface);
  min-width: 0;
}

.an-rubro__g {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: var(--s-4);
  margin: var(--s-3) 0 0;
}

.an-rubro__g dt {
  font-size: var(--t-xs);
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 2px;
}

.an-rubro__g dd {
  margin: 0;
  font-size: 0.98rem;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.an-rubro__q { font-weight: 700; }

/* Los tres pasos de la cuenta. */
.an-steps {
  list-style: none;
  margin: var(--s-6) 0 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: var(--s-4);
  counter-reset: an-step;
}

.an-step {
  position: relative;
  padding: var(--s-4) var(--s-5);
  border: 1px solid var(--rule);
  border-radius: var(--r-md);
  background: var(--surface);
  min-width: 0;
  counter-increment: an-step;
}

.an-step__l {
  margin: 0;
  font-size: var(--t-xs);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-muted);
  line-height: 1.4;
}

.an-step__v {
  margin: var(--s-2) 0 var(--s-2);
  font-size: var(--t-lg);
  font-weight: 700;
  line-height: 1.1;
  overflow-wrap: anywhere;
}

.an-step__n {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.55;
  color: var(--text-muted);
  overflow-wrap: anywhere;
}

/* La tabla scrollea dentro de su caja: el documento nunca se va de costado. */
.an-tablewrap {
  margin-top: var(--s-6);
  overflow-x: auto;
  border: 1px solid var(--rule);
  border-radius: var(--r-md);
  background: var(--surface);
}

.an-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.95rem;
}

.an-table th,
.an-table td {
  padding: var(--s-3) var(--s-4);
  text-align: right;
  white-space: nowrap;
  border-bottom: 1px solid var(--rule);
}

.an-table thead th {
  font-size: var(--t-xs);
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-muted);
  font-weight: 600;
}

.an-table th[scope='row'],
.an-table thead th:first-child {
  text-align: left;
}

.an-table tbody tr:last-child th,
.an-table tbody tr:last-child td { border-bottom: 0; }

.an-table__hi { background: var(--surface-sunken); }
.an-table__hi th[scope='row'] { font-weight: 700; }

.an-note {
  margin: var(--s-4) 0 0;
  font-size: 0.92rem;
  line-height: 1.6;
  color: var(--text-muted);
  max-width: 78ch;
}

/* La licitación y sus oferentes. */
.an-tender { min-width: 0; }

.an-tender__h {
  margin: 0;
  font-size: var(--t-md);
  font-weight: 700;
  line-height: 1.3;
  overflow-wrap: anywhere;
}

.an-tender__r {
  margin: 2px 0 var(--s-4);
  font-family: var(--font-mono);
  font-size: var(--t-sm);
  color: var(--text-muted);
  overflow-wrap: anywhere;
}

.an-bidders {
  margin: 0;
  padding-left: var(--s-5);
  display: grid;
  gap: var(--s-2);
  max-width: 70ch;
  line-height: 1.5;
  font-size: 0.95rem;
}

.an-bidders li { overflow-wrap: anywhere; }

.an-tender__c {
  margin: var(--s-3) 0 var(--s-6);
  font-size: var(--t-xs);
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.an-related {
  margin: var(--s-5) 0 0;
  font-size: 0.95rem;
  overflow-wrap: anywhere;
}

.an-limits {
  margin: 0;
  padding-left: var(--s-5);
  display: grid;
  gap: var(--s-4);
  max-width: 78ch;
  line-height: 1.6;
  color: var(--text-muted);
}
</style>
