<script setup lang="ts">
/**
 * Cuatro horas menos: qué ganó la construcción y por dónde pasa la cuenta.
 *
 * EL ORDEN DECIDE CÓMO SE LEE. Primero las cifras de conjunto, después «qué se acordó» con el
 * cronograma, y recién ahí cualquier número de costo. Adelantar el costo convertiría una medición en
 * un cargo contra el sindicato, que es lo que PRODUCT.md prohíbe.
 *
 * LA AUDITORÍA DE CIFRAS VA ANTES DEL HALLAZGO PROPIO. Si primero mostramos nuestro 20,59% y después
 * decimos que el 10% ajeno no tiene fuente, la pieza parece defenderse. En este orden, primero se ve
 * que las cifras que circularon no se pueden verificar, y después se ve una que sí.
 *
 * NADA EN ORO salvo los montos de gasto público (app/DESIGN.md). Los porcentajes de jornada y los
 * escalones del cronograma NO son plata y van en celeste.
 *
 * MÓVIL: la tabla de rubros desborda a 360px, así que vive dentro de un contenedor con
 * `overflow-x: auto` propio. Ningún `padding` shorthand sobre un elemento con `.u-container`.
 */
import { SUNCA_MEASURED_ON, suncaContent } from '~/data/investigaciones-sunca'
import { invContent } from '~/data/investigaciones'

const { locale, t } = useI18n()
const c = computed(() => suncaContent(locale.value))
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
  path: '/investigaciones/sunca',
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
      'dateModified': SUNCA_MEASURED_ON,
    },
    breadcrumbLd,
  ],
}))

/** Rótulos de plantilla. No van en el módulo de datos: ese archivo es contenido, no chrome. */
const LABELS = {
  es: {
    sources: 'Fuentes',
    finding: 'Hallazgo',
    claimClaim: 'Lo que se dijo',
    claimCheck: 'Lo que encontramos',
    line: 'Rubro',
    amount: 'Pesos',
    share: 'Del lado en pesos',
    total: 'Total adjudicado',
    formula: 'Las tres cuentas',
    reading: 'Qué significa',
    schedule: 'Los cuatro escalones',
    seven: 'Los siete contratos, en millones de pesos',
  },
  en: {
    sources: 'Sources',
    finding: 'Finding',
    claimClaim: 'What was said',
    claimCheck: 'What we found',
    line: 'Price line',
    amount: 'Pesos',
    share: 'Of the peso side',
    total: 'Total awarded',
    formula: 'The three calculations',
    reading: 'What it means',
    schedule: 'The four steps',
    seven: 'The seven contracts, in million pesos',
  },
} as const

const l = computed(() => LABELS[locale.value === 'en' ? 'en' : 'es'])

const heroTiles = computed(() =>
  c.value.portada.cifras.map(x => ({ value: x.valor, label: x.etiqueta, sub: x.sub })),
)

/** El estado de cada cifra de prensa decide su color. «inconsistente» no es «falso». */
function claimTone(estado: string) {
  return estado === 'inconsistente' ? 'sunca-claim--bad' : 'sunca-claim--unk'
}

const leakFacts = computed(() => [
  'El convenio de la construcción baja la jornada de 44 a 40 horas semanales entre 2027 y 2030, sin pérdida de salario.',
  'En el mayor contrato de obra del registro público —OSE, Licitación Pública 24711/2023— el ajuste paramétrico y las leyes sociales son el 20,59% del lado en pesos.',
  'El Estado adjudicó 159.853 millones de pesos en rubros de obra entre 2019 y 2026; siete contratos concentran el 71,56%.',
])
</script>

<template>
  <div class="inv">
    <InvCover
      tone="celeste"
      :kicker="c.kicker"
      :title="c.titulo"
      :dek="c.bajada"
      :fields="[
        { label: t('inv.file.alcance'), value: c.alcance },
        { label: t('inv.file.periodo'), value: c.periodo },
        { value: c.origen },
      ]"
    />

    <!-- Las cifras de conjunto -->
    <InvSection alt>
      <InvTiles
        :columns="4"
        :items="heroTiles"
      />
      <InvSplit
        class="sunca-intro"
        sticky
      >
        <div class="inv-prose">
          <p
            v-for="(p, i) in c.portada.parrafos"
            :key="i"
          >
            {{ p }}
          </p>
        </div>

        <template #aside>
          <p class="sunca-railh">
            {{ c.portada.ficha.titulo }}
          </p>
          <dl class="sunca-ficha">
            <template
              v-for="f in c.portada.ficha.filas"
              :key="f.k"
            >
              <dt>{{ f.k }}</dt>
              <dd>{{ f.v }}</dd>
            </template>
          </dl>
        </template>
      </InvSplit>
    </InvSection>

    <!-- Qué se acordó. Va antes de cualquier cifra de costo. -->
    <InvSection
      :eyebrow="common.common.method ?? 'Método'"
      :title="c.acuerdo.titulo"
    >
      <InvSplit sticky>
        <div class="inv-prose">
          <p
            v-for="(p, i) in c.acuerdo.parrafos"
            :key="i"
          >
            {{ p }}
          </p>
        </div>

        <template #aside>
          <p class="sunca-railh">
            {{ l.schedule }}
          </p>
          <ol class="sunca-steps">
            <li
              v-for="s in c.acuerdo.cronograma"
              :key="s.fecha"
              class="sunca-step"
            >
              <p class="sunca-step__h u-mono">
                {{ s.horas }}
              </p>
              <p class="sunca-step__d">
                {{ s.fecha }}
              </p>
              <p class="sunca-step__n">
                {{ s.nota }}
              </p>
            </li>
          </ol>
        </template>
      </InvSplit>
    </InvSection>

    <!-- Las conquistas anteriores -->
    <InvSection
      alt
      :title="c.hitos.titulo"
      :dek="c.hitos.dek"
    >
      <ol class="sunca-time">
        <li
          v-for="h in c.hitos.items"
          :key="h.fecha"
          class="sunca-time__i"
        >
          <p class="sunca-time__d u-mono">
            {{ h.fecha }}
          </p>
          <h3 class="sunca-time__t">
            {{ h.titulo }}
          </h3>
          <p class="sunca-time__b">
            {{ h.detalle }}
          </p>
          <InvSources :items="[h.fuente]" />
        </li>
      </ol>
    </InvSection>

    <!-- La aritmética. Tres cuentas, no una opinión. -->
    <InvSection :title="c.aritmetica.titulo">
      <!-- Sin `sticky`: acá el carril (las tres cuentas) es MÁS ALTO que la prosa, y fijarlo lo
           dejaría empujando la sección después de que el texto terminó. -->
      <InvSplit>
        <div class="inv-prose">
          <p
            v-for="(p, i) in c.aritmetica.parrafos"
            :key="i"
          >
            {{ p }}
          </p>
        </div>

        <template #aside>
          <p class="sunca-railh">
            {{ l.formula }}
          </p>
          <div class="sunca-math">
            <div
              v-for="q in c.aritmetica.cuentas"
              :key="q.formula"
              class="sunca-math__c"
            >
              <p class="sunca-math__f u-mono">
                {{ q.formula }}
              </p>
              <p class="sunca-math__r u-mono">
                {{ q.resultado }}
              </p>
              <p class="sunca-math__l">
                {{ q.lectura }}
              </p>
            </div>
          </div>
        </template>
      </InvSplit>
    </InvSection>

    <!-- La auditoría de las cifras ajenas, ANTES de mostrar la propia -->
    <InvSection
      alt
      :title="c.claims.titulo"
      :dek="c.claims.dek"
    >
      <div class="sunca-claims">
        <article
          v-for="k in c.claims.items"
          :key="k.cifra + k.medio"
          class="sunca-claim"
          :class="claimTone(k.estado)"
        >
          <p class="sunca-claim__n u-mono">
            {{ k.cifra }}
          </p>
          <div class="sunca-claim__body">
            <h3 class="sunca-claim__lbl">
              {{ l.claimClaim }}
            </h3>
            <p class="sunca-claim__said">
              {{ k.dicho }}
            </p>
            <h3 class="sunca-claim__lbl">
              {{ l.claimCheck }}
            </h3>
            <p class="sunca-claim__found">
              {{ k.respaldo }}
            </p>
            <div class="chip-row sunca-claim__foot">
              <span class="sunca-claim__state u-mono">{{ k.estado }}</span>
              <a
                class="sunca-claim__src"
                :href="k.url"
                target="_blank"
                rel="noopener noreferrer"
              >{{ k.medio }}</a>
            </div>
          </div>
        </article>
      </div>
    </InvSection>

    <!-- El canal, y el contrato que lo muestra -->
    <InvSection :title="c.canal.titulo">
      <div class="inv-prose">
        <p
          v-for="(p, i) in c.canal.parrafos"
          :key="i"
        >
          {{ p }}
        </p>
      </div>

      <section class="sunca-contract">
        <h3 class="sunca-contract__t">
          {{ c.canal.contrato.titulo }}
        </h3>
        <p class="sunca-contract__s">
          {{ c.canal.contrato.subtitulo }}
        </p>
        <p class="sunca-contract__tot">
          <span class="sunca-contract__totl">{{ l.total }}</span>
          <span class="u-mono sunca-money">{{ c.canal.contrato.total }}</span>
        </p>

        <div class="sunca-tablewrap">
          <table class="sunca-table">
            <thead>
              <tr>
                <th scope="col">
                  {{ l.line }}
                </th>
                <th
                  scope="col"
                  class="sunca-table__num"
                >
                  {{ l.amount }}
                </th>
                <th
                  scope="col"
                  class="sunca-table__num"
                >
                  {{ l.share }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="r in c.canal.contrato.rubros"
                :key="r.nombre"
              >
                <th scope="row">
                  <span class="sunca-table__name">{{ r.nombre }}</span>
                  <span class="sunca-table__note">{{ r.nota }}</span>
                </th>
                <td
                  class="sunca-table__num u-mono sunca-money"
                  :data-label="l.amount"
                >
                  {{ r.monto }}
                </td>
                <td
                  class="sunca-table__num u-mono"
                  :data-label="l.share"
                >
                  {{ r.pct }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <InvFinding
        :kicker="l.finding"
        :body="c.canal.derivacion"
      />
    </InvSection>

    <!-- La escala de la obra pública en el registro -->
    <InvSection
      alt
      :title="c.escala.titulo"
    >
      <InvSplit>
        <div class="inv-prose">
          <p
            v-for="(p, i) in c.escala.parrafos"
            :key="i"
          >
            {{ p }}
          </p>
        </div>

        <template #aside>
          <p class="sunca-railh">
            {{ l.seven }}
          </p>
          <ol class="sunca-seven">
            <li
              v-for="k in c.escala.contratos"
              :key="k.nombre"
            >
              <p class="sunca-seven__m u-mono sunca-money">
                {{ k.monto }}
              </p>
              <p class="sunca-seven__n">
                {{ k.nombre }}
              </p>
              <p class="sunca-seven__o">
                {{ k.organismo }} · {{ k.ano }}
              </p>
            </li>
          </ol>
        </template>
      </InvSplit>
    </InvSection>

    <!-- Los límites, con el mismo peso que los hallazgos -->
    <InvSection :title="c.limites.titulo">
      <ul class="sunca-limits">
        <li
          v-for="(p, i) in c.limites.puntos"
          :key="i"
        >
          {{ p }}
        </li>
      </ul>
    </InvSection>

    <InvSection alt>
      <LeakTip
        :subject="c.titulo"
        path="/investigaciones/sunca"
        :facts="leakFacts"
      />
    </InvSection>

    <InvSection :title="l.sources">
      <InvSources
        split
        :items="c.fuentes"
      />
    </InvSection>

    <InvSection alt>
      <InvDisclaimer
        :title="common.common.disclaimerTitle"
        :paragraphs="common.common.disclaimer"
      />
    </InvSection>
  </div>
</template>

<style scoped lang="scss">
.sunca-intro { margin-top: var(--s-6); }

/* EL RÓTULO DEL CARRIL. Sin él, el bloque de la derecha se lee como una segunda columna de texto en
   vez de como evidencia de apoyo. */
.sunca-railh {
  margin: 0 0 var(--s-3);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  font-weight: 600;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--text-muted);
}

/* EN EL CARRIL TODO VA EN UNA COLUMNA. Estos bloques nacieron como filas de ancho completo, así que
   su `auto-fit` daría tres columnas dentro del carril y volvería a apretar el contenido. */
.inv-split__aside .sunca-steps,
.inv-split__aside .sunca-math { grid-template-columns: minmax(0, 1fr); }

/* La ficha del convenio: clave a la izquierda, valor a la derecha. */
.sunca-ficha {
  display: grid;
  grid-template-columns: minmax(0, 11ch) minmax(0, 1fr);
  gap: var(--s-2) var(--s-4);
  margin: 0;
  font-size: var(--t-sm);
  line-height: 1.5;
}

.sunca-ficha dt {
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-muted);
  overflow-wrap: anywhere;
}

.sunca-ficha dd {
  margin: 0;
  overflow-wrap: anywhere;
}

/* Los siete contratos que concentran la obra registrada. */
.sunca-seven {
  display: grid;
  gap: var(--s-4);
  margin: 0;
  padding: 0;
  list-style: none;
}

.sunca-seven li {
  border-left: 2px solid var(--rule-strong);
  padding-inline-start: var(--s-3);
  min-width: 0;
}

.sunca-seven__m {
  margin: 0;
  font-size: var(--t-md);
  line-height: 1.1;
}

.sunca-seven__n {
  margin: 2px 0 0;
  font-size: var(--t-sm);
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.sunca-seven__o {
  margin: 2px 0 0;
  font-size: var(--t-xs);
  color: var(--text-muted);
  overflow-wrap: anywhere;
}

/* El cronograma: cuatro escalones. Celeste, no oro: no son plata. */
.sunca-steps {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: var(--s-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.sunca-step {
  border: 1px solid var(--rule);
  border-top: 3px solid var(--celeste);
  border-radius: 0 0 var(--r-md) var(--r-md);
  background: var(--surface);
  padding-block: var(--s-4);
  padding-inline: var(--s-4);
  min-width: 0;
}

.sunca-step__h {
  margin: 0;
  font-size: var(--t-lg);
  font-weight: 700;
  color: var(--celeste-deep);
  line-height: 1.1;
}

.sunca-step__d {
  margin: 2px 0 var(--s-2);
  font-size: var(--t-sm);
  font-weight: 600;
}

.sunca-step__n {
  margin: 0;
  font-size: var(--t-xs);
  color: var(--text-muted);
  line-height: 1.45;
  overflow-wrap: anywhere;
}

/* La línea de tiempo de las conquistas anteriores. */
.sunca-time {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: var(--s-5);
}

.sunca-time__i {
  border-left: 3px solid var(--rule-strong);
  padding-inline-start: var(--s-5);
  min-width: 0;
  max-width: 80ch;
}

.sunca-time__d {
  margin: 0;
  font-size: var(--t-xs);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--celeste-deep);
}

.sunca-time__t {
  margin: 2px 0 var(--s-2);
  font-size: var(--t-md);
  line-height: 1.25;
}

.sunca-time__b {
  margin: 0 0 var(--s-3);
  font-size: 0.98rem;
  line-height: 1.65;
  overflow-wrap: anywhere;
}

/* Las tres cuentas. */
.sunca-math {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: var(--s-4);
}

.sunca-math__c {
  border: 1px solid var(--rule);
  border-radius: var(--r-md);
  background: var(--surface);
  padding-block: var(--s-4);
  padding-inline: var(--s-5);
  min-width: 0;
}

.sunca-math__f {
  margin: 0;
  font-size: var(--t-sm);
  color: var(--text-muted);
}

.sunca-math__r {
  margin: var(--s-1) 0 var(--s-2);
  font-size: var(--t-xl);
  font-weight: 700;
  color: var(--celeste-deep);
  line-height: 1.05;
  overflow-wrap: anywhere;
}

.sunca-math__l {
  margin: 0;
  font-size: var(--t-xs);
  color: var(--text-muted);
  line-height: 1.5;
  overflow-wrap: anywhere;
}

/* La auditoría de cifras ajenas. */
.sunca-claims {
  display: grid;
  gap: var(--s-4);
}

.sunca-claim {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--s-3);
  border: 1px solid var(--rule);
  border-left: 3px solid var(--rule-strong);
  border-radius: 0 var(--r-md) var(--r-md) 0;
  background: var(--surface);
  padding-block: var(--s-4);
  padding-inline: var(--s-5);
  min-width: 0;
}

@media (min-width: 720px) {
  .sunca-claim {
    grid-template-columns: 120px minmax(0, 1fr);
    gap: var(--s-5);
    align-items: start;
  }
}

.sunca-claim--bad { border-left-color: var(--alerta); }
.sunca-claim--unk { border-left-color: var(--celeste); }

/* Oro sólo acá: son montos de gasto público (app/DESIGN.md). */
.sunca-money {
  color: var(--money);
  font-weight: 600;
}

.sunca-claim__n {
  margin: 0;
  font-size: var(--t-xl);
  font-weight: 700;
  line-height: 1;
  color: var(--text-muted);
  overflow-wrap: anywhere;
}

.sunca-claim__body { min-width: 0; }

.sunca-claim__lbl {
  margin: 0 0 2px;
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  font-weight: 600;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.sunca-claim__said,
.sunca-claim__found {
  margin: 0 0 var(--s-3);
  font-size: 0.96rem;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.sunca-claim__foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--s-2);
}

.sunca-claim__state {
  font-size: var(--t-xs);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
}

.sunca-claim__src {
  font-size: var(--t-xs);
  color: var(--celeste-deep);
}

/* El contrato de OSE, abierto por rubro. */
.sunca-contract {
  margin-top: var(--s-6);
  border: 1px solid var(--rule);
  border-radius: var(--r-md);
  background: var(--surface);
  padding-block: var(--s-5);
  padding-inline: var(--s-5);
  min-width: 0;
}

.sunca-contract__t {
  margin: 0 0 var(--s-2);
  font-size: var(--t-md);
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.sunca-contract__s {
  margin: 0 0 var(--s-4);
  font-size: var(--t-sm);
  color: var(--text-muted);
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.sunca-contract__tot {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--s-2);
  margin: 0 0 var(--s-4);
}

.sunca-contract__totl {
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--text-muted);
}

/* La tabla desborda a 360px. Que scrollee ella, no el documento. */
.sunca-tablewrap {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.sunca-table {
  width: 100%;
  min-width: 460px;
  border-collapse: collapse;
  font-size: 0.94rem;
}

.sunca-table th,
.sunca-table td {
  text-align: start;
  vertical-align: top;
  padding-block: var(--s-3);
  padding-inline: var(--s-2);
  border-bottom: 1px solid var(--rule);
}

.sunca-table thead th {
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.sunca-table__num { text-align: end; white-space: nowrap; }

.sunca-table tbody th { font-weight: 600; }

.sunca-table__name { display: block; }

.sunca-table__note {
  display: block;
  margin-top: 2px;
  max-width: 46ch;
  font-weight: 400;
  font-size: var(--t-xs);
  color: var(--text-muted);
  line-height: 1.45;
  overflow-wrap: anywhere;
}

/* A 360px la columna de montos queda cortada, y el monto es el dato de la tabla.
   Debajo de 640px la fila se apila y cada celda lleva su rótulo con `data-label`. */
@media (max-width: 639px) {
  .sunca-table { min-width: 0; }

  .sunca-table thead {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .sunca-table tr {
    display: grid;
    gap: var(--s-1);
    padding-block: var(--s-3);
    border-bottom: 1px solid var(--rule);
  }

  .sunca-table th,
  .sunca-table td {
    border-bottom: 0;
    padding-block: 0;
    padding-inline: 0;
  }

  .sunca-table__num {
    text-align: start;
    white-space: normal;
    overflow-wrap: anywhere;
  }

  .sunca-table__num::before {
    content: attr(data-label) ' ';
    font-family: var(--font-mono);
    font-size: var(--t-xs);
    font-weight: 400;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-muted);
  }
}

.sunca-limits {
  margin: 0;
  padding-left: var(--s-5);
  display: grid;
  gap: var(--s-4);
  max-width: 78ch;
  line-height: 1.6;
  color: var(--text-muted);
}
</style>
