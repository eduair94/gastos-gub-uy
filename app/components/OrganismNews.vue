<script setup lang="ts">
/**
 * "Lo que se publicó sobre las compras de este organismo."
 *
 * Cruza el corpus con la prensa. La convergencia es lo que le da valor: en la ficha de
 * la Intendencia de Flores, el 48% de oferente único que medimos queda al lado de una
 * nota sobre irregularidades que encontró la JUTEP en una licitación suya.
 *
 * ESTO ES UNA BÚSQUEDA, NO UNA CURADURÍA. No verificamos el contenido de las notas ni
 * las respaldamos, y el panel lo dice. Cada resultado sale con su medio, su fecha y su
 * enlace para que se lea en la fuente.
 *
 * Por qué no existe el equivalente por proveedor: se midió y es ruido puro — "MOTOCICLO"
 * devuelve choques de motos en Cuba, "DIVINO" fiestas religiosas, y los proveedores que
 * de verdad importan no tienen prensa. Ver shared/news-search.ts.
 */
interface NewsItem {
  title: string
  link: string
  source: string
  publishedAt: string | null
}

const props = defineProps<{ buyerId: string }>()
const { t, locale } = useI18n()

const { data } = await useLazyFetch<{ data: { items: NewsItem[], fetchedAt: string | null } }>(
  () => `/api/buyers/${encodeURIComponent(props.buyerId)}/news`,
)
const items = computed(() => data.value?.data?.items ?? [])
const show = computed(() => items.value.length > 0)

function when(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString(locale.value === 'en' ? 'en-GB' : 'es-UY', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}
</script>

<template>
  <section
    v-if="show"
    class="panel block news"
  >
    <div class="panel__head">
      <h2>{{ t('buyers.newsTitle') }}</h2>
    </div>
    <div class="panel__body">
      <p class="news__help u-muted">
        {{ t('buyers.newsHelp') }}
      </p>
      <ul class="news__list">
        <li
          v-for="(n, i) in items"
          :key="`${n.link}-${i}`"
          class="news__item"
        >
          <a
            :href="n.link"
            target="_blank"
            rel="noopener nofollow"
            class="news__title"
          >{{ n.title }}</a>
          <span class="news__meta u-mono">
            {{ n.source }}<span v-if="n.publishedAt"> · {{ when(n.publishedAt) }}</span>
          </span>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.news__help { font-size: var(--t-xs); line-height: 1.5; max-width: 78ch; margin: 0 0 var(--s-3); }
.news__list { list-style: none; padding: 0; margin: 0; }
.news__item {
  display: flex; flex-direction: column; gap: 2px;
  padding: var(--s-2) 0; border-bottom: 1px solid var(--rule);
}
.news__item:last-child { border-bottom: 0; }
.news__title { color: var(--celeste-deep); line-height: 1.45; overflow-wrap: anywhere; }
.news__meta { font-size: var(--t-xs); color: var(--text-muted); }
</style>
