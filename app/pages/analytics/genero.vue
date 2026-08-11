<script setup lang="ts">
/**
 * Gasto en políticas de género y diversidad — the explorer.
 *
 * The procurement feed has no "policy area" field, so this topic is recovered from
 * the free text of each contract by shared/spending-topics.ts and adjudicated by
 * src/jobs/refresh-topic-spending.ts. That makes the METHOD part of the finding, not
 * a footnote: the page publishes the term list, the terms deliberately left out with
 * the evidence for leaving them out, and the candidates the classifier discarded.
 *
 * Two numbers lead on purpose:
 *   - the measured total, and
 *   - the share of matched contracts the feed gives an amount for at all (~20%).
 * The second is why the first is a floor, not a total. That is a loading failure of
 * the state's own records, and hiding it would make the page assert more than it can.
 *
 * The party column is CONTEXT (public electoral record at the year of each contract),
 * never attribution — and the party comparison is normalised against what those same
 * organisms spent on everything, because the Intendencia de Montevideo alone is most
 * of the measured spend.
 */
import type { DataColumn } from '~/components/DataTable.vue'

const { t, locale } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const router = useRouter()

const TOPIC = 'genero'

// ---- filters (URL is the state, so every view is shareable) ----------------
const year = ref(route.query.year ? String(route.query.year) : '')
const category = ref(route.query.category ? String(route.query.category) : '')
const buyerId = ref(route.query.buyerId ? String(route.query.buyerId) : '')
const party = ref(route.query.party ? String(route.query.party) : '')
const sort = ref(route.query.sort ? String(route.query.sort) : 'amount')
const rejected = ref(route.query.rejected === '1')
const page = ref(Number(route.query.page ?? 1))

watch([year, category, buyerId, party, sort, rejected], () => {
  page.value = 1
})
watch([year, category, buyerId, party, sort, rejected, page], () => {
  const q: Record<string, string> = {}
  if (year.value) q.year = year.value
  if (category.value) q.category = category.value
  if (buyerId.value) q.buyerId = buyerId.value
  if (party.value) q.party = party.value
  if (sort.value !== 'amount') q.sort = sort.value
  if (rejected.value) q.rejected = '1'
  if (page.value > 1) q.page = String(page.value)
  router.replace({ query: q })
})

const { data: res } = await useFetch<any>(`/api/analytics/topics/${TOPIC}`)
const stats = computed<any>(() => res.value?.data?.stats ?? null)
const topic = computed<any>(() => res.value?.data?.topic ?? null)

const { data: listRes, pending: listPending } = await useFetch<any>(
  `/api/analytics/topics/${TOPIC}/contracts`,
  {
    query: computed(() => ({
      page: page.value,
      limit: 25,
      sort: sort.value,
      ...(year.value ? { year: year.value } : {}),
      ...(category.value ? { category: category.value } : {}),
      ...(buyerId.value ? { buyerId: buyerId.value } : {}),
      ...(party.value ? { party: party.value } : {}),
      ...(rejected.value ? { rejected: '1' } : {}),
    })),
  },
)
const contracts = computed<any[]>(() => listRes.value?.data?.items ?? [])
const totalPages = computed<number>(() => listRes.value?.data?.pagination?.pages ?? 1)
const totalRows = computed<number>(() => listRes.value?.data?.pagination?.total ?? 0)

// ---- derived --------------------------------------------------------------
const isEs = computed(() => locale.value === 'es')

function categoryLabel(key: string): string {
  const c = topic.value?.categories?.find((x: any) => x.key === key)
  if (!c) return key
  return isEs.value ? c.labelEs : c.labelEn
}

const coveragePct = computed(() => Math.round((stats.value?.coverage ?? 0) * 100))

const yearBars = computed(() =>
  (stats.value?.byYear ?? [])
    .filter((y: any) => y.total > 0)
    .map((y: any) => ({
      label: String(y.year),
      value: y.total,
      sub: t('genero.bars.yearSub', { n: y.contracts, m: y.withoutAmount }),
    })),
)

const categoryBars = computed(() =>
  (stats.value?.byCategory ?? []).map((c: any) => ({
    label: categoryLabel(c.category),
    value: c.total,
    sub: t('genero.bars.catSub', { n: c.contracts }),
  })),
)

const years = computed<string[]>(() =>
  [...(stats.value?.byYear ?? [])].map((y: any) => String(y.year)).reverse(),
)

/** A share this small reads better as "X de cada 10.000 pesos" than as a percentage. */
function bp(value?: number | null): string {
  if (!value || !Number.isFinite(value)) return '—'
  return t('genero.bpValue', { n: value.toFixed(1) })
}

function fmtDate(value?: string | Date | null): string {
  if (!value) return '—'
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`
}

const buyerCols = computed<DataColumn[]>(() => [
  { key: 'buyerName', label: t('genero.col.organism'), primary: true },
  { key: 'party', label: t('genero.col.party') },
  { key: 'contracts', label: t('genero.col.contracts'), align: 'end', mono: true },
  { key: 'share', label: t('genero.col.share'), align: 'end', mono: true },
  { key: 'total', label: t('genero.col.total'), align: 'end' },
])

const supplierCols = computed<DataColumn[]>(() => [
  { key: 'name', label: t('genero.col.supplier'), primary: true },
  { key: 'buyers', label: t('genero.col.buyers'), align: 'end', mono: true },
  { key: 'contracts', label: t('genero.col.contracts'), align: 'end', mono: true },
  { key: 'total', label: t('genero.col.total'), align: 'end' },
])

const contractCols = computed<DataColumn[]>(() => [
  { key: 'title', label: t('genero.col.contract'), primary: true },
  { key: 'buyerName', label: t('genero.col.organism') },
  { key: 'category', label: t('genero.col.category') },
  { key: 'year', label: t('genero.col.year'), align: 'end', mono: true },
  { key: 'amount', label: t('genero.col.amount'), align: 'end' },
])

function clearFilters(): void {
  year.value = ''
  category.value = ''
  buyerId.value = ''
  party.value = ''
  rejected.value = false
}

const activeFilters = computed(() =>
  Boolean(year.value || category.value || buyerId.value || party.value || rejected.value),
)

/**
 * Deep link into the alert builder, pre-filled with the topic's STRONG terms only.
 * The weak ones ("genero" on its own, "afrodescendiente") exist to open candidacy for
 * the classifier, not to page a subscriber at 3am about a roll of cloth.
 */
const alertHref = computed(() => {
  const strong = (topic.value?.terms ?? [])
    .filter((x: any) => x.strength === 'strong')
    .map((x: any) => x.term)
  if (!strong.length) return ''
  const q = new URLSearchParams({
    new: '',
    keywords: strong.join(','),
    name: t('genero.alertName'),
  })
  return localePath(`/app/alertas?${q.toString()}`)
})

const buyerName = computed(() =>
  stats.value?.byBuyer?.find((b: any) => b.buyerId === buyerId.value)?.buyerName ?? buyerId.value,
)

useSeo(() => ({
  title: t('seo.genero.title'),
  description: t('seo.genero.description'),
  path: '/analytics/genero',
  kicker: 'Análisis',
}))
</script>

<template>
  <div class="gen">
    <v-sheet
      class="hero"
      tag="header"
    >
      <div class="u-container">
        <div class="hero__in">
          <p class="hero__eyebrow u-mono">
            {{ t('home.eyebrow') }}
          </p>
          <h1 class="hero__title">
            {{ t('genero.title') }}
          </h1>
          <p class="hero__dek">
            {{ t('genero.lead') }}
          </p>
        </div>
      </div>
    </v-sheet>

    <div class="u-container page">
      <!-- The coverage caveat leads: it is what makes the total a floor. -->
      <v-alert
        v-if="stats"
        type="warning"
        variant="tonal"
        density="comfortable"
        class="caveat"
      >
        {{ t('genero.coverageWarning', {
          pct: coveragePct,
          withAmount: stats.contractsWithAmount,
          contracts: stats.contracts,
        }) }}
      </v-alert>

      <div
        v-if="stats"
        class="kpis"
      >
        <div class="kpi kpi--money">
          <MoneyAmount
            :amount="stats.total"
            size="lg"
            align="start"
            :rule="false"
            compact
          />
          <span class="kpi__l">{{ t('genero.kpi.total') }}</span>
        </div>
        <div class="kpi">
          <span class="kpi__n u-mono">{{ stats.contracts }}</span>
          <span class="kpi__l">{{ t('genero.kpi.contracts') }}</span>
        </div>
        <div class="kpi">
          <span class="kpi__n u-mono">{{ coveragePct }}%</span>
          <span class="kpi__l">{{ t('genero.kpi.coverage') }}</span>
        </div>
        <div class="kpi">
          <span class="kpi__n u-mono">{{ stats.buyers }}</span>
          <span class="kpi__l">{{ t('genero.kpi.buyers') }}</span>
        </div>
        <div class="kpi">
          <span class="kpi__n u-mono">{{ stats.suppliers }}</span>
          <span class="kpi__l">{{ t('genero.kpi.suppliers') }}</span>
        </div>
        <div class="kpi">
          <span class="kpi__n u-mono">{{ stats.discarded }}</span>
          <span class="kpi__l">{{ t('genero.kpi.discarded') }}</span>
        </div>
      </div>

      <p
        v-if="stats"
        class="updated u-mono"
      >
        {{ t('genero.updated', { date: fmtDate(stats.calculatedAt), n: stats.candidates }) }}
        <NuxtLink :to="localePath('/investigaciones/gasto-en-genero')">
          {{ t('genero.readInvestigation') }}
        </NuxtLink>
      </p>

      <!-- Llamados abiertos: the only actionable, time-sensitive block. -->
      <section
        v-if="stats?.openCalls?.length"
        class="block"
      >
        <h2 class="block__h">
          {{ t('genero.openCallsTitle') }}
        </h2>
        <ul class="calls">
          <li
            v-for="c in stats.openCalls"
            :key="c.compraId"
            class="calls__row"
          >
            <NuxtLink
              class="calls__link"
              :to="localePath(`/llamados/${c.compraId}`)"
            >
              <span class="calls__t">{{ c.title || `#${c.compraId}` }}</span>
              <span class="calls__b">{{ c.buyerName }}</span>
            </NuxtLink>
            <span class="calls__d u-mono">{{ t('genero.closes', { date: fmtDate(c.endDate) }) }}</span>
          </li>
        </ul>
      </section>

      <p
        v-if="alertHref"
        class="alertcta"
      >
        <v-btn
          :to="alertHref"
          variant="tonal"
          size="small"
          prepend-icon="mdi-bell-outline"
        >
          {{ t('genero.alertCta') }}
        </v-btn>
        <span class="alertcta__n">{{ t('genero.alertHelp') }}</span>
      </p>

      <!-- Novedades: what the weekly job saw for the first time. -->
      <section
        v-if="stats?.recent?.length"
        class="block"
      >
        <h2 class="block__h">
          {{ t('genero.recentTitle') }}
        </h2>
        <p class="block__note">
          {{ t('genero.recentNote', { n: stats.recent.length }) }}
        </p>
        <ul class="recent">
          <li
            v-for="c in stats.recent.slice(0, 10)"
            :key="c.ocid"
            class="recent__row"
          >
            <NuxtLink
              v-if="c.releaseId"
              class="recent__t"
              :to="localePath(`/contracts/${c.releaseId}`)"
            >
              {{ c.title || c.description || c.ocid }}
            </NuxtLink>
            <span
              v-else
              class="recent__t"
            >{{ c.title || c.description || c.ocid }}</span>
            <span class="recent__b">{{ c.buyerName }} · {{ c.sourceYear }}</span>
            <MoneyAmount
              :amount="c.hasAmount ? c.amount : null"
              size="sm"
            />
          </li>
        </ul>
      </section>

      <div class="charts">
        <ChartBlock
          :title="t('genero.byYearTitle')"
          :help="t('genero.byYearHelp')"
          :scroll="false"
        >
          <SpendBars :items="yearBars" />
        </ChartBlock>

        <ChartBlock
          :title="t('genero.byCategoryTitle')"
          :help="t('genero.byCategoryHelp')"
          :scroll="false"
        >
          <SpendBars :items="categoryBars" />
        </ChartBlock>
      </div>

      <section
        v-if="stats?.byBuyer?.length"
        class="block"
      >
        <h2 class="block__h">
          {{ t('genero.byBuyerTitle') }}
        </h2>
        <p class="block__note">
          {{ t('genero.byBuyerHelp') }}
        </p>
        <DataTable
          :columns="buyerCols"
          :rows="stats.byBuyer"
          :row-key="(r: any) => r.buyerId"
        >
          <template #cell:buyerName="{ row }">
            <button
              type="button"
              class="linkish"
              @click="buyerId = buyerId === row.buyerId ? '' : row.buyerId"
            >
              {{ row.buyerName || row.buyerId }}
            </button>
          </template>
          <template #cell:party="{ row }">
            <MandateChip
              :buyer-id="row.buyerId"
              :year="row.maxYear"
              :show-holder="false"
              size="x-small"
            />
          </template>
          <template #cell:contracts="{ row }">
            {{ row.contracts }}
          </template>
          <template #cell:share="{ row }">
            {{ bp(row.shareBp) }}
          </template>
          <template #cell:total="{ row }">
            <MoneyAmount
              :amount="row.total"
              size="sm"
            />
          </template>
        </DataTable>
      </section>

      <section
        v-if="stats?.bySupplier?.length"
        class="block"
      >
        <h2 class="block__h">
          {{ t('genero.bySupplierTitle') }}
        </h2>
        <p class="block__note">
          {{ t('genero.bySupplierHelp') }}
        </p>
        <DataTable
          :columns="supplierCols"
          :rows="stats.bySupplier.slice(0, 25)"
          :row-key="(r: any) => r.supplierId || r.name"
        >
          <template #cell:name="{ row }">
            <NuxtLink
              v-if="row.supplierId"
              :to="localePath(`/suppliers/${encodeURIComponent(row.supplierId)}`)"
            >
              {{ row.name }}
            </NuxtLink>
            <span v-else>{{ row.name }}</span>
          </template>
          <template #cell:buyers="{ row }">
            {{ row.buyers }}
          </template>
          <template #cell:contracts="{ row }">
            {{ row.contracts }}
          </template>
          <template #cell:total="{ row }">
            <MoneyAmount
              :amount="row.total"
              size="sm"
            />
          </template>
        </DataTable>
      </section>

      <!-- Party: normalised only, with the reason stated. -->
      <section
        v-if="stats?.byParty?.length"
        class="block"
      >
        <h2 class="block__h">
          {{ t('genero.byPartyTitle') }}
        </h2>
        <v-alert
          type="info"
          variant="tonal"
          density="compact"
          class="block__note"
        >
          {{ t('genero.byPartyCaveat') }}
        </v-alert>
        <ul class="parties">
          <li
            v-for="p in stats.byParty"
            :key="p.party"
            class="parties__row"
          >
            <button
              type="button"
              class="parties__btn"
              :class="{ 'parties__btn--on': party === p.party }"
              @click="party = party === p.party ? '' : p.party"
            >
              <span class="parties__name">{{ p.partyLabel }}</span>
              <span class="parties__meta u-mono">
                {{ t('genero.partyMeta', { orgs: p.organisms, contracts: p.contracts }) }}
              </span>
              <span class="parties__share u-mono">{{ bp(p.weightedShareBp) }}</span>
            </button>
          </li>
        </ul>
        <p class="block__note">
          {{ t('genero.byPartyMedian') }}
        </p>
      </section>

      <!-- The record itself -->
      <section class="block">
        <h2 class="block__h">
          {{ rejected ? t('genero.discardedTitle') : t('genero.contractsTitle') }}
        </h2>

        <div class="filters">
          <v-select
            v-model="year"
            :items="[{ title: t('genero.allYears'), value: '' }, ...years.map(y => ({ title: y, value: y }))]"
            :label="t('genero.col.year')"
            density="comfortable"
            variant="outlined"
            hide-details
          />
          <v-select
            v-model="category"
            :items="[
              { title: t('genero.allCategories'), value: '' },
              ...(stats?.byCategory ?? []).map((c: any) => ({ title: categoryLabel(c.category), value: c.category })),
            ]"
            :label="t('genero.col.category')"
            density="comfortable"
            variant="outlined"
            hide-details
          />
          <v-select
            v-model="sort"
            :items="[
              { title: t('genero.sort.amount'), value: 'amount' },
              { title: t('genero.sort.recent'), value: 'recent' },
              { title: t('genero.sort.year'), value: 'year' },
            ]"
            :label="t('genero.sortLabel')"
            density="comfortable"
            variant="outlined"
            hide-details
          />
          <v-switch
            v-model="rejected"
            :label="t('genero.showDiscarded')"
            color="primary"
            density="compact"
            hide-details
          />
        </div>

        <div
          v-if="activeFilters"
          class="chips"
        >
          <v-chip
            v-if="buyerId"
            closable
            size="small"
            @click:close="buyerId = ''"
          >
            {{ buyerName }}
          </v-chip>
          <v-chip
            v-if="party"
            closable
            size="small"
            @click:close="party = ''"
          >
            {{ party }}
          </v-chip>
          <v-btn
            variant="text"
            size="small"
            @click="clearFilters"
          >
            {{ t('genero.clearFilters') }}
          </v-btn>
        </div>

        <p class="block__note u-mono">
          {{ t('genero.resultCount', { n: totalRows }) }}
        </p>

        <v-progress-linear
          v-if="listPending"
          indeterminate
          color="accent"
        />

        <DataTable
          v-else
          :columns="contractCols"
          :rows="contracts"
          :row-key="(r: any) => r.ocid"
        >
          <template #cell:title="{ row }">
            <NuxtLink
              v-if="row.releaseId"
              :to="localePath(`/contracts/${row.releaseId}`)"
            >
              {{ row.title || row.description || row.ocid }}
            </NuxtLink>
            <span v-else>{{ row.title || row.description || row.ocid }}</span>
            <span
              v-if="row.description && row.title"
              class="rowsub"
            >{{ row.description }}</span>
            <span
              v-if="row.hits?.length"
              class="rowsub rowsub--terms u-mono"
            >{{ row.hits.map((h: any) => h.term).join(' · ') }}</span>
            <span
              v-if="row.ai?.reason"
              class="rowsub rowsub--why"
            >{{ row.ai.reason }}</span>
          </template>
          <template #cell:buyerName="{ row }">
            <span>{{ row.buyerName }}</span>
            <MandateChip
              :buyer-id="row.buyerId"
              :year="row.sourceYear"
              :show-holder="false"
              size="x-small"
            />
          </template>
          <template #cell:category="{ row }">
            {{ categoryLabel(row.category) }}
          </template>
          <template #cell:year="{ row }">
            {{ row.sourceYear ?? '—' }}
          </template>
          <template #cell:amount="{ row }">
            <MoneyAmount
              :amount="row.hasAmount ? row.amount : null"
              size="sm"
            />
          </template>
        </DataTable>

        <v-pagination
          v-if="totalPages > 1"
          v-model="page"
          :length="totalPages"
          :total-visible="7"
          class="pager"
        />
      </section>

      <!-- Method. Published because a topic recovered from free text is only
           auditable if the reader can attack one term without attacking the total. -->
      <section
        v-if="topic"
        class="block"
      >
        <h2 class="block__h">
          {{ t('genero.methodTitle') }}
        </h2>
        <p class="block__note">
          {{ t('genero.methodLead') }}
        </p>

        <v-expansion-panels variant="accordion">
          <v-expansion-panel :title="t('genero.termsIncluded', { n: topic.terms.length })">
            <template #text>
              <ul class="terms">
                <li
                  v-for="term in topic.terms"
                  :key="term.term"
                >
                  <code>{{ term.term }}</code>
                  <span class="terms__s">{{ t(`genero.strength.${term.strength}`) }}</span>
                  <span class="terms__n">{{ term.note }}</span>
                </li>
              </ul>
            </template>
          </v-expansion-panel>
          <v-expansion-panel :title="t('genero.termsRejected', { n: topic.rejectedTerms.length })">
            <template #text>
              <ul class="terms">
                <li
                  v-for="term in topic.rejectedTerms"
                  :key="term.term"
                >
                  <code>{{ term.term }}</code>
                  <span class="terms__n">{{ term.note }}</span>
                </li>
              </ul>
            </template>
          </v-expansion-panel>
          <v-expansion-panel :title="t('genero.catalogTitle', { n: topic.catalogCodes.length })">
            <template #text>
              <ul class="terms">
                <li
                  v-for="c in topic.catalogCodes"
                  :key="c.code"
                >
                  <code>{{ c.code }}</code>
                  <span class="terms__n">{{ c.name }}</span>
                </li>
              </ul>
            </template>
          </v-expansion-panel>
        </v-expansion-panels>

        <p class="source u-mono">
          {{ t('genero.sources') }}
          <a
            v-for="s in topic.sources"
            :key="s.url"
            :href="s.url"
            target="_blank"
            rel="noopener"
          >{{ s.label }}</a>
        </p>
      </section>
    </div>
  </div>
</template>

<style scoped lang="scss">
.hero {
  background: var(--ink);
  color: var(--paper);
  padding: var(--s-10) 0;
}

.hero__in { max-width: 46rem; }
.hero__eyebrow { font-size: var(--t-xs); opacity: 0.7; letter-spacing: 0.08em; text-transform: uppercase; }
.hero__title { font-family: var(--font-display); margin: var(--s-2) 0 var(--s-3); }
.hero__dek { opacity: 0.85; }

.page { padding: var(--s-8) 0 var(--s-12); }
.caveat { margin-bottom: var(--s-5); }

.kpis {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 11rem), 1fr));
  gap: var(--s-3);
  margin-bottom: var(--s-3);
}

.kpi {
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
  background: var(--surface);
  padding: var(--s-4);
  min-width: 0;
}

.kpi__n { display: block; font-size: var(--t-xl); font-weight: 700; }
.kpi__l { display: block; font-size: var(--t-xs); color: var(--text-muted); margin-top: var(--s-1); }

.updated { font-size: var(--t-xs); color: var(--text-muted); margin-bottom: var(--s-4); }
.alertcta { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s-3); margin-bottom: var(--s-6); }
.alertcta__n { font-size: var(--t-xs); color: var(--text-muted); }
.updated a { margin-left: var(--s-2); }

.block { margin-bottom: var(--s-7); }
.block__h { font-family: var(--font-display); font-size: var(--t-lg); margin-bottom: var(--s-3); }
.block__note { font-size: var(--t-sm); color: var(--text-muted); margin-bottom: var(--s-3); max-width: 70ch; }

.charts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr));
  gap: var(--s-4);
  margin-bottom: var(--s-7);
}

.calls, .recent, .parties {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--s-2);
}

.calls__row, .recent__row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--s-2) var(--s-3);
  border: 1px solid var(--rule);
  border-radius: var(--r-md);
  background: var(--surface);
  padding: var(--s-3);
}

.calls__link { flex: 1 1 20rem; min-width: 0; }
.calls__t { display: block; font-weight: 600; font-size: var(--t-sm); }
.calls__b, .recent__b { display: block; font-size: var(--t-xs); color: var(--text-muted); }
.calls__d { font-size: var(--t-xs); }
.recent__t { flex: 1 1 22rem; min-width: 0; font-size: var(--t-sm); font-weight: 600; }

.parties__btn {
  width: 100%;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--s-3);
  border: 1px solid var(--rule);
  border-radius: var(--r-md);
  background: var(--surface);
  padding: var(--s-3);
  text-align: left;
  cursor: pointer;
  color: inherit;
  font: inherit;
}

.parties__btn:hover { background: var(--surface-sunken); }
.parties__btn--on { border-color: var(--celeste-deep); }
.parties__name { flex: 1 1 12rem; font-weight: 600; }
.parties__meta { font-size: var(--t-xs); color: var(--text-muted); }
.parties__share { font-weight: 700; }

.filters {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 13rem), 1fr));
  gap: var(--s-3);
  margin-bottom: var(--s-3);
  align-items: center;
}

.chips { display: flex; flex-wrap: wrap; gap: var(--s-2); margin-bottom: var(--s-3); align-items: center; }

.linkish {
  background: none;
  border: 0;
  padding: 0;
  font: inherit;
  color: var(--celeste-deep);
  cursor: pointer;
  text-align: left;
}

.rowsub { display: block; font-size: var(--t-xs); color: var(--text-muted); }
.rowsub--why { font-style: italic; }
.rowsub--terms { color: var(--celeste-deep); }

.terms { margin: 0; padding-left: var(--s-4); font-size: var(--t-sm); }
.terms li { margin-bottom: var(--s-2); }
.terms code { font-family: var(--font-mono); background: var(--surface-sunken); padding: 0 var(--s-1); border-radius: var(--r-sm); }
.terms__s { font-size: var(--t-xs); color: var(--text-muted); margin-left: var(--s-2); text-transform: uppercase; letter-spacing: 0.04em; }
.terms__n { display: block; color: var(--text-muted); }

.pager { margin-top: var(--s-5); }
.source { margin-top: var(--s-5); font-size: var(--t-xs); color: var(--text-muted); }
.source a { margin-left: var(--s-3); }
</style>
