<script setup lang="ts">
/**
 * Typeahead over the values that ACTUALLY carry an anomaly — supplier, buyer,
 * SICE rubro, or product (catalogue code). It suggests only entities that have at
 * least one flag (with the flag count as a subtitle), so a reader never picks a
 * value that returns an empty list. Emits the exact strings the
 * /api/analytics/anomalies `supplier` / `buyer` / `rubroName` / `product` filters
 * match on. The name/supplier/buyer/rubro facets are self-labelling (value ===
 * label); product is the exception — its value is the CODE, so a code arriving
 * from the URL is hydrated to its article name for the chip. A thin wrapper over
 * the shared EntityAutocomplete.
 */
import type { EntityOption } from './EntityAutocomplete.vue'

const props = defineProps<{
  modelValue: string[]
  /** Which anomaly dimension to search. Maps to a metadata path server-side. */
  field: 'supplierName' | 'buyerName' | 'rubroName' | 'product'
  placeholder?: string
}>()
const emit = defineEmits<{ 'update:modelValue': [string[]] }>()
const { t } = useI18n()

async function fetchOptions(q: string): Promise<EntityOption[]> {
  const res = await $fetch<any>('/api/analytics/anomalies/facets', {
    query: { field: props.field, search: q, limit: 15 },
  })
  return (res?.data ?? []).map((o: any) => ({
    value: o.value,
    title: o.label,
    sub: t('anomalies.filters.flagCount', { n: formatNumber(o.count) }),
  }))
}

// Resolve product CODES back to article names so a ?product=<code> URL renders a
// readable chip instead of a bare number. Reuses the products endpoint's code
// resolver — the same one ProductAutocomplete uses.
async function hydrateProduct(codes: string[]): Promise<Record<string, string>> {
  const res = await $fetch<any>('/api/analytics/products', { query: { codes: codes.join(',') } })
  const map: Record<string, string> = {}
  for (const p of res?.data?.products ?? []) map[p.code] = p.canonicalName || p.description || p.code
  return map
}
</script>

<template>
  <EntityAutocomplete
    :model-value="modelValue"
    :fetch-options="fetchOptions"
    :hydrate="field === 'product' ? hydrateProduct : undefined"
    :placeholder="placeholder"
    @update:model-value="v => emit('update:modelValue', v)"
  />
</template>
