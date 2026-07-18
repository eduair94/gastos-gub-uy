<script setup lang="ts">
/**
 * The shared server-side typeahead behind every filter autocomplete.
 *
 * It owns the mechanics that were duplicated across filter components: a 300ms
 * debounced search, a code/name → label cache so a selected value always has a
 * chip title, and a merge of the live results with a synthetic item per selected
 * value (v-autocomplete only renders a chip for a value present in `:items`, so
 * chips would vanish when the search list changes without this).
 *
 * It is deliberately data-source agnostic. The caller supplies:
 *   - `fetchOptions(query)` — how to search (which endpoint, how to map rows),
 *   - `hydrate(values)`     — OPTIONAL, how to resolve labels for preselected
 *                             values whose label is not the value itself
 *                             (products: code → name). Omit it when the value IS
 *                             the label (a supplier/buyer NAME), and the value is
 *                             used as its own chip title.
 *
 * v-model is `string[]` of the chosen values — the exact strings the server
 * filter matches on. See ProductAutocomplete (codes) and AnomalyFacetAutocomplete
 * (names) for the two wrappers in use.
 */
import { debounce } from 'lodash-es'

export interface EntityOption { value: string, title: string, sub?: string }

const props = withDefaults(defineProps<{
  modelValue: string[]
  /** Run the search. Return the options to show for this query. */
  fetchOptions: (query: string) => Promise<EntityOption[]>
  /** Resolve labels for preselected values not seen via search yet. Optional:
   *  when omitted, an unresolved value is its own label (value === label). */
  hydrate?: (values: string[]) => Promise<Record<string, string>>
  /** Minimum characters before a search fires (avoids a request per keystroke). */
  minChars?: number
  placeholder?: string
  noDataText?: string
}>(), { minChars: 2 })

const emit = defineEmits<{ 'update:modelValue': [string[]] }>()
const { t } = useI18n()

const items = ref<EntityOption[]>([])
const loading = ref(false)
const search = ref('')
/** value -> label, so a selected value always has a chip title. */
const labels = ref<Record<string, string>>({})

const runSearch = debounce(async (q: string) => {
  if (!q || q.trim().length < props.minChars) {
    items.value = []
    loading.value = false
    return
  }
  loading.value = true
  try {
    const opts = await props.fetchOptions(q.trim())
    for (const o of opts) labels.value[o.value] = o.title
    items.value = opts
  }
  catch { items.value = [] }
  finally { loading.value = false }
}, 300)

function onSearch(v: string) {
  search.value = v
  runSearch(v)
}

/** Resolve a chip title for every selected value we don't already have one for. */
async function hydrateValues(values: string[]) {
  const missing = values.filter(v => !labels.value[v])
  if (!missing.length) return
  if (props.hydrate) {
    try {
      const map = await props.hydrate(missing)
      for (const [k, v] of Object.entries(map)) if (v) labels.value[k] = v
    }
    catch { /* fall through to value-as-label below */ }
  }
  // Anything still unresolved is its own label — correct when value === label.
  for (const m of missing) {
    if (!labels.value[m]) labels.value[m] = m
  }
}

onMounted(() => hydrateValues(props.modelValue))
watch(() => props.modelValue, v => hydrateValues(v))

const mergedItems = computed<EntityOption[]>(() => {
  const map = new Map<string, EntityOption>()
  for (const o of items.value) map.set(o.value, o)
  for (const c of props.modelValue) {
    if (!map.has(c)) map.set(c, { value: c, title: labels.value[c] || c })
  }
  return [...map.values()]
})

function onModel(v: string[]) {
  emit('update:modelValue', v)
}

/**
 * Read the subtitle from a v-autocomplete `#item` slot argument. Vuetify hands
 * the slot either the InternalItem wrapper (`.raw` is our option) or, in this
 * version, the raw option directly — so read from whichever is present. Typed
 * `any` because the two shapes don't share a static type.
 */
function subtitleOf(item: any): string | undefined {
  return item?.raw?.sub ?? item?.sub
}
</script>

<template>
  <v-autocomplete
    :model-value="modelValue"
    :items="mergedItems"
    item-title="title"
    item-value="value"
    :search="search"
    :placeholder="placeholder"
    :no-data-text="search.length < minChars ? (placeholder ?? t('filters.noOptions')) : (noDataText ?? t('filters.noOptions'))"
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
        :subtitle="subtitleOf(item)"
      />
    </template>
  </v-autocomplete>
</template>
