<script setup lang="ts">
/**
 * "¿Cuánta competencia hay?" — oferente único por organismo.
 *
 * El oferente único es la señal más citada de compra pública capturada, y hasta ahora
 * acá era imposible: el feed OCDS no publica oferentes y el acta en PDF los enumera en
 * ~8% de los casos. La ficha HTML del gobierno sí (medido: 30/30 adjudicaciones de cinco
 * años distintos), y esta página agrega eso.
 *
 * LA COBERTURA ES PARTE DEL DATO, NO UNA NOTA AL PIE. El scraper avanza de a tandas por
 * noche, así que lo mirado es parcial y desigual entre organismos. Por eso cada fila
 * muestra sondeadas/universo al lado del porcentaje, y los organismos con muestra
 * insuficiente NO aparecen con un porcentaje inventado: quedan detrás del filtro
 * "incluir muestras chicas", rotulados. Sin eso, esta página repetiría exactamente la
 * trampa del "% de compra directa", donde el organismo menos mirado sale más limpio.
 */
const { t } = useI18n()
const localePath = useLocalePath()

const page = ref(1)
const sortBy = ref<'sole' | 'competition' | 'coverage' | 'probed' | 'avg'>('sole')
const search = ref('')
const includeSmall = ref(false)

const { data, pending } = await useFetch<{
  data: {
    rows: Array<{
      buyerId: string
      buyerName: string | null
      universe: number
      probed: number
      withBidders: number
      soleBidder: number
      soleRate: number | null
      avgBidders: number | null
      coverage: number
      conclusive: boolean
    }>
    pagination: { page: number, limit: number, total: number, pages: number }
    totals: { probed: number, withBidders: number, sole: number, soleRate: number | null, avgBidders: number | null }
    calculatedAt: string | null
  }
}>(() => `/api/analytics/competencia?page=${page.value}&sortBy=${sortBy.value}&search=${encodeURIComponent(search.value)}${includeSmall.value ? '&all=1' : ''}`)

const rows = computed(() => data.value?.data?.rows ?? [])
const totals = computed(() => data.value?.data?.totals ?? null)
const pagination = computed(() => data.value?.data?.pagination ?? null)

const pct = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}%`)

const sortOptions = computed(() => ([
  { value: 'sole', title: t('competencia.sort.sole') },
  { value: 'competition', title: t('competencia.sort.competition') },
  { value: 'coverage', title: t('competencia.sort.coverage') },
  { value: 'probed', title: t('competencia.sort.probed') },
  { value: 'avg', title: t('competencia.sort.avg') },
]))

// Cualquier cambio de filtro vuelve a la primera página: quedarse en la 7 de un
// listado que ahora tiene 2 muestra la tabla vacía y parece que no hay datos.
watch([sortBy, search, includeSmall], () => {
  page.value = 1
})

const orgLd = useOrgLd()
useSeo(() => ({
  title: t('seo.competencia.title'),
  description: t('seo.competencia.description'),
  path: '/analytics/competencia',
  kicker: 'Análisis',
  jsonLd: {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    'name': t('seo.competencia.title'),
    'description': t('seo.competencia.description'),
    'publisher': orgLd,
  },
}))
</script>

<template>
  <div>
    <section class="chero">
      <v-container class="chero__in u-container">
        <p class="u-eyebrow">
          {{ t('competencia.eyebrow') }}
        </p>
        <h1 class="chero__title">
          {{ t('competencia.title') }}
        </h1>
        <p class="chero__lead">
          {{ t('competencia.lead') }}
        </p>
      </v-container>
    </section>

    <v-container class="u-container comp__body">
      <!-- Totales de lo efectivamente mirado -->
      <section
        v-if="totals"
        class="mb-6"
      >
        <v-row dense>
          <v-col
            cols="6"
            md="3"
          >
            <div class="kpi">
              <span class="kpi__v u-mono">{{ formatNumber(totals.probed) }}</span>
              <span class="kpi__l">{{ t('competencia.kpi.probed') }}</span>
            </div>
          </v-col>
          <v-col
            cols="6"
            md="3"
          >
            <div class="kpi">
              <span class="kpi__v u-mono">{{ formatNumber(totals.withBidders) }}</span>
              <span class="kpi__l">{{ t('competencia.kpi.withBidders') }}</span>
            </div>
          </v-col>
          <v-col
            cols="6"
            md="3"
          >
            <div class="kpi kpi--alert">
              <span class="kpi__v u-mono">{{ pct(totals.soleRate) }}</span>
              <span class="kpi__l">{{ t('competencia.kpi.soleRate') }}</span>
            </div>
          </v-col>
          <v-col
            cols="6"
            md="3"
          >
            <div class="kpi">
              <span class="kpi__v u-mono">{{ totals.avgBidders ? totals.avgBidders.toFixed(1) : '—' }}</span>
              <span class="kpi__l">{{ t('competencia.kpi.avg') }}</span>
            </div>
          </v-col>
        </v-row>
      </section>

      <!-- El aviso de cobertura va ARRIBA de la tabla, no al pie -->
      <v-card class="cov mb-6">
        <p class="cov__badge">
          <v-icon size="15">
            mdi-progress-clock
          </v-icon>
          {{ t('competencia.coverageTitle') }}
        </p>
        <p class="cov__body">
          {{ t('competencia.coverageBody') }}
        </p>
      </v-card>

      <section class="mb-6">
        <div class="comp__controls">
          <v-select
            v-model="sortBy"
            :items="sortOptions"
            item-title="title"
            item-value="value"
            :label="t('competencia.sortLabel')"
            density="compact"
            variant="outlined"
            hide-details
            class="comp__sort"
          />
          <v-text-field
            v-model="search"
            :label="t('competencia.searchLabel')"
            density="compact"
            variant="outlined"
            hide-details
            clearable
            prepend-inner-icon="mdi-magnify"
            class="comp__search"
          />
          <v-switch
            v-model="includeSmall"
            :label="t('competencia.includeSmall')"
            density="compact"
            hide-details
            color="primary"
            class="comp__switch"
          />
        </div>

        <v-card
          border
          class="comp__tablewrap"
        >
          <table class="comp__table">
            <thead>
              <tr>
                <th class="comp__th">
                  {{ t('competencia.colBuyer') }}
                </th>
                <th class="comp__th comp__th--num">
                  {{ t('competencia.colSole') }}
                </th>
                <th class="comp__th comp__th--num">
                  {{ t('competencia.colAvg') }}
                </th>
                <th class="comp__th comp__th--num">
                  {{ t('competencia.colSample') }}
                </th>
                <th class="comp__th comp__th--num">
                  {{ t('competencia.colCoverage') }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="r in rows"
                :key="r.buyerId"
              >
                <td
                  class="comp__td comp__td--buyer"
                  :data-label="t('competencia.colBuyer')"
                >
                  <NuxtLink :to="localePath(`/buyers/${encodeURIComponent(r.buyerId)}`)">
                    {{ r.buyerName || r.buyerId }}
                  </NuxtLink>
                </td>
                <td
                  class="comp__td comp__td--num"
                  :data-label="t('competencia.colSole')"
                >
                  <span
                    v-if="r.soleRate != null"
                    class="comp__rate"
                    :class="{ 'comp__rate--high': r.soleRate >= 0.5 }"
                  >{{ pct(r.soleRate) }}</span>
                  <span
                    v-else
                    class="comp__nodata"
                  >{{ t('competencia.notConclusive') }}</span>
                </td>
                <td
                  class="comp__td comp__td--num u-mono"
                  :data-label="t('competencia.colAvg')"
                >
                  {{ r.avgBidders ? r.avgBidders.toFixed(1) : '—' }}
                </td>
                <td
                  class="comp__td comp__td--num u-mono"
                  :data-label="t('competencia.colSample')"
                >
                  {{ formatNumber(r.soleBidder) }} / {{ formatNumber(r.withBidders) }}
                </td>
                <td
                  class="comp__td comp__td--num u-mono"
                  :data-label="t('competencia.colCoverage')"
                >
                  {{ pct(r.coverage) }}
                  <span class="comp__cov">{{ formatNumber(r.probed) }}/{{ formatNumber(r.universe) }}</span>
                </td>
              </tr>
              <tr v-if="!rows.length && !pending">
                <td
                  class="comp__td comp__empty"
                  colspan="5"
                >
                  {{ t('competencia.empty') }}
                </td>
              </tr>
            </tbody>
          </table>
        </v-card>

        <div
          v-if="pagination && pagination.pages > 1"
          class="comp__pager"
        >
          <v-btn
            :disabled="page <= 1"
            variant="text"
            size="small"
            @click="page = Math.max(1, page - 1)"
          >
            {{ t('competencia.prev') }}
          </v-btn>
          <span class="u-mono comp__pagelabel">{{ page }} / {{ pagination.pages }}</span>
          <v-btn
            :disabled="page >= pagination.pages"
            variant="text"
            size="small"
            @click="page = Math.min(pagination.pages, page + 1)"
          >
            {{ t('competencia.next') }}
          </v-btn>
        </div>
      </section>

      <section class="comp__method">
        <h2 class="comp__h">
          {{ t('competencia.methodTitle') }}
        </h2>
        <ul class="comp__methodlist">
          <li>{{ t('competencia.method1') }}</li>
          <li>{{ t('competencia.method2') }}</li>
          <li>{{ t('competencia.method3') }}</li>
          <li>{{ t('competencia.method4') }}</li>
        </ul>
      </section>
    </v-container>
  </div>
</template>

<style scoped>
.chero { border-bottom: 1px solid var(--rule); padding: var(--s-7) 0 var(--s-6); }
.chero__in { padding-block: 0; }
.chero__title { font-size: clamp(1.7rem, 6vw, var(--t-3xl)); line-height: 1.1; margin: var(--s-2) 0 var(--s-3); }
.chero__lead { font-size: var(--t-lg); line-height: 1.5; max-width: 66ch; color: var(--text-muted); }
.comp__body { padding-block: var(--s-6) var(--s-8); }
.comp__h { font-size: var(--t-xl); margin: 0 0 var(--s-2); }

.kpi { display: flex; flex-direction: column; gap: 2px; padding: var(--s-3); border: 1px solid var(--rule); border-radius: var(--r-md); height: 100%; }
.kpi__v { font-size: var(--t-xl); font-weight: 700; }
.kpi__l { font-size: var(--t-xs); color: var(--text-muted); line-height: 1.3; }
.kpi--alert .kpi__v { color: var(--alerta); }

.cov { border: 2px solid var(--celeste); border-radius: var(--r-lg); padding: var(--s-4); background: var(--celeste-wash); }
.cov__badge {
  display: inline-flex; align-items: center; gap: var(--s-1); margin: 0 0 var(--s-2);
  font-family: var(--font-mono); font-size: var(--t-xs); text-transform: uppercase;
  letter-spacing: 0.05em; color: var(--celeste-deep); font-weight: 700;
}
.cov__body { margin: 0; line-height: 1.6; font-size: var(--t-sm); max-width: 88ch; }

.comp__controls { display: flex; flex-wrap: wrap; gap: var(--s-3); align-items: center; margin-bottom: var(--s-4); }
.comp__sort { max-width: 260px; }
.comp__search { max-width: 320px; }
.comp__switch { flex: 0 0 auto; }

.comp__tablewrap { overflow-x: auto; }
.comp__table { width: 100%; border-collapse: collapse; }
.comp__th {
  text-align: left; padding: var(--s-2) var(--s-3); background: var(--surface-sunken);
  font-family: var(--font-mono); font-size: var(--t-xs); text-transform: uppercase;
  letter-spacing: 0.04em; color: var(--text-muted); font-weight: 500; white-space: nowrap;
}
.comp__th--num { text-align: right; }
.comp__td { padding: var(--s-2) var(--s-3); border-top: 1px solid var(--rule); font-size: var(--t-sm); }
.comp__td--num { text-align: right; white-space: nowrap; }
.comp__td--buyer a { color: var(--text); text-decoration: none; }
.comp__td--buyer a:hover { color: var(--celeste-deep); text-decoration: underline; }
.comp__rate { font-family: var(--font-mono); font-weight: 700; }
.comp__rate--high { color: var(--alerta); }
.comp__nodata { font-size: var(--t-xs); color: var(--text-muted); font-style: italic; }
.comp__cov { display: block; font-size: 10px; color: var(--text-muted); }
.comp__empty { text-align: center; color: var(--text-muted); padding: var(--s-5); }

.comp__pager { display: flex; align-items: center; justify-content: center; gap: var(--s-3); margin-top: var(--s-3); }
.comp__pagelabel { font-size: var(--t-xs); color: var(--text-muted); }

.comp__methodlist { max-width: 82ch; padding-left: var(--s-4); }
.comp__methodlist li { line-height: 1.6; margin-bottom: var(--s-2); font-size: var(--t-sm); }

@media (max-width: 760px) {
  .comp__tablewrap { overflow-x: visible; }
  .comp__table, .comp__table tbody, .comp__table tr, .comp__table td { display: block; width: 100%; }
  .comp__table thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); }
  .comp__table tr { border: 1px solid var(--rule); border-radius: var(--r-md); margin-bottom: var(--s-3); padding: var(--s-2) var(--s-3); }
  .comp__td { border-top: 0; display: flex; justify-content: space-between; gap: var(--s-3); padding: var(--s-1) 0; text-align: right; }
  .comp__td::before {
    content: attr(data-label);
    font-family: var(--font-mono); font-size: var(--t-xs); text-transform: uppercase;
    letter-spacing: 0.04em; color: var(--text-muted); text-align: left; flex: 0 0 auto;
  }
  .comp__td--buyer { font-weight: 700; }
  .comp__cov { display: inline; margin-left: var(--s-1); }
}
</style>
