<script setup lang="ts">
definePageMeta({ middleware: 'guest' })

const { t } = useI18n()
const localePath = useLocalePath()
const { sendReset } = useAuth()
const { track } = useAnalytics()

useSeo({ title: t('auth.resetTitle'), description: t('auth.resetTitle'), path: '/recuperar', noindex: true })

const email = ref('')
const sent = ref(false)
const loading = ref(false)
const error = ref('')

async function doReset() {
  error.value = ''
  loading.value = true
  // Measured on the request, not the outcome: the handler reports success either way
  // so it never reveals whether the address has an account.
  track('password_reset_request')
  try {
    await sendReset(email.value)
    sent.value = true
  }
  catch {
    // Never reveal whether the email exists.
    sent.value = true
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="authwrap u-container">
    <div class="authcard panel">
      <h1 class="authcard__h">
        {{ t('auth.resetTitle') }}
      </h1>

      <p
        v-if="sent"
        class="authcard__ok"
      >
        {{ t('auth.resetSent') }}
      </p>
      <form
        v-else
        class="authcard__form"
        @submit.prevent="doReset"
      >
        <v-text-field
          v-model="email"
          :label="t('auth.email')"
          type="email"
          autocomplete="email"
        />
        <p
          v-if="error"
          class="authcard__err"
        >
          {{ error }}
        </p>
        <v-btn
          color="primary"
          type="submit"
          :loading="loading"
          block
        >
          {{ t('auth.resetSend') }}
        </v-btn>
      </form>

      <div class="authcard__links">
        <NuxtLink :to="localePath('/login')">
          {{ t('auth.signIn') }}
        </NuxtLink>
      </div>
    </div>
  </div>
</template>

<style scoped>
.authwrap { display: flex; justify-content: center; padding: var(--s-8) var(--s-4); }
.authcard { width: 100%; max-width: 420px; padding: var(--s-6); display: flex; flex-direction: column; gap: var(--s-3); }
.authcard__h { font-family: var(--font-display); font-weight: 800; font-size: var(--t-2xl); margin: 0; }
.authcard__form { display: flex; flex-direction: column; gap: var(--s-3); }
.authcard__links { margin-top: var(--s-3); font-size: var(--t-sm); }
.authcard__links a { color: var(--celeste-deep); text-decoration: none; }
.authcard__err { color: var(--alerta); font-size: var(--t-sm); margin: 0; }
.authcard__ok { color: var(--verde); font-size: var(--t-sm); margin: 0; }
</style>
