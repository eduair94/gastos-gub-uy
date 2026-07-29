<script setup lang="ts">
const { t } = useI18n()
const route = useRoute()
const localePath = useLocalePath()

useSeo({
  title: t('newsletter.unsubscribeTitle'),
  description: t('newsletter.unsubscribeDescription'),
  path: '/newsletter/unsubscribe',
  noindex: true,
})

const status = ref<'loading' | 'done' | 'invalid' | 'error'>('loading')

onMounted(async () => {
  const token = typeof route.query.token === 'string' ? route.query.token : ''
  if (!token) {
    status.value = 'invalid'
    return
  }
  try {
    const response = await $fetch<{ data: { unsubscribed: boolean } }>('/api/newsletter/unsubscribe', {
      method: 'POST',
      body: { token },
    })
    status.value = response.data.unsubscribed ? 'done' : 'invalid'
  }
  catch {
    status.value = 'error'
  }
})
</script>

<template>
  <main class="u-container unsub">
    <section class="panel unsub__card">
      <p class="u-eyebrow">
        {{ t('newsletter.eyebrow') }}
      </p>
      <h1>{{ t(`newsletter.unsubscribe.${status}.title`) }}</h1>
      <p>{{ t(`newsletter.unsubscribe.${status}.body`) }}</p>
      <v-btn
        :to="localePath('/blog')"
        variant="outlined"
      >
        {{ t('newsletter.backToBlog') }}
      </v-btn>
    </section>
  </main>
</template>

<style scoped>
.unsub { display: grid; place-items: center; min-height: 60vh; padding-block: var(--s-8); }
.unsub__card { width: min(100%, 560px); padding: var(--s-6); }
.unsub__card h1 { margin: var(--s-2) 0 var(--s-3); font-family: var(--font-display); }
.unsub__card p { line-height: 1.6; color: var(--text-muted); }
</style>
