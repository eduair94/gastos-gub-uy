<script setup lang="ts">
/**
 * El datacenter de Google, buscado en los registros del Estado.
 *
 * El hallazgo es un CERO, así que la página tiene que hacer legible una ausencia: primero qué
 * buscamos (con la tabla de búsquedas fallidas, que es la evidencia), después por qué el cero es
 * correcto, y recién ahí el rastro que sí existe. Invertir ese orden convertiría una ausencia
 * explicable en una insinuación.
 *
 * Cada eslabón de la cronología lleva su procedencia a la vista — documento oficial o prensa —
 * porque la pieza mezcla las dos y no puede dejar que se confundan.
 */
import { invContent } from '~/data/investigaciones'
import { CORPUS_SEARCH, DC_SOURCES, HOSTING, TIMELINE, dcContent } from '~/data/investigaciones-datacenter'

const { locale, t } = useI18n()
const c = computed(() => invContent(locale.value))
const cx = computed(() => dcContent(locale.value))

const personLd = usePersonLd()
const orgLd = useOrgLd()
const breadcrumbLd = useBreadcrumbLd([
  { name: 'Investigaciones', path: '/investigaciones' },
  { name: cx.value.title },
])

useSeo(() => ({
  title: cx.value.title,
  description: cx.value.dek.slice(0, 155),
  path: '/investigaciones/datacenter-google',
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
const heroTiles = computed(() => cx.value.tiles.map(t2 => ({ value: t2.n, label: t2.l, sub: t2.s })))

type SearchKey = keyof typeof cx.value.searchItems
const searchRows = computed(() => CORPUS_SEARCH.map(s => ({ ...s, label: cx.value.searchItems[s.key as SearchKey] })))
const searchColumns = computed(() => [
  { key: 'label', label: cx.value.colBuscado, primary: true, minWidth: '260px' },
  { key: 'hits', label: cx.value.colResultado, align: 'end' as const, mono: true },
])

type TlKey = keyof typeof cx.value.timeline
const timeline = computed(() => TIMELINE.map(e => ({
  ...e,
  text: cx.value.timeline[e.key as TlKey],
  sourceLabel: e.source === 'oficial' ? cx.value.sourceOficial : cx.value.sourcePrensa,
  badge: e.source === 'oficial' ? 'inv-badge--ok' : 'inv-badge--nd',
})))

const sourceGroups = computed(() => DC_SOURCES.map(g => ({
  title: g.key === 'oficial' ? cx.value.srcOficial : cx.value.srcPrensa,
  items: g.items,
})))

const leakFacts = computed(() => [
  'El proyecto figura ante el Ministerio de Ambiente como "Teros", de Eleanor Applications S.R.L., en los padrones 47.763 y 47.827 a 47.832 de Ciudad de la Costa.',
  'La Resolución 65/024 del MEF (Diario Oficial del 08/03/2024) amplió la zona franca justo sobre esos padrones.',
  'No hay un solo registro del proyecto en los 2.184.330 registros de compras públicas.',
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
          <p class="dc-zero">
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

    <!-- La búsqueda -->
    <InvSection
      :eyebrow="cx.buscamosTag"
      :title="cx.buscamosTitle"
    >
      <div class="inv-prose">
        <p
          v-for="(p, i) in cx.buscamos"
          :key="i"
        >
          {{ p }}
        </p>
      </div>

      <InvLedger
        :columns="searchColumns"
        :rows="searchRows"
        row-key="key"
        :min-width="480"
      >
        <template #cell:hits="{ row }">
          {{ nf.format(row.hits) }}
        </template>
      </InvLedger>
    </InvSection>

    <!-- La cronología documental -->
    <InvSection
      alt
      :eyebrow="cx.rastroTag"
      :title="cx.rastroTitle"
      :dek="cx.rastroIntro"
    >
      <ol class="dc-tl">
        <li
          v-for="e in timeline"
          :key="e.key"
          class="dc-tl__item"
        >
          <div class="dc-tl__head">
            <time class="u-mono">{{ e.date }}</time>
            <a
              class="inv-badge"
              :class="e.badge"
              :href="e.url"
              target="_blank"
              rel="noopener noreferrer"
            >{{ e.sourceLabel }}</a>
          </div>
          <p>{{ e.text }}</p>
        </li>
      </ol>
    </InvSection>

    <!-- Lo que la ficha ciudadana no dice -->
    <InvSection
      :eyebrow="cx.fichaTag"
      :title="cx.fichaTitle"
    >
      <div class="inv-prose">
        <p
          v-for="(p, i) in cx.ficha"
          :key="i"
        >
          {{ p }}
        </p>
      </div>
    </InvSection>

    <!-- La letra chica de la autorización -->
    <InvSection
      alt
      :eyebrow="cx.condicionesTag"
      :title="cx.condicionesTitle"
      :dek="cx.condicionesIntro"
    >
      <ol class="dc-cond">
        <li
          v-for="(cond, i) in cx.condiciones"
          :key="i"
        >
          {{ cond }}
        </li>
      </ol>
      <p class="inv-note">
        {{ cx.condicionesNota }}
      </p>
    </InvSection>

    <!-- El contraste con lo que sí paga el Estado -->
    <InvSection
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

      <div class="inv-balance">
        <div class="inv-balance__h">
          {{ HOSTING.awards }} · {{ HOSTING.buyers }} · {{ HOSTING.from }} → {{ HOSTING.to }}
        </div>
        <p>
          <MoneyAmount
            :amount="HOSTING.uyu"
            size="md"
            compact
          />
        </p>
      </div>
    </InvSection>

    <!-- Los límites, con el mismo peso que los hallazgos -->
    <InvSection
      alt
      :eyebrow="c.common.method ?? 'Método'"
      :title="cx.limitesTitle"
    >
      <ul class="dc-limits">
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
        path="/investigaciones/datacenter-google"
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
/* El cero es el titular de la pieza, así que se escribe con el cuerpo de una cifra de dinero
   — pero NO en oro: no es plata, es una ausencia. */
.dc-zero {
  font-family: var(--font-display);
  font-size: clamp(3.5rem, 12vw, 7rem);
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.04em;
  margin: var(--s-3) 0 0;
  color: var(--celeste-deep);
}

.dc-tl {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--s-5);
  max-width: 78ch;
}

.dc-tl__item {
  border-top: 1px solid var(--rule);
  padding-top: var(--s-4);
}

.dc-tl__head {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2) var(--s-3);
  align-items: baseline;
  margin-bottom: var(--s-2);
}

.dc-tl__head time {
  font-size: 0.82rem;
  color: var(--text-muted);
}

.dc-tl__item p {
  margin: 0;
  max-width: 72ch;
  line-height: 1.6;
}

.dc-cond {
  margin: 0;
  padding-left: var(--s-5);
  display: grid;
  gap: var(--s-3);
  max-width: 74ch;
  line-height: 1.55;
}

.dc-limits {
  margin: 0;
  padding-left: var(--s-5);
  display: grid;
  gap: var(--s-3);
  max-width: 74ch;
  color: var(--text-muted);
}
</style>
