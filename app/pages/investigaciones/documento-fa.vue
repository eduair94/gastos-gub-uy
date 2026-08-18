<script setup lang="ts">
/**
 * Investigación · El documento del Frente Amplio, leído contra sus fuentes.
 *
 * Es la pieza de la serie que NO arranca en un contrato. Arranca en un documento partidario que
 * la prensa citó y que casi nadie chequeó, y lo trata como se trata acá cualquier fuente: se
 * publica entera, se mide y se contrasta.
 *
 * Tres decisiones sostienen la página y conviene no deshacerlas:
 *
 *  1. EL ORDEN ES DOCUMENTO → MEDICIÓN → PRENSA → CHEQUEO. Poner la prensa antes que el
 *     documento convertiría la pieza en una crítica a los medios. El documento va primero
 *     porque es la fuente, y la fila de cada medio se lee contra un texto que el lector ya vio.
 *  2. LA CITA DEL PÁRRAFO 108 VA JUNTO A LAS OTRAS DOS. El documento reparte la causa entre
 *     errores propios y una ofensiva ajena. Publicar sólo la autocrítica sería el mismo recorte
 *     que la página está midiendo.
 *  3. LAS ETIQUETAS SON SOBRE EL DATO, NO SOBRE EL DOCUMENTO. «No se puede medir» dice qué
 *     alcance tiene el dato público. Nunca dice que el documento se equivoca.
 *
 * Los números salen de ~/data/investigaciones-documento-fa (conteos sobre el PDF oficial) y las
 * encuestas de ~/data/encuestas, que ya tiene la ficha técnica de cada medición. Ninguna cifra
 * de encuesta se copia acá: se importa, para que el sitio no se contradiga a sí mismo.
 */
import { invContent } from '~/data/investigaciones'
import type { Claim, Coverage, TermCount, Verdict } from '~/data/investigaciones-documento-fa'
import { CHAPTERS, CLAIMS, COVERAGE, DOC, FA_SOURCES, TERMS, ZERO_TERMS, faContent } from '~/data/investigaciones-documento-fa'

const { locale, t } = useI18n()
const localePath = useLocalePath()
const c = computed(() => invContent(locale.value))
const cx = computed(() => faContent(locale.value))

const personLd = usePersonLd()
const orgLd = useOrgLd()
const breadcrumbLd = useBreadcrumbLd([
  { name: 'Investigaciones', path: '/investigaciones' },
  { name: cx.value.title },
])

useSeo(() => ({
  title: cx.value.title,
  description: cx.value.dek.slice(0, 155),
  path: '/investigaciones/documento-fa',
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

const isEn = computed(() => locale.value === 'en')
const nf = computed(() => new Intl.NumberFormat(isEn.value ? 'en-US' : 'es-UY'))
const heroTiles = computed(() => cx.value.tiles.map(x => ({ value: x.n, label: x.l, sub: x.s })))

/** Fecha larga, en el idioma de la página. */
function longDate(iso: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(isEn.value ? 'en-GB' : 'es-UY', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  })
}

/* Reparto del texto por capítulo */
type ChapterKey = keyof typeof cx.value.chapters
const chapterRows = computed(() => CHAPTERS.map(ch => ({ ...ch, label: cx.value.chapters[ch.key as ChapterKey] })))
const chapterColumns = computed(() => [
  { key: 'label', label: cx.value.colCapitulo, primary: true, minWidth: '240px' },
  { key: 'pages', label: cx.value.colPaginas, align: 'end' as const, mono: true },
  { key: 'words', label: cx.value.colPalabras, align: 'end' as const, mono: true },
  { key: 'share', label: cx.value.colShare, align: 'end' as const, mono: true },
])

/* Conteo de términos */
type TermKey = keyof typeof cx.value.terms
const termRows = computed(() => TERMS.map((x: TermCount) => ({ ...x, label: cx.value.terms[x.key as TermKey] })))
const termColumns = computed(() => [
  { key: 'label', label: cx.value.colTermino, primary: true, minWidth: '220px' },
  { key: 'n', label: cx.value.colMenciones, align: 'end' as const, mono: true },
])

type ZeroKey = keyof typeof cx.value.zeroTerms
const zeroLabels = computed(() => ZERO_TERMS.map(k => cx.value.zeroTerms[k as ZeroKey]))

/* Coberturas */
type CoverageKey = keyof typeof cx.value.coverage
const quotesBadge: Record<Coverage['quotes'], string> = {
  literal: 'inv-badge--ok',
  parafrasis: 'inv-badge--co',
  ninguna: 'inv-badge--nd',
}
const coverageRows = computed(() => COVERAGE.map(cv => ({
  ...cv,
  what: cx.value.coverage[cv.key as CoverageKey],
  quotesLabel: cx.value.quotesLabel[cv.quotes],
  badge: quotesBadge[cv.quotes],
})))
const coverageColumns = computed(() => [
  { key: 'outlet', label: cx.value.colMedio, primary: true, minWidth: '170px' },
  { key: 'date', label: cx.value.colFecha, mono: true, minWidth: '110px' },
  { key: 'quotes', label: cx.value.colCitas, minWidth: '130px' },
  { key: 'what', label: cx.value.colQue, minWidth: '380px' },
])

/* Afirmaciones chequeadas */
type ClaimKey = keyof typeof cx.value.claims
const verdictBadge: Record<Verdict, string> = {
  'medible': 'inv-badge--ok',
  'parcial': 'inv-badge--co',
  'no-medible': 'inv-badge--nd',
}
const claimCards = computed(() => CLAIMS.map((cl: Claim) => ({
  ...cl,
  ...cx.value.claims[cl.key as ClaimKey],
  verdictLabel: cx.value.verdictLabel[cl.verdict],
  badge: verdictBadge[cl.verdict],
})))

const sourceGroups = computed(() => FA_SOURCES.map(g => ({
  title: g.key === 'primaria'
    ? cx.value.srcPrimaria
    : g.key === 'estado'
      ? cx.value.srcEstado
      : g.key === 'encuestas' ? cx.value.srcEncuestas : cx.value.srcPrensa,
  items: g.items,
})))

const leakFacts = computed(() => [
  'El documento del VIII Congreso está publicado por el propio Frente Amplio desde el 14/08/2026.',
  'El 85% de las 63 prioridades es una declaración de Fernando Pereira: «63» y «85» no aparecen en las 63 páginas.',
  'El documento habla de compromisos «que superaban los 1000 millones de dólares»; el ministro presentó US$ 970 millones al Parlamento.',
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

    <!-- El cero, como titular -->
    <InvSection alt>
      <div class="inv-hero">
        <div>
          <p class="u-eyebrow">
            {{ cx.statHead }}
          </p>
          <p class="fa-zero">
            0
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

    <!-- La fuente primaria -->
    <InvSection
      :eyebrow="cx.docTag"
      :title="cx.docTitle"
    >
      <div class="inv-prose">
        <p
          v-for="(p, i) in cx.doc"
          :key="i"
        >
          {{ p }}
        </p>
      </div>

      <div class="fa-quotes">
        <InvFinding
          kicker="§111"
          :law="cx.quoteAnimo"
        />
        <InvFinding
          kicker="§112"
          :law="cx.quoteCoord"
        />
        <InvFinding
          kicker="§108"
          :law="cx.quoteRight"
          :body="cx.quoteRightNote"
        />
      </div>

      <p class="inv-note">
        <a
          :href="DOC.pdfUrl"
          target="_blank"
          rel="noopener noreferrer"
        >{{ DOC.pages }} {{ isEn ? 'pages' : 'páginas' }} · PDF</a>
        · {{ isEn ? 'approved' : 'aprobado' }} {{ longDate(DOC.approved) }}
        · {{ isEn ? 'published' : 'publicado' }} {{ longDate(DOC.publishedAt) }}
      </p>
    </InvSection>

    <!-- Medición propia sobre el texto -->
    <InvSection
      alt
      :eyebrow="cx.pesoTag"
      :title="cx.pesoTitle"
    >
      <div class="inv-prose">
        <p
          v-for="(p, i) in cx.peso"
          :key="i"
        >
          {{ p }}
        </p>
      </div>

      <InvLedger
        :columns="chapterColumns"
        :rows="chapterRows"
        row-key="key"
        :min-width="520"
      >
        <template #cell:words="{ row }">
          {{ nf.format(row.words) }}
        </template>
        <template #cell:share="{ row }">
          {{ nf.format(row.share) }}%
        </template>
      </InvLedger>

      <div class="fa-zeros">
        <p class="u-eyebrow">
          {{ cx.zeroTitle }}
        </p>
        <div class="chip-row fa-zeros__list">
          <span
            v-for="(z, i) in zeroLabels"
            :key="i"
            class="inv-badge inv-badge--nd"
          >{{ z }}</span>
        </div>
      </div>

      <InvLedger
        :columns="termColumns"
        :rows="termRows"
        row-key="key"
        :min-width="320"
      />

      <p class="inv-note fa-note">
        {{ cx.pesoNota }}
      </p>

      <h3 class="fa-h3">
        {{ cx.agendaTitle }}
      </h3>
      <div class="inv-prose">
        <p
          v-for="(p, i) in cx.agenda"
          :key="i"
        >
          {{ p }}
        </p>
      </div>
      <p class="inv-note">
        <NuxtLink :to="localePath('/encuestas')">
          {{ cx.encuestasLink }}
        </NuxtLink>
      </p>
    </InvSection>

    <!-- Las coberturas -->
    <InvSection
      :eyebrow="cx.prensaTag"
      :title="cx.prensaTitle"
      :dek="cx.prensaIntro"
    >
      <InvLedger
        :columns="coverageColumns"
        :rows="coverageRows"
        row-key="key"
        :min-width="760"
      >
        <template #cell:outlet="{ row }">
          <a
            :href="row.url"
            target="_blank"
            rel="noopener noreferrer"
          >{{ row.outlet }}</a>
        </template>
        <template #cell:quotes="{ row }">
          <span
            class="inv-badge"
            :class="row.badge"
          >{{ row.quotesLabel }}</span>
        </template>
      </InvLedger>
    </InvSection>

    <!-- Las afirmaciones, contra fuente -->
    <InvSection
      alt
      :eyebrow="cx.medibleTag"
      :title="cx.medibleTitle"
      :dek="cx.medibleIntro"
    >
      <ol class="fa-claims">
        <li
          v-for="cl in claimCards"
          :key="cl.key"
          class="fa-claim"
        >
          <div class="chip-row fa-claim__head">
            <span
              class="inv-badge"
              :class="cl.badge"
            >{{ cl.verdictLabel }}</span>
          </div>
          <p class="fa-claim__claim">
            {{ cl.claim }}
          </p>
          <p class="fa-claim__check">
            {{ cl.check }}
          </p>
        </li>
      </ol>
    </InvSection>

    <!-- Método y límites -->
    <InvSection
      :eyebrow="cx.limitesTag"
      :title="cx.limitesTitle"
    >
      <ul class="fa-limits">
        <li
          v-for="(l, i) in cx.limites"
          :key="i"
        >
          {{ l }}
        </li>
      </ul>
    </InvSection>

    <InvSection>
      <LeakTip
        :subject="cx.title"
        path="/investigaciones/documento-fa"
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
/* El cero es el titular: una ausencia contada, no una cifra de dinero. Por eso no va en oro. */
.fa-zero {
  font-family: var(--font-display);
  font-size: clamp(3.5rem, 12vw, 7rem);
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.04em;
  margin: var(--s-3) 0 0;
  color: var(--celeste-deep);
}

.fa-quotes {
  display: grid;
  gap: var(--s-5);
  margin-top: var(--s-6);
}

/* Los ceros son el hallazgo del capítulo, así que van a lo ancho y antes de la tabla:
   al costado dejaban media pantalla vacía en escritorio. */
.fa-zeros {
  margin: var(--s-7) 0 var(--s-5);
}

.fa-zeros__list {
  margin-top: var(--s-3);
}

.fa-note {
  margin-top: var(--s-4);
}

.fa-h3 {
  font-family: var(--font-display);
  font-size: 1.35rem;
  margin: var(--s-7) 0 var(--s-4);
}

.fa-claims {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--s-6);
}

.fa-claim {
  border-top: 1px solid var(--rule);
  padding-top: var(--s-4);
  max-width: 78ch;
}

.fa-claim__head {
  margin-bottom: var(--s-3);
}

.fa-claim__claim {
  margin: 0 0 var(--s-3);
  font-family: var(--font-display);
  font-size: 1.12rem;
  line-height: 1.45;
}

.fa-claim__check {
  margin: 0;
  line-height: 1.6;
  color: var(--text-muted);
}

.fa-limits {
  margin: 0;
  padding-left: var(--s-5);
  display: grid;
  gap: var(--s-3);
  max-width: 74ch;
  color: var(--text-muted);
}
</style>
