<script setup lang="ts">
/**
 * Funcionarios declarados omisos — JUTEP's public roster.
 *
 * Officials formally declared delinquent in their duty to file the sworn declaration of assets and
 * income (Ley 17.060 arts. 10, 11 and 13). Art. 18 makes the CONTENT of a declaration confidential;
 * the fact of the omission is required to be published in the Diario Oficial by art. 13, and JUTEP
 * itself publishes this roster as open data. This page mirrors that roster and nothing else — no
 * declaration content, no assets, no income — and the cédula is masked to its last three digits.
 *
 * It sits beside the procurement signals because it answers the same question from the other side:
 * the señales page measures how a body BUYS, this one records who inside it did not declare.
 */
import type { DataColumn } from '~/components/DataTable.vue'

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const router = useRouter()

const search = ref((route.query.search as string) ?? '')
const organismo = ref((route.query.organismo as string) ?? '')
const page = ref(Number(route.query.page ?? 1))
const ITEMS_PER_PAGE = 50

watch([search, organismo], () => {
  page.value = 1
})
watch([search, organismo, page], () => {
  const q: Record<string, string> = {}
  if (search.value) q.search = search.value
  if (organismo.value) q.organismo = organismo.value
  if (page.value > 1) q.page = String(page.value)
  router.replace({ query: q })
})

const { data: res, pending } = await useFetch<any>('/api/analytics/omisos', {
  query: computed(() => ({
    page: page.value,
    limit: ITEMS_PER_PAGE,
    ...(search.value.trim().length >= 3 ? { search: search.value.trim() } : {}),
    ...(organismo.value ? { organismo: organismo.value } : {}),
  })),
})

const omisos = computed<any[]>(() => res.value?.data?.omisos ?? [])
const byOrganism = computed<any[]>(() => res.value?.data?.byOrganism ?? [])
const byYear = computed<any[]>(() => res.value?.data?.byYear ?? [])
const meta = computed<any>(() => res.value?.data?.meta ?? null)
const totalPages = computed<number>(() => res.value?.data?.pagination?.totalPages ?? 1)

const peakYear = computed(() => {
  let best: any = null
  for (const y of byYear.value) if (!best || y.count > best.count) best = y
  return best
})

// The person is the record, so it heads the card on a phone.
const cols = computed<DataColumn[]>(() => [
  { key: 'displayName', label: t('omisos.col.name'), primary: true },
  { key: 'cargo', label: t('omisos.col.cargo') },
  { key: 'organismo', label: t('omisos.col.organismo') },
  { key: 'fechaOmision', label: t('omisos.col.fecha'), mono: true, width: '11rem' },
])

function formatDate(value?: string | Date | null): string {
  if (!value) return '—'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return `${String(date.getUTCDate()).padStart(2, '0')}/${String(date.getUTCMonth() + 1).padStart(2, '0')}/${date.getUTCFullYear()}`
}

useSeo(() => ({
  title: t('seo.omisos.title'),
  description: t('seo.omisos.description'),
  path: '/analytics/omisos',
  kicker: 'Análisis',
}))
</script>

<template>
  <div class="omi">
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
            {{ t('omisos.title') }}
          </h1>
          <p class="hero__dek">
            {{ t('omisos.lead') }}
          </p>
        </div>
      </div>
    </v-sheet>

    <div class="u-container page">
      <!-- The legal basis is the reason this can be published at all, so it leads. -->
      <v-alert
        type="info"
        variant="tonal"
        density="comfortable"
        class="caveat"
      >
        {{ t('omisos.legal') }}
      </v-alert>

      <div
        v-if="meta"
        class="kpis"
      >
        <div class="kpi">
          <span class="kpi__n u-mono">{{ meta.grandTotal }}</span>
          <span class="kpi__l">{{ t('omisos.kpi.total') }}</span>
        </div>
        <div
          v-if="peakYear"
          class="kpi"
        >
          <span class="kpi__n u-mono">{{ peakYear.year }}</span>
          <span class="kpi__l">{{ t('omisos.kpi.peak', { n: peakYear.count }) }}</span>
        </div>
        <div class="kpi">
          <span class="kpi__n u-mono">{{ byOrganism.length }}</span>
          <span class="kpi__l">{{ t('omisos.kpi.organisms') }}</span>
        </div>
      </div>

      <section
        v-if="byOrganism.length"
        class="block"
      >
        <h2 class="block__h">
          {{ t('omisos.byOrganismTitle') }}
        </h2>
        <ul class="orgs">
          <li
            v-for="row in byOrganism"
            :key="row.organismo ?? 'sin-organismo'"
            class="orgs__row"
          >
            <button
              type="button"
              class="orgs__btn"
              @click="organismo = organismo === row.organismo ? '' : row.organismo"
            >
              <span class="orgs__name u-truncate">{{ row.organismo ?? t('omisos.unknownOrganism') }}</span>
              <span class="orgs__n u-mono">{{ row.count }}</span>
            </button>
          </li>
        </ul>
      </section>

      <div class="filters">
        <v-text-field
          v-model="search"
          :label="t('omisos.searchLabel')"
          :hint="t('omisos.searchHint')"
          density="comfortable"
          variant="outlined"
          clearable
          persistent-hint
        />
        <v-chip
          v-if="organismo"
          closable
          @click:close="organismo = ''"
        >
          {{ organismo }}
        </v-chip>
      </div>

      <!-- `<PaginatedList>` + `<DataTable>`, not a hand-rolled table and pager:
           the roster is a record directory, so it reflows to one card per person
           on a phone, and both pagers plus the return-to-results anchor come from
           the shared component. -->
      <PaginatedList
        v-model:page="page"
        :total-pages="totalPages"
      >
        <v-progress-linear
          v-if="pending"
          indeterminate
          color="accent"
        />

        <DataTable
          v-else
          :columns="cols"
          :rows="omisos"
          :row-key="(o: any, i: number) => `${o.displayName}-${i}`"
          min-width="560px"
        >
          <template #cell:displayName="{ row }">
            <span class="rows__name">{{ row.displayName }}</span>
            <span
              v-if="row.documentoMasked"
              class="rows__doc u-mono"
            >{{ row.documentoMasked }}</span>
          </template>

          <template #cell:cargo="{ row }">
            <span class="rows__cargo">{{ row.cargo ?? '—' }}</span>
          </template>

          <template #cell:organismo="{ row }">
            <NuxtLink
              v-if="row.incisoCode"
              :to="localePath(`/analytics/senales`)"
              class="rows__org"
            >{{ row.organismo ?? '—' }}</NuxtLink>
            <span v-else>{{ row.organismo ?? '—' }}</span>
          </template>

          <template #cell:fechaOmision="{ row }">
            {{ formatDate(row.fechaOmision) }}
          </template>
        </DataTable>
      </PaginatedList>

      <p
        v-if="meta"
        class="source u-mono"
      >
        {{ t('omisos.source') }}
        <a
          :href="meta.sourceUrl"
          target="_blank"
          rel="noopener"
        >catalogodatos.gub.uy</a>
      </p>
    </div>
  </div>
</template>

<style scoped lang="scss">
.hero {
  background: var(--ink);
  color: var(--paper);
  /* The scale stops at `--s-9`. This named `--s-10`, so the declaration was
     invalid and the hero shipped with no padding at all. */
  padding-block: var(--s-7) var(--s-6);
}

.hero__in { max-width: 46rem; }
.hero__eyebrow { font-size: var(--t-xs); opacity: 0.7; letter-spacing: 0.08em; text-transform: uppercase; }
.hero__title { font-family: var(--font-display); margin: var(--s-2) 0 var(--s-3); }
.hero__dek { opacity: 0.85; }

/* `padding-block`, never the `padding` shorthand — see `.u-container` in
   main.scss: a shorthand here wipes the site gutter on mobile. The scale
   stops at `--s-9`; the `--s-12` this used to name does not exist, so the
   whole declaration was invalid and the page opened welded to the hero. */
.page { padding-block: var(--s-8) var(--s-9); }
.caveat { margin-bottom: var(--s-5); }

.kpis {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr));
  gap: var(--s-3);
  margin-bottom: var(--s-6);
}

.kpi {
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
  background: var(--surface);
  padding: var(--s-4);
}

.kpi__n { display: block; font-size: var(--t-xl); font-weight: 700; }
.kpi__l { display: block; font-size: var(--t-xs); color: var(--text-muted); }

.block { margin-bottom: var(--s-6); }
.block__h { font-family: var(--font-display); font-size: var(--t-lg); margin-bottom: var(--s-3); }

.orgs {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr));
  gap: var(--s-2);
}

.orgs__btn {
  width: 100%;
  display: flex;
  align-items: baseline;
  gap: var(--s-3);
  border: 1px solid var(--rule);
  border-radius: var(--r-md);
  background: var(--surface);
  padding: var(--s-2) var(--s-3);
  text-align: left;
  cursor: pointer;
  color: inherit;
  font: inherit;
}

.orgs__btn:hover { background: var(--surface-sunken); }
.orgs__name { flex: 1; min-width: 0; font-size: var(--t-sm); }
.orgs__n { font-weight: 600; }

.filters { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s-3); margin-bottom: var(--s-4); }
.filters > :first-child { flex: 1 1 20rem; }

/* `<DataTable>` owns the frame, the scroll box and the card reflow. Only the
   cell contents are styled here. */
.rows__name { display: block; font-weight: 600; }
.rows__doc { display: block; font-size: var(--t-xs); color: var(--text-muted); }
.rows__cargo { color: var(--text-muted); }
.rows__org { color: inherit; }

.source { margin-top: var(--s-5); font-size: var(--t-xs); color: var(--text-muted); }
</style>
