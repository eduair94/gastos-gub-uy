<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const { t } = useI18n()
const api = useMonitorApi()

useSeo({ title: t('webhooks.title'), description: t('webhooks.lead'), path: '/app/webhooks', noindex: true })

interface Hook {
  _id: string
  url: string
  events: string[]
  active: boolean
  failureCount: number
  lastDeliveryAt: string | null
  createdAt: string
}

const hooks = ref<Hook[]>([])
const loading = ref(true)

async function refresh() {
  loading.value = true
  try {
    const res = await api.webhooks.list()
    hooks.value = res.data as Hook[]
  }
  finally {
    loading.value = false
  }
}
onMounted(refresh)

const EVENT_KEYS = ['tender.matched', 'anomaly.detected', 'award.created'] as const
function eventLabel(e: string): string {
  if (e === 'tender.matched') return t('webhooks.eventTenderMatched')
  if (e === 'anomaly.detected') return t('webhooks.eventAnomalyDetected')
  if (e === 'award.created') return t('webhooks.eventAwardCreated')
  return e
}

// ---- Create dialog ----
const createOpen = ref(false)
const form = reactive({
  url: '',
  events: [] as string[],
  minAmount: '' as string | number,
  categories: '',
})
const creating = ref(false)
const createError = ref('')

function openCreate() {
  form.url = ''
  form.events = []
  form.minAmount = ''
  form.categories = ''
  createError.value = ''
  createOpen.value = true
}

// ---- One-time secret reveal ----
const revealOpen = ref(false)
const newSecret = ref('')
const copied = ref(false)

async function submitCreate() {
  if (form.events.length === 0) {
    createError.value = t('webhooks.needEvent')
    return
  }
  const filters: Record<string, unknown> = {}
  const min = Number(form.minAmount)
  if (form.minAmount !== '' && Number.isFinite(min)) filters.minAmount = min
  const cats = form.categories.split(',').map(s => s.trim()).filter(Boolean)
  if (cats.length) filters.categories = cats

  creating.value = true
  createError.value = ''
  try {
    const res = await api.webhooks.create({
      url: form.url.trim(),
      events: form.events,
      ...(Object.keys(filters).length ? { filters } : {}),
    })
    newSecret.value = res.data.secret
    createOpen.value = false
    revealOpen.value = true
    await refresh()
  }
  catch {
    createError.value = t('webhooks.createError')
  }
  finally {
    creating.value = false
  }
}

async function copySecret() {
  if (import.meta.client && navigator.clipboard) {
    await navigator.clipboard.writeText(newSecret.value)
    copied.value = true
  }
}

// ---- Test + delete ----
const testResult = reactive<Record<string, string>>({})
async function testHook(row: Hook) {
  testResult[row._id] = '…'
  try {
    const res = await api.webhooks.test(row._id)
    testResult[row._id] = res.data.ok
      ? `${t('webhooks.testOk')}${res.data.status ? ` (${res.data.status})` : ''}`
      : t('webhooks.testFail')
  }
  catch {
    testResult[row._id] = t('webhooks.testFail')
  }
}

async function remove(row: Hook) {
  if (import.meta.client && !window.confirm(t('webhooks.removeConfirm'))) return
  await api.webhooks.remove(row._id)
  await refresh()
}

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString() : '—'
}
</script>

<template>
  <div class="u-container wh">
    <header class="wh__head">
      <p class="u-eyebrow">
        {{ t('webhooks.title') }}
      </p>
      <h1 class="u-hero">
        {{ t('webhooks.title') }}
      </h1>
      <p class="wh__lead">
        {{ t('webhooks.lead') }}
      </p>
    </header>

    <section class="panel wh__section">
      <p class="wh__intro">
        {{ t('webhooks.intro') }}
      </p>
      <a
        href="/docs"
        target="_blank"
        rel="noopener"
        class="wh__doclink"
      >
        <v-icon size="16">
          mdi-book-open-variant
        </v-icon>
        {{ t('webhooks.docsLink') }}
      </a>
    </section>

    <div class="wh__toolbar">
      <v-btn
        color="primary"
        prepend-icon="mdi-plus"
        @click="openCreate"
      >
        {{ t('webhooks.create') }}
      </v-btn>
    </div>

    <section class="panel wh__section">
      <div
        v-if="loading"
        class="wh__empty"
      >
        <v-progress-circular
          indeterminate
          size="24"
        />
      </div>
      <p
        v-else-if="hooks.length === 0"
        class="wh__empty"
      >
        {{ t('webhooks.empty') }}
      </p>
      <v-table
        v-else
        density="comfortable"
      >
        <thead>
          <tr>
            <th>{{ t('webhooks.colUrl') }}</th>
            <th>{{ t('webhooks.colEvents') }}</th>
            <th>{{ t('webhooks.colStatus') }}</th>
            <th>{{ t('webhooks.colCreated') }}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in hooks"
            :key="row._id"
          >
            <td class="u-mono wh__url">
              {{ row.url }}
            </td>
            <td>
              <v-chip
                v-for="e in row.events"
                :key="e"
                size="x-small"
                class="mr-1"
                label
              >
                {{ eventLabel(e) }}
              </v-chip>
            </td>
            <td>
              <v-chip
                size="x-small"
                :color="row.active ? 'success' : 'error'"
                label
              >
                {{ row.active ? t('webhooks.active') : t('webhooks.disabledState') }}
              </v-chip>
            </td>
            <td>{{ fmtDate(row.createdAt) }}</td>
            <td class="wh__actions">
              <v-btn
                variant="text"
                size="small"
                @click="testHook(row)"
              >
                {{ t('webhooks.test') }}
              </v-btn>
              <span
                v-if="testResult[row._id]"
                class="wh__testres"
              >{{ testResult[row._id] }}</span>
              <v-btn
                variant="text"
                size="small"
                color="error"
                @click="remove(row)"
              >
                {{ t('webhooks.remove') }}
              </v-btn>
            </td>
          </tr>
        </tbody>
      </v-table>
    </section>

    <!-- Create dialog -->
    <v-dialog
      v-model="createOpen"
      max-width="480"
    >
      <v-card>
        <v-card-title>{{ t('webhooks.createTitle') }}</v-card-title>
        <v-card-text>
          <v-text-field
            v-model="form.url"
            :label="t('webhooks.urlField')"
            :hint="t('webhooks.urlHint')"
            persistent-hint
            placeholder="https://"
            autofocus
          />
          <p class="wh__grouplabel">
            {{ t('webhooks.events') }}
          </p>
          <v-checkbox
            v-for="ek in EVENT_KEYS"
            :key="ek"
            v-model="form.events"
            :value="ek"
            :label="eventLabel(ek)"
            hide-details
            density="compact"
          />
          <p class="wh__grouplabel">
            {{ t('webhooks.filtersOptional') }}
          </p>
          <v-text-field
            v-model="form.minAmount"
            :label="t('webhooks.minAmount')"
            type="number"
            hide-details
            density="compact"
            class="mb-2"
          />
          <v-text-field
            v-model="form.categories"
            :label="t('webhooks.categories')"
            hide-details
            density="compact"
          />
          <p
            v-if="createError"
            class="wh__err"
          >
            {{ createError }}
          </p>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn
            variant="text"
            @click="createOpen = false"
          >
            {{ t('webhooks.cancel') }}
          </v-btn>
          <v-btn
            color="primary"
            :loading="creating"
            :disabled="!form.url.trim()"
            @click="submitCreate"
          >
            {{ t('webhooks.confirmCreate') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- One-time secret reveal -->
    <v-dialog
      v-model="revealOpen"
      max-width="520"
      persistent
    >
      <v-card>
        <v-card-title>{{ t('webhooks.createdTitle') }}</v-card-title>
        <v-card-text>
          <v-alert
            type="warning"
            variant="tonal"
            density="compact"
            class="mb-3"
          >
            {{ t('webhooks.createdWarning') }}
          </v-alert>
          <div class="wh__token">
            <code class="wh__tokencode">{{ newSecret }}</code>
            <v-btn
              size="small"
              variant="tonal"
              :color="copied ? 'success' : 'primary'"
              prepend-icon="mdi-content-copy"
              @click="copySecret"
            >
              {{ copied ? t('webhooks.copied') : t('webhooks.copy') }}
            </v-btn>
          </div>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn
            color="primary"
            @click="revealOpen = false; copied = false"
          >
            {{ t('webhooks.done') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
.wh { padding-block: var(--s-6) var(--s-8); max-width: 920px; }
.wh__head { margin-bottom: var(--s-5); }
.wh__lead { color: var(--text-muted); margin-top: var(--s-2); }
.wh__section { padding: var(--s-5); margin-bottom: var(--s-4); }
.wh__intro { margin: 0 0 var(--s-3); color: var(--text); }
.wh__doclink { display: inline-flex; align-items: center; gap: var(--s-2); color: var(--celeste-deep); text-decoration: none; font-size: var(--t-sm); }
.wh__doclink:hover { text-decoration: underline; }
.wh__toolbar { display: flex; justify-content: flex-end; margin-bottom: var(--s-3); }
.wh__empty { text-align: center; color: var(--text-muted); padding: var(--s-5); }
.wh__url { max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wh__actions { display: flex; align-items: center; gap: var(--s-1); flex-wrap: wrap; }
.wh__testres { font-size: var(--t-xs); color: var(--text-muted); }
.wh__grouplabel { margin: var(--s-4) 0 var(--s-1); font-size: var(--t-sm); color: var(--text-muted); }
.wh__err { color: var(--rojo, #c0392b); font-size: var(--t-sm); margin-top: var(--s-2); }
.wh__token { display: flex; align-items: center; gap: var(--s-3); flex-wrap: wrap; }
.wh__tokencode { flex: 1 1 260px; padding: var(--s-3); border: 1px solid var(--rule); border-radius: var(--r-md); background: var(--surface-sunken); font-family: var(--font-mono); font-size: var(--t-sm); word-break: break-all; }
.mr-1 { margin-right: 4px; }
.mb-2 { margin-bottom: var(--s-2); }
.mb-3 { margin-bottom: var(--s-3); }
</style>
