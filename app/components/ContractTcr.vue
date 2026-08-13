<script setup lang="ts">
/**
 * "El Tribunal de Cuentas se pronunció sobre esta compra."
 *
 * El TC es el auditor del propio Estado. Su archivo es público pero está fuera de los
 * datos abiertos de compras, así que hasta ahora nadie los veía juntos. Se atan por
 * ⟨organismo, «Licitación Pública 5/2021»⟩, que es la forma exacta en que el corpus
 * guarda `tender.title` (ver src/jobs/scrape-tcr-resolutions.ts).
 *
 * LÍMITE QUE MANDA SOBRE ESTE TEXTO: la ficha HTML del TC publica sólo el VISTO — qué
 * expediente miró y sobre qué llamado. El fallo (si observó el gasto, por cuánto, con
 * qué fundamento) está únicamente en el PDF. Por eso este panel dice "se pronunció",
 * muestra el VISTO textual y enlaza la resolución. Decir "observó" sería inventar el
 * fallo: es la diferencia entre un dato y una acusación.
 */
interface TcrRuling {
  tcrId: number
  date: string | null
  organism: string | null
  subject: string | null
  expediente: string | null
  visto: string | null
  pdfUrl: string | null
  sourceUrl: string
}

const props = defineProps<{ rulings?: TcrRuling[] | null }>()
const { t } = useI18n()

const list = computed(() => props.rulings ?? [])
const show = computed(() => list.value.length > 0)
</script>

<template>
  <section
    v-if="show"
    class="panel block"
  >
    <div class="panel__head">
      <h2>{{ t('contract.sections.tcr') }}</h2>
    </div>
    <div class="panel__body">
      <p class="tcr__help u-muted">
        {{ t('contract.tcrHelp') }}
      </p>

      <article
        v-for="r in list"
        :key="r.tcrId"
        class="tcr__item"
      >
        <header class="tcr__head">
          <span class="tcr__date u-mono">{{ r.date ?? '—' }}</span>
          <span
            v-if="r.expediente"
            class="tcr__exp u-mono"
          >{{ r.expediente }}</span>
        </header>
        <p
          v-if="r.subject"
          class="tcr__subject"
        >
          {{ r.subject }}
        </p>
        <blockquote
          v-if="r.visto"
          class="tcr__visto"
        >
          {{ r.visto }}
        </blockquote>
        <p class="tcr__links">
          <a
            v-if="r.pdfUrl"
            :href="r.pdfUrl"
            target="_blank"
            rel="noopener nofollow"
          >{{ t('contract.tcrPdf') }}</a>
          <a
            :href="r.sourceUrl"
            target="_blank"
            rel="noopener nofollow"
          >{{ t('contract.tcrSource') }}</a>
        </p>
      </article>
    </div>
  </section>
</template>

<style scoped>
.tcr__help { font-size: var(--t-xs); line-height: 1.5; max-width: 78ch; margin: 0 0 var(--s-3); }
.tcr__item { padding: var(--s-3) 0; border-bottom: 1px solid var(--rule); }
.tcr__item:last-child { border-bottom: 0; padding-bottom: 0; }
.tcr__head { display: flex; flex-wrap: wrap; gap: var(--s-3); align-items: baseline; margin-bottom: var(--s-1); }
.tcr__date { font-weight: 700; font-size: var(--t-sm); }
.tcr__exp { font-size: var(--t-xs); color: var(--text-muted); }
.tcr__subject { font-size: var(--t-sm); font-weight: 600; margin: 0 0 var(--s-2); }
.tcr__visto {
  margin: 0 0 var(--s-2); padding-left: var(--s-3);
  border-left: 2px solid var(--rule); color: var(--text-muted);
  font-size: var(--t-sm); line-height: 1.55; overflow-wrap: anywhere;
}
.tcr__links { display: flex; flex-wrap: wrap; gap: var(--s-4); margin: 0; font-size: var(--t-xs); }
.tcr__links a { color: var(--celeste-deep); font-weight: 600; }
</style>
