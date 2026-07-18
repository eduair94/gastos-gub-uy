<script setup lang="ts">
interface WatchDoc {
  _id?: string
  name?: string
  categories?: string[]
  keywords?: string[]
  keywordMode?: 'any' | 'all'
  active?: boolean
}

const props = defineProps<{ modelValue?: WatchDoc | null }>()
const emit = defineEmits<{ saved: [], cancel: [] }>()

const { t } = useI18n()
const api = useMonitorApi()

const editing = computed(() => Boolean(props.modelValue?._id))

const form = reactive({
  name: props.modelValue?.name ?? '',
  categories: [...(props.modelValue?.categories ?? [])] as string[],
  keywords: [...(props.modelValue?.keywords ?? [])] as string[],
  keywordMode: (props.modelValue?.keywordMode ?? 'any') as 'any' | 'all',
  active: props.modelValue?.active ?? true,
})

// --- Category autocomplete (async against /api/categories) ---
const categoryItems = ref<Array<{ code: string, description: string }>>([])
const categoryLoading = ref(false)
let catTimer: ReturnType<typeof setTimeout> | null = null

function onCategorySearch(q: string) {
  if (catTimer) clearTimeout(catTimer)
  catTimer = setTimeout(async () => {
    categoryLoading.value = true
    try {
      const res = await api.categories.search(q ?? '', 30)
      categoryItems.value = res.data
    }
    catch {
      categoryItems.value = []
    }
    finally {
      categoryLoading.value = false
    }
  }, 250)
}

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
      const res = await api.watches.test({
        name: form.name || 'preview',
        categories: form.categories,
        keywords: form.keywords,
        keywordMode: form.keywordMode,
        buyers: [],
      })
      preview.value = res.data
    }
    catch {
      preview.value = null
    }
    finally {
      previewLoading.value = false
    }
  }, 500)
}

watch(() => [form.categories, form.keywords, form.keywordMode], schedulePreview, { deep: true })
onMounted(() => {
  onCategorySearch('')
  schedulePreview()
})

const saving = ref(false)
const error = ref('')

async function save() {
  error.value = ''
  if (!form.name.trim()) {
    error.value = t('alerts.name')
    return
  }
  if (!form.categories.length && !form.keywords.length) {
    error.value = t('alerts.needTrigger')
    return
  }
  saving.value = true
  try {
    const payload = {
      name: form.name.trim(),
      categories: form.categories,
      keywords: form.keywords,
      keywordMode: form.keywordMode,
      buyers: [],
      active: form.active,
    }
    if (editing.value && props.modelValue?._id) {
      await api.watches.update(props.modelValue._id, payload)
    }
    else {
      await api.watches.create(payload)
    }
    emit('saved')
  }
  catch (e) {
    const err = e as { data?: { statusMessage?: string }, statusMessage?: string }
    error.value = err?.data?.statusMessage || err?.statusMessage || t('auth.genericError')
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <form class="wform panel" @submit.prevent="save">
    <h2 class="wform__h u-eyebrow">
      {{ editing ? t('alerts.edit') : t('alerts.new') }}
    </h2>

    <v-text-field
      v-model="form.name"
      :label="t('alerts.name')"
      :placeholder="t('alerts.namePlaceholder')"
      maxlength="120"
    />

    <v-autocomplete
      v-model="form.categories"
      :items="categoryItems"
      :loading="categoryLoading"
      item-title="description"
      item-value="code"
      :label="t('alerts.categories')"
      :hint="t('alerts.categoriesHint')"
      persistent-hint
      multiple
      chips
      closable-chips
      no-filter
      @update:search="onCategorySearch"
    />

    <v-combobox
      v-model="form.keywords"
      :label="t('alerts.keywords')"
      :hint="t('alerts.keywordsHint')"
      persistent-hint
      multiple
      chips
      closable-chips
    />

    <div class="wform__row">
      <span class="wform__label">{{ t('alerts.keywordMode') }}</span>
      <v-btn-toggle v-model="form.keywordMode" density="comfortable" mandatory variant="outlined">
        <v-btn value="any" size="small">{{ t('alerts.modeAny') }}</v-btn>
        <v-btn value="all" size="small">{{ t('alerts.modeAll') }}</v-btn>
      </v-btn-toggle>
    </div>

    <v-switch
      v-model="form.active"
      :label="t('alerts.active')"
      color="success"
      hide-details
    />

    <div v-if="previewLoading" class="wform__preview u-muted">
      …
    </div>
    <div v-else-if="preview" class="wform__preview">
      <p class="wform__previewcount">
        {{ preview.total > 0 ? t('alerts.preview', { n: preview.total }) : t('alerts.previewNone') }}
      </p>
      <ul v-if="preview.sample.length" class="wform__samples">
        <li v-for="s in preview.sample" :key="s.compraId" class="u-truncate">
          {{ s.title }}
        </li>
      </ul>
    </div>

    <p v-if="error" class="wform__error">
      {{ error }}
    </p>

    <div class="wform__actions">
      <v-btn variant="text" @click="emit('cancel')">
        {{ t('alerts.cancel') }}
      </v-btn>
      <v-btn color="primary" type="submit" :loading="saving">
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
  color: var(--text-muted);
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
