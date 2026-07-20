<script setup lang="ts">
// `guest` middleware also redirects to home when Firebase isn't configured, so this
// magic-link landing never runs its auth calls in the disabled state.
definePageMeta({ middleware: 'guest' })

const { t } = useI18n()
const localePath = useLocalePath()
const { completeMagicLink } = useAuth()

useSeo({ title: t('auth.callbackChecking'), description: t('auth.callbackChecking'), path: '/auth/callback', noindex: true })

const failed = ref(false)

const { track } = useAnalytics()

onMounted(async () => {
  try {
    // completeMagicLink() already tracks 'login' { method: 'magic_link' } on success.
    const ok = await completeMagicLink()
    if (ok) {
      await navigateTo(localePath('/app'))
      return
    }
    failed.value = true
    track('login_failed', { method: 'magic_link', reason: 'not_a_sign_in_link' })
  }
  catch (e) {
    failed.value = true
    track('login_failed', { method: 'magic_link', reason: authErrorCode(e) })
  }
})
</script>

<template>
  <div class="authwrap u-container">
    <div class="authcard panel">
      <template v-if="!failed">
        <p class="authcard__checking">
          {{ t('auth.callbackChecking') }}
        </p>
      </template>
      <template v-else>
        <p class="authcard__err">
          {{ t('auth.callbackError') }}
        </p>
        <NuxtLink
          :to="localePath('/login')"
          class="authcard__link"
        >
          {{ t('auth.signIn') }}
        </NuxtLink>
      </template>
    </div>
  </div>
</template>

<style scoped>
.authwrap { display: flex; justify-content: center; padding: var(--s-8) var(--s-4); }
.authcard { width: 100%; max-width: 420px; padding: var(--s-6); text-align: center; }
.authcard__checking { color: var(--text-muted); }
.authcard__err { color: var(--alerta); margin: 0 0 var(--s-3); }
.authcard__link { color: var(--celeste-deep); text-decoration: none; }
</style>
