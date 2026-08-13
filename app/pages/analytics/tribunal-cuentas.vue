<script setup lang="ts">
/**
 * "Lo que dijo el Tribunal de Cuentas" — sus resoluciones sobre compras, con la compra
 * enlazada al lado.
 *
 * El archivo del TC es público pero vive fuera de los datos abiertos de compras, así que
 * hasta ahora nadie podía leer un contrato y su auditoría juntos. Acá se atan por
 * ⟨organismo, «Licitación Pública 5/2021»⟩ — ver src/jobs/scrape-tcr-resolutions.ts.
 *
 * DOS COSAS QUE LA PÁGINA NO PUEDE CALLAR:
 *  1. El archivo en línea publica sólo el VISTO. El fallo —si el gasto se observó, por
 *     cuánto— está en el PDF. Por eso el texto dice "se pronunció", no "observó".
 *  2. Lo leído es parcial y está sesgado a los años recientes del archivo: el recorrido
 *     va por id descendente. El rango de fechas cubierto se muestra arriba.
 */
const { t } = useI18n()
const localePath = useLocalePath()

const page = ref(1)
const search = ref('')
const includeUnlinked = ref(false)

const { data, pending } = await useFetch<{
  data: {
    rows: Array<{
      tcrId: number
      date: string | null
      organism: string | null
      organismPath: string | null
      subject: string | null
      expediente: string | null
      visto: string | null
      pdfUrl: string | null
      sourceUrl: string
      procurementTitle: string | null
      matchedOcid: string | null
      matchedCompraId: string | null
      matchedBuyerName: string | null
      matchCandidates: number
    }>
    pagination: { page: number, limit: number, total: number, pages: number }
    totals: { probed: number, exists: number, procurement: number, named: number, linked: number, ambiguous: number }
    range: { from: string | null, to: string | null }
  }
}>(() => `/api/analytics/tribunal-cuentas?page=${page.value}&search=${encodeURIComponent(search.value)}${includeUnlinked.value ? '&all=1' : ''}`)

const rows = computed(() => data.value?.data?.rows ?? [])
const totals = computed(() => data.value?.data?.totals ?? null)
const pagination = computed(() => data.value?.data?.pagination ?? null)
const range = computed(() => data.value?.data?.range ?? null)

function yearOf(iso: string | null): string {
  if (!iso) return '—'
  return String(new Date(iso).getUTCFullYear())
}

watch([search, includeUnlinked], () => {
  page.value = 1
})

const orgLd = useOrgLd()
useSeo(() => ({
  title: t('seo.tribunalCuentas.title'),
  description: t('seo.tribunalCuentas.description'),
  path: '/analytics/tribunal-cuentas',
  kicker: 'Análisis',
  jsonLd: {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    'name': t('seo.tribunalCuentas.title'),
    'description': t('seo.tribunalCuentas.description'),
    'publisher': orgLd,
  },
}))
</script>

<template>
  <div>
    <section class="chero">
      <v-container class="chero__in u-container">
        <p class="u-eyebrow">
          {{ t('tcr.eyebrow') }}
        </p>
        <h1 class="chero__title">
          {{ t('tcr.title') }}
        </h1>
        <p class="chero__lead">
          {{ t('tcr.lead') }}
        </p>
      </v-container>
    </section>

    <v-container class="u-container tcr__body">
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
              <span class="kpi__v u-mono">{{ formatNumber(totals.exists) }}</span>
              <span class="kpi__l">{{ t('tcr.kpi.read') }}</span>
            </div>
          </v-col>
          <v-col
            cols="6"
            md="3"
          >
            <div class="kpi">
              <span class="kpi__v u-mono">{{ formatNumber(totals.procurement) }}</span>
              <span class="kpi__l">{{ t('tcr.kpi.procurement') }}</span>
            </div>
          </v-col>
          <v-col
            cols="6"
            md="3"
          >
            <div class="kpi kpi--good">
              <span class="kpi__v u-mono">{{ formatNumber(totals.linked) }}</span>
              <span class="kpi__l">{{ t('tcr.kpi.linked') }}</span>
            </div>
          </v-col>
          <v-col
            cols="6"
            md="3"
          >
            <div class="kpi">
              <span class="kpi__v u-mono">{{ formatNumber(totals.ambiguous) }}</span>
              <span class="kpi__l">{{ t('tcr.kpi.ambiguous') }}</span>
            </div>
          </v-col>
        </v-row>
      </section>

      <v-card class="warn mb-6">
        <p class="warn__badge">
          <v-icon size="15">
            mdi-information-outline
          </v-icon>
          {{ t('tcr.warnTitle') }}
        </p>
        <p class="warn__body">
          {{ t('tcr.warnBody') }}
        </p>
        <p
          v-if="range && range.from && range.to"
          class="warn__body warn__body--range"
        >
          {{ t('tcr.warnRange', { from: yearOf(range.from), to: yearOf(range.to) }) }}
        </p>
      </v-card>

      <section class="mb-6">
        <div class="tcr__controls">
          <v-text-field
            v-model="search"
            :label="t('tcr.searchLabel')"
            density="compact"
            variant="outlined"
            hide-details
            clearable
            prepend-inner-icon="mdi-magnify"
            class="tcr__search"
          />
          <v-switch
            v-model="includeUnlinked"
            :label="t('tcr.includeUnlinked')"
            density="compact"
            hide-details
            color="primary"
          />
        </div>

        <p
          v-if="pagination"
          class="tcr__count u-muted"
        >
          {{ t('tcr.countLabel', { n: formatNumber(pagination.total) }) }}
        </p>

        <article
          v-for="r in rows"
          :key="r.tcrId"
          class="tcard"
        >
          <header class="tcard__head">
            <span class="tcard__date u-mono">{{ r.date ?? '—' }}</span>
            <span class="tcard__org">{{ r.organism || '—' }}</span>
            <span
              v-if="r.expediente"
              class="tcard__exp u-mono"
            >{{ r.expediente }}</span>
          </header>

          <p
            v-if="r.subject"
            class="tcard__subject"
          >
            {{ r.subject }}
          </p>

          <blockquote
            v-if="r.visto"
            class="tcard__visto"
          >
            {{ r.visto }}
          </blockquote>

          <p class="tcard__links">
            <NuxtLink
              v-if="r.matchedOcid"
              class="tcard__contract"
              :to="localePath(`/contracts/${r.matchedOcid}`)"
            >
              {{ t('tcr.openContract', { title: r.procurementTitle ?? '' }) }}
            </NuxtLink>
            <span
              v-else-if="r.matchCandidates > 1"
              class="tcard__ambiguous"
            >{{ t('tcr.ambiguous', { n: r.matchCandidates }) }}</span>
            <a
              v-if="r.pdfUrl"
              :href="r.pdfUrl"
              target="_blank"
              rel="noopener nofollow"
            >{{ t('tcr.openPdf') }}</a>
            <a
              :href="r.sourceUrl"
              target="_blank"
              rel="noopener nofollow"
            >{{ t('tcr.openSource') }}</a>
          </p>
        </article>

        <p
          v-if="!rows.length && !pending"
          class="tcr__empty u-muted"
        >
          {{ t('tcr.empty') }}
        </p>

        <div
          v-if="pagination && pagination.pages > 1"
          class="tcr__pager"
        >
          <v-btn
            :disabled="page <= 1"
            variant="text"
            size="small"
            @click="page = Math.max(1, page - 1)"
          >
            {{ t('tcr.prev') }}
          </v-btn>
          <span class="u-mono tcr__pagelabel">{{ page }} / {{ pagination.pages }}</span>
          <v-btn
            :disabled="page >= pagination.pages"
            variant="text"
            size="small"
            @click="page = Math.min(pagination.pages, page + 1)"
          >
            {{ t('tcr.next') }}
          </v-btn>
        </div>
      </section>

      <section class="tcr__method">
        <h2 class="tcr__h">
          {{ t('tcr.methodTitle') }}
        </h2>
        <ul class="tcr__methodlist">
          <li>{{ t('tcr.method1') }}</li>
          <li>{{ t('tcr.method2') }}</li>
          <li>{{ t('tcr.method3') }}</li>
        </ul>
        <p class="tcr__src u-muted">
          {{ t('tcr.sourceLabel') }}
          <a
            href="https://www.tcr.gub.uy/"
            target="_blank"
            rel="noopener nofollow"
          >tcr.gub.uy</a>
        </p>
      </section>
    </v-container>
  </div>
</template>

<style scoped>
.chero { border-bottom: 1px solid var(--rule); padding: var(--s-7) 0 var(--s-6); }
.chero__in { padding-block: 0; }
.chero__title { font-size: clamp(1.7rem, 6vw, var(--t-3xl)); line-height: 1.1; margin: var(--s-2) 0 var(--s-3); }
.chero__lead { font-size: var(--t-lg); line-height: 1.5; max-width: 66ch; color: var(--text-muted); }
.tcr__body { padding-block: var(--s-6) var(--s-8); }
.tcr__h { font-size: var(--t-xl); margin: 0 0 var(--s-2); }

.kpi { display: flex; flex-direction: column; gap: 2px; padding: var(--s-3); border: 1px solid var(--rule); border-radius: var(--r-md); height: 100%; }
.kpi__v { font-size: var(--t-xl); font-weight: 700; }
.kpi__l { font-size: var(--t-xs); color: var(--text-muted); line-height: 1.3; }
.kpi--good .kpi__v { color: var(--verde); }

.warn { border: 2px solid var(--celeste); border-radius: var(--r-lg); padding: var(--s-4); background: var(--celeste-wash); }
.warn__badge {
  display: inline-flex; align-items: center; gap: var(--s-1); margin: 0 0 var(--s-2);
  font-family: var(--font-mono); font-size: var(--t-xs); text-transform: uppercase;
  letter-spacing: 0.05em; color: var(--celeste-deep); font-weight: 700;
}
.warn__body { margin: 0; line-height: 1.6; font-size: var(--t-sm); max-width: 88ch; }
.warn__body--range { margin-top: var(--s-2); font-weight: 600; }

.tcr__controls { display: flex; flex-wrap: wrap; gap: var(--s-3); align-items: center; margin-bottom: var(--s-3); }
.tcr__search { max-width: 340px; }
.tcr__count { font-size: var(--t-xs); margin: 0 0 var(--s-3); }

.tcard { border: 1px solid var(--rule); border-radius: var(--r-md); padding: var(--s-4); margin-bottom: var(--s-3); background: var(--surface); }
.tcard__head { display: flex; flex-wrap: wrap; gap: var(--s-2) var(--s-3); align-items: baseline; margin-bottom: var(--s-2); }
.tcard__date { font-weight: 700; font-size: var(--t-sm); }
.tcard__org { font-weight: 600; font-size: var(--t-sm); }
.tcard__exp { font-size: var(--t-xs); color: var(--text-muted); }
.tcard__subject { font-size: var(--t-xs); color: var(--text-muted); margin: 0 0 var(--s-2); }
.tcard__visto {
  margin: 0 0 var(--s-3); padding-left: var(--s-3);
  border-left: 2px solid var(--rule); font-size: var(--t-sm); line-height: 1.55;
  overflow-wrap: anywhere;
}
.tcard__links { display: flex; flex-wrap: wrap; gap: var(--s-2) var(--s-4); margin: 0; font-size: var(--t-xs); }
.tcard__links a { color: var(--celeste-deep); font-weight: 600; }
.tcard__contract { font-weight: 700 !important; }
.tcard__ambiguous { color: var(--text-muted); font-style: italic; }

.tcr__empty { padding: var(--s-6) 0; text-align: center; }
.tcr__pager { display: flex; align-items: center; justify-content: center; gap: var(--s-3); margin-top: var(--s-3); }
.tcr__pagelabel { font-size: var(--t-xs); color: var(--text-muted); }
.tcr__methodlist { max-width: 82ch; padding-left: var(--s-4); }
.tcr__methodlist li { line-height: 1.6; margin-bottom: var(--s-2); font-size: var(--t-sm); }
.tcr__src { font-size: var(--t-xs); }
.tcr__src a { color: var(--celeste-deep); }
</style>
