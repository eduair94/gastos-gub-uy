<script setup lang="ts">
/**
 * Server-side product typeahead. Emits catalogue CODES (classification.id) via
 * v-model — exactly the values the contracts `categoryId` filter matches on.
 * Codes arriving from the URL are resolved to labels once so their chips read as
 * product names, not bare numbers. The search is debounced 300ms and needs ≥2
 * chars; the endpoint escapes input server-side.
 */
import { debounce } from 'lodash-es'

const props = defineProps<{ modelValue: string[] }>()
const emit = defineEmits<{ 'update:modelValue': [string[]] }>()
const { t } = useI18n()

interface Opt { value: string, title: string, sub?: string }

const items = ref<Opt[]>([])
const loading = ref(false)
const search = ref('')
/** code -> label, so a selected code always has a chip title. */
const labels = ref<Record<string, string>>({})

function toOpt(p: any): Opt {
  const title = p.canonicalName || p.description || p.code
  return { value: p.code, title, sub: p.contractCount ? t('filters.productCount', { n: p.contractCount }) : undefined }
}

const runSearch = debounce(async (q: string) => {
  if (!q || q.trim().length < 2) { items.value = []; loading.value = false; return }
  loading.value = true
  try {
    const res = await $fetch<any>('/api/analytics/products', { query: { search: q.trim(), limit: 20 } })
    const opts = (res?.data?.products ?? []).map(toOpt)
    for (const o of opts) labels.value[o.value] = o.title
    items.value = opts
  }
  catch { items.value = [] }
  finally { loading.value = false }
}, 300)

function onSearch(v: string) { search.value = v; runSearch(v) }

/** Resolve labels for any selected code we don't yet have a title for. */
async function hydrate(codes: string[]) {
  const missing = codes.filter(c => !labels.value[c])
  if (!missing.length) return
  try {
    const res = await $fetch<any>('/api/analytics/products', { query: { codes: missing.join(',') } })
    for (const p of res?.data?.products ?? []) labels.value[p.code] = p.canonicalName || p.description || p.code
  }
  catch { /* fall through to code-as-label below */ }
  for (const c of missing) if (!labels.value[c]) labels.value[c] = c // fall back to the code itself
}

onMounted(() => hydrate(props.modelValue))
watch(() => props.modelValue, v => hydrate(v))

/**
 * v-autocomplete only renders a chip for a selected value that is present in
 * :items. Merge the current search results with a synthetic item per selected
 * code so chips survive after the search list changes.
 */
const mergedItems = computed<Opt[]>(() => {
  const map = new Map<string, Opt>()
  for (const o of items.value) map.set(o.value, o)
  for (const c of props.modelValue) if (!map.has(c)) map.set(c, { value: c, title: labels.value[c] || c })
  return [...map.values()]
})

function onModel(v: string[]) { emit('update:modelValue', v) }
</script>

<template>
  <v-autocomplete
    :model-value="modelValue"
    :items="mergedItems"
    item-title="title"
    item-value="value"
    :search="search"
    :placeholder="t('filters.productPlaceholder')"
    :no-data-text="search.length < 2 ? t('filters.productPlaceholder') : t('filters.noOptions')"
    multiple
    chips
    closable-chips
    density="compact"
    :loading="loading"
    hide-no-data-on-loading
    @update:search="onSearch"
    @update:model-value="onModel"
  >
    <template #item="{ props: itemProps, item }">
      <v-list-item
        v-bind="itemProps"
        :subtitle="item.raw.sub"
      />
    </template>
  </v-autocomplete>
</template>
