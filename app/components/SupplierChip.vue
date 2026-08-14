<script setup lang="ts">
/**
 * A small AI-derived category pill for a supplier ("TV", "Agencia", "Organismo").
 * Fed by supplier_enrichment via the endpoints; renders nothing when there is no
 * category. It is advisory AI context — pages that use it carry the "generado por
 * IA" note nearby.
 *
 * Built on v-chip so it sizes/aligns the same as DeiChip wherever the two sit
 * side by side (e.g. the supplier directory row).
 */
const props = defineProps<{ category?: string | null }>()
const { t } = useI18n()

const MEDIA = new Set(['medio-tv', 'medio-radio', 'medio-prensa', 'medio-digital', 'medio-via-publica'])
const VERDE = new Set(['agencia-publicidad', 'productora'])

// `primary` (celeste-deep), not `info` (celeste): Vuetify paints a chip's label
// in its own colour, and the bright celeste measured 3.3:1 as 11px uppercase
// text on the chip's tonal wash. `info` stays what it is — a fill for icons and
// timeline dots, where the 3:1 non-text floor applies.
const color = computed(() => {
  const c = props.category ?? ''
  if (MEDIA.has(c)) return 'primary'
  if (VERDE.has(c)) return 'success'
  return undefined
})
</script>

<template>
  <v-chip
    v-if="category"
    :color="color"
    size="x-small"
    rounded="pill"
    class="schip"
    :title="t('sup.aiTitle')"
  >
    {{ t(`sup.cat.${category}`) }}
  </v-chip>
</template>

<style scoped>
.schip {
  font-weight: 600;
  text-transform: uppercase;
}
</style>
