<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const { t } = useI18n()
const localePath = useLocalePath()
const { user, logout } = useAuth()
const api = useMonitorApi()

useSeo({ title: t('accountPage.title'), description: t('accountPage.title'), path: '/app/cuenta', noindex: true })

const { data } = await useFetch<{ data: { email: string, emailVerified: boolean, locale: string, notificationPrefs: { enabled: boolean, frequency: string } } }>(
  '/api/account/preferences',
  { server: false },
)

const form = reactive({ enabled: true, frequency: 'instant', locale: 'es' })

watch(data, (d) => {
  if (d?.data) {
    form.enabled = d.data.notificationPrefs?.enabled ?? true
    form.frequency = d.data.notificationPrefs?.frequency ?? 'instant'
    form.locale = d.data.locale ?? 'es'
  }
}, { immediate: true })

const saving = ref(false)
const savedOk = ref(false)

async function save() {
  saving.value = true
  savedOk.value = false
  try {
    await api.account.updatePrefs({ enabled: form.enabled, frequency: form.frequency, locale: form.locale })
    savedOk.value = true
  }
  finally {
    saving.value = false
  }
}

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
.cuenta__actions { display: flex; align-items: center; gap: var(--s-3); }
.cuenta__ok { color: var(--verde); font-size: var(--t-sm); }
</style>
