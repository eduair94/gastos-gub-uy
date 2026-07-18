<script setup lang="ts">
/**
 * Server-side product typeahead. Emits catalogue CODES (classification.id) via
 * v-model — exactly the values the contracts `categoryId` filter matches on.
 *
 * A thin wrapper over the shared EntityAutocomplete: it supplies only the two
 * product-specific bits — the search endpoint and the code → name hydration so a
 * code arriving from the URL resolves to a product name instead of a bare number.
 * All the typeahead mechanics (debounce, chip survival) live in the shared core.
 */
import type { EntityOption } from './EntityAutocomplete.vue'

defineProps<{ modelValue: string[] }>()
const emit = defineEmits<{ 'update:modelValue': [string[]] }>()
const { t } = useI18n()

function toOpt(p: any): EntityOption {
  return {
    value: p.code,
    title: p.canonicalName || p.description || p.code,
    sub: p.contractCount ? t('filters.productCount', { n: p.contractCount }) : undefined,
  }
}

async function fetchOptions(q: string): Promise<EntityOption[]> {
  const res = await $fetch<any>('/api/analytics/products', { query: { search: q, limit: 20 } })
  return (res?.data?.products ?? []).map(toOpt)
}

async function hydrate(codes: string[]): Promise<Record<string, string>> {
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
    :hydrate="hydrate"
    :placeholder="t('filters.productPlaceholder')"
    @update:model-value="v => emit('update:modelValue', v)"
  />
</template>
