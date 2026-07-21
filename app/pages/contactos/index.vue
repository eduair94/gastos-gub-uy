<script setup lang="ts">
// Public directory of contracting-unit purchasing contacts, from the
// precomputed procurement_contacts rollup. Public data (comprasestatales).
const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const router = useRouter()

const search = ref((route.query.q as string) ?? '')
const page = ref(Number(route.query.page ?? 1) || 1)
const searchDebounced = refDebounced(search, 350)
const searchTerm = computed(() => searchDebounced.value.trim())

const listQuery = computed(() => ({
  page: page.value,
  limit: 25,
  ...(searchTerm.value ? { q: searchTerm.value } : {}),
}))

watch(searchTerm, () => {
  page.value = 1
})
watch([searchTerm, page], () => {
  router.replace({ query: {
    ...(searchTerm.value ? { q: searchTerm.value } : {}),
    ...(page.value > 1 ? { page: String(page.value) } : {}),
  } })
})

const { data: listRes, pending, error } = await useFetch<any>('/api/contactos', { query: listQuery })
const { data: totalRes } = await useFetch<any>('/api/contactos', { query: { limit: 1 }, key: 'contactos-total' })

const contacts = computed<any[]>(() => listRes.value?.data?.contacts ?? [])
const pagination = computed(() => listRes.value?.data?.pagination ?? null)
const directoryTotal = computed<number | null>(() => totalRes.value?.data?.pagination?.total ?? null)
const totalPages = computed(() => Math.max(1, pagination.value?.totalPages ?? 1))

function clearSearch() {
  search.value = ''
}
function telHref(v?: string) {
  const d = (v ?? '').replace(/[^\d+]/g, '')
  return d ? `tel:${d}` : ''
}

const orgLd = useOrgLd()
useSeo(() => {
  const title = t('seo.contactos.title')
  const description = t('seo.contactos.description', { total: formatNumber(directoryTotal.value) })
  return {
    title,
    description,
    path: '/contactos',
    noindex: Boolean(searchTerm.value),
    kicker: 'Contactos',
    jsonLd: [
      { '@context': 'https://schema.org', '@type': 'CollectionPage', 'name': title, 'description': description },
      orgLd,
    ],
  }
})
</script>

<template>
  <div class="u-container page">
    <header class="page__head">
      <p class="u-eyebrow">
        {{ t('home.eyebrow') }}
      </p>
      <h1>{{ t('contactos.title') }}</h1>
      <p class="u-lead page__lead">
        {{ t('contactos.lead') }}
      </p>
    </header>

    <div class="toolbar">
      <form
        class="find"
        role="search"
        @submit.prevent
      >
        <label
          class="u-sr-only"
          for="contact-q"
        >{{ t('common.search') }}</label>
        <v-icon
          class="find__icon"
          size="20"
        >
          mdi-magnify
        </v-icon>
        <input
          id="contact-q"
          v-model="search"
          class="find__input"
          type="search"
          :placeholder="t('contactos.searchPlaceholder')"
        >
        <button
          v-if="search"
          class="find__x"
          type="button"
          :aria-label="t('common.clear')"
          @click="clearSearch"
        >
          <v-icon size="18">
            mdi-close
          </v-icon>
        </button>
      </form>
    </div>

    <p
      v-if="pagination?.total != null"
      class="count"
    >
      {{ t('contactos.resultsSummary', { count: formatNumber(pagination.total) }) }}
    </p>

    <PaginatedList
      v-model:page="page"
      :total-pages="totalPages"
    >
      <div
        v-if="error"
        class="state"
      >
        <h2 class="state__t">
          {{ t('errors.generic.title') }}
        </h2>
        <p class="state__b">
          {{ t('errors.generic.body') }}
        </p>
        <button
          class="state__a"
          type="button"
          @click="() => refreshNuxtData()"
        >
          {{ t('errors.generic.action') }}
        </button>
      </div>

      <div
        v-else-if="pending && !contacts.length"
        class="skeleton"
      >
        <div
          v-for="i in 8"
          :key="i"
          class="skeleton__row"
        />
      </div>

      <div
        v-else-if="!contacts.length"
        class="state"
      >
        <h2 class="state__t">
          {{ t('contactos.empty.title') }}
        </h2>
        <p class="state__b">
          {{ t('contactos.empty.body') }}
        </p>
        <button
          v-if="searchTerm"
          class="state__a"
          type="button"
          @click="clearSearch"
        >
          {{ t('contactos.empty.action') }}
        </button>
      </div>

      <div
        v-else
        class="tablewrap"
      >
        <table class="ctable">
          <thead>
            <tr>
              <th>{{ t('contactos.colOrganism') }}</th>
              <th>{{ t('contactos.colContact') }}</th>
              <th>{{ t('contactos.colEmail') }}</th>
              <th>{{ t('contactos.colPhone') }}</th>
              <th class="u-num">
                {{ t('contactos.colCalls') }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="c in contacts"
              :key="c.organismId"
            >
              <td>
                <NuxtLink
                  :to="localePath(`/buyers/${encodeURIComponent(c.organismId)}`)"
                  class="ctable__link"
                >
                  <span class="u-truncate">{{ c.organismName }}</span>
                </NuxtLink>
              </td>
              <td>{{ c.contactName || '—' }}</td>
              <td>
                <a
                  v-if="c.email"
                  :href="`mailto:${c.email}`"
                  class="ctable__link"
                >{{ c.email }}</a>
                <span
                  v-else
                  class="u-muted"
                >—</span>
              </td>
              <td>
                <a
                  v-if="c.telephone && telHref(c.telephone)"
                  :href="telHref(c.telephone)"
                  class="ctable__link"
                >{{ c.telephone }}</a>
                <span v-else>{{ c.telephone || '—' }}</span>
              </td>
              <td class="u-num u-mono">
                {{ formatNumber(c.llamadosCount) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </PaginatedList>

    <p class="u-muted directory__note">
      {{ t('contactos.note') }}
    </p>
  </div>
</template>

<style scoped>
.count { color: var(--text-muted); font-size: var(--t-sm); margin: var(--s-3) 0; }
.tablewrap { overflow-x: auto; }
.ctable { width: 100%; border-collapse: collapse; }
.ctable th, .ctable td { text-align: left; padding: var(--s-2) var(--s-3); border-bottom: 1px solid var(--rule); font-size: var(--t-sm); vertical-align: top; }
.ctable th { color: var(--text-muted); font-weight: 600; white-space: nowrap; }
.ctable__link { color: var(--celeste-deep); text-decoration: none; display: inline-block; max-width: 100%; }
.ctable__link:hover { text-decoration: underline; }
.u-num { text-align: right; }
.directory__note { font-size: var(--t-xs); margin-top: var(--s-4); }
</style>
