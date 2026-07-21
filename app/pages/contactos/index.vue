<script setup lang="ts">
// Public directory of contracting-unit purchasing contacts, from the
// precomputed procurement_contacts rollup. Public data (comprasestatales).
// Insightful filters (organism group + deliverability) + a four-format download,
// so people who need to reach a buying unit can find and export the right contact.
const { t, locale } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const router = useRouter()

const search = ref((route.query.q as string) ?? '')
const grupo = ref((route.query.grupo as string) ?? '')
const hasEmail = ref(route.query.hasEmail === '1')
const hasPhone = ref(route.query.hasPhone === '1')
const sort = ref((route.query.sort as string) ?? 'calls')
const page = ref(Number(route.query.page ?? 1) || 1)
const searchDebounced = refDebounced(search, 350)
const searchTerm = computed(() => searchDebounced.value.trim())

const FORMATS = [
  { fmt: 'csv', icon: 'mdi-file-delimited-outline' },
  { fmt: 'xlsx', icon: 'mdi-file-excel-outline' },
  { fmt: 'json', icon: 'mdi-code-json' },
  { fmt: 'vcf', icon: 'mdi-card-account-details-outline' },
] as const

const SORTS: Record<string, { sortBy: string }> = {
  calls: { sortBy: 'llamados' },
  name: { sortBy: 'organism' },
}

// The filter half of the query (everything the export also honours).
const filterQuery = computed(() => ({
  ...(searchTerm.value ? { q: searchTerm.value } : {}),
  ...(grupo.value ? { grupo: grupo.value } : {}),
  ...(hasEmail.value ? { hasEmail: '1' } : {}),
  ...(hasPhone.value ? { hasPhone: '1' } : {}),
  ...(SORTS[sort.value] ?? SORTS.calls),
}))
const listQuery = computed(() => ({ page: page.value, limit: 25, ...filterQuery.value }))

const hasFilters = computed(() => !!grupo.value || hasEmail.value || hasPhone.value)
function clearFilters() {
  search.value = ''
  grupo.value = ''
  hasEmail.value = false
  hasPhone.value = false
  page.value = 1
}

watch([searchTerm, grupo, hasEmail, hasPhone, sort], () => { page.value = 1 })
watch([searchTerm, grupo, hasEmail, hasPhone, sort, page], () => {
  router.replace({ query: {
    ...(searchTerm.value ? { q: searchTerm.value } : {}),
    ...(grupo.value ? { grupo: grupo.value } : {}),
    ...(hasEmail.value ? { hasEmail: '1' } : {}),
    ...(hasPhone.value ? { hasPhone: '1' } : {}),
    ...(sort.value !== 'calls' ? { sort: sort.value } : {}),
    ...(page.value > 1 ? { page: String(page.value) } : {}),
  } })
})

const { data: listRes, pending, error } = await useFetch<any>('/api/contactos', { query: listQuery })
const { data: totalRes } = await useFetch<any>('/api/contactos', { query: { limit: 1 }, key: 'contactos-total' })

const contacts = computed<any[]>(() => listRes.value?.data?.contacts ?? [])
const groups = computed<any[]>(() => listRes.value?.data?.groups ?? [])
const pagination = computed(() => listRes.value?.data?.pagination ?? null)
const directoryTotal = computed<number | null>(() => totalRes.value?.data?.pagination?.total ?? null)
const totalPages = computed(() => Math.max(1, pagination.value?.totalPages ?? 1))

const GROUP_ITEMS = computed(() => [
  { title: t('contactos.filter.groupAny'), value: '' },
  ...groups.value.map(g => ({ title: locale.value === 'en' ? g.labelEn : g.label, value: g.key })),
])

function telHref(v?: string) {
  const d = (v ?? '').replace(/[^\d+]/g, '')
  return d ? `tel:${d}` : ''
}
function exportUrl(fmt: string) {
  const params = new URLSearchParams(Object.entries(filterQuery.value).map(([k, v]) => [k, String(v)]))
  params.set('format', fmt)
  return `/api/contactos/export?${params.toString()}`
}

const orgLd = useOrgLd()
useSeo(() => {
  const title = t('seo.contactos.title')
  const description = t('seo.contactos.description', { total: formatNumber(directoryTotal.value) })
  return {
    title,
    description,
    path: '/contactos',
    noindex: Boolean(searchTerm.value) || hasFilters.value,
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
          @click="() => (search = '')"
        >
          <v-icon size="18">
            mdi-close
          </v-icon>
        </button>
      </form>
    </div>

    <!-- ===== Filters ===== -->
    <div class="filters">
      <label class="filters__sel">
        <span class="u-sr-only">{{ t('contactos.filter.group') }}</span>
        <select
          v-model="grupo"
          class="sel"
        >
          <option
            v-for="it in GROUP_ITEMS"
            :key="it.value"
            :value="it.value"
          >
            {{ it.title }}
          </option>
        </select>
      </label>

      <label class="filters__sel">
        <span class="u-sr-only">{{ t('contactos.filter.sort') }}</span>
        <select
          v-model="sort"
          class="sel"
        >
          <option value="calls">
            {{ t('contactos.filter.sortCalls') }}
          </option>
          <option value="name">
            {{ t('contactos.filter.sortName') }}
          </option>
        </select>
      </label>

      <label class="filters__chk">
        <input
          v-model="hasEmail"
          type="checkbox"
        >
        <span>{{ t('contactos.filter.hasEmail') }}</span>
      </label>
      <label class="filters__chk">
        <input
          v-model="hasPhone"
          type="checkbox"
        >
        <span>{{ t('contactos.filter.hasPhone') }}</span>
      </label>

      <button
        v-if="hasFilters"
        class="filters__clear"
        type="button"
        @click="clearFilters"
      >
        {{ t('common.clear') }}
      </button>

      <div class="dl">
        <span class="dl__label">{{ t('contactos.download') }}</span>
        <a
          v-for="f in FORMATS"
          :key="f.fmt"
          class="dl__btn"
          :href="exportUrl(f.fmt)"
          :title="f.fmt.toUpperCase()"
          rel="nofollow"
        >
          <v-icon size="18">{{ f.icon }}</v-icon>
          <span class="dl__ext">{{ f.fmt }}</span>
        </a>
      </div>
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
          v-if="searchTerm || hasFilters"
          class="state__a"
          type="button"
          @click="clearFilters"
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
              <th>{{ t('contactos.colGroup') }}</th>
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
              <td>
                <span
                  v-if="c.group"
                  class="grouptag"
                >{{ c.group }}</span>
                <span
                  v-else
                  class="u-muted"
                >—</span>
              </td>
              <td>{{ c.contactName || '—' }}</td>
              <td>
                <div
                  v-if="c.emails && c.emails.length"
                  class="emails"
                >
                  <a
                    v-for="e in c.emails"
                    :key="e"
                    :href="`mailto:${e}`"
                    class="ctable__link"
                  >{{ e }}</a>
                </div>
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
.filters { display: flex; flex-wrap: wrap; gap: var(--s-2); align-items: center; margin: var(--s-3) 0; }
.sel { padding: 8px 10px; border-radius: 8px; border: 1px solid var(--rule); background: var(--surface, transparent); color: inherit; max-width: 260px; }
.filters__chk { display: inline-flex; align-items: center; gap: 6px; font-size: var(--t-sm); color: var(--text-muted); cursor: pointer; }
.filters__clear { background: none; border: 1px solid var(--rule); border-radius: 8px; padding: 7px 12px; color: inherit; cursor: pointer; font-size: var(--t-sm); }
.dl { display: inline-flex; align-items: center; gap: 6px; margin-left: auto; }
.dl__label { font-size: var(--t-xs); color: var(--text-muted); }
.dl__btn { display: inline-flex; align-items: center; gap: 4px; padding: 6px 9px; border: 1px solid var(--rule); border-radius: 8px; color: var(--celeste-deep); text-decoration: none; font-size: var(--t-xs); }
.dl__btn:hover { border-color: var(--celeste-deep); }
.dl__ext { text-transform: uppercase; }
.tablewrap { overflow-x: auto; }
.ctable { width: 100%; border-collapse: collapse; }
.ctable th, .ctable td { text-align: left; padding: var(--s-2) var(--s-3); border-bottom: 1px solid var(--rule); font-size: var(--t-sm); vertical-align: top; }
.ctable th { color: var(--text-muted); font-weight: 600; white-space: nowrap; }
.ctable__link { color: var(--celeste-deep); text-decoration: none; display: inline-block; max-width: 100%; }
.ctable__link:hover { text-decoration: underline; }
.emails { display: flex; flex-direction: column; gap: 2px; }
.grouptag { font-size: 0.78rem; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--rule); white-space: nowrap; color: var(--text-muted); }
.u-num { text-align: right; }
.directory__note { font-size: var(--t-xs); margin-top: var(--s-4); }
</style>
