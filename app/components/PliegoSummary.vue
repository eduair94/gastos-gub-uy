<script setup lang="ts">
interface Summary {
  objeto?: string
  requisitosClave?: string[]
  plazos?: { recepcionOfertas?: string, aperturaOfertas?: string, consultas?: string }
  garantias?: string
  criteriosEvaluacion?: string[]
  montoReferencia?: string
  observaciones?: string[]
  disclaimer?: string
}

const props = defineProps<{ compraId: string }>()
const { t } = useI18n()

const { data, pending } = await useFetch<{ data: { available: boolean, summary?: Summary, hasPliego?: boolean } }>(
  () => `/api/open-calls/${props.compraId}/summary`,
)

const available = computed(() => data.value?.data?.available === true)
const hasPliego = computed(() => data.value?.data?.hasPliego !== false)
const s = computed<Summary>(() => data.value?.data?.summary ?? {})
</script>

<template>
  <section class="panel pliego">
    <h2 class="pliego__h u-eyebrow">
      {{ t('llamados.summaryTitle') }}
    </h2>

    <div
      v-if="pending"
      class="pliego__muted u-muted"
    >
      …
    </div>

    <template v-else-if="available">
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
        {{ s.disclaimer || 'Resumen generado por IA. Verificá siempre el pliego oficial.' }}
      </p>
    </template>

    <p
      v-else
      class="pliego__muted u-muted"
    >
      {{ hasPliego ? t('llamados.summaryUnavailable') : t('llamados.summaryNoPliego') }}
    </p>
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
.pliego__muted { font-size: var(--t-sm); }
</style>
