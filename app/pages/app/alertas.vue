<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const { t } = useI18n()
const api = useMonitorApi()

useSeo({ title: t('alerts.title'), description: t('alerts.lead'), path: '/app/alertas', noindex: true })

interface Watch {
  _id: string
  name: string
  active?: boolean
  categories?: string[]
  keywords?: string[]
  keywordMode?: 'any' | 'all'
  lastMatchedAt?: string
}

const { data, refresh } = await useFetch<{ data: Watch[] }>('/api/watches', { server: false })
const watches = computed(() => data.value?.data ?? [])

const showForm = ref(false)
const editing = ref<Watch | null>(null)

function newWatch() {
  editing.value = null
  showForm.value = true
}
function editWatch(w: Watch) {
  editing.value = w
  showForm.value = true
}
async function onSaved() {
  showForm.value = false
  editing.value = null
  await refresh()
}
async function remove(w: Watch) {
  if (!window.confirm(t('alerts.deleteConfirm'))) return
  await api.watches.remove(w._id)
  await refresh()
}
</script>

<template>
  <div class="u-container alertas">
    <header class="alertas__head">
      <div>
        <p class="u-eyebrow">
          {{ t('alerts.title') }}
        </p>
        <h1 class="u-hero">
          {{ t('alerts.title') }}
        </h1>
        <p class="u-lead">
          {{ t('alerts.lead') }}
        </p>
      </div>
      <v-btn
        v-if="!showForm"
        color="primary"
        prepend-icon="mdi-plus"
        @click="newWatch"
      >
        {{ t('alerts.new') }}
      </v-btn>
    </header>

    <WatchForm
      v-if="showForm"
      :model-value="editing"
      class="alertas__form"
      @saved="onSaved"
      @cancel="showForm = false"
    />

    <div
      v-if="watches.length"
      class="alertas__list"
    >
      <article
        v-for="w in watches"
        :key="w._id"
        class="panel alertas__item"
      >
        <div class="alertas__itemhead">
          <h3 class="alertas__name">
            {{ w.name }}
          </h3>
          <span
            class="tag"
            :class="w.active ? 'tag--activo' : 'tag--neutral'"
          >
            {{ w.active ? t('alerts.activeChip') : t('alerts.pausedChip') }}
          </span>
        </div>
        <p
          v-if="w.keywords?.length"
          class="alertas__kw u-mono u-muted"
        >
          {{ w.keywords.join(' · ') }}
        </p>
        <p
          v-if="w.categories?.length"
          class="alertas__cat u-muted"
        >
          {{ t('alerts.productsCount', { n: w.categories.length }) }}
        </p>
        <p
          v-if="w.lastMatchedAt"
          class="alertas__last u-muted"
        >
          {{ t('alerts.lastMatched', { date: formatDate(w.lastMatchedAt) }) }}
        </p>
        <div class="alertas__actions">
          <v-btn
            variant="text"
            size="small"
            prepend-icon="mdi-pencil"
            @click="editWatch(w)"
          >
            {{ t('alerts.edit') }}
          </v-btn>
          <v-btn
            variant="text"
            size="small"
            color="error"
            prepend-icon="mdi-delete-outline"
            @click="remove(w)"
          >
            {{ t('alerts.delete') }}
          </v-btn>
        </div>
      </article>
    </div>
    <div
      v-else-if="!showForm"
      class="panel alertas__empty"
    >
      {{ t('alerts.empty') }}
    </div>
  </div>
</template>

<style scoped>
.alertas { padding-block: var(--s-6) var(--s-8); }
.alertas__head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--s-4); flex-wrap: wrap; margin-bottom: var(--s-5); }
.alertas__form { margin-bottom: var(--s-5); }
.alertas__list { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: var(--s-3); }
.alertas__item { padding: var(--s-4); display: flex; flex-direction: column; gap: var(--s-2); }
.alertas__itemhead { display: flex; align-items: center; justify-content: space-between; gap: var(--s-2); }
.alertas__name { font-family: var(--font-display); font-weight: 700; font-size: var(--t-base); margin: 0; }
.alertas__kw, .alertas__cat, .alertas__last { margin: 0; font-size: var(--t-xs); }
.alertas__actions { display: flex; gap: var(--s-1); margin-top: var(--s-1); }
.alertas__empty { padding: var(--s-6); text-align: center; color: var(--text-muted); }
</style>
