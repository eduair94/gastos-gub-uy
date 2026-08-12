<script setup lang="ts">
/**
 * Proveedores del Estado sancionados por Defensa del Consumidor.
 *
 * Reads the precomputed `udeco_supplier_stats` cross-reference. Nothing is joined on the request
 * path — see the endpoint for why the RUT match needs a 12-digit normalisation.
 *
 * FRAMING, which this page must never soften: a UDECO sanction is about how the firm treated
 * CONSUMERS. It says nothing about whether any public contract was irregular, and this page must
 * not be read as alleging that. What it shows is narrower and entirely factual — the State's own
 * consumer agency fined this firm, and the State keeps buying from it.
 */
const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const router = useRouter()

const NuxtLinkComponent = resolveComponent('NuxtLink')

const sort = ref((route.query.sort as string) ?? 'spend')
const search = ref((route.query.search as string) ?? '')
const onlyFines = ref(route.query.onlyFines === 'true')
const page = ref(Number(route.query.page ?? 1))
const ITEMS_PER_PAGE = 25

watch([sort, search, onlyFines], () => {
  page.value = 1
})
watch([sort, search, onlyFines, page], () => {
  const q: Record<string, string> = {}
  if (sort.value !== 'spend') q.sort = sort.value
  if (search.value) q.search = search.value
  if (onlyFines.value) q.onlyFines = 'true'
  if (page.value > 1) q.page = String(page.value)
  router.replace({ query: q })
})

const { data: res, pending, error } = await useFetch<any>('/api/analytics/sanciones', {
  query: computed(() => ({
    page: page.value,
    limit: ITEMS_PER_PAGE,
    sortBy: sort.value,
    ...(search.value.trim().length >= 3 ? { search: search.value.trim() } : {}),
    ...(onlyFines.value ? { onlyFines: 'true' } : {}),
  })),
})

const firms = computed<any[]>(() => res.value?.data?.firms ?? [])
const meta = computed<any>(() => res.value?.data?.meta ?? null)
const totalPages = computed<number>(() => res.value?.data?.pagination?.totalPages ?? 1)

const SORT_ITEMS = computed(() => [
  { value: 'spend', title: t('sanciones.sort.spend') },
  { value: 'sanctions', title: t('sanciones.sort.sanctions') },
  { value: 'fines', title: t('sanciones.sort.fines') },
  { value: 'recent', title: t('sanciones.sort.recent') },
])

function formatDate(value?: string | Date | null): string {
  if (!value) return '—'
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`
}

/** The firm's contracts in the explorer, by the name the procurement corpus uses. */
function contractsLink(firm: any): string | null {
  const name = firm?.supplierName
  return name ? localePath(`/contracts?suppliers=${encodeURIComponent(name)}`) : null
}

useSeo(() => ({
  title: t('seo.sanciones.title'),
  description: t('seo.sanciones.description'),
  path: '/analytics/sanciones',
  kicker: 'Análisis',
}))
</script>

<template>
  <div class="san">
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
            {{ t('sanciones.title') }}
          </h1>
          <p class="hero__dek">
            {{ t('sanciones.lead') }}
          </p>
        </div>
      </div>
    </v-sheet>

    <div class="u-container page">
      <!-- The contract under which these numbers are published. Stays above the list. -->
      <v-alert
        type="info"
        variant="tonal"
        density="comfortable"
        class="caveat"
      >
        {{ t('sanciones.caveat') }}
      </v-alert>

      <div
        v-if="meta"
        class="kpis"
      >
        <div class="kpi">
          <span class="kpi__n u-mono">{{ meta.sellingToState }}</span>
          <span class="kpi__l">{{ t('sanciones.kpi.firms', { total: meta.sanctionedFirmsTotal }) }}</span>
        </div>
        <div class="kpi">
          <MoneyAmount
            :amount="meta.totalStateUyu"
            currency="UYU"
            compact
          />
          <span class="kpi__l">{{ t('sanciones.kpi.spend') }}</span>
        </div>
        <div class="kpi">
          <span class="kpi__n u-mono">{{ meta.totalSanctions }}</span>
          <span class="kpi__l">{{ t('sanciones.kpi.sanctions') }}</span>
        </div>
        <div class="kpi">
          <span class="kpi__n u-mono">{{ Math.round(meta.totalUr) }} UR</span>
          <span class="kpi__l">{{ t('sanciones.kpi.fines') }}</span>
        </div>
      </div>

      <div class="filters">
        <v-select
          v-model="sort"
          :items="SORT_ITEMS"
          :label="t('sanciones.sortLabel')"
          density="comfortable"
          variant="outlined"
          hide-details
        />
        <v-text-field
          v-model="search"
          :label="t('sanciones.searchLabel')"
          density="comfortable"
          variant="outlined"
          clearable
          hide-details
        />
        <v-checkbox
          v-model="onlyFines"
          :label="t('sanciones.onlyFines')"
          density="comfortable"
          hide-details
        />
      </div>

      <v-alert
        v-if="error"
        type="warning"
        variant="tonal"
      >
        {{ t('sanciones.notComputed') }}
      </v-alert>

      <v-progress-linear
        v-else-if="pending"
        indeterminate
        color="accent"
      />

      <ul
        v-else
        class="firms"
      >
        <li
          v-for="f in firms"
          :key="f.rut"
          class="firms__row"
        >
          <div class="firms__head">
            <component
              :is="contractsLink(f) ? NuxtLinkComponent : 'span'"
              :to="contractsLink(f) ?? undefined"
              class="firms__name"
            >
              {{ f.supplierName ?? f.razonSocial }}
            </component>
            <span
              v-if="f.nombreComercial && f.nombreComercial !== f.razonSocial"
              class="firms__alias"
            >{{ f.nombreComercial }}</span>
            <span class="firms__rut u-mono">{{ f.rut }}</span>
            <MoneyAmount
              :amount="f.totalUyu"
              currency="UYU"
              compact
              size="sm"
            />
          </div>

          <p class="firms__meta u-mono">
            {{ t('sanciones.row.contracts', { n: f.contracts, buyers: f.buyers }) }}
            · {{ t('sanciones.row.sanctions', { n: f.sanctions, ur: Math.round(f.totalUr) }) }}
            · {{ t('sanciones.row.last', { date: formatDate(f.lastSanctionAt) }) }}
          </p>

          <ul class="motivos">
            <li
              v-for="m in f.motivos.slice(0, 6)"
              :key="m"
              class="motivos__item"
            >
              {{ m }}
            </li>
          </ul>
        </li>
      </ul>

      <v-pagination
        v-if="totalPages > 1"
        v-model="page"
        :length="totalPages"
        :total-visible="7"
        class="pager"
      />

      <p
        v-if="meta"
        class="source u-mono"
      >
        {{ t('sanciones.source') }}
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
.hero { background: var(--ink); color: var(--paper); padding: var(--s-10) 0; }
.hero__in { max-width: 46rem; }
.hero__eyebrow { font-size: var(--t-xs); opacity: 0.7; letter-spacing: 0.08em; text-transform: uppercase; }
.hero__title { font-family: var(--font-display); margin: var(--s-2) 0 var(--s-3); }
.hero__dek { opacity: 0.85; }

.page { padding: var(--s-8) 0 var(--s-12); }
.caveat { margin-bottom: var(--s-5); }

.kpis {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr));
  gap: var(--s-3);
  margin-bottom: var(--s-6);
}

.kpi { border: 1px solid var(--rule); border-radius: var(--r-lg); background: var(--surface); padding: var(--s-4); }
.kpi__n { display: block; font-size: var(--t-xl); font-weight: 700; }
.kpi__l { display: block; font-size: var(--t-xs); color: var(--text-muted); }

.filters { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s-3); margin-bottom: var(--s-4); }
.filters > :first-child { min-width: 14rem; }
.filters > :nth-child(2) { flex: 1 1 18rem; }

.firms { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--s-3); }

.firms__row {
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
  background: var(--surface);
  padding: var(--s-4);
}

.firms__head { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--s-3); }
.firms__name { font-weight: 600; color: inherit; text-decoration: none; }
a.firms__name:hover { text-decoration: underline; }
.firms__alias { font-size: var(--t-sm); color: var(--text-muted); }
.firms__rut { font-size: var(--t-xs); color: var(--text-muted); }
.firms__meta { margin: var(--s-2) 0 0; font-size: var(--t-xs); color: var(--text-muted); }

.motivos { list-style: none; margin: var(--s-2) 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--s-2); }

.motivos__item {
  border: 1px solid var(--rule);
  border-radius: var(--r-sm);
  padding: 2px var(--s-2);
  font-size: var(--t-xs);
  color: var(--text-muted);
}

.pager { margin-top: var(--s-6); }
.source { margin-top: var(--s-5); font-size: var(--t-xs); color: var(--text-muted); }
</style>
