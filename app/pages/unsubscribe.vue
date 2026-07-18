<script setup lang="ts">
const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()

useSeo({ title: t('unsub.title'), description: t('unsub.title'), path: '/unsubscribe', noindex: true })

const state = ref<'processing' | 'done' | 'error'>('processing')

onMounted(async () => {
  const token = typeof route.query.token === 'string' ? route.query.token : ''
  if (!token) {
    state.value = 'error'
    return
  }
  try {
    const res = await $fetch<{ success: boolean }>('/api/unsubscribe', { method: 'POST', body: { token } })
    state.value = res.success ? 'done' : 'error'
  }
  catch {
    state.value = 'error'
  }
})
</script>

<template>
  <div class="authwrap u-container">
    <div class="authcard panel">
      <h1 class="authcard__h">
        {{ t('unsub.title') }}
      </h1>
      <p v-if="state === 'processing'" class="u-muted">
        {{ t('unsub.processing') }}
      </p>
      <p v-else-if="state === 'done'" class="authcard__ok">
        {{ t('unsub.done') }}
      </p>
      <p v-else class="authcard__err">
        {{ t('unsub.error') }}
      </p>
      <NuxtLink :to="localePath('/')" class="authcard__link">
        {{ t('unsub.backHome') }}
      </NuxtLink>
    </div>
  </div>
</template>

<style scoped>
.authwrap { display: flex; justify-content: center; padding: var(--s-8) var(--s-4); }
.authcard { width: 100%; max-width: 460px; padding: var(--s-6); text-align: center; display: flex; flex-direction: column; gap: var(--s-3); }
.authcard__h { font-family: var(--font-display); font-weight: 800; font-size: var(--t-xl); margin: 0; }
.authcard__ok { color: var(--verde); margin: 0; }
.authcard__err { color: var(--alerta); margin: 0; }
.authcard__link { color: var(--celeste-deep); text-decoration: none; }
</style>
