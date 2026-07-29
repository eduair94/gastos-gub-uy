<script setup lang="ts">
const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const authEnabled = useAuthEnabled()
const { user, isAuthed, refresh } = useAuth()
const api = useMonitorApi()
const { track } = useAnalytics()

const loading = ref(false)
const error = ref(false)
const subscribed = computed(() => user.value?.newsletter?.subscribed === true)
const registrationTo = computed(() => ({
  path: localePath('/registro'),
  query: { newsletter: '1', redirect: route.fullPath },
}))

async function toggle(): Promise<void> {
  loading.value = true
  error.value = false
  const next = !subscribed.value
  try {
    await api.account.updatePrefs({ newsletterSubscribed: next })
    await refresh()
    track(next ? 'newsletter_subscribe' : 'newsletter_unsubscribe')
  }
  catch {
    error.value = true
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <aside class="subscribe">
    <div class="subscribe__copy">
      <p class="u-eyebrow">
        {{ t('newsletter.subscriptionEyebrow') }}
      </p>
      <h2>{{ t('newsletter.subscriptionTitle') }}</h2>
      <p>{{ t('newsletter.subscriptionBody') }}</p>
      <p class="subscribe__privacy">
        {{ t('newsletter.subscriptionPrivacy') }}
      </p>
    </div>
    <div
      v-if="authEnabled"
      class="subscribe__action"
    >
      <v-btn
        v-if="isAuthed"
        :variant="subscribed ? 'outlined' : 'flat'"
        :color="subscribed ? undefined : 'primary'"
        :loading="loading"
        @click="toggle"
      >
        {{ subscribed ? t('newsletter.unsubscribeAction') : t('newsletter.subscribeAction') }}
      </v-btn>
      <v-btn
        v-else
        color="primary"
        :to="registrationTo"
      >
        {{ t('newsletter.subscribeAction') }}
      </v-btn>
      <span
        v-if="subscribed"
        class="subscribe__state"
      >{{ t('newsletter.subscribedState') }}</span>
      <span
        v-if="error"
        class="subscribe__error"
      >{{ t('newsletter.subscriptionError') }}</span>
    </div>
  </aside>
</template>

<style scoped>
.subscribe {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--s-5);
  padding: var(--s-5);
  border: 1px solid var(--rule-strong);
  border-left: 4px solid var(--celeste-deep);
  border-radius: var(--r-lg);
  background: var(--surface);
}
.subscribe__copy h2 { margin: var(--s-1) 0 var(--s-2); font-family: var(--font-display); font-size: var(--t-lg); }
.subscribe__copy > p:not(.u-eyebrow) { margin: 0; color: var(--text-muted); line-height: 1.55; }
.subscribe__privacy { margin-top: var(--s-2) !important; font-size: var(--t-xs); }
.subscribe__action { display: flex; flex-direction: column; align-items: flex-end; gap: var(--s-2); }
.subscribe__state { color: var(--verde); font-size: var(--t-xs); }
.subscribe__error { color: var(--alerta); font-size: var(--t-xs); }
@media (max-width: 700px) {
  .subscribe { grid-template-columns: 1fr; }
  .subscribe__action { align-items: stretch; }
}
</style>
