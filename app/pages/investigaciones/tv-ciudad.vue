<script setup lang="ts">
/**
 * TV Ciudad — el canal municipal de la Intendencia, a la luz de la base y la prensa.
 * Chrome estático alrededor de ~/data/investigaciones-tvciudad. El ledger sale de la
 * base (comprador 98-1, texto "TV Ciudad", ficha por ficha); el presupuesto, la
 * publicidad, la NBA y los recortes son prensa citada — el grueso del dinero, como
 * contexto, porque el canal se financia por presupuesto y casi no deja rastro en compras.
 */
import {
  TVC_BUDGET,
  TVC_LEDGER,
  TVC_NEWS,
  TVC_SOURCES,
  TVC_STATS,
  tvcContent,
} from '~/data/investigaciones-tvciudad'

const { locale, t } = useI18n()
const localePath = useLocalePath()
const c = computed(() => tvcContent(locale.value))

const personLd = usePersonLd()
const orgLd = useOrgLd()
const breadcrumbLd = useBreadcrumbLd([
  { name: 'Investigaciones', path: '/investigaciones' },
  { name: c.value.title },
])

useSeo(() => ({
  title: c.value.title,
  description: c.value.dek.slice(0, 155),
  path: '/investigaciones/tv-ciudad',
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

const sortedBudget = computed(() => TVC_BUDGET.slice().sort((a, b) => b.spend - a.spend))
const budgetItems = computed(() =>
  sortedBudget.value.map(line => ({
    label: (c.value.budget as Record<string, string>)[line.key],
    value: line.spend,
    color: 'gold',
  })))

/** Adjudicados con monto primero (mayor a menor), luego los llamados por fecha desc. */
const ledger = computed(() =>
  TVC_LEDGER.slice().sort((a, b) => {
    if (a.amount !== b.amount) return b.amount - a.amount
    return b.date.localeCompare(a.date)
  }))

const headlineTiles = computed(() => [
  { amount: TVC_STATS.presupuesto2023UYU, label: c.value.tiles.presupuesto, sub: c.value.tiles.presupuestoSub },
  { amount: TVC_STATS.presupuesto2026UYU, label: c.value.tiles.proyecto, sub: c.value.tiles.proyectoSub },
  { amount: TVC_STATS.publicidad2024UYU, label: c.value.tiles.publicidad, sub: c.value.tiles.publicidadSub },
  { value: TVC_STATS.dbRecords, label: c.value.tiles.registros, sub: c.value.tiles.registrosSub },
])

const ledgerColumns = computed(() => [
  { key: 'date', label: c.value.ledger.colDate, mono: true, nowrap: true },
  { key: 'desc', label: c.value.ledger.colObjeto, primary: true, minWidth: '220px' },
  { key: 'supplier', label: c.value.ledger.colSup, muted: true, minWidth: '170px' },
  { key: 'cat', label: c.value.ledger.colCat },
  { key: 'amount', label: c.value.ledger.colAmount, align: 'end' as const },
  { key: 'ficha', align: 'end' as const },
])

const newsItems = computed(() => TVC_NEWS.map(n => ({
  url: n.url,
  amountText: n.amountText,
  text: (c.value.casos as Record<string, string>)[n.key] ?? '',
  source: n.source,
  date: n.date,
})))
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

    <!-- Contexto -->
    <InvSection
      :eyebrow="c.ctx.tag"
      :title="c.ctx.title"
    >
      <div class="inv-prose">
        <p>{{ c.ctx.p1 }}</p>
        <p>{{ c.ctx.p2 }}</p>
      </div>
    </InvSection>

    <!-- La escala: presupuesto -->
    <InvSection
      alt
      :eyebrow="c.disc.tag"
      :title="c.disc.title"
      :dek="c.disc.intro"
    >
      <ChartBlock
        framed
        :level="3"
        :title="c.disc.chart"
      >
        <InvHBars
          :items="budgetItems"
          format="moneyM"
          :row-height="46"
        />
      </ChartBlock>
      <InvFinding
        spaced
        :kicker="c.disc.tag"
        :body="c.disc.finding"
      />
    </InvSection>

    <!-- Ledger -->
    <InvSection
      :eyebrow="c.ledger.tag"
      :title="c.ledger.title"
      :dek="c.ledger.intro"
    >
      <InvLedger
        :columns="ledgerColumns"
        :rows="ledger"
        row-key="recordId"
      >
        <template #cell:date="{ row }">
          {{ formatDate(row.date) }}
        </template>
        <template #cell:supplier="{ row }">
          {{ row.supplier || '—' }}
        </template>
        <template #cell:cat="{ row }">
          <span
            class="inv-badge"
            :class="`cat--${row.cat}`"
          >{{ (c.cat as Record<string, string>)[row.cat] }}</span>
        </template>
        <template #cell:amount="{ row }">
          <MoneyAmount
            v-if="row.amount > 0"
            :amount="row.amount"
            compact
          />
          <span
            v-else
            class="tvc-nomonto u-mono"
          >{{ c.ledger.sinMonto }}</span>
        </template>
        <template #cell:ficha="{ row }">
          <NuxtLink :to="localePath(`/contracts/${row.recordId}`)">
            {{ c.ledger.ficha }} →
          </NuxtLink>
        </template>
      </InvLedger>

      <!-- Interconexión con el sitio -->
      <InvExplore
        :tag="c.explore.tag"
        :title="c.explore.title"
        :intro="c.explore.intro"
      >
        <v-btn
          :to="localePath('/investigaciones/intendencia-montevideo')"
          color="primary"
          variant="flat"
          prepend-icon="mdi-city-variant-outline"
          class="text-none"
        >
          {{ c.explore.im }}
        </v-btn>
        <v-btn
          :to="localePath('/buyers/98-1')"
          variant="outlined"
          prepend-icon="mdi-file-document-multiple-outline"
          class="text-none"
        >
          {{ c.explore.buyer }}
        </v-btn>
        <v-btn
          :to="localePath({ path: '/contracts', query: { buyerIds: '98-1', search: 'tv ciudad' } })"
          variant="text"
          prepend-icon="mdi-magnify"
          class="text-none"
        >
          {{ c.explore.search }}
        </v-btn>
      </InvExplore>
    </InvSection>

    <!-- Casos mediáticos -->
    <InvSection
      alt
      :eyebrow="c.casos.tag"
      :title="c.casos.title"
      :dek="c.casos.intro"
    >
      <InvNewsCards
        :items="newsItems"
        :note="c.casos.note"
      />
    </InvSection>

    <!-- Método -->
    <InvSection
      :eyebrow="c.method.tag"
      :title="c.method.title"
    >
      <div class="inv-prose">
        <p>{{ c.method.p1 }}</p>
        <p>{{ c.method.p2 }}</p>
      </div>
    </InvSection>

    <!-- Fuentes -->
    <InvSection
      alt
      :eyebrow="c.sourcesTitle"
      :title="c.common.verified"
    >
      <InvSources :items="TVC_SOURCES" />
    </InvSection>

    <!-- Uruguay Leaks: lo que no está en los datos abiertos se manda a quien puede protegerlo. -->
    <InvSection>
      <LeakTip
        :subject="c.title"
        path="/investigaciones/tv-ciudad"
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
/* The ledger's own vocabulary of categories — the badge shell is the shared
   `.inv-badge`; only the reading of each category belongs to this page. */
.cat--equipamiento { border: 1px solid color-mix(in srgb, var(--celeste) 45%, transparent); color: var(--celeste-deep); }
.cat--vehiculo { border: 1px solid color-mix(in srgb, var(--alerta) 40%, transparent); color: var(--alerta); }
.cat--insumos { border: 1px solid color-mix(in srgb, var(--sol) 50%, transparent); color: var(--money); }
.cat--obra { border: 1px solid var(--rule-strong); color: var(--text-muted); }

/* A call with no awarded amount is not zero pesos — it is a call, so it says so
   instead of rendering a gold figure that does not exist. */
.tvc-nomonto { font-size: var(--t-xs); color: var(--text-muted); }
</style>
