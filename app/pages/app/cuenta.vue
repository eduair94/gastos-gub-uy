<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const { t } = useI18n()
const localePath = useLocalePath()
const { user, logout } = useAuth()
const api = useMonitorApi()
const push = useWebPush()
const pwa = usePwaInstall()

useSeo({ title: t('accountPage.title'), description: t('accountPage.title'), path: '/app/cuenta', noindex: true })

interface PrefsData {
  email: string
  emailVerified: boolean
  locale: string
  notificationPrefs: { enabled: boolean, frequency: string, channels?: { email?: boolean, push?: boolean, telegram?: boolean, inapp?: boolean } }
  telegram: { linked: boolean, username: string | null }
  push: { devices: number }
}

const { data, refresh } = await useFetch<{ data: PrefsData }>('/api/account/preferences', { server: false })

const form = reactive({
  enabled: true,
  frequency: 'instant',
  locale: 'es',
  channels: { email: true, inapp: true },
})
const telegram = reactive({ linked: false, username: null as string | null })

watch(data, (d) => {
  if (d?.data) {
    const p = d.data.notificationPrefs
    form.enabled = p?.enabled ?? true
    form.frequency = p?.frequency ?? 'instant'
    form.locale = d.data.locale ?? 'es'
    form.channels.email = p?.channels?.email ?? true
    form.channels.inapp = p?.channels?.inapp ?? true
    telegram.linked = d.data.telegram?.linked ?? false
    telegram.username = d.data.telegram?.username ?? null
  }
}, { immediate: true })

onMounted(() => {
  push.readState()
  // The Telegram link completes in another tab — refresh state when we return.
  window.addEventListener('focus', refresh)
})
onBeforeUnmount(() => window.removeEventListener('focus', refresh))

const saving = ref(false)
const savedOk = ref(false)

async function save() {
  saving.value = true
  savedOk.value = false
  try {
    await api.account.updatePrefs({
      enabled: form.enabled,
      frequency: form.frequency,
      locale: form.locale,
      channels: { email: form.channels.email, inapp: form.channels.inapp },
    })
    savedOk.value = true
  }
  finally {
    saving.value = false
  }
}

// ---- Push ----
async function togglePush() {
  if (push.isSubscribed.value) await push.unsubscribe()
  else await push.subscribe()
  await refresh()
}

// ---- Telegram ----
const tgLoading = ref(false)
async function linkTelegram() {
  tgLoading.value = true
  try {
    const res = await api.telegram.link()
    window.open(res.data.url, '_blank', 'noopener')
  }
  catch {
    // 503 when not configured — the row shows the not-configured hint instead
  }
  finally {
    tgLoading.value = false
  }
}
async function unlinkTelegram() {
  tgLoading.value = true
  try {
    await api.telegram.unlink()
    telegram.linked = false
    telegram.username = null
  }
  finally {
    tgLoading.value = false
  }
}
const telegramConfigured = computed(() => !!useRuntimeConfig().public.telegramBotUsername)

async function onLogout() {
  await logout()
  await navigateTo(localePath('/'))
}
</script>

<template>
  <div class="u-container cuenta">
    <header class="cuenta__head">
      <p class="u-eyebrow">
        {{ t('accountPage.title') }}
      </p>
      <h1 class="u-hero">
        {{ t('accountPage.title') }}
      </h1>
    </header>

    <section class="panel cuenta__section">
      <div
        class="cuenta__row"
        data-tour="account-email"
      >
        <span class="cuenta__label">{{ t('accountPage.email') }}</span>
        <span class="u-mono">{{ user?.email }}</span>
        <span
          class="tag"
          :class="user?.emailVerified ? 'tag--activo' : 'tag--alerta'"
        >
          {{ user?.emailVerified ? t('accountPage.verified') : t('accountPage.notVerified') }}
        </span>
      </div>
    </section>

    <!-- Master switch + frequency + language -->
    <section class="panel cuenta__section">
      <h2 class="u-eyebrow">
        {{ t('accountPage.notifications') }}
      </h2>
      <v-switch
        v-model="form.enabled"
        :label="t('accountPage.enabled')"
        color="success"
        hide-details
        data-tour="notif-enabled"
      />
      <v-select
        v-model="form.frequency"
        :items="[{ title: t('accountPage.instant'), value: 'instant' }, { title: t('accountPage.daily'), value: 'daily' }]"
        :label="t('accountPage.frequency')"
        :disabled="!form.enabled"
        hide-details
        class="cuenta__field"
        data-tour="notif-frequency"
      />
      <v-select
        v-model="form.locale"
        :items="[{ title: 'Español', value: 'es' }, { title: 'English', value: 'en' }]"
        :label="t('accountPage.language')"
        hide-details
        class="cuenta__field"
      />
    </section>

    <!-- Per-channel delivery -->
    <section class="panel cuenta__section">
      <h2 class="u-eyebrow">
        {{ t('accountPage.channelsTitle') }}
      </h2>

      <!-- Email -->
      <div class="chan">
        <div class="chan__info">
          <v-icon
            size="20"
            class="chan__icon"
          >
            mdi-email-outline
          </v-icon>
          <div>
            <p class="chan__name">
              {{ t('accountPage.channelEmail') }}
            </p>
            <p class="chan__hint">
              {{ t('accountPage.channelEmailHint') }}
            </p>
          </div>
        </div>
        <v-switch
          v-model="form.channels.email"
          color="success"
          hide-details
          density="compact"
          :disabled="!form.enabled || !user?.emailVerified"
        />
      </div>

      <!-- In-app -->
      <div class="chan">
        <div class="chan__info">
          <v-icon
            size="20"
            class="chan__icon"
          >
            mdi-bell-outline
          </v-icon>
          <div>
            <p class="chan__name">
              {{ t('accountPage.channelInapp') }}
            </p>
            <p class="chan__hint">
              {{ t('accountPage.channelInappHint') }}
            </p>
          </div>
        </div>
        <v-switch
          v-model="form.channels.inapp"
          color="success"
          hide-details
          density="compact"
          :disabled="!form.enabled"
        />
      </div>

      <!-- Push -->
      <div class="chan">
        <div class="chan__info">
          <v-icon
            size="20"
            class="chan__icon"
          >
            mdi-cellphone-message
          </v-icon>
          <div>
            <p class="chan__name">
              {{ t('accountPage.channelPush') }}
            </p>
            <p class="chan__hint">
              <template v-if="!push.isSupported.value">{{ t('accountPage.pushUnsupported') }}</template>
              <template v-else-if="push.permission.value === 'denied'">{{ t('accountPage.pushBlocked') }}</template>
              <template v-else>{{ t('accountPage.channelPushHint') }} · {{ t('accountPage.pushDevices', { count: data?.data.push.devices ?? 0 }) }}</template>
            </p>
          </div>
        </div>
        <v-btn
          v-if="push.isAvailable.value && push.permission.value !== 'denied'"
          :color="push.isSubscribed.value ? undefined : 'primary'"
          :variant="push.isSubscribed.value ? 'outlined' : 'flat'"
          size="small"
          :loading="push.loading.value"
          @click="togglePush"
        >
          {{ push.isSubscribed.value ? t('accountPage.pushDisable') : t('accountPage.pushEnable') }}
        </v-btn>
      </div>

      <!-- Telegram -->
      <div class="chan">
        <div class="chan__info">
          <v-icon
            size="20"
            class="chan__icon"
          >
            mdi-send
          </v-icon>
          <div>
            <p class="chan__name">
              {{ t('accountPage.channelTelegram') }}
            </p>
            <p class="chan__hint">
              <template v-if="!telegramConfigured">{{ t('accountPage.telegramNotConfigured') }}</template>
              <template v-else-if="telegram.linked && telegram.username">{{ t('accountPage.telegramLinked', { username: telegram.username }) }}</template>
              <template v-else-if="telegram.linked">{{ t('accountPage.telegramLinkedNoUser') }}</template>
              <template v-else>{{ t('accountPage.channelTelegramHint') }} · {{ t('accountPage.telegramOpenHint') }}</template>
            </p>
          </div>
        </div>
        <v-btn
          v-if="telegramConfigured"
          :color="telegram.linked ? undefined : 'primary'"
          :variant="telegram.linked ? 'outlined' : 'flat'"
          size="small"
          :loading="tgLoading"
          @click="telegram.linked ? unlinkTelegram() : linkTelegram()"
        >
          {{ telegram.linked ? t('accountPage.telegramUnlink') : t('accountPage.telegramLink') }}
        </v-btn>
      </div>

      <div class="cuenta__actions">
        <v-btn
          color="primary"
          :loading="saving"
          data-tour="notif-save"
          @click="save"
        >
          {{ t('accountPage.save') }}
        </v-btn>
        <span
          v-if="savedOk"
          class="cuenta__ok"
        >{{ t('accountPage.saved') }}</span>
      </div>
    </section>

    <!-- Install as app -->
    <section
      v-if="pwa.canInstall.value || pwa.installed.value"
      class="panel cuenta__section"
    >
      <div class="chan">
        <div class="chan__info">
          <v-icon
            size="20"
            class="chan__icon"
          >
            mdi-download-box-outline
          </v-icon>
          <div>
            <p class="chan__name">
              {{ pwa.installed.value ? t('accountPage.installed') : t('accountPage.installApp') }}
            </p>
            <p class="chan__hint">
              {{ t('accountPage.installHint') }}
            </p>
          </div>
        </div>
        <v-btn
          v-if="pwa.canInstall.value"
          color="primary"
          variant="flat"
          size="small"
          @click="pwa.install()"
        >
          {{ t('accountPage.installApp') }}
        </v-btn>
      </div>
    </section>

    <section class="panel cuenta__section">
      <v-btn
        variant="outlined"
        color="error"
        prepend-icon="mdi-logout"
        @click="onLogout"
      >
        {{ t('accountPage.logout') }}
      </v-btn>
    </section>
  </div>
</template>

<style scoped>
.cuenta { padding-block: var(--s-6) var(--s-8); max-width: 640px; }
.cuenta__head { margin-bottom: var(--s-5); }
.cuenta__section { padding: var(--s-5); margin-bottom: var(--s-4); display: flex; flex-direction: column; gap: var(--s-3); }
.cuenta__section h2 { margin: 0; }
.cuenta__row { display: flex; align-items: center; gap: var(--s-3); flex-wrap: wrap; }
.cuenta__label { color: var(--text-muted); font-size: var(--t-sm); min-width: 80px; }
.cuenta__field { max-width: 320px; }
.cuenta__actions { display: flex; align-items: center; gap: var(--s-3); margin-top: var(--s-2); }
.cuenta__ok { color: var(--verde); font-size: var(--t-sm); }

.chan { display: flex; align-items: center; justify-content: space-between; gap: var(--s-4); padding: var(--s-2) 0; border-top: 1px solid var(--rule); }
.chan:first-of-type { border-top: 0; }
.chan__info { display: flex; align-items: flex-start; gap: var(--s-3); min-width: 0; }
.chan__icon { color: var(--celeste); margin-top: 2px; }
.chan__name { margin: 0; font-weight: 600; font-size: var(--t-sm); }
.chan__hint { margin: 2px 0 0; font-size: var(--t-xs); color: var(--text-muted); line-height: 1.4; }
</style>
