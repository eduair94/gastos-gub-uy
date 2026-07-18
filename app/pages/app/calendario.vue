<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const { t } = useI18n()
const localePath = useLocalePath()

useSeo({ title: t('calendar.title'), description: t('calendar.lead'), path: '/app/calendario', noindex: true })

interface CalItem {
  compraId: string
  title: string
  buyer?: { name?: string }
  endDate?: string | null
  saved?: boolean
  matched?: boolean
}

const { data } = await useFetch<{ data: { items: CalItem[] } }>('/api/calendar', { server: false })
const items = computed(() => data.value?.data?.items ?? [])
</script>

<template>
  <div class="u-container cal">
    <header class="cal__head">
      <p class="u-eyebrow">
        {{ t('calendar.title') }}
      </p>
      <h1 class="u-hero">
        {{ t('calendar.title') }}
      </h1>
      <p class="u-lead">
        {{ t('calendar.lead') }}
      </p>
    </header>

    <div v-if="items.length" class="cal__list">
      <NuxtLink
        v-for="c in items"
        :key="c.compraId"
        :to="localePath(`/llamados/${c.compraId}`)"
        class="panel cal__item"
      >
        <div class="cal__date u-mono">
          <v-icon size="16">mdi-calendar-clock</v-icon>
          {{ c.endDate ? formatDate(c.endDate) : '—' }}
        </div>
        <div class="cal__body">
          <span class="cal__title u-truncate">{{ c.title }}</span>
          <span v-if="c.buyer?.name" class="cal__buyer u-truncate u-muted">{{ c.buyer.name }}</span>
        </div>
        <div class="cal__tags">
          <span v-if="c.saved" class="tag tag--celeste">{{ t('calendar.savedTag') }}</span>
          <span v-if="c.matched" class="tag tag--activo">{{ t('calendar.matchedTag') }}</span>
        </div>
      </NuxtLink>
    </div>
    <div v-else class="panel cal__empty">
      {{ t('calendar.empty') }}
    </div>
  </div>
</template>

<style scoped>
.cal { padding-block: var(--s-6) var(--s-8); }
.cal__head { margin-bottom: var(--s-5); }
.cal__list { display: flex; flex-direction: column; gap: var(--s-2); }
.cal__item {
  display: grid;
  grid-template-columns: 140px 1fr auto;
  align-items: center;
  gap: var(--s-3);
  padding: var(--s-3) var(--s-4);
  text-decoration: none;
  color: var(--text);
}
.cal__item:hover { border-color: var(--celeste); }
.cal__date { display: inline-flex; align-items: center; gap: var(--s-1); font-size: var(--t-xs); color: var(--text-muted); }
.cal__body { display: flex; flex-direction: column; min-width: 0; }
.cal__title { font-weight: 600; font-size: var(--t-sm); }
.cal__buyer { font-size: var(--t-xs); }
.cal__tags { display: flex; gap: var(--s-1); }
.cal__empty { padding: var(--s-6); text-align: center; color: var(--text-muted); }
@media (max-width: 620px) {
  .cal__item { grid-template-columns: 1fr; gap: var(--s-1); }
  .cal__tags { margin-top: var(--s-1); }
}
</style>
