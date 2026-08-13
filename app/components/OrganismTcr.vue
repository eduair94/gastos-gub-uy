<script setup lang="ts">
/**
 * "Lo que dijo el Tribunal de Cuentas" — en la ficha del ORGANISMO.
 *
 * El panel del contrato sólo aparece si esa compra puntual quedó atada a una resolución;
 * un lector parado en el organismo no veía nada. Acá se listan las resoluciones que lo
 * nombran, y cuando además se pudo atar la compra, se enlaza.
 *
 * DOS COSAS QUE ESTE PANEL NO DICE, Y SON LAS QUE LO HACEN PUBLICABLE:
 *
 *  1. No dice "observó". El archivo en línea del Tribunal publica sólo el VISTO — el
 *     encabezado del expediente. Si el gasto fue observado y por cuánto está en el PDF,
 *     que se enlaza en cada fila.
 *  2. El conteo NO es un medidor de irregularidades. El Tribunal se pronuncia de forma
 *     rutinaria sobre muchísimo gasto y la cantidad sigue al TAMAÑO del organismo, no a
 *     su conducta. Por eso no hay ranking ni comparación entre organismos en ningún lado
 *     del sitio: el número vive dentro de la ficha de cada uno y en ningún otro lugar.
 */
interface Ruling {
  tcrId: number
  date: string | null
  subject: string | null
  expediente: string | null
  visto: string | null
  pdfUrl: string | null
  sourceUrl: string
  procurementTitle: string | null
  matchedOcid: string | null
}

const props = defineProps<{ buyerId: string }>()
const { t } = useI18n()
const localePath = useLocalePath()

const { data } = await useLazyFetch<{ data: { items: Ruling[], total: number } }>(
  () => `/api/buyers/${encodeURIComponent(props.buyerId)}/tcr`,
)
const items = computed(() => data.value?.data?.items ?? [])
const total = computed(() => data.value?.data?.total ?? 0)
const show = computed(() => items.value.length > 0)
</script>

<template>
  <section
    v-if="show"
    class="panel block otcr"
  >
    <div class="panel__head">
      <h2>{{ t('buyers.tcrTitle') }}</h2>
    </div>
    <div class="panel__body">
      <p class="otcr__help u-muted">
        {{ t('buyers.tcrHelp', { n: total }) }}
      </p>

      <article
        v-for="r in items"
        :key="r.tcrId"
        class="otcr__item"
      >
        <header class="otcr__head">
          <span class="otcr__date u-mono">{{ r.date ?? '—' }}</span>
          <span
            v-if="r.expediente"
            class="otcr__exp u-mono"
          >{{ r.expediente }}</span>
        </header>
        <p
          v-if="r.subject"
          class="otcr__subject"
        >
          {{ r.subject }}
        </p>
        <blockquote
          v-if="r.visto"
          class="otcr__visto"
        >
          {{ r.visto }}
        </blockquote>
        <p class="otcr__links">
          <NuxtLink
            v-if="r.matchedOcid"
            :to="localePath(`/contracts/${r.matchedOcid}`)"
          >
            {{ t('buyers.tcrContract', { title: r.procurementTitle ?? '' }) }}
          </NuxtLink>
          <a
            v-if="r.pdfUrl"
            :href="r.pdfUrl"
            target="_blank"
            rel="noopener nofollow"
          >{{ t('buyers.tcrPdf') }}</a>
          <a
            :href="r.sourceUrl"
            target="_blank"
            rel="noopener nofollow"
          >{{ t('buyers.tcrSource') }}</a>
        </p>
      </article>

      <p class="otcr__all">
        <NuxtLink :to="localePath('/analytics/tribunal-cuentas')">
          {{ t('buyers.tcrAll') }}
        </NuxtLink>
      </p>
    </div>
  </section>
</template>

<style scoped>
.otcr__help { font-size: var(--t-xs); line-height: 1.5; max-width: 80ch; margin: 0 0 var(--s-3); }
.otcr__item { padding: var(--s-3) 0; border-bottom: 1px solid var(--rule); }
.otcr__item:last-of-type { border-bottom: 0; }
.otcr__head { display: flex; flex-wrap: wrap; gap: var(--s-3); align-items: baseline; margin-bottom: var(--s-1); }
.otcr__date { font-weight: 700; font-size: var(--t-sm); }
.otcr__exp { font-size: var(--t-xs); color: var(--text-muted); }
.otcr__subject { font-size: var(--t-xs); color: var(--text-muted); margin: 0 0 var(--s-2); }
.otcr__visto {
  margin: 0 0 var(--s-2); padding-left: var(--s-3); border-left: 2px solid var(--rule);
  font-size: var(--t-sm); line-height: 1.55; overflow-wrap: anywhere;
}
.otcr__links { display: flex; flex-wrap: wrap; gap: var(--s-2) var(--s-4); margin: 0; font-size: var(--t-xs); }
.otcr__links a { color: var(--celeste-deep); font-weight: 600; }
.otcr__all { margin: var(--s-3) 0 0; font-size: var(--t-xs); }
.otcr__all a { color: var(--celeste-deep); font-weight: 600; }
</style>
