<script setup lang="ts">
interface Summary {
  objeto?: string
  requisitosClave?: string[]
  documentacionRequerida?: string[]
  formaCotizacion?: string
  plazos?: { recepcionOfertas?: string, aperturaOfertas?: string, consultas?: string }
  plazoEjecucion?: string
  garantias?: string
  criteriosEvaluacion?: string[]
  montoReferencia?: string
  observaciones?: string[]
  model?: string
  sourceDocs?: string[]
  disclaimer?: string
}

interface SummaryResponse {
  data: {
    available: boolean
    summary?: Summary
    hasPliego?: boolean
    stale?: boolean
    generating?: boolean
    started?: boolean
    generation?: { model?: string, lastActivityAt?: string, receivedChars?: number }
    error?: string
  }
}

const props = defineProps<{ compraId: string, hasBenchmarks?: boolean }>()
const { t } = useI18n()

// AI pliego summaries are generated on the free-tier model ladder (Gemini → Groq).
// The cron pre-generates prioritized calls; when a call has none yet, the user can
// trigger one on demand (rate-limited server-side).
const available = ref(false)
const hasPliego = ref(true)
const stale = ref(false)
const s = ref<Summary>({})
const generating = ref(false)
const genError = ref('')
const streamingModel = ref('')
let pollPromise: Promise<void> | null = null
let disposed = false

const { data } = await useFetch<SummaryResponse>(() => `/api/open-calls/${props.compraId}/summary`)

function applyResponse(res: SummaryResponse | null | undefined) {
  if (!res?.data) return
  available.value = res.data.available === true
  hasPliego.value = res.data.hasPliego !== false
  stale.value = res.data.stale === true
  generating.value = res.data.generating === true
  streamingModel.value = (res.data.generation?.receivedChars ?? 0) > 0
    ? (res.data.generation?.model ?? '')
    : ''
  if (res.data.summary) s.value = res.data.summary
  if (res.data.error && !generating.value) genError.value = t('llamados.summaryError')
}

applyResponse(data.value)

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function pollSummary(): Promise<void> {
  if (pollPromise) return pollPromise
  pollPromise = (async () => {
    const deadline = Date.now() + 7 * 60_000
    while (!disposed && generating.value && Date.now() < deadline) {
      await delay(2_500)
      if (disposed) return
      try {
        const res = await $fetch<SummaryResponse>(`/api/open-calls/${props.compraId}/summary`)
        applyResponse(res)
        if (!generating.value) {
          if (!available.value || stale.value) genError.value = t('llamados.summaryError')
          return
        }
      }
      catch {
        // A transient polling miss must not start another generation. Keep
        // following the shared server-side lease until it resolves or expires.
      }
    }
    if (!disposed && generating.value) {
      generating.value = false
      genError.value = t('llamados.summaryError')
    }
  })().finally(() => { pollPromise = null })
  return pollPromise
}

onMounted(() => {
  if (generating.value) void pollSummary()
})

onBeforeUnmount(() => {
  disposed = true
})

async function generate() {
  if (generating.value) return
  generating.value = true
  genError.value = ''
  try {
    const res = await $fetch<SummaryResponse>(`/api/open-calls/${props.compraId}/summary`, { method: 'POST' })
    applyResponse(res)
    if (generating.value) void pollSummary()
    else if (!available.value || stale.value) genError.value = hasPliego.value ? t('llamados.summaryError') : ''
  }
  catch (err: any) {
    // 429 (rate limit) carries a friendly statusMessage; anything else is a soft failure.
    generating.value = false
    genError.value = err?.data?.statusMessage || err?.statusMessage || t('llamados.summaryError')
  }
}
</script>

<template>
  <section class="panel pliego">
    <h2 class="pliego__h u-eyebrow">
      {{ t('llamados.summaryTitle') }}
    </h2>

    <template v-if="available">
      <p
        v-if="stale"
        class="pliego__stale"
      >
        <v-icon size="15">
          mdi-file-alert-outline
        </v-icon>
        {{ t('llamados.summaryStale') }}
        <button
          class="pliego__refresh"
          :disabled="generating"
          @click="generate"
        >
          {{ generating ? t('llamados.summaryGenerating') : t('llamados.summaryRefresh') }}
        </button>
        <span
          v-if="streamingModel"
          class="pliego__stream u-muted u-mono"
        >
          <v-icon size="14">mdi-loading mdi-spin</v-icon>
          {{ t('llamados.summaryModel', { model: streamingModel }) }}
        </span>
      </p>

      <p
        v-if="s.objeto"
        class="pliego__objeto"
      >
        {{ s.objeto }}
      </p>

      <div
        v-if="s.requisitosClave?.length"
        class="pliego__block"
      >
        <h3>{{ t('llamados.summaryRequisitos') }}</h3>
        <ul>
          <li
            v-for="(r, i) in s.requisitosClave"
            :key="`req-${i}`"
          >
            {{ r }}
          </li>
        </ul>
      </div>

      <div
        v-if="s.documentacionRequerida?.length"
        class="pliego__block"
      >
        <h3>{{ t('llamados.summaryDocumentacion') }}</h3>
        <ul>
          <li
            v-for="(dq, i) in s.documentacionRequerida"
            :key="`doc-${i}`"
          >
            {{ dq }}
          </li>
        </ul>
      </div>

      <div
        v-if="s.formaCotizacion"
        class="pliego__block"
      >
        <h3>{{ t('llamados.summaryCotizacion') }}</h3>
        <p>{{ s.formaCotizacion }}</p>
      </div>

      <div
        v-if="s.criteriosEvaluacion?.length"
        class="pliego__block"
      >
        <h3>{{ t('llamados.summaryCriterios') }}</h3>
        <ul>
          <li
            v-for="(c, i) in s.criteriosEvaluacion"
            :key="`cri-${i}`"
          >
            {{ c }}
          </li>
        </ul>
      </div>

      <div
        v-if="s.plazoEjecucion"
        class="pliego__block"
      >
        <h3>{{ t('llamados.summaryPlazoEjecucion') }}</h3>
        <p>{{ s.plazoEjecucion }}</p>
      </div>

      <div
        v-if="s.garantias"
        class="pliego__block"
      >
        <h3>{{ t('llamados.summaryGarantias') }}</h3>
        <p>{{ s.garantias }}</p>
      </div>

      <div
        v-if="s.montoReferencia"
        class="pliego__block"
      >
        <h3>{{ t('llamados.summaryMonto') }}</h3>
        <p>{{ s.montoReferencia }}</p>
      </div>

      <div
        v-if="s.observaciones?.length"
        class="pliego__block"
      >
        <h3>{{ t('llamados.summaryObservaciones') }}</h3>
        <ul>
          <li
            v-for="(o, i) in s.observaciones"
            :key="`obs-${i}`"
          >
            {{ o }}
          </li>
        </ul>
      </div>

      <p class="pliego__disc u-muted">
        {{ s.disclaimer || t('llamados.summaryDisclaimer') }}
      </p>
      <p
        v-if="s.model"
        class="pliego__meta u-muted u-mono"
      >
        <span>{{ t('llamados.summaryModel', { model: s.model }) }}</span>
        <span v-if="s.sourceDocs?.length">{{ t('llamados.summarySources', { n: s.sourceDocs.length }) }}</span>
      </p>
    </template>

    <template v-else>
      <!-- No summary cached yet: offer on-demand generation when a pliego exists. -->
      <template v-if="hasPliego">
        <p class="pliego__muted u-muted">
          {{ t('llamados.summaryOnDemand') }}
        </p>
        <button
          class="pliego__gen"
          :disabled="generating"
          @click="generate"
        >
          <v-icon size="16">
            {{ generating ? 'mdi-loading mdi-spin' : 'mdi-creation' }}
          </v-icon>
          {{ generating ? t('llamados.summaryGenerating') : t('llamados.summaryGenerate') }}
        </button>
        <p
          v-if="streamingModel"
          class="pliego__stream u-muted u-mono"
        >
          <v-icon size="14">mdi-loading mdi-spin</v-icon>
          {{ t('llamados.summaryModel', { model: streamingModel }) }}
        </p>
        <p
          v-if="genError"
          class="pliego__err"
        >
          {{ genError }}
        </p>
      </template>

      <p
        v-else
        class="pliego__muted u-muted"
      >
        {{ t('llamados.summaryNoPliego') }}
      </p>

      <AudienceHook
        variant="slot"
        :compra-id="compraId"
        :has-benchmarks="hasBenchmarks"
      />
    </template>
  </section>
</template>

<style scoped>
.pliego { padding: var(--s-5); }
.pliego__h { margin: 0 0 var(--s-3); }
.pliego__objeto { font-size: var(--t-base); line-height: 1.5; margin: 0 0 var(--s-4); }
.pliego__block { margin-bottom: var(--s-4); }
.pliego__block h3 {
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  margin: 0 0 var(--s-1);
}
.pliego__block ul { margin: 0; padding-left: var(--s-4); }
.pliego__block li { margin-bottom: var(--s-1); line-height: 1.45; }
.pliego__block p { margin: 0; line-height: 1.5; }
.pliego__disc { font-size: var(--t-xs); margin: var(--s-4) 0 0; }
.pliego__meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-1) var(--s-3);
  font-size: var(--t-xs);
  margin: var(--s-1) 0 0;
}
.pliego__muted { font-size: var(--t-sm); margin: 0 0 var(--s-3); }
.pliego__gen, .pliego__refresh {
  display: inline-flex;
  align-items: center;
  gap: var(--s-1);
  padding: var(--s-2) var(--s-3);
  border-radius: var(--r-md);
  border: 1px solid var(--celeste);
  background: var(--celeste-wash);
  color: var(--celeste-deep);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: background 0.15s ease;
}
.pliego__gen:hover:not(:disabled), .pliego__refresh:hover:not(:disabled) { background: var(--cta-fill); color: var(--cta-fg); }
.pliego__gen:disabled, .pliego__refresh:disabled { opacity: 0.6; cursor: default; }
.pliego__stale {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  flex-wrap: wrap;
  font-size: var(--t-sm);
  color: var(--text-muted);
  background: var(--surface-sunken);
  border-radius: var(--r-md);
  padding: var(--s-2) var(--s-3);
  margin: 0 0 var(--s-4);
}
.pliego__refresh { padding: 2px var(--s-2); text-transform: none; }
.pliego__err { font-size: var(--t-sm); color: var(--alerta); margin: var(--s-2) 0 0; }
.pliego__stream { display: inline-flex; align-items: center; gap: var(--s-1); font-size: var(--t-xs); margin: var(--s-2) 0 0; }
</style>
