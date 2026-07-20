<script setup lang="ts">
interface CatItem {
  token: string
  label: string
  level: 'familia' | 'subfamilia' | 'clase' | 'subclase' | 'articulo'
  path?: string
  articleCount?: number
  breadcrumb?: string[]
}
interface MethodOption { value: string, label: string, count?: number }
interface WatchDoc {
  _id?: string
  name?: string
  categories?: string[]
  keywords?: string[]
  keywordMode?: 'any' | 'all'
  minValue?: number
  maxValue?: number
  procurementMethods?: string[]
  active?: boolean
}

const props = defineProps<{ modelValue?: WatchDoc | null }>()
const emit = defineEmits<{ saved: [], cancel: [] }>()

const { t } = useI18n()
const api = useMonitorApi()
const { track } = useAnalytics()

const editing = computed(() => Boolean(props.modelValue?._id))

const form = reactive({
  name: props.modelValue?.name ?? '',
  categories: [...(props.modelValue?.categories ?? [])] as string[],
  keywords: [...(props.modelValue?.keywords ?? [])] as string[],
  keywordMode: (props.modelValue?.keywordMode ?? 'any') as 'any' | 'all',
  minValue: props.modelValue?.minValue as number | undefined,
  maxValue: props.modelValue?.maxValue as number | undefined,
  procurementMethods: [...(props.modelValue?.procurementMethods ?? [])] as string[],
  active: props.modelValue?.active ?? true,
})

// --- Selected catalog nodes (resolved for display) ---
const selected = ref<CatItem[]>([])
function isSelected(token: string) { return form.categories.includes(token) }
function addNode(item: CatItem) {
  if (isSelected(item.token)) return
  form.categories.push(item.token)
  selected.value.push(item)
}
function removeNode(token: string) {
  form.categories = form.categories.filter(c => c !== token)
  selected.value = selected.value.filter(s => s.token !== token)
}

// --- Rubro drilldown columns (familia → subfamilia → clase → subclase → artículos) ---
const columns = ref<Array<{ parent: CatItem | null, items: CatItem[] }>>([])
const columnsLoading = ref(false)
async function loadRoot() {
  columnsLoading.value = true
  try {
    const res = await api.categories.browse()
    columns.value = [{ parent: null, items: res.data }]
  }
  catch { columns.value = [] }
  finally { columnsLoading.value = false }
}
async function drill(colIndex: number, item: CatItem) {
  if (item.level === 'articulo') return
  columnsLoading.value = true
  try {
    const res = await api.categories.browse(item.token)
    columns.value = columns.value.slice(0, colIndex + 1)
    columns.value.push({ parent: item, items: res.data })
  }
  catch { /* keep current columns */ }
  finally { columnsLoading.value = false }
}

// --- Search (rubro nodes + articles) ---
const searchQuery = ref('')
const searchResults = ref<CatItem[]>([])
const searchLoading = ref(false)
let searchTimer: ReturnType<typeof setTimeout> | null = null
watch(searchQuery, (q) => {
  if (searchTimer) clearTimeout(searchTimer)
  if (!q || !q.trim()) { searchResults.value = []; return }
  searchTimer = setTimeout(async () => {
    searchLoading.value = true
    try { searchResults.value = (await api.categories.search(q.trim(), 40)).data }
    catch { searchResults.value = [] }
    finally { searchLoading.value = false }
    track('alert_catalog_search')
  }, 250)
})

const levelLabel = (lvl: CatItem['level']) => t(`alerts.level_${lvl}`)

// --- Procurement method options ---
const methodOptions = ref<MethodOption[]>([])

// --- Live preview (dry-run) ---
const preview = ref<{ total: number, sample: Array<{ compraId: string, title: string }> } | null>(null)
const previewLoading = ref(false)
let previewTimer: ReturnType<typeof setTimeout> | null = null
function schedulePreview() {
  if (previewTimer) clearTimeout(previewTimer)
  preview.value = null
  if (!form.categories.length && !form.keywords.length) return
  previewTimer = setTimeout(async () => {
    previewLoading.value = true
    try {
      preview.value = (await api.watches.test(buildPayload())).data
      track('alert_preview', { matches: preview.value.total })
    }
    catch { preview.value = null }
    finally { previewLoading.value = false }
  }, 500)
}
watch(() => [form.categories, form.keywords, form.keywordMode, form.minValue, form.maxValue, form.procurementMethods], schedulePreview, { deep: true })

onMounted(async () => {
  await loadRoot()
  if (form.categories.length) {
    try { selected.value = (await api.categories.resolve(form.categories)).data }
    catch { selected.value = form.categories.map(tk => ({ token: tk, label: tk, level: 'articulo' as const })) }
  }
  try {
    const f = await $fetch<{ data?: { procurementMethodDetails?: MethodOption[] } }>('/api/contracts/filters')
    methodOptions.value = f?.data?.procurementMethodDetails ?? []
  }
  catch { methodOptions.value = [] }
  schedulePreview()
})

function buildPayload() {
  const p: Record<string, unknown> = {
    name: form.name.trim() || 'preview',
    categories: form.categories,
    keywords: form.keywords,
    keywordMode: form.keywordMode,
    buyers: [],
    procurementMethods: form.procurementMethods,
    active: form.active,
  }
  if (form.minValue != null && form.minValue !== ('' as unknown)) p.minValue = Number(form.minValue)
  if (form.maxValue != null && form.maxValue !== ('' as unknown)) p.maxValue = Number(form.maxValue)
  return p
}

const saving = ref(false)
const error = ref('')
async function save() {
  error.value = ''
  if (!form.name.trim()) { error.value = t('alerts.name'); return }
  if (!form.categories.length && !form.keywords.length) { error.value = t('alerts.needTrigger'); return }
  saving.value = true
  try {
    const payload = { ...buildPayload(), name: form.name.trim() }
    if (editing.value && props.modelValue?._id) await api.watches.update(props.modelValue._id, payload as never)
    else await api.watches.create(payload as never)
    track(editing.value ? 'alert_update' : 'alert_create', {
      categories: form.categories.length,
      keywords: form.keywords.length,
      keyword_mode: form.keywordMode,
      procurement_methods: form.procurementMethods.length,
      has_amount_filter: form.minValue != null || form.maxValue != null,
    })
    emit('saved')
  }
  catch (e) {
    const err = e as { data?: { statusMessage?: string }, statusMessage?: string }
    error.value = err?.data?.statusMessage || err?.statusMessage || t('auth.genericError')
  }
  finally { saving.value = false }
}
</script>

<template>
  <form
    class="wform panel"
    @submit.prevent="save"
  >
    <h2 class="wform__h u-eyebrow">
      {{ editing ? t('alerts.edit') : t('alerts.new') }}
    </h2>

    <v-text-field
      v-model="form.name"
      :label="t('alerts.name')"
      :placeholder="t('alerts.namePlaceholder')"
      maxlength="120"
      data-tour="alert-name"
    />

    <!-- Catalog picker: search + rubro drilldown -->
    <div
      class="wform__cat"
      data-tour="alert-products"
    >
      <span class="wform__label">{{ t('alerts.products') }}</span>
      <p class="wform__hint u-muted">
        {{ t('alerts.productsHint') }}
      </p>

      <!-- Selected chips -->
      <div
        v-if="selected.length"
        class="wform__chips"
      >
        <v-chip
          v-for="s in selected"
          :key="s.token"
          size="small"
          closable
          :title="s.breadcrumb?.join(' › ')"
          @click:close="removeNode(s.token)"
        >
          <span class="wform__chiplvl">{{ levelLabel(s.level) }}</span>
          {{ s.label }}
        </v-chip>
      </div>

      <v-text-field
        v-model="searchQuery"
        :label="t('alerts.searchProducts')"
        :loading="searchLoading"
        prepend-inner-icon="mdi-magnify"
        clearable
        density="comfortable"
        hide-details
      />

      <!-- Search results -->
      <v-list
        v-if="searchResults.length"
        class="wform__results"
        density="compact"
      >
        <v-list-item
          v-for="r in searchResults"
          :key="r.token"
          :disabled="isSelected(r.token)"
          @click="addNode(r)"
        >
          <template #prepend>
            <span class="wform__lvlbadge">{{ levelLabel(r.level) }}</span>
          </template>
          <v-list-item-title>{{ r.label }}</v-list-item-title>
          <v-list-item-subtitle v-if="r.breadcrumb?.length">
            {{ r.breadcrumb.join(' › ') }}
          </v-list-item-subtitle>
          <template #append>
            <v-icon
              size="small"
              :icon="isSelected(r.token) ? 'mdi-check' : 'mdi-plus'"
            />
          </template>
        </v-list-item>
      </v-list>

      <!-- Rubro drilldown columns -->
      <div
        v-else
        class="wform__cols"
      >
        <div
          v-for="(col, ci) in columns"
          :key="ci"
          class="wform__col"
        >
          <div
            v-if="col.parent"
            class="wform__coltitle u-muted"
          >
            {{ col.parent.label }}
          </div>
          <v-list
            class="wform__collist"
            density="compact"
          >
            <v-list-item
              v-for="it in col.items"
              :key="it.token"
              :active="columns[ci + 1]?.parent?.token === it.token"
              @click="drill(ci, it)"
            >
              <v-list-item-title>{{ it.label }}</v-list-item-title>
              <v-list-item-subtitle v-if="it.articleCount">
                {{ t('alerts.articleCount', { n: it.articleCount }) }}
              </v-list-item-subtitle>
              <template #append>
                <v-btn
                  :icon="isSelected(it.token) ? 'mdi-check' : 'mdi-plus'"
                  size="x-small"
                  variant="text"
                  :color="isSelected(it.token) ? 'success' : undefined"
                  @click.stop="addNode(it)"
                />
                <v-icon
                  v-if="it.level !== 'articulo'"
                  size="small"
                  icon="mdi-chevron-right"
                />
              </template>
            </v-list-item>
          </v-list>
        </div>
      </div>
    </div>

    <!-- Keywords -->
    <v-combobox
      v-model="form.keywords"
      data-tour="alert-keywords"
      :label="t('alerts.keywords')"
      :hint="t('alerts.keywordsHint')"
      persistent-hint
      multiple
      chips
      closable-chips
    />

    <div class="wform__row">
      <span class="wform__label">{{ t('alerts.keywordMode') }}</span>
      <v-btn-toggle
        v-model="form.keywordMode"
        density="comfortable"
        mandatory
        variant="outlined"
      >
        <v-btn
          value="any"
          size="small"
        >
          {{ t('alerts.modeAny') }}
        </v-btn>
        <v-btn
          value="all"
          size="small"
        >
          {{ t('alerts.modeAll') }}
        </v-btn>
      </v-btn-toggle>
    </div>

    <!-- Refinements -->
    <details
      class="wform__refine"
      data-tour="alert-refine"
    >
      <summary>{{ t('alerts.refinements') }}</summary>
      <div class="wform__refinebody">
        <v-select
          v-model="form.procurementMethods"
          :items="methodOptions"
          item-title="label"
          item-value="value"
          :label="t('alerts.method')"
          multiple
          chips
          closable-chips
          clearable
          density="comfortable"
          hide-details
        />
        <div class="wform__range">
          <v-text-field
            v-model.number="form.minValue"
            :label="t('alerts.minValue')"
            type="number"
            min="0"
            suffix="UYU"
            density="comfortable"
            hide-details
          />
          <v-text-field
            v-model.number="form.maxValue"
            :label="t('alerts.maxValue')"
            type="number"
            min="0"
            suffix="UYU"
            density="comfortable"
            hide-details
          />
        </div>
        <p class="wform__hint u-muted">
          {{ t('alerts.valueHint') }}
        </p>
      </div>
    </details>

    <v-switch
      v-model="form.active"
      :label="t('alerts.active')"
      color="success"
      hide-details
    />

    <div
      v-if="previewLoading"
      class="wform__preview u-muted"
    >
      …
    </div>
    <div
      v-else-if="preview"
      class="wform__preview"
      data-tour="alert-preview"
    >
      <p class="wform__previewcount">
        {{ preview.total > 0 ? t('alerts.preview', { n: preview.total }) : t('alerts.previewNone') }}
      </p>
      <ul
        v-if="preview.sample.length"
        class="wform__samples"
      >
        <li
          v-for="s in preview.sample"
          :key="s.compraId"
          class="u-truncate"
        >
          {{ s.title }}
        </li>
      </ul>
    </div>

    <p
      v-if="error"
      class="wform__error"
    >
      {{ error }}
    </p>

    <div class="wform__actions">
      <v-btn
        variant="text"
        @click="emit('cancel')"
      >
        {{ t('alerts.cancel') }}
      </v-btn>
      <v-btn
        color="primary"
        type="submit"
        :loading="saving"
        data-tour="alert-save"
      >
        {{ t('alerts.save') }}
      </v-btn>
    </div>
  </form>
</template>

<style scoped>
.wform {
  display: flex;
  flex-direction: column;
  gap: var(--s-4);
  padding: var(--s-5);
}

.wform__h { margin: 0; }

.wform__row {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  flex-wrap: wrap;
}

.wform__label {
  font-size: var(--t-sm);
  font-weight: 600;
  color: var(--text-muted);
}

.wform__hint {
  margin: 0;
  font-size: var(--t-xs);
}

.wform__cat {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
}

.wform__chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2);
}

.wform__chiplvl {
  font-size: var(--t-xs);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
  margin-right: var(--s-2);
}

.wform__lvlbadge {
  font-size: var(--t-xs);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
  width: 5.5rem;
  display: inline-block;
}

.wform__results {
  max-height: 16rem;
  overflow-y: auto;
  border: 1px solid var(--rule);
  border-radius: var(--r-md);
}

.wform__cols {
  display: flex;
  gap: var(--s-2);
  overflow-x: auto;
  border: 1px solid var(--rule);
  border-radius: var(--r-md);
  min-height: 12rem;
}

.wform__col {
  min-width: 14rem;
  flex: 0 0 auto;
  border-right: 1px solid var(--rule);
}

.wform__col:last-child { border-right: none; }

.wform__coltitle {
  padding: var(--s-2) var(--s-3);
  font-size: var(--t-xs);
  font-weight: 600;
  border-bottom: 1px solid var(--rule);
}

.wform__collist {
  max-height: 18rem;
  overflow-y: auto;
  background: transparent;
}

.wform__refine {
  border: 1px dashed var(--rule);
  border-radius: var(--r-md);
  padding: var(--s-3);
}

.wform__refine summary {
  cursor: pointer;
  font-size: var(--t-sm);
  font-weight: 600;
  color: var(--text-muted);
}

.wform__refinebody {
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
  margin-top: var(--s-3);
}

.wform__range {
  display: flex;
  gap: var(--s-3);
}

.wform__preview {
  padding: var(--s-3);
  border: 1px dashed var(--rule);
  border-radius: var(--r-md);
}

.wform__previewcount {
  margin: 0;
  font-weight: 600;
  font-size: var(--t-sm);
}

.wform__samples {
  margin: var(--s-2) 0 0;
  padding-left: var(--s-4);
  font-size: var(--t-sm);
  color: var(--text-muted);
}

.wform__error {
  margin: 0;
  color: var(--alerta);
  font-size: var(--t-sm);
}

.wform__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--s-2);
}
</style>
