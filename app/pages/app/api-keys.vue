<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const { t } = useI18n()
const api = useMonitorApi()
const { track } = useAnalytics()

useSeo({ title: t('apiKeys.title'), description: t('apiKeys.lead'), path: '/app/api-keys', noindex: true })

interface KeyRow {
  _id: string
  label: string
  prefix: string
  scopes: string[]
  lastUsedAt: string | null
  createdAt: string
}

const keys = ref<KeyRow[]>([])
const loading = ref(true)

async function refresh() {
  loading.value = true
  try {
    const res = await api.apiKeys.list()
    keys.value = res.data as KeyRow[]
  }
  finally {
    loading.value = false
  }
}

onMounted(refresh)

// ---- Create dialog ----
const createOpen = ref(false)
const form = reactive({ label: '', read: true, write: false })
const creating = ref(false)
const createError = ref('')

function openCreate() {
  form.label = ''
  form.read = true
  form.write = false
  createError.value = ''
  createOpen.value = true
}

// ---- One-time secret reveal ----
const revealOpen = ref(false)
const newToken = ref('')

async function submitCreate() {
  const scopes = [
    ...(form.read ? ['read'] : []),
    ...(form.write ? ['write'] : []),
  ]
  if (scopes.length === 0) scopes.push('read')
  creating.value = true
  createError.value = ''
  try {
    const res = await api.apiKeys.create({ label: form.label.trim(), scopes })
    newToken.value = res.data.token
    track('api_key_create', { scopes: scopes.join(',') })
    createOpen.value = false
    revealOpen.value = true
    await refresh()
  }
  catch {
    createError.value = t('apiKeys.createError')
    track('api_key_create_error')
  }
  finally {
    creating.value = false
  }
}

// ---- Copy + revoke ----
const copied = ref(false)
async function copyToken() {
  if (import.meta.client && navigator.clipboard) {
    await navigator.clipboard.writeText(newToken.value)
    copied.value = true
    track('api_key_copy')
  }
}

async function revoke(row: KeyRow) {
  if (import.meta.client && !window.confirm(t('apiKeys.revokeConfirm'))) return
  await api.apiKeys.revoke(row._id)
  track('api_key_revoke')
  await refresh()
}

function fmtDate(iso: string | null): string {
  if (!iso) return t('apiKeys.never')
  return new Date(iso).toLocaleDateString()
}
</script>

<template>
  <div class="u-container keys">
    <header class="keys__head">
      <p class="u-eyebrow">
        {{ t('apiKeys.title') }}
      </p>
      <h1 class="u-hero">
        {{ t('apiKeys.title') }}
      </h1>
      <p class="keys__lead">
        {{ t('apiKeys.lead') }}
      </p>
    </header>

    <section class="panel keys__section">
      <p class="keys__intro">
        {{ t('apiKeys.intro') }}
      </p>
      <!-- /docs is same-origin, so the global outbound-link delegate ignores it;
           this is the only signal that anyone reached the API reference. -->
      <a
        href="/docs"
        target="_blank"
        rel="noopener"
        class="keys__doclink"
        @click="track('docs_open', { source: 'api_keys' })"
      >
        <v-icon size="16">mdi-book-open-variant</v-icon>
        {{ t('apiKeys.docsLink') }}
      </a>
    </section>

    <div class="keys__toolbar">
      <v-btn
        color="primary"
        prepend-icon="mdi-plus"
        @click="openCreate"
      >
        {{ t('apiKeys.create') }}
      </v-btn>
    </div>

    <section class="panel keys__section">
      <div
        v-if="loading"
        class="keys__empty"
      >
        <v-progress-circular
          indeterminate
          size="24"
        />
      </div>
      <p
        v-else-if="keys.length === 0"
        class="keys__empty"
      >
        {{ t('apiKeys.empty') }}
      </p>
      <v-table
        v-else
        density="comfortable"
      >
        <thead>
          <tr>
            <th>{{ t('apiKeys.colLabel') }}</th>
            <th>{{ t('apiKeys.colPrefix') }}</th>
            <th>{{ t('apiKeys.colScopes') }}</th>
            <th>{{ t('apiKeys.colCreated') }}</th>
            <th>{{ t('apiKeys.colLastUsed') }}</th>
            <th>{{ t('apiKeys.colActions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in keys"
            :key="row._id"
          >
            <td>{{ row.label }}</td>
            <td class="u-mono">
              {{ row.prefix }}…
            </td>
            <td>
              <v-chip
                v-for="s in row.scopes"
                :key="s"
                size="x-small"
                class="mr-1"
                :color="s === 'write' ? 'warning' : 'default'"
                label
              >
                {{ s === 'write' ? t('apiKeys.scopeWrite').split(' —')[0] : t('apiKeys.scopeRead').split(' —')[0] }}
              </v-chip>
            </td>
            <td>{{ fmtDate(row.createdAt) }}</td>
            <td>{{ fmtDate(row.lastUsedAt) }}</td>
            <td>
              <v-btn
                variant="text"
                size="small"
                color="error"
                @click="revoke(row)"
              >
                {{ t('apiKeys.revoke') }}
              </v-btn>
            </td>
          </tr>
        </tbody>
      </v-table>
    </section>

    <!-- Create dialog -->
    <v-dialog
      v-model="createOpen"
      max-width="440"
    >
      <v-card>
        <v-card-title>{{ t('apiKeys.createTitle') }}</v-card-title>
        <v-card-text>
          <v-text-field
            v-model="form.label"
            :label="t('apiKeys.labelField')"
            :hint="t('apiKeys.labelHint')"
            persistent-hint
            maxlength="60"
            autofocus
          />
          <p class="keys__scopelabel">
            {{ t('apiKeys.scopes') }}
          </p>
          <v-checkbox
            v-model="form.read"
            :label="t('apiKeys.scopeRead')"
            hide-details
            density="compact"
          />
          <v-checkbox
            v-model="form.write"
            :label="t('apiKeys.scopeWrite')"
            hide-details
            density="compact"
          />
          <p
            v-if="createError"
            class="keys__err"
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
            {{ t('apiKeys.cancel') }}
          </v-btn>
          <v-btn
            color="primary"
            :loading="creating"
            :disabled="!form.label.trim()"
            @click="submitCreate"
          >
            {{ t('apiKeys.confirmCreate') }}
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
        <v-card-title>{{ t('apiKeys.createdTitle') }}</v-card-title>
        <v-card-text>
          <v-alert
            type="warning"
            variant="tonal"
            density="compact"
            class="mb-3"
          >
            {{ t('apiKeys.createdWarning') }}
          </v-alert>
          <div class="keys__token">
            <code class="keys__tokencode">{{ newToken }}</code>
            <v-btn
              size="small"
              variant="tonal"
              :color="copied ? 'success' : 'primary'"
              prepend-icon="mdi-content-copy"
              @click="copyToken"
            >
              {{ copied ? t('apiKeys.copied') : t('apiKeys.copy') }}
            </v-btn>
          </div>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn
            color="primary"
            @click="revealOpen = false; copied = false"
          >
            {{ t('apiKeys.done') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
.keys { padding-block: var(--s-6) var(--s-8); max-width: 860px; }
.keys__head { margin-bottom: var(--s-5); }
.keys__lead { color: var(--text-muted); margin-top: var(--s-2); }
.keys__section { padding: var(--s-5); margin-bottom: var(--s-4); }
.keys__intro { margin: 0 0 var(--s-3); color: var(--text); }
.keys__doclink { display: inline-flex; align-items: center; gap: var(--s-2); color: var(--celeste-deep); text-decoration: none; font-size: var(--t-sm); }
.keys__doclink:hover { text-decoration: underline; }
.keys__toolbar { display: flex; justify-content: flex-end; margin-bottom: var(--s-3); }
.keys__empty { text-align: center; color: var(--text-muted); padding: var(--s-5); }
.keys__scopelabel { margin: var(--s-4) 0 var(--s-1); font-size: var(--t-sm); color: var(--text-muted); }
/* --rojo is not a token in this system; it fell back to a hex that ignores the
   theme, so error text stayed dark red on the dark surface. --alerta is the signal. */
.keys__err { color: var(--alerta); font-size: var(--t-sm); margin-top: var(--s-2); }
.keys__token { display: flex; align-items: center; gap: var(--s-3); flex-wrap: wrap; }
.keys__tokencode { flex: 1 1 260px; padding: var(--s-3); border: 1px solid var(--rule); border-radius: var(--r-md); background: var(--surface-sunken); font-family: var(--font-mono); font-size: var(--t-sm); word-break: break-all; }
.mr-1 { margin-right: 4px; }
.mb-3 { margin-bottom: var(--s-3); }
</style>
