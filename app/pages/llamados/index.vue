<script setup lang="ts">
const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const router = useRouter()
// Browsing open calls is public (backed by the DB); the "create alert" CTA needs
// accounts, so it's hidden when Firebase isn't configured.
const authEnabled = useAuthEnabled()
const { track } = useAnalytics()

useSeo({ title: t('llamados.title'), description: t('llamados.lead'), path: '/llamados' })

const q = ref(typeof route.query.q === 'string' ? route.query.q : '')
const sort = ref(typeof route.query.sort === 'string' ? route.query.sort : 'deadline')
const page = ref(Number(route.query.page) || 1)

const query = computed(() => ({
  q: q.value || undefined,
  sort: sort.value,
  page: page.value,
  limit: 24,
}))

const { data, pending } = await useFetch<{ data: { calls: Array<Record<string, unknown>>, pagination: { total: number | null, hasMore: boolean } } }>(
  '/api/open-calls',
  { query },
)

const calls = computed(() => data.value?.data?.calls ?? [])
const pagination = computed(() => data.value?.data?.pagination)

watch([q, sort, page], () => {
  router.replace({ query: { q: q.value || undefined, sort: sort.value, page: page.value > 1 ? page.value : undefined } })
})

function submitSearch() {
  page.value = 1
  if (q.value.trim()) track('search', { search_term: q.value.trim(), location: 'llamados' })
  else track('filter_clear', { surface: 'llamados' })
}

watch(sort, s => track('sort_change', { surface: 'llamados', sort: s }))

// The CTA promises "an alert for THIS search", so carry the current keyword into the
// alert builder (`?new=1` auto-opens the form, `?keyword=` prefills it). Guests are
// bounced to /login by the auth middleware and returned here with the keyword intact.
const createAlertTo = computed(() => ({
  path: localePath('/app/alertas'),
  query: { new: '1', ...(q.value.trim() ? { keyword: q.value.trim() } : {}) },
}))
</script>

<template>
  <div class="u-container llamados">
    <header class="llamados__head">
      <p class="u-eyebrow">
        {{ t('nav.llamados') }}
      </p>
      <h1 class="u-hero">
        {{ t('llamados.title') }}
      </h1>
      <p class="u-lead">
        {{ t('llamados.lead') }}
      </p>
    </header>

    <div class="llamados__toolbar">
      <form
        class="llamados__search"
        role="search"
        data-tour="llamados-search"
        @submit.prevent="submitSearch"
      >
        <v-text-field
          v-model="q"
          :placeholder="t('llamados.searchPlaceholder')"
          prepend-inner-icon="mdi-magnify"
          hide-details
          density="comfortable"
          clearable
          @click:clear="submitSearch"
        />
      </form>
      <v-select
        v-model="sort"
        :items="[{ title: t('llamados.sortDeadline'), value: 'deadline' }, { title: t('llamados.sortNewest'), value: 'newest' }]"
        :label="t('llamados.sortBy')"
        hide-details
        density="comfortable"
        class="llamados__sort"
      />
      <NuxtLink
        v-if="authEnabled"
        :to="createAlertTo"
        class="llamados__cta"
        data-tour="llamados-cta"
      >
        <v-icon size="18">
          mdi-bell-plus-outline
        </v-icon>
        {{ t('llamados.createAlertCta') }}
      </NuxtLink>
    </div>

    <AudienceHook variant="band" />

    <p
      v-if="pagination?.total != null"
      class="llamados__count u-mono u-muted"
    >
      {{ t('llamados.resultsCount', { n: pagination.total }) }}
    </p>

    <div
      v-if="pending"
      class="llamados__grid"
    >
      <div
        v-for="i in 6"
        :key="i"
        class="occard panel llamados__skel"
      />
    </div>
    <div
      v-else-if="calls.length"
      class="llamados__grid"
      data-tour="llamados-grid"
    >
      <OpenCallCard
        v-for="c in calls"
        :key="(c.compraId as string)"
        :call="(c as any)"
      />
    </div>
    <div
      v-else
      class="llamados__empty panel"
    >
      {{ t('llamados.empty') }}
    </div>

    <div
      v-if="pagination && (page > 1 || pagination.hasMore)"
      class="llamados__pager"
    >
      <v-btn
        variant="outlined"
        :disabled="page <= 1"
        @click="page = Math.max(1, page - 1)"
      >
        <v-icon>mdi-chevron-left</v-icon>
      </v-btn>
      <span class="u-mono">{{ page }}</span>
      <v-btn
        variant="outlined"
        :disabled="!pagination.hasMore"
        @click="page = page + 1"
      >
        <v-icon>mdi-chevron-right</v-icon>
      </v-btn>
    </div>
  </div>
</template>

<style scoped>
.llamados { padding-block: var(--s-6) var(--s-8); }
.llamados__head { margin-bottom: var(--s-5); }
.llamados__toolbar {
  display: flex;
  gap: var(--s-3);
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: var(--s-4);
}
.llamados__search { flex: 1 1 280px; }
.llamados__sort { max-width: 200px; }
.llamados__cta {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  padding: 0 var(--s-4);
  height: 44px;
  border-radius: var(--r-md);
  background: var(--cta-fill);
  color: var(--cta-fg);
  font-weight: 600;
  font-size: var(--t-sm);
  text-decoration: none;
  white-space: nowrap;
}
.llamados__cta:hover { filter: brightness(1.05); }
.llamados__count { margin: 0 0 var(--s-3); }
.llamados__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--s-3);
}
.llamados__skel { min-height: 150px; opacity: 0.5; }
.llamados__empty { padding: var(--s-6); text-align: center; color: var(--text-muted); }
.llamados__pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--s-4);
  margin-top: var(--s-6);
}
</style>
