<script setup lang="ts">
/**
 * Intendencia de Montevideo — gasto discrecional a la luz del déficit.
 * Chrome estático alrededor de ~/data/investigaciones-im. Cada contrato del ledger
 * enlaza a su ficha en el sitio; el déficit y los casos mediáticos son prensa citada.
 */
import {
  IM_CATEGORIES,
  IM_LEDGER,
  IM_NEWS,
  IM_SOURCES,
  IM_STATS,
  imContent,
} from '~/data/investigaciones-im'

const { locale, t } = useI18n()
const localePath = useLocalePath()
const c = computed(() => imContent(locale.value))

const personLd = usePersonLd()
const orgLd = useOrgLd()
const breadcrumbLd = useBreadcrumbLd([
  { name: 'Investigaciones', path: '/investigaciones' },
  { name: c.value.title },
])

useSeo(() => ({
  title: c.value.title,
  description: c.value.dek.slice(0, 155),
  path: '/investigaciones/intendencia-montevideo',
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

const sortedCats = computed(() => IM_CATEGORIES.slice().sort((a, b) => b.spend - a.spend))
const catItems = computed(() =>
  sortedCats.value.map(cat => ({
    label: (c.value.cat as Record<string, string>)[cat.key],
    value: cat.spend,
    color: 'gold',
  })))

/** Each category bar drills through to that Intendencia's contracts matching the rubro. */
const CAT_SEARCH: Record<string, string> = { publicidad: 'publicidad', eventos: 'espectáculo', mobiliario: 'mobiliario', catering: 'catering' }
function catHref(i: number): string | undefined {
  const cat = sortedCats.value[i]
  if (!cat) return undefined
  // buyerIds (stable id filter) not buyers (name) — matches the explorer's link convention.
  return localePath({ path: '/contracts', query: { buyerIds: '98-1', search: CAT_SEARCH[cat.key] ?? cat.key } })
}

const ledger = computed(() => IM_LEDGER.slice().sort((a, b) => b.amount - a.amount))

const headlineTiles = computed(() => [
  { amount: IM_STATS.comprasTotal, label: c.value.tiles.compras, sub: c.value.tiles.comprasSub },
  { amount: IM_STATS.deficit2024UYU, label: c.value.tiles.deficit, sub: c.value.tiles.deficitSub },
  // The median contract is deliberately quieter than the totals beside it: it is
  // read in full, not shortened, because its whole point is the order of magnitude.
  { amount: IM_STATS.medianContract, size: 'md' as const, compact: false, label: c.value.tiles.mediana },
  { value: `×${IM_STATS.deficitMult}`, tone: 'alerta' as const, label: c.value.tiles.mult },
])

const ledgerColumns = computed(() => [
  { key: 'date', label: c.value.ledger.colDate, mono: true, nowrap: true },
  { key: 'desc', label: c.value.ledger.colObjeto, primary: true, minWidth: '200px' },
  { key: 'supplier', label: c.value.ledger.colSup, muted: true, minWidth: '170px' },
  { key: 'cat', label: c.value.ledger.colDesc },
  { key: 'amount', label: c.value.ledger.colAmount, align: 'end' as const },
  { key: 'ficha', align: 'end' as const },
])

const newsItems = computed(() => IM_NEWS.map(n => ({
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

    <!-- Lo discrecional -->
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
        :meta="locale === 'en' ? 'Click a bar to see those contracts' : 'Tocá una barra para ver esos contratos'"
      >
        <InvHBars
          :items="catItems"
          format="moneyM"
          :row-height="46"
          :href-for="catHref"
        />
      </ChartBlock>
      <InvFinding
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
        row-key="ocid"
      >
        <template #cell:date="{ row }">
          {{ formatDate(row.date) }}
        </template>
        <template #cell:cat="{ row }">
          <span
            class="inv-badge"
            :class="`cat--${row.cat}`"
          >{{ (c.cat as Record<string, string>)[row.cat] }}</span>
        </template>
        <template #cell:amount="{ row }">
          <MoneyAmount
            :amount="row.amount"
            compact
          />
        </template>
        <template #cell:ficha="{ row }">
          <NuxtLink :to="localePath(`/contracts/adjudicacion-${row.id}`)">
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
          :to="localePath('/buyers/98-1')"
          color="primary"
          variant="flat"
          prepend-icon="mdi-file-document-multiple-outline"
          class="text-none"
        >
          {{ c.explore.allContracts }}
        </v-btn>
        <v-btn
          :to="localePath('/analytics/intendencias')"
          variant="outlined"
          prepend-icon="mdi-scale-balance"
          class="text-none"
        >
          {{ c.explore.compare }}
        </v-btn>
        <v-btn
          :to="localePath({ path: '/contracts', query: { buyerIds: '98-1' } })"
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
      <InvSources :items="IM_SOURCES" />
    </InvSection>

    <!-- Uruguay Leaks: lo que no está en los datos abiertos se manda a quien puede protegerlo. -->
    <InvSection>
      <LeakTip
        :subject="c.title"
        path="/investigaciones/intendencia-montevideo"
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
.cat--publicidad { border: 1px solid color-mix(in srgb, var(--celeste) 45%, transparent); color: var(--celeste-deep); }
.cat--eventos { border: 1px solid color-mix(in srgb, var(--alerta) 40%, transparent); color: var(--alerta); }
.cat--merchandising { border: 1px solid color-mix(in srgb, var(--sol) 50%, transparent); color: var(--money); }
</style>
