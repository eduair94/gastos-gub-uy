<script setup lang="ts">
/**
 * Los monopolios estatales, de los dos lados del mostrador.
 *
 * EL ORDEN DE LA PÁGINA DECIDE CÓMO SE LEE. Primero las cifras de conjunto, después la sección que
 * explica qué es un monopolio estatal y por qué esta pieza no lo trata como una irregularidad, y
 * recién ahí las ocho fichas. Invertir esos dos primeros bloques convertiría una medición en una
 * denuncia, que es lo que PRODUCT.md prohíbe.
 *
 * CADA FICHA TIENE LA MISMA FORMA: qué concede la norma, qué NO concede, la cara de proveedor, la
 * cara de comprador y el hallazgo. El "qué no concede" va con el mismo peso visual que el "qué
 * concede", porque es la mitad del valor de la ficha: casi todos estos monopolios son más chicos
 * de lo que su nombre sugiere.
 *
 * NADA EN ORO salvo los montos, que sí son gasto público (app/DESIGN.md).
 */
import { MONO_MEASURED_ON, monoContent } from '~/data/investigaciones-monopolios'
import { invContent } from '~/data/investigaciones'

const { locale, t } = useI18n()
const c = computed(() => monoContent(locale.value))
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
  path: '/investigaciones/monopolios',
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
      'dateModified': MONO_MEASURED_ON,
    },
    breadcrumbLd,
  ],
}))

/**
 * Rótulos de la plantilla. Viven acá y no en el módulo de datos porque ese archivo se GENERA desde
 * el material de medición: una etiqueta escrita ahí se pierde en la próxima regeneración.
 */
const LABELS = {
  es: {
    grants: 'Lo que concede la norma',
    notGrants: 'Lo que NO concede',
    asSupplier: 'Como proveedor del Estado',
    asBuyer: 'Como comprador',
    finding: 'Hallazgo',
    sources: 'Fuentes',
    scope: '9 empresas públicas con monopolio legal',
    origin: 'Registro de compras públicas (OCDS) y las normas citadas',
    index: 'Las ocho fichas',
  },
  en: {
    grants: 'What the law grants',
    notGrants: 'What it does NOT grant',
    asSupplier: 'As a supplier to the state',
    asBuyer: 'As a buyer',
    finding: 'Finding',
    sources: 'Sources',
    scope: '9 state companies with a legal monopoly',
    origin: 'Public procurement record (OCDS) and the cited laws',
    index: 'The eight files',
  },
} as const

const l = computed(() => LABELS[locale.value === 'en' ? 'en' : 'es'])

const heroTiles = computed(() =>
  c.value.portada.cifras.map(x => ({ value: x.valor, label: x.etiqueta, sub: x.sub })),
)

/** Índice de las fichas. Ocho casos es demasiado para leer en orden sin un mapa arriba. */
const indice = computed(() => c.value.casos.map(k => ({ key: k.key, sigla: k.sigla, nombre: k.nombre })))

const leakFacts = computed(() => [
  'Las nueve empresas públicas con monopolio legal le facturaron al resto del Estado 32.983 millones de pesos entre 2002 y 2026, el 2,00% del gasto registrado.',
  'Las mismas nueve, comprando, adjudicaron 734.993 millones: el 44,66% del gasto registrado, y ANCAP sola el 28,67%.',
  'El 69,1% de lo que facturan se lo paga otra empresa pública. El eje es ANCAP vendiéndole combustible a UTE, y el 94% de esa relación es del año 2023.',
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
        { label: t('inv.file.alcance'), value: l.scope },
        { label: t('inv.file.periodo'), value: '2002 – 2026' },
        { value: l.origin },
      ]"
    />

    <!-- Las cifras de conjunto -->
    <InvSection alt>
      <InvTiles
        :columns="4"
        :items="heroTiles"
      />
      <div class="inv-prose mo-intro">
        <p
          v-for="(p, i) in c.portada.parrafos"
          :key="i"
        >
          {{ p }}
        </p>
      </div>
    </InvSection>

    <!-- Por qué esto no es una denuncia. Va ANTES de las fichas, no después. -->
    <InvSection
      :eyebrow="common.common.method ?? 'Método'"
      :title="c.queEs.titulo"
    >
      <div class="inv-prose">
        <p
          v-for="(p, i) in c.queEs.parrafos"
          :key="i"
        >
          {{ p }}
        </p>
      </div>
    </InvSection>

    <!-- El índice: ocho fichas no se leen en orden sin un mapa -->
    <InvSection alt>
      <nav class="mo-nav">
        <a
          v-for="k in indice"
          :key="k.key"
          class="mo-nav__i"
          :href="`#${k.key}`"
        >
          <span class="mo-nav__s">{{ k.sigla }}</span>
          <span class="mo-nav__n">{{ k.nombre }}</span>
        </a>
      </nav>
    </InvSection>

    <!-- Una ficha por caso -->
    <InvSection
      v-for="(caso, idx) in c.casos"
      :id="caso.key"
      :key="caso.key"
      :alt="idx % 2 === 1"
      :eyebrow="caso.sigla"
      :title="caso.nombre"
    >
      <InvTiles
        :columns="4"
        :items="caso.cifras.map(x => ({ value: x.valor, label: x.etiqueta }))"
      />

      <div class="mo-law">
        <div class="mo-law__b">
          <h3>{{ l.grants }}</h3>
          <p class="mo-law__cite">
            {{ caso.norma }}
          </p>
          <p>{{ caso.alcance }}</p>
        </div>
        <div class="mo-law__b mo-law__b--not">
          <h3>{{ l.notGrants }}</h3>
          <p>{{ caso.noAlcanza }}</p>
        </div>
      </div>

      <div class="mo-sides">
        <section class="mo-side">
          <h3 class="mo-side__h">
            {{ l.asSupplier }}
          </h3>
          <p>{{ caso.comoProveedor }}</p>
        </section>
        <section class="mo-side">
          <h3 class="mo-side__h">
            {{ l.asBuyer }}
          </h3>
          <p>{{ caso.comoComprador }}</p>
        </section>
      </div>

      <InvFinding
        :kicker="l.finding"
        :body="[caso.hallazgo]"
      />

      <InvSources :items="caso.fuentes" />
    </InvSection>

    <!-- Los límites, con el mismo peso que los hallazgos -->
    <InvSection
      alt
      :title="c.limites.titulo"
    >
      <ul class="mo-limits">
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
        path="/investigaciones/monopolios"
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
.mo-intro { margin-top: var(--s-6); }

/* El índice de las ocho fichas. */
.mo-nav {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--s-3);
}

.mo-nav__i {
  display: grid;
  gap: 2px;
  padding: var(--s-3) var(--s-4);
  border: 1px solid var(--rule);
  border-radius: var(--r-md);
  background: var(--surface);
  text-decoration: none;
  color: inherit;
  transition: border-color var(--dur) var(--ease);
  min-width: 0;
}

.mo-nav__i:hover { border-color: var(--celeste); }

.mo-nav__s {
  font-family: var(--font-mono);
  font-size: var(--t-sm);
  font-weight: 700;
  color: var(--celeste-deep);
}

.mo-nav__n {
  font-size: var(--t-xs);
  color: var(--text-muted);
  line-height: 1.35;
  overflow-wrap: anywhere;
}

/* Lo que concede y lo que no, enfrentados. El "no" no es una nota al pie. */
.mo-law {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: var(--s-4);
  margin-top: var(--s-6);
}

.mo-law__b {
  border: 1px solid var(--rule);
  border-left: 3px solid var(--celeste);
  border-radius: 0 var(--r-md) var(--r-md) 0;
  background: var(--surface);
  padding: var(--s-4) var(--s-5);
  min-width: 0;
}

.mo-law__b--not { border-left-color: var(--rule-strong); }

.mo-law__b h3 {
  margin: 0 0 var(--s-2);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  font-weight: 600;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.mo-law__b p {
  margin: 0 0 var(--s-3);
  font-size: 0.95rem;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.mo-law__b p:last-child { margin-bottom: 0; }

.mo-law__cite {
  color: var(--text-muted);
  font-size: 0.9rem !important;
}

.mo-sides {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: var(--s-5);
  margin-top: var(--s-6);
}

.mo-side { min-width: 0; }

.mo-side__h {
  margin: 0 0 var(--s-2);
  font-size: var(--t-md);
  line-height: 1.25;
}

.mo-side p {
  margin: 0;
  font-size: 0.98rem;
  line-height: 1.65;
  overflow-wrap: anywhere;
}

.mo-limits {
  margin: 0;
  padding-left: var(--s-5);
  display: grid;
  gap: var(--s-4);
  max-width: 78ch;
  line-height: 1.6;
  color: var(--text-muted);
}
</style>
