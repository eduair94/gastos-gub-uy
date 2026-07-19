<script setup lang="ts">
definePageMeta({ middleware: 'guest' })

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const { registerEmail, loginGoogle } = useAuth()

useSeo({ title: t('auth.registerTitle'), description: t('auth.subtitle'), path: '/registro', noindex: true })

const email = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

// Preserve where the user was headed (e.g. the prefilled alert builder) across signup.
function redirectTarget(): string {
  const r = route.query.redirect
  return typeof r === 'string' && r.startsWith('/') ? r : localePath('/app')
}

// Carry the return path over to the login page so switching auth mode never drops it.
const loginTo = computed(() => ({
  path: localePath('/login'),
  query: route.query.redirect ? { redirect: route.query.redirect } : {},
}))

async function doRegister() {
  error.value = ''
  loading.value = true
  try {
    await registerEmail(email.value, password.value)
    await navigateTo(redirectTarget())
  }
  catch (e) {
    error.value = authError(e, t)
  }
  finally {
    loading.value = false
  }
}

async function doGoogle() {
  error.value = ''
  loading.value = true
  try {
    await loginGoogle()
    await navigateTo(redirectTarget())
  }
  catch (e) {
    error.value = authError(e, t)
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
        {{ t('auth.registerTitle') }}
      </h1>
      <p class="authcard__sub u-muted">
        {{ t('auth.subtitle') }}
      </p>

      <form
        class="authcard__form"
        @submit.prevent="doRegister"
      >
        <v-text-field
          v-model="email"
          :label="t('auth.email')"
          type="email"
          autocomplete="email"
        />
        <v-text-field
          v-model="password"
          :label="t('auth.password')"
          type="password"
          autocomplete="new-password"
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
          {{ t('auth.signUp') }}
        </v-btn>
      </form>

      <div class="authcard__or">
        <span>{{ t('auth.or') }}</span>
      </div>

      <v-btn
        variant="outlined"
        block
        prepend-icon="mdi-google"
        :disabled="loading"
        @click="doGoogle"
      >
        {{ t('auth.withGoogle') }}
      </v-btn>

      <div class="authcard__links">
        <span>{{ t('auth.haveAccount') }} <NuxtLink :to="loginTo">{{ t('auth.signInInstead') }}</NuxtLink></span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.authwrap { display: flex; justify-content: center; padding: var(--s-8) var(--s-4); }
.authcard { width: 100%; max-width: 420px; padding: var(--s-6); display: flex; flex-direction: column; gap: var(--s-3); }
.authcard__h { font-family: var(--font-display); font-weight: 800; font-size: var(--t-2xl); margin: 0; }
.authcard__sub { margin: 0 0 var(--s-2); font-size: var(--t-sm); }
.authcard__form { display: flex; flex-direction: column; gap: var(--s-3); }
.authcard__or { position: relative; text-align: center; margin: var(--s-2) 0; color: var(--text-muted); font-size: var(--t-xs); }
.authcard__or::before { content: ""; position: absolute; top: 50%; left: 0; right: 0; height: 1px; background: var(--rule); }
.authcard__or span { position: relative; background: var(--surface); padding: 0 var(--s-2); }
.authcard__links { display: flex; flex-direction: column; gap: var(--s-1); margin-top: var(--s-3); font-size: var(--t-sm); }
.authcard__links a { color: var(--celeste-deep); text-decoration: none; }
.authcard__links a:hover { text-decoration: underline; }
.authcard__err { color: var(--alerta); font-size: var(--t-sm); margin: 0; }
</style>
