<script setup lang="ts">
/**
 * Typeahead over the values that ACTUALLY carry an anomaly — supplier, buyer, or
 * SICE rubro. It suggests only entities that have at least one flag (with the
 * flag count as a subtitle), so a reader never picks a value that returns an
 * empty list. Emits the exact NAME strings the /api/analytics/anomalies
 * `supplier` / `buyer` / `rubroName` filters match on, so value === label and no
 * hydration is needed. A thin wrapper over the shared EntityAutocomplete.
 */
import type { EntityOption } from './EntityAutocomplete.vue'

const props = defineProps<{
  modelValue: string[]
  /** Which anomaly dimension to search. Maps to a metadata path server-side. */
  field: 'supplierName' | 'buyerName' | 'rubroName'
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
</script>

<template>
  <EntityAutocomplete
    :model-value="modelValue"
    :fetch-options="fetchOptions"
    :placeholder="placeholder"
    @update:model-value="v => emit('update:modelValue', v)"
  />
</template>
