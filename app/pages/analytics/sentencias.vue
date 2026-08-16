<script setup lang="ts">
/**
 * Lo que el Estado presupuesta y paga por perder juicios.
 *
 * Lee `judicial_spending`, que arma src/jobs/load-judicial-spending.ts desde el crédito
 * presupuestal de OPP. La taxonomía de qué objeto del gasto cuenta vive en
 * shared/judicial-objects.ts.
 *
 * TRES COSAS QUE ESTA PÁGINA NO PUEDE SUAVIZAR:
 *
 *  1. El titular es el CRÉDITO VIGENTE, no el ejecutado. Los archivos de 2019, 2020 y 2021 no
 *     publican ejecución para ninguna fila. Cada cifra dice cuál de las dos es.
 *  2. Los años parciales se marcan en la propia barra. 2013-2015 y 2017-2018 traen 3 a 10
 *     organismos contra los 28-34 de un año completo, y sin la marca la serie dibuja un derrumbe
 *     del gasto que nunca pasó.
 *  3. El presupuesto no nombra causas ni personas. Ninguna cifra de acá dice a quién indemnizó el
 *     Estado ni por qué.
 */
import type { DataColumn } from '~/components/DataTable.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const year = ref((route.query.year as string) ?? '')
const category = ref((route.query.category as string) ?? '')
const page = ref(Number(route.query.page ?? 1))
const ITEMS_PER_PAGE = 25

watch([year, category], () => {
  page.value = 1
})
watch([year, category, page], () => {
  const q: Record<string, string> = {}
  if (year.value) q.year = year.value
  if (category.value) q.category = category.value
  if (page.value > 1) q.page = String(page.value)
  router.replace({ query: q })
})

const { data: res, pending, error } = await useFetch<any>('/api/analytics/sentencias', {
  query: computed(() => ({
    page: page.value,
    limit: ITEMS_PER_PAGE,
    ...(year.value ? { year: year.value } : {}),
    ...(category.value ? { category: category.value } : {}),
  })),
})

const series = computed<any[]>(() => res.value?.data?.series ?? [])
const byCategory = computed<any[]>(() => res.value?.data?.byCategory ?? [])
const byOrganismo = computed<any[]>(() => res.value?.data?.byOrganismo ?? [])
const rows = computed<any[]>(() => res.value?.data?.rows ?? [])
const meta = computed<any>(() => res.value?.data?.meta ?? null)
const totalPages = computed<number>(() => res.value?.data?.pagination?.totalPages ?? 1)

/** El último año con dato — la foto más reciente del crédito. */
const latest = computed<any | null>(() => series.value.length ? series.value[series.value.length - 1] : null)

/**
 * Crecimiento en pesos de HOY entre el primer y el último año completo. En nominales cualquier
 * serie de once años sube por inflación sola y no dice nada.
 */
const growth = computed<{ from: number, to: number, times: number } | null>(() => {
  const a = meta.value?.solidFirst
  const b = meta.value?.solidLast
  if (!a?.vigenteReal || !b?.vigenteReal || a.year === b.year) return null
  return { from: a.year, to: b.year, times: b.vigenteReal / a.vigenteReal }
})

/** Escala lineal de la serie, sobre el crédito en pesos de hoy cuando lo hay. */
const seriesMax = computed<number>(() =>
  Math.max(1, ...series.value.map(s => s.judicialVigenteReal ?? s.judicialVigente)))
function barPct(s: any): number {
  return Math.max(1.5, ((s.judicialVigenteReal ?? s.judicialVigente) / seriesMax.value) * 100)
}

const orgMax = computed<number>(() =>
  Math.max(1, ...byOrganismo.value.map(o => o.vigenteReal ?? o.vigente)))

const YEAR_ITEMS = computed(() => [
  { value: '', title: t('sentencias.filters.allYears') },
  ...series.value.map(s => ({ value: String(s.year), title: String(s.year) })),
])
const CATEGORY_ITEMS = computed(() => [
  { value: '', title: t('sentencias.filters.allCategories') },
  { value: 'sentencia', title: t('sentencias.cat.sentencia') },
  { value: 'acuerdo', title: t('sentencias.cat.acuerdo') },
  { value: 'amparo', title: t('sentencias.cat.amparo') },
  { value: 'indemnizacion', title: t('sentencias.cat.indemnizacion') },
])

const rowCols = computed<DataColumn[]>(() => [
  { key: 'year', label: t('sentencias.col.year'), primary: true, mono: true, width: '5rem' },
  { key: 'organismo', label: t('sentencias.col.organismo') },
  { key: 'objectLabel', label: t('sentencias.col.objeto') },
  { key: 'creditoVigente', label: t('sentencias.col.vigente'), align: 'end', mono: true, width: '9rem' },
  { key: 'ejecutado', label: t('sentencias.col.ejecutado'), align: 'end', mono: true, width: '9rem' },
])

/** Un año sin ejecución publicada no muestra «0»: muestra que no hay dato. */
function executionOf(row: any): { known: boolean, amount: number } {
  const y = series.value.find(s => s.year === row.year)
  return { known: y ? y.executionAvailable : true, amount: row.ejecutado }
}

useSeo(() => ({
  title: t('seo.sentencias.title'),
  description: t('seo.sentencias.description'),
  path: '/analytics/sentencias',
  kicker: 'Análisis',
}))
</script>

<template>
  <div class="sen">
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
            {{ t('sentencias.title') }}
          </h1>
          <p class="hero__dek">
            {{ t('sentencias.lead') }}
          </p>
        </div>
      </div>
    </v-sheet>

    <div class="u-container page">
      <!-- El contrato bajo el que se publican estas cifras. Va arriba de todo. -->
      <v-alert
        type="info"
        variant="tonal"
        density="comfortable"
        class="caveat"
      >
        {{ t('sentencias.caveat') }}
      </v-alert>

      <v-alert
        v-if="error"
        type="warning"
        variant="tonal"
      >
        {{ t('sentencias.notComputed') }}
      </v-alert>

      <v-progress-linear
        v-else-if="pending"
        indeterminate
        color="accent"
      />

      <template v-else-if="meta">
        <div class="kpis">
          <div class="kpi">
            <MoneyAmount
              :amount="latest?.judicialVigente ?? 0"
              currency="UYU"
              compact
            />
            <span class="kpi__l">{{ t('sentencias.kpi.latest', { year: latest?.year }) }}</span>
          </div>
          <div class="kpi">
            <MoneyAmount
              :amount="meta.totalVigenteReal ?? meta.totalVigente"
              currency="UYU"
              compact
            />
            <span class="kpi__l">{{ t('sentencias.kpi.total', { from: meta.firstYear, to: meta.lastYear }) }}</span>
          </div>
          <div
            v-if="growth"
            class="kpi"
          >
            <span class="kpi__n u-mono">×{{ growth.times.toFixed(1) }}</span>
            <span class="kpi__l">{{ t('sentencias.kpi.growth', { from: growth.from, to: growth.to }) }}</span>
          </div>
          <div class="kpi">
            <span class="kpi__n u-mono">{{ meta.fullySpentRows }}/{{ meta.rowsWithExecution }}</span>
            <span class="kpi__l">{{ t('sentencias.kpi.fullySpent') }}</span>
          </div>
        </div>

        <!-- ---- La serie ---- -->
        <section class="block">
          <h2 class="block__h">
            {{ t('sentencias.series.title') }}
          </h2>
          <p class="block__dek">
            {{ t('sentencias.series.dek') }}
          </p>

          <ul class="bars">
            <li
              v-for="s in series"
              :key="s.year"
              class="bars__row"
              :class="{ 'bars__row--partial': s.partial }"
            >
              <span class="bars__year u-mono">{{ s.year }}</span>
              <span class="bars__track">
                <span
                  class="bars__fill"
                  :style="{ width: `${barPct(s)}%` }"
                />
              </span>
              <span class="bars__val u-mono">
                <MoneyAmount
                  :amount="s.judicialVigenteReal ?? s.judicialVigente"
                  currency="UYU"
                  compact
                  size="sm"
                />
              </span>
              <!-- Los dos avisos van pegados a su propia barra. En una nota al pie
                   nadie los ata al año que corresponde. Envueltos en `.chip-row`
                   porque Vue come el salto de línea entre hermanos y los suelda. -->
              <span class="chip-row bars__flags">
                <span
                  v-if="s.partial"
                  class="flag flag--partial"
                >{{ t('sentencias.flag.partial', { n: s.fileOrganismos }) }}</span>
                <span
                  v-if="!s.executionAvailable"
                  class="flag flag--noexec"
                >{{ t('sentencias.flag.noExecution') }}</span>
              </span>
            </li>
          </ul>

          <p class="note">
            {{ t('sentencias.series.note') }}
          </p>
        </section>

        <!-- ---- Por qué motivo ---- -->
        <section class="block">
          <h2 class="block__h">
            {{ t('sentencias.cats.title') }}
          </h2>
          <p class="block__dek">
            {{ t('sentencias.cats.dek') }}
          </p>
          <ul class="cats">
            <li
              v-for="c in byCategory"
              :key="c.key"
              class="cats__row"
            >
              <span class="cats__name">{{ t(`sentencias.cat.${c.key}`) }}</span>
              <MoneyAmount
                :amount="c.vigenteReal ?? c.vigente"
                currency="UYU"
                compact
                size="sm"
              />
              <span class="cats__meta u-mono">{{ t('sentencias.cats.rows', { n: c.rows }) }}</span>
            </li>
          </ul>
        </section>

        <!-- ---- Quién ---- -->
        <section class="block">
          <h2 class="block__h">
            {{ t('sentencias.orgs.title') }}
          </h2>
          <p class="block__dek">
            {{ t('sentencias.orgs.dek') }}
          </p>
          <ul class="bars bars--org">
            <li
              v-for="o in byOrganismo.slice(0, 12)"
              :key="o.key"
              class="bars__row bars__row--org"
            >
              <span class="bars__org">{{ o.key }}</span>
              <span class="bars__track">
                <span
                  class="bars__fill"
                  :style="{ width: `${Math.max(1.5, ((o.vigenteReal ?? o.vigente) / orgMax) * 100)}%` }"
                />
              </span>
              <span class="bars__val u-mono">
                <MoneyAmount
                  :amount="o.vigenteReal ?? o.vigente"
                  currency="UYU"
                  compact
                  size="sm"
                />
              </span>
            </li>
          </ul>
        </section>

        <!-- ---- El detalle ---- -->
        <section class="block">
          <h2
            id="sentencias-rows"
            class="block__h"
          >
            {{ t('sentencias.rows.title') }}
          </h2>

          <div class="filters">
            <v-select
              v-model="year"
              :items="YEAR_ITEMS"
              :label="t('sentencias.filters.year')"
              density="comfortable"
              variant="outlined"
              hide-details
            />
            <v-select
              v-model="category"
              :items="CATEGORY_ITEMS"
              :label="t('sentencias.filters.category')"
              density="comfortable"
              variant="outlined"
              hide-details
            />
          </div>

          <!-- `<DataTable>`, no una tabla cruda: cinco columnas sólo entran en un
               teléfono como una tarjeta por fila. -->
          <DataTable
            :columns="rowCols"
            :rows="rows"
            :row-key="(r: any) => r.rowKey"
            min-width="640px"
          >
            <template #cell:organismo="{ row }">
              <span class="rows__org">{{ row.organismo }}</span>
              <span
                v-if="row.unidadEjecutora !== row.organismo"
                class="rows__ue"
              >{{ row.unidadEjecutora }}</span>
            </template>

            <template #cell:objectLabel="{ row }">
              <span>{{ row.objectLabel }}</span>
              <span class="rows__code u-mono">{{ row.objectCode }}</span>
            </template>

            <template #cell:creditoVigente="{ row }">
              <MoneyAmount
                :amount="row.creditoVigente"
                currency="UYU"
                compact
                size="sm"
              />
            </template>

            <template #cell:ejecutado="{ row }">
              <MoneyAmount
                v-if="executionOf(row).known"
                :amount="row.ejecutado"
                currency="UYU"
                compact
                size="sm"
              />
              <span
                v-else
                class="rows__nodata"
                :title="t('sentencias.flag.noExecution')"
              >{{ t('sentencias.rows.noData') }}</span>
            </template>
          </DataTable>

          <!-- `<DataPager>`, no `<v-pagination>`: siete botones de 48px más
               anterior/siguiente piden 432px y empujan la página de costado. -->
          <DataPager
            v-if="totalPages > 1"
            v-model:page="page"
            :total-pages="totalPages"
            scroll-target-id="sentencias-rows"
            class="pager"
          />
        </section>

        <!-- ---- Qué falta ---- -->
        <section class="block">
          <h2 class="block__h">
            {{ t('sentencias.gap.title') }}
          </h2>
          <p class="block__dek">
            {{ t('sentencias.gap.body') }}
          </p>
          <ul class="gap">
            <li>{{ t('sentencias.gap.bjn') }}</li>
            <li>{{ t('sentencias.gap.ruje') }}</li>
            <li>{{ t('sentencias.gap.tca') }}</li>
          </ul>
        </section>

        <p class="source u-mono">
          {{ t('sentencias.source') }}
          <a
            :href="meta.sourceUrl"
            target="_blank"
            rel="noopener"
          >catalogodatos.gub.uy</a>
        </p>
      </template>
    </div>
  </div>
</template>

<style scoped lang="scss">
/* La escala de espaciado termina en `--s-9`: un `--s-10` invalida la declaración
   entera y el hero sale sin padding. */
.hero { background: var(--ink); color: var(--paper); padding-block: var(--s-7) var(--s-6); }
.hero__in { max-width: 46rem; }
.hero__eyebrow { font-size: var(--t-xs); opacity: 0.7; letter-spacing: 0.08em; text-transform: uppercase; }
.hero__title { font-family: var(--font-display); margin: var(--s-2) 0 var(--s-3); }
.hero__dek { opacity: 0.85; }

/* `padding-block`, nunca el atajo `padding`: este elemento también lleva
   `.u-container` y el atajo borra el margen lateral en el teléfono. */
.page { padding-block: var(--s-8) var(--s-9); }
.caveat { margin-bottom: var(--s-5); }

.kpis {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr));
  gap: var(--s-3);
  margin-bottom: var(--s-7);
}

.kpi { border: 1px solid var(--rule); border-radius: var(--r-lg); background: var(--surface); padding: var(--s-4); }
.kpi__n { display: block; font-size: var(--t-xl); font-weight: 700; }
.kpi__l { display: block; font-size: var(--t-xs); color: var(--text-muted); }

.block + .block { margin-top: var(--s-7); }
.block__h { font-size: var(--t-lg); margin: 0 0 var(--s-2); }
.block__dek { margin: 0 0 var(--s-4); color: var(--text-muted); font-size: var(--t-sm); max-width: 62ch; }

/* ---- Barras ---- */
.bars { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--s-2); }

.bars__row {
  display: grid;
  grid-template-columns: 3.5rem 1fr auto;
  align-items: center;
  gap: var(--s-3);
}

.bars__row--org { grid-template-columns: minmax(0, 14rem) 1fr auto; }

.bars__year { font-size: var(--t-sm); color: var(--text-muted); }

.bars__org {
  font-size: var(--t-sm);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bars__track {
  height: 12px;
  border-radius: var(--r-sm);
  background: var(--surface-sunken);
  overflow: hidden;
}

/* El oro es dinero: la regla del sitio, y este bloque es todo dinero. */
.bars__fill { display: block; height: 100%; background: var(--money-rule, var(--gold)); }

/* Un año parcial se atenúa Y se rotula. El color solo no dice nada a quien no lo ve. */
.bars__row--partial .bars__fill { opacity: 0.4; }

.bars__val { font-size: var(--t-xs); white-space: nowrap; }

.bars__flags { grid-column: 2 / -1; }

.chip-row { display: flex; flex-wrap: wrap; gap: var(--s-2); align-items: center; }

.flag {
  border: 1px solid var(--rule);
  border-radius: var(--r-sm);
  padding: 1px var(--s-2);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  color: var(--text-muted);
}

.flag--partial { border-color: color-mix(in srgb, var(--alerta) 40%, var(--rule)); color: var(--alerta); }

.note { margin: var(--s-4) 0 0; font-size: var(--t-xs); color: var(--text-muted); max-width: 68ch; }

/* ---- Motivos ---- */
.cats { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--s-2); }

.cats__row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--s-3);
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
  background: var(--surface);
  padding: var(--s-3) var(--s-4);
}

.cats__name { font-weight: 600; }
.cats__meta { font-size: var(--t-xs); color: var(--text-muted); margin-left: auto; }

/* ---- Detalle ---- */
.filters { display: flex; flex-wrap: wrap; gap: var(--s-3); margin-bottom: var(--s-4); }
.filters > * { flex: 1 1 12rem; min-width: 0; }

.rows__org { display: block; }
.rows__ue { display: block; font-size: var(--t-xs); color: var(--text-muted); }
.rows__code { display: block; font-size: var(--t-xs); color: var(--text-muted); }
.rows__nodata { font-size: var(--t-xs); color: var(--text-muted); }

.gap { margin: 0; padding-left: var(--s-5); color: var(--text-muted); font-size: var(--t-sm); display: grid; gap: var(--s-2); }

.pager { margin-top: var(--s-6); }
.source { margin-top: var(--s-7); font-size: var(--t-xs); color: var(--text-muted); }

@media (max-width: 560px) {
  /* El nombre del organismo pide su propia línea antes que quedar en tres letras. */
  .bars__row--org { grid-template-columns: 1fr auto; }
  .bars__org { grid-column: 1 / -1; white-space: normal; }
}
</style>
