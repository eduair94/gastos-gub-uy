<script setup lang="ts">
/**
 * Public directory of contactable providers — for outreach / cold-email / B2B
 * marketing. Reads `supplier_contacts` (the enrichment collection) through
 * `/api/contacts`; the same filter set drives the four-format download, which
 * pulls the FULL filtered set server-side (not just the visible page).
 *
 * Compliance: ToS-restricted (Google-Maps-sourced) fields are already stripped
 * server-side; the page is `noindex` (public but not a crawlable email dump);
 * a Ley 18.331 opt-out line is shown.
 */
import type { DataColumn } from '~/components/DataTable.vue'

interface EmailEntry { email: string, source: string, mxValid: boolean, status: string }
interface ContactRow {
  supplierId: string
  rut: string
  name: string
  email: string | null
  emails: EmailEntry[]
  website: string | null
  websiteSource: string | null
  phone: string | null
  phoneSource: string | null
  locality: string | null
  address: string | null
  rubro: string | null
  methods: string[]
  neverAwarded: boolean
  rupeEstado: string | null
  dei?: { estado?: string | null } | null
  onlyDirectAward: boolean
  directAwardCount: number
}

/** Short, language-neutral origin tag for a contact field ("DEI"/"RUPE" are proper nouns). */
function originLabel(src: string | null): string {
  if (src === 'webSearch') return '✓ verificado'
  if (src === 'dei') return 'DEI'
  if (src === 'rupe') return 'RUPE'
  return ''
}
interface RubroFacet { classificationId: string, label: string, count: number }

/** Uruguay's 19 departments; value = DB form (uppercase), matched case-insensitively. */
const DEPARTAMENTOS = [
  'ARTIGAS', 'CANELONES', 'CERRO LARGO', 'COLONIA', 'DURAZNO', 'FLORES', 'FLORIDA',
  'LAVALLEJA', 'MALDONADO', 'MONTEVIDEO', 'PAYSANDU', 'RIO NEGRO', 'RIVERA', 'ROCHA',
  'SALTO', 'SAN JOSE', 'SORIANO', 'TACUAREMBO', 'TREINTA Y TRES',
]

/** Company-type (AI-classified) values — mirrors the /suppliers Tipo filter. */
const CATEGORIAS = [
  'empresa', 'organismo-publico', 'persona', 'cooperativa', 'agencia-publicidad', 'productora',
  'medio-tv', 'medio-radio', 'medio-prensa', 'medio-digital', 'medio-via-publica',
]

/** How each enrichment method is badged (label + css modifier). */
const METHOD_BADGES: Record<string, { label: string, cls: string }> = {
  dei: { label: 'DEI', cls: 'is-dei' },
  rupe: { label: 'RUPE', cls: 'is-rupe' },
  crawl4ai: { label: 'crawl4ai', cls: 'is-crawl' },
  googleMaps: { label: 'Maps', cls: 'is-maps' },
  impo: { label: 'IMPO', cls: 'is-impo' },
}

const FORMATS = [
  { fmt: 'csv', icon: 'mdi-file-delimited-outline' },
  { fmt: 'xlsx', icon: 'mdi-file-excel-outline' },
  { fmt: 'json', icon: 'mdi-code-json' },
  { fmt: 'vcf', icon: 'mdi-card-account-details-outline' },
] as const

/** Server-side export ceiling (mirrors EXPORT_CAP); above it the download is capped. */
const EXPORT_CAP = 50_000

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const router = useRouter()
const { track } = useAnalytics()

// ---- Filter state lives in the URL (linkable / reloadable) ----
const search = ref((route.query.search as string) ?? '')
const page = ref(Number(route.query.page ?? 1))
const rubro = ref((route.query.rubro as string) ?? '')
const departamento = ref((route.query.departamento as string) ?? '')
const tamano = ref((route.query.tamano as string) ?? '')
const categoria = ref((route.query.categoria as string) ?? '')
const deiOnly = ref(route.query.dei === '1')
const onlyDirect = ref(route.query.onlyDirect === '1')
// Which population to include: todas (default) | con-email | sin-adjudicaciones.
const origen = ref((route.query.origen as string) ?? 'todas')
// Verified-only is the default; the URL only records the widening (verified=0).
const verifiedOnly = ref(route.query.verified !== '0')
const hasPhone = ref(route.query.hasPhone === '1')
const hasWebsite = ref(route.query.hasWebsite === '1')
const sort = ref((route.query.sort as string) ?? 'priorityDesc')

const SORTS: Record<string, { sortBy: string, sortOrder: string }> = {
  priorityDesc: { sortBy: 'priority', sortOrder: 'desc' },
  nameAsc: { sortBy: 'name', sortOrder: 'asc' },
}

const hasFilters = computed(() =>
  !!rubro.value || !!departamento.value || !!tamano.value || !!categoria.value || deiOnly.value || onlyDirect.value
  || !verifiedOnly.value || hasPhone.value || hasWebsite.value || origen.value !== 'todas')

function clearFilters() {
  track('filter_clear', { surface: 'contacts' })
  rubro.value = ''
  departamento.value = ''
  tamano.value = ''
  categoria.value = ''
  deiOnly.value = false
  onlyDirect.value = false
  origen.value = 'todas'
  verifiedOnly.value = true
  hasPhone.value = false
  hasWebsite.value = false
  page.value = 1
}

const searchDebounced = refDebounced(search, 350)
const searchTerm = computed(() => searchDebounced.value.trim())

// The filter half of the query (everything the export also honours).
const filterQuery = computed(() => ({
  ...(searchTerm.value ? { search: searchTerm.value } : {}),
  ...(rubro.value ? { rubro: rubro.value } : {}),
  ...(deiOnly.value ? { dei: '1' } : {}),
  ...(onlyDirect.value ? { onlyDirect: '1' } : {}),
  ...(tamano.value ? { tamano: tamano.value } : {}),
  ...(categoria.value ? { categoria: categoria.value } : {}),
  ...(departamento.value ? { departamento: departamento.value } : {}),
  ...(origen.value !== 'todas' ? { origen: origen.value } : {}),
  ...(verifiedOnly.value ? {} : { verified: '0' }),
  ...(hasPhone.value ? { hasPhone: '1' } : {}),
  ...(hasWebsite.value ? { hasWebsite: '1' } : {}),
  ...(SORTS[sort.value] ?? SORTS.priorityDesc),
}))

const listQuery = computed(() => ({ page: page.value, limit: 25, ...filterQuery.value }))

watch([searchTerm, rubro, departamento, tamano, categoria, deiOnly, onlyDirect, origen, verifiedOnly, hasPhone, hasWebsite, sort], () => {
  page.value = 1
})

watch([searchTerm, page, rubro, departamento, tamano, categoria, deiOnly, onlyDirect, origen, verifiedOnly, hasPhone, hasWebsite, sort], () => {
  const q: Record<string, string> = {}
  if (searchTerm.value) q.search = searchTerm.value
  if (page.value > 1) q.page = String(page.value)
  if (rubro.value) q.rubro = rubro.value
  if (departamento.value) q.departamento = departamento.value
  if (tamano.value) q.tamano = tamano.value
  if (categoria.value) q.categoria = categoria.value
  if (deiOnly.value) q.dei = '1'
  if (onlyDirect.value) q.onlyDirect = '1'
  if (origen.value !== 'todas') q.origen = origen.value
  if (!verifiedOnly.value) q.verified = '0'
  if (hasPhone.value) q.hasPhone = '1'
  if (hasWebsite.value) q.hasWebsite = '1'
  if (sort.value !== 'priorityDesc') q.sort = sort.value
  router.replace({ query: q })
})

const { data: listRes, pending, error } = await useFetch<any>('/api/contacts', { query: listQuery })
const { data: totalRes } = await useFetch<any>('/api/contacts', { query: { limit: 1 }, key: 'contacts-directory-total' })
const { data: rubroRes } = await useFetch<any>('/api/contacts/rubros', { key: 'contacts-rubros' })

const contacts = computed<ContactRow[]>(() => listRes.value?.data?.contacts ?? [])
const pagination = computed(() => listRes.value?.data?.pagination ?? null)
const directoryTotal = computed<number | null>(() => totalRes.value?.data?.pagination?.total ?? null)
const filteredTotal = computed<number>(() => pagination.value?.total ?? 0)
// Above the cap the download returns the top EXPORT_CAP rows — say so up front,
// since an anchor download can't surface the server's truncation header.
const exportTruncated = computed(() => filteredTotal.value > EXPORT_CAP)
const totalPages = computed(() => Math.max(1, pagination.value?.totalPages ?? 1))
const rubros = computed<RubroFacet[]>(() => rubroRes.value?.data?.rubros ?? [])

function clearSearch() {
  search.value = ''
  page.value = 1
}

/** Supplier ids carry a slash; encode each segment for the catch-all detail route. */
function supplierPath(id: string) {
  return localePath(`/suppliers/${id.split('/').map(encodeURIComponent).join('/')}`)
}

function hostname(url: string) {
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, '')
  }
  catch {
    return url
  }
}
function websiteHref(url: string) {
  return url.startsWith('http') ? url : `https://${url}`
}

/** Download URL for the current filter set in a given format (page/limit dropped). */
function exportUrl(fmt: string) {
  const params = new URLSearchParams(
    Object.entries(filterQuery.value).map(([k, v]) => [k, String(v)]),
  )
  params.set('format', fmt)
  return `/api/contacts/export?${params.toString()}`
}
function onExport(fmt: string) {
  track('contact_export', { format: fmt, count: filteredTotal.value })
}

const CATEGORIA_ITEMS = computed(() => [
  { title: t('sup.filter.categoryAny'), value: '' },
  ...CATEGORIAS.map(c => ({ title: t(`sup.cat.${c}`), value: c })),
])

const columns = computed<DataColumn<ContactRow>[]>(() => [
  { key: 'name', label: t('contacts.table.name'), primary: true },
  { key: 'rubro', label: t('contacts.table.rubro') },
  { key: 'locality', label: t('contacts.table.locality') },
  { key: 'email', label: t('contacts.table.email') },
  { key: 'website', label: t('contacts.table.website') },
  { key: 'phone', label: t('contacts.table.phone'), mono: true },
  { key: 'methods', label: t('contacts.table.sources') },
])

const orgLd = useOrgLd()
useSeo(() => ({
  title: t('seo.contacts.title'),
  description: t('seo.contacts.description', { total: formatNumber(directoryTotal.value) }),
  path: '/proveedores/contactos',
  // Public, but not a harvestable email list we ask crawlers to index.
  noindex: true,
  kicker: 'Proveedores',
  jsonLd: [orgLd],
}))
</script>

<template>
  <div class="u-container page">
    <header class="page__head">
      <p class="u-eyebrow">
        {{ t('nav.suppliers') }}
      </p>
      <h1>{{ t('contacts.title') }}</h1>
      <p class="u-lead page__lead">
        {{ t('contacts.lead', { total: formatNumber(directoryTotal) }) }}
      </p>
    </header>

    <!-- ===== Toolbar: search + sort ===== -->
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
          :placeholder="t('contacts.searchPlaceholder')"
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

      <label class="toolbar__sort">
        <span class="u-sr-only">{{ t('common.sortBy') }}</span>
        <select
          v-model="sort"
          class="sel"
        >
          <option value="priorityDesc">
            {{ t('contacts.sort.priorityDesc') }}
          </option>
          <option value="nameAsc">
            {{ t('contacts.sort.nameAsc') }}
          </option>
        </select>
      </label>
    </div>

    <!-- ===== Segment filters ===== -->
    <div class="filters">
      <label class="filters__sel">
        <span class="u-sr-only">{{ t('contacts.filter.origin') }}</span>
        <select
          v-model="origen"
          class="sel"
        >
          <option value="todas">
            {{ t('contacts.filter.originTodas') }}
          </option>
          <option value="con-email">
            {{ t('contacts.filter.originConEmail') }}
          </option>
          <option value="sin-adjudicaciones">
            {{ t('contacts.filter.originSinAdjudicaciones') }}
          </option>
        </select>
      </label>

      <label class="filters__sel">
        <span class="u-sr-only">{{ t('contacts.filter.rubro') }}</span>
        <select
          v-model="rubro"
          class="sel"
        >
          <option value="">
            {{ t('contacts.filter.rubroAny') }}
          </option>
          <option
            v-for="r in rubros"
            :key="r.classificationId"
            :value="r.classificationId"
          >
            {{ r.label || r.classificationId }} ({{ formatNumber(r.count) }})
          </option>
        </select>
      </label>

      <label class="filters__sel">
        <span class="u-sr-only">{{ t('contacts.filter.dept') }}</span>
        <select
          v-model="departamento"
          class="sel"
        >
          <option value="">
            {{ t('contacts.filter.deptAny') }}
          </option>
          <option
            v-for="d in DEPARTAMENTOS"
            :key="d"
            :value="d"
          >
            {{ d }}
          </option>
        </select>
      </label>

      <label class="filters__sel">
        <span class="u-sr-only">{{ t('contacts.filter.size') }}</span>
        <select
          v-model="tamano"
          class="sel"
        >
          <option value="">
            {{ t('contacts.filter.sizeAny') }}
          </option>
          <option value="micro">
            {{ t('sup.dei.size.micro') }}
          </option>
          <option value="pequena">
            {{ t('sup.dei.size.pequena') }}
          </option>
          <option value="mediana">
            {{ t('sup.dei.size.mediana') }}
          </option>
          <option value="gran">
            {{ t('sup.dei.size.gran') }}
          </option>
        </select>
      </label>

      <label class="filters__sel">
        <span class="u-sr-only">{{ t('sup.filter.category') }}</span>
        <select
          v-model="categoria"
          class="sel"
        >
          <option
            v-for="it in CATEGORIA_ITEMS"
            :key="it.value"
            :value="it.value"
          >
            {{ it.title }}
          </option>
        </select>
      </label>

      <label class="chk">
        <input
          v-model="deiOnly"
          type="checkbox"
        >
        <span>{{ t('contacts.filter.deiOnly') }}</span>
      </label>
      <label class="chk">
        <input
          v-model="onlyDirect"
          type="checkbox"
        >
        <span>{{ t('contacts.filter.onlyDirect') }}</span>
      </label>
      <label class="chk">
        <input
          v-model="verifiedOnly"
          type="checkbox"
        >
        <span>{{ t('contacts.filter.verifiedOnly') }}</span>
      </label>
      <label class="chk">
        <input
          v-model="hasPhone"
          type="checkbox"
        >
        <span>{{ t('contacts.filter.hasPhone') }}</span>
      </label>
      <label class="chk">
        <input
          v-model="hasWebsite"
          type="checkbox"
        >
        <span>{{ t('contacts.filter.hasWebsite') }}</span>
      </label>

      <button
        v-if="hasFilters"
        class="filters__clear"
        type="button"
        @click="clearFilters"
      >
        {{ t('contacts.filter.clear') }}
      </button>
    </div>

    <!-- ===== Download bar ===== -->
    <div class="dl">
      <span class="dl__label">
        {{ t('contacts.download.label', { count: formatNumber(filteredTotal) }) }}
      </span>
      <div class="dl__btns">
        <a
          v-for="f in FORMATS"
          :key="f.fmt"
          class="dl__btn"
          :href="exportUrl(f.fmt)"
          :aria-label="t('contacts.download.aria', { format: f.fmt.toUpperCase() })"
          rel="nofollow"
          @click="onExport(f.fmt)"
        >
          <v-icon size="18">{{ f.icon }}</v-icon>
          <span>{{ f.fmt.toUpperCase() }}</span>
        </a>
      </div>
    </div>

    <p
      v-if="exportTruncated"
      class="dl__warn"
    >
      {{ t('contacts.download.capWarning', { cap: formatNumber(EXPORT_CAP) }) }}
    </p>

    <p class="count">
      {{ t('contacts.resultsSummary', { count: formatNumber(filteredTotal) }) }}
    </p>

    <!-- ===== Results ===== -->
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
          {{ t('contacts.empty.title') }}
        </h2>
        <p class="state__b">
          {{ t('contacts.empty.body') }}
        </p>
        <button
          v-if="hasFilters || searchTerm"
          class="state__a"
          type="button"
          @click="clearFilters"
        >
          {{ t('contacts.filter.clear') }}
        </button>
      </div>

      <DataTable
        v-else
        :columns="columns"
        :rows="contacts"
        :row-key="(r) => r.supplierId"
        min-width="820px"
      >
        <template #cell:name="{ row }">
          <div class="namecell">
            <NuxtLink
              :to="supplierPath(row.supplierId)"
              class="namecell__link"
            >
              {{ row.name }}
            </NuxtLink>
            <DeiChip
              v-if="row.dei"
              :estado="row.dei.estado"
            />
            <NeverAwardedChip v-if="row.neverAwarded" />
            <OnlyDirectAwardChip
              v-if="row.onlyDirectAward"
              :count="row.directAwardCount"
            />
          </div>
        </template>
        <template #cell:rubro="{ row }">
          {{ row.rubro || '—' }}
        </template>
        <template #cell:locality="{ row }">
          <div>{{ row.locality || '—' }}</div>
          <div
            v-if="row.address"
            style="font-size:0.85em;opacity:0.7"
          >
            {{ row.address }}
          </div>
        </template>
        <template #cell:email="{ row }">
          <div
            v-if="row.emails.length"
            style="display:flex;flex-direction:column;gap:2px"
          >
            <a
              v-for="e in row.emails"
              :key="e.email"
              :href="`mailto:${e.email}`"
              class="link"
            >{{ e.email }}</a>
          </div>
          <span
            v-else-if="row.neverAwarded"
            style="opacity:0.7"
          >{{ t('contacts.noPublicEmail') }}</span>
          <span v-else>—</span>
        </template>
        <template #cell:website="{ row }">
          <template v-if="row.website">
            <a
              :href="websiteHref(row.website)"
              target="_blank"
              rel="nofollow noopener"
              class="link"
            >{{ hostname(row.website) }}</a>
            <div
              v-if="originLabel(row.websiteSource)"
              style="font-size:0.8em;opacity:0.7"
            >
              {{ originLabel(row.websiteSource) }}
            </div>
          </template>
          <span v-else>—</span>
        </template>
        <template #cell:phone="{ row }">
          {{ row.phone || '—' }}
        </template>
        <template #cell:methods="{ row }">
          <div
            v-if="row.methods && row.methods.length"
            class="srcbadges"
          >
            <span
              v-for="m in row.methods"
              :key="m"
              class="srcbadge"
              :class="METHOD_BADGES[m]?.cls"
            >{{ METHOD_BADGES[m]?.label || m }}</span>
          </div>
          <span v-else>—</span>
        </template>
      </DataTable>
    </PaginatedList>

    <!-- ===== Compliance / source ===== -->
    <div class="notice">
      <p class="notice__src">
        {{ t('contacts.notice.source') }}
      </p>
      <p class="notice__opt">
        {{ t('contacts.notice.optout') }}
        <a
          class="link"
          href="mailto:info@checkleaked.cc?subject=Baja%20de%20datos%20-%20proveedores"
        >info@checkleaked.cc</a>.
      </p>
    </div>
  </div>
</template>

<style scoped>
.u-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}

.page { padding-block: var(--s-6) var(--s-8); }
.page__head { margin-bottom: var(--s-5); }
.page__lead { margin: var(--s-3) 0 0; }

/* ---- Toolbar ---- */
.toolbar {
  display: flex;
  align-items: center;
  gap: var(--s-4);
  margin-bottom: var(--s-3);
}

.find {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  flex: 1 1 auto;
  min-width: 0;
  max-width: 420px;
  padding: var(--s-1) var(--s-3);
  background: var(--surface);
  border: 1px solid var(--rule-strong);
  border-radius: var(--r-md);
  transition: border-color var(--dur) var(--ease);
}

.find:focus-within { border-color: var(--celeste); }
.find__icon { color: var(--text-muted); flex: none; }

.find__input {
  flex: 1 1 auto;
  min-width: 0;
  padding: var(--s-2) 0;
  border: 0;
  background: transparent;
  color: var(--text);
  font-family: var(--font-body);
  font-size: var(--t-sm);
}

.find__input:focus { outline: none; }
.find__input::placeholder { color: var(--text-muted); }
.find__input::-webkit-search-cancel-button { display: none; }

.find__x {
  display: grid;
  place-items: center;
  flex: none;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}

.find__x:hover { color: var(--text); }

.toolbar__sort { margin-left: auto; }

.sel {
  padding: var(--s-2) var(--s-3);
  border: 1px solid var(--rule);
  border-radius: var(--r-md);
  background: var(--surface);
  color: var(--text);
  font-family: var(--font-body);
  font-size: var(--t-sm);
  cursor: pointer;
  max-width: 260px;
}

/* ---- Filters ---- */
.filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--s-3);
  margin-bottom: var(--s-4);
}

.chk {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  font-size: var(--t-sm);
  color: var(--text);
  cursor: pointer;
}

.chk input { accent-color: var(--verde); cursor: pointer; }

.filters__clear {
  padding: var(--s-1) var(--s-3);
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--celeste-deep);
  font-family: var(--font-body);
  font-size: var(--t-sm);
  font-weight: 600;
  cursor: pointer;
}

.filters__clear:hover { text-decoration: underline; }

/* ---- Download bar ---- */
.dl {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-3);
  padding: var(--s-4);
  margin-bottom: var(--s-4);
  background: var(--surface-sunken);
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
}

.dl__label {
  font-size: var(--t-sm);
  font-weight: 600;
  color: var(--text);
}

.dl__btns { display: flex; flex-wrap: wrap; gap: var(--s-2); }

.dl__btn {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  padding: var(--s-2) var(--s-3);
  border: 1px solid var(--rule-strong);
  border-radius: var(--r-md);
  background: var(--surface);
  color: var(--text);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  font-weight: 600;
  letter-spacing: 0.04em;
  text-decoration: none;
  cursor: pointer;
  transition: border-color var(--dur) var(--ease), color var(--dur) var(--ease);
}

.dl__btn:hover { border-color: var(--celeste); color: var(--celeste-deep); }

.dl__warn {
  margin: 0 0 var(--s-3);
  font-size: var(--t-sm);
  color: var(--text-muted);
}

.count {
  margin: 0 0 var(--s-3);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  color: var(--text-muted);
}

/* ---- Cells ---- */
.namecell {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--s-2);
}

.namecell__link {
  font-weight: 600;
  color: var(--text);
  text-decoration: none;
}

.namecell__link:hover { color: var(--celeste-deep); text-decoration: underline; }

.link { color: var(--celeste-deep); text-decoration: none; }

/* Source/method badges (which enrichment produced the record). */
.srcbadges { display: flex; flex-wrap: wrap; gap: 4px; }
.srcbadge {
  font-size: 0.72rem;
  line-height: 1;
  padding: 3px 6px;
  border-radius: 999px;
  border: 1px solid var(--stroke, rgba(255, 255, 255, 0.14));
  white-space: nowrap;
  opacity: 0.92;
}
.srcbadge.is-dei { color: #7ee0a6; border-color: rgba(126, 224, 166, 0.4); }
.srcbadge.is-rupe { color: #7ec8e0; border-color: rgba(126, 200, 224, 0.4); }
.srcbadge.is-crawl { color: #e6c46a; border-color: rgba(230, 196, 106, 0.4); }
.srcbadge.is-maps { color: #d59bd5; border-color: rgba(213, 155, 213, 0.4); }
.srcbadge.is-impo { color: #b7b7c9; border-color: rgba(183, 183, 201, 0.4); }
.link:hover { text-decoration: underline; }

/* ---- States ---- */
.state {
  padding: var(--s-8) var(--s-5);
  text-align: center;
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
}

.state__t { margin: 0 0 var(--s-2); font-size: var(--t-lg); }

.state__b {
  margin: 0 auto var(--s-4);
  max-width: 46ch;
  color: var(--text-muted);
  font-size: var(--t-sm);
}

.state__a {
  padding: var(--s-2) var(--s-5);
  border: 0;
  border-radius: var(--r-md);
  background: var(--ink);
  color: #fff;
  font-family: var(--font-body);
  font-weight: 600;
  font-size: var(--t-sm);
  cursor: pointer;
}

.skeleton {
  display: flex;
  flex-direction: column;
  gap: 1px;
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
  overflow: hidden;
}

.skeleton__row {
  height: 52px;
  background: linear-gradient(90deg, var(--surface) 25%, var(--surface-sunken) 37%, var(--surface) 63%);
  background-size: 400% 100%;
  animation: shimmer 1.4s ease infinite;
}

@keyframes shimmer {
  0% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}

/* ---- Compliance ---- */
.notice {
  margin: var(--s-6) 0 0;
  padding-top: var(--s-5);
  border-top: 1px solid var(--rule);
}

.notice__src, .notice__opt {
  margin: 0 0 var(--s-2);
  font-size: var(--t-sm);
  color: var(--text-muted);
}

@media (max-width: 640px) {
  .toolbar { flex-direction: column; align-items: stretch; }
  .find { max-width: none; }
  .toolbar__sort { margin-left: 0; }
  .sel { max-width: none; width: 100%; }
}
</style>
