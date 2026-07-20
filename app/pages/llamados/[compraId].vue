<script setup lang="ts">
interface CallItem { description?: string, classificationId?: string, classificationLabel?: string, quantity?: number, unit?: { name?: string } }
interface CallDoc { title?: string, url: string, format?: string }
interface OpenCall {
  compraId: string
  ocid: string
  title: string
  description?: string
  buyer?: { id?: string, name?: string }
  procuringEntity?: { name?: string }
  procurementMethodDetails?: string
  status?: string
  publishDate?: string
  tenderPeriod?: { startDate?: string, endDate?: string }
  items?: CallItem[]
  documents?: CallDoc[]
  sourceUrl?: string | null
  savedByMe?: boolean
}

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const { user } = useAuth()
// Saving a call needs an account; hide the save control and its login hint when
// Firebase isn't configured. Viewing the call detail stays public.
const authEnabled = useAuthEnabled()
const api = useMonitorApi()
const { track } = useAnalytics()

const compraId = computed(() => String(route.params.compraId))

const { data } = await useFetch<{ data: OpenCall }>(() => `/api/open-calls/${compraId.value}`)
const call = computed<OpenCall>(() => data.value?.data ?? ({} as OpenCall))

// Guard against double-firing between SSR hydration and a later client nav.
let viewedId = ''
watch(compraId, (id) => {
  if (!id || id === viewedId) return
  viewedId = id
  track('view_item', { item_type: 'open_call', item_id: id })
}, { immediate: true })

const { data: benchData } = await useFetch<{ data: { benchmarks: Array<Record<string, unknown>> } }>(
  () => `/api/open-calls/${compraId.value}/benchmarks`,
)
const benchmarks = computed(() => benchData.value?.data?.benchmarks ?? [])

// "¿Cuánto ofertar para ganar?" — quantity × historical award unit price per line.
// (Bidder intel panel: estimate + benchmarks below.)
const { data: estimateData } = await useFetch<{ data: Record<string, unknown> }>(
  () => `/api/open-calls/${compraId.value}/estimate`,
)
const estimate = computed(() => estimateData.value?.data ?? null)

useSeo({
  title: call.value.title || t('llamados.title'),
  description: call.value.description || call.value.title || t('llamados.lead'),
  path: `/llamados/${compraId.value}`,
})

const statusLabel = computed(() => {
  const map: Record<string, string> = {
    open: 'statusOpen', clarification: 'statusClarification', amended: 'statusAmended',
    closed: 'statusClosed', awarded: 'statusAwarded', cancelled: 'statusCancelled',
  }
  return t(`llamados.${map[call.value.status || 'open'] || 'statusOpen'}`)
})

// --- Save / reminder (gated) ---
const saved = ref(false)
const reminderDays = ref<number>(0)
const savingState = ref(false)

onMounted(async () => {
  if (!user.value) return
  try {
    const res = await $fetch<{ data: OpenCall }>(`/api/open-calls/${compraId.value}`)
    saved.value = Boolean(res.data.savedByMe)
  }
  catch {
    saved.value = Boolean(call.value.savedByMe)
  }
})

async function toggleSave() {
  if (!user.value) return
  savingState.value = true
  try {
    if (saved.value) {
      await api.savedCalls.remove(compraId.value)
      saved.value = false
      reminderDays.value = 0
      track('call_unsave')
    }
    else {
      await api.savedCalls.save({ compraId: compraId.value })
      saved.value = true
      track('call_save')
    }
  }
  finally {
    savingState.value = false
  }
}

async function setReminder(days: number) {
  reminderDays.value = days
  if (!user.value) return
  await api.savedCalls.save({ compraId: compraId.value, reminderDaysBefore: days || undefined })
  saved.value = true
  track('call_reminder_set', { days })
}
</script>

<template>
  <div class="u-container calldetail">
    <NuxtLink
      :to="localePath('/llamados')"
      class="calldetail__back"
    >
      <v-icon size="16">
        mdi-arrow-left
      </v-icon> {{ t('nav.llamados') }}
    </NuxtLink>

    <header class="calldetail__head panel">
      <div class="calldetail__meta">
        <span class="tag tag--activo">{{ statusLabel }}</span>
        <span
          v-if="call.procurementMethodDetails"
          class="u-mono calldetail__method"
        >{{ call.procurementMethodDetails }}</span>
      </div>
      <h1 class="calldetail__title">
        {{ call.title }}
      </h1>
      <p
        v-if="call.buyer?.name"
        class="calldetail__buyer"
      >
        {{ call.buyer.name }}
      </p>
      <div class="calldetail__facts">
        <span
          v-if="call.tenderPeriod?.endDate"
          class="calldetail__fact"
        >
          <v-icon size="16">mdi-calendar-clock</v-icon>
          {{ t('llamados.closes') }} <strong>{{ formatDateTime(call.tenderPeriod.endDate) }}</strong>
        </span>
        <span
          v-if="call.publishDate"
          class="calldetail__fact u-muted"
        >
          {{ t('llamados.published') }} {{ formatDate(call.publishDate) }}
        </span>
      </div>

      <div class="calldetail__actions">
        <a
          v-if="call.sourceUrl"
          :href="call.sourceUrl"
          target="_blank"
          rel="noopener"
          class="calldetail__source"
        >
          <v-icon size="16">mdi-open-in-new</v-icon> {{ t('llamados.source') }}
        </a>

        <template v-if="user">
          <v-btn
            :variant="saved ? 'flat' : 'outlined'"
            :color="saved ? 'success' : undefined"
            :loading="savingState"
            size="small"
            @click="toggleSave"
          >
            <v-icon
              start
              size="16"
            >
              {{ saved ? 'mdi-bookmark' : 'mdi-bookmark-outline' }}
            </v-icon>
            {{ saved ? t('llamados.saved') : t('llamados.save') }}
          </v-btn>
          <v-select
            v-if="saved"
            :model-value="reminderDays"
            :items="[{ title: '—', value: 0 }, { title: '3', value: 3 }, { title: '7', value: 7 }]"
            :label="t('llamados.remind')"
            density="compact"
            hide-details
            class="calldetail__remind"
            @update:model-value="setReminder"
          />
        </template>
        <NuxtLink
          v-else-if="authEnabled"
          :to="localePath('/login')"
          class="calldetail__loginhint u-muted"
        >
          {{ t('llamados.loginToSave') }}
        </NuxtLink>
      </div>
    </header>

    <div class="calldetail__grid">
      <div class="calldetail__main">
        <section
          v-if="call.description"
          class="panel calldetail__section"
        >
          <h2 class="u-eyebrow">
            {{ t('llamados.object') }}
          </h2>
          <p class="calldetail__desc">
            {{ call.description }}
          </p>
        </section>

        <section
          v-if="call.items?.length"
          class="panel calldetail__section"
        >
          <h2 class="u-eyebrow">
            {{ t('llamados.items') }}
          </h2>
          <ul class="calldetail__items">
            <li
              v-for="(it, i) in call.items"
              :key="`it-${i}`"
              class="calldetail__item"
            >
              <span class="calldetail__itemdesc">{{ it.description }}</span>
              <span
                v-if="it.quantity"
                class="u-mono u-muted"
              >{{ formatNumber(it.quantity) }} {{ it.unit?.name }}</span>
            </li>
          </ul>
        </section>

        <CallBidEstimate :estimate="(estimate as any)" />

        <ClientOnly>
          <PliegoSummary
            :compra-id="compraId"
            :has-benchmarks="benchmarks.length > 0"
          />
        </ClientOnly>

        <CallBenchmarks :benchmarks="(benchmarks as any)" />
      </div>

      <aside class="calldetail__aside">
        <section
          v-if="call.documents?.length"
          class="panel calldetail__section"
        >
          <h2 class="u-eyebrow">
            {{ t('llamados.documents') }}
          </h2>
          <ul class="calldetail__docs">
            <li
              v-for="(d, i) in call.documents"
              :key="`d-${i}`"
            >
              <a
                :href="d.url"
                target="_blank"
                rel="noopener"
                class="calldetail__doc"
              >
                <v-icon size="16">mdi-file-document-outline</v-icon>
                <span class="u-truncate">{{ d.title || t('llamados.openDocument') }}</span>
              </a>
            </li>
          </ul>
        </section>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.calldetail { padding-block: var(--s-5) var(--s-8); }
.calldetail__back {
  display: inline-flex;
  align-items: center;
  gap: var(--s-1);
  color: var(--celeste-deep);
  text-decoration: none;
  font-size: var(--t-sm);
  margin-bottom: var(--s-4);
}
.calldetail__head { padding: var(--s-5); margin-bottom: var(--s-4); }
.calldetail__meta { display: flex; align-items: center; gap: var(--s-2); flex-wrap: wrap; margin-bottom: var(--s-3); }
.calldetail__method { font-size: var(--t-xs); color: var(--text-muted); }
.calldetail__title { font-family: var(--font-display); font-weight: 800; font-size: var(--t-2xl); line-height: 1.2; margin: 0 0 var(--s-2); }
.calldetail__buyer { font-size: var(--t-base); color: var(--text-muted); margin: 0 0 var(--s-3); }
.calldetail__facts { display: flex; flex-wrap: wrap; gap: var(--s-4); margin-bottom: var(--s-4); }
.calldetail__fact { display: inline-flex; align-items: center; gap: var(--s-1); font-size: var(--t-sm); }
.calldetail__actions { display: flex; align-items: center; gap: var(--s-3); flex-wrap: wrap; }
.calldetail__source { display: inline-flex; align-items: center; gap: var(--s-1); color: var(--celeste-deep); text-decoration: none; font-size: var(--t-sm); }
.calldetail__source:hover { text-decoration: underline; }
.calldetail__remind { max-width: 120px; }
.calldetail__loginhint { font-size: var(--t-sm); text-decoration: none; }
.calldetail__grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--s-4); }
@media (min-width: 900px) { .calldetail__grid { grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); } }
.calldetail__main, .calldetail__aside { display: flex; flex-direction: column; gap: var(--s-4); }
.calldetail__section { padding: var(--s-5); }
.calldetail__section h2 { margin: 0 0 var(--s-3); }
.calldetail__desc { line-height: 1.6; margin: 0; }
.calldetail__items { list-style: none; margin: 0; padding: 0; }
.calldetail__item { display: flex; justify-content: space-between; gap: var(--s-3); padding: var(--s-2) 0; border-bottom: 1px solid var(--rule); }
.calldetail__item:last-child { border-bottom: 0; }
.calldetail__docs { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--s-2); }
.calldetail__doc { display: flex; align-items: center; gap: var(--s-2); color: var(--celeste-deep); text-decoration: none; font-size: var(--t-sm); }
.calldetail__doc:hover { text-decoration: underline; }
</style>
