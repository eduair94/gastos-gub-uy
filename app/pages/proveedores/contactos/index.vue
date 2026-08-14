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

interface EmailEntry { email: string, source: string, sourceUrl: string | null, confidence: number, mxValid: boolean, status: string }
interface PhoneEntry { phone: string, source: string, sourceUrl: string | null, confidence: number }
interface SocialLink { platform: string, url: string, label: string, source: string, sourceUrl: string | null }
interface ContactChannel { key: string, label: string, href: string, sourceLabel: string, sourceUrl: string | null, external: boolean }
interface ContactRow {
  supplierId: string
  rut: string
  name: string
  email: string | null
  emails: EmailEntry[]
  website: string | null
  websiteSource: string | null
  websiteSourceUrl: string | null
  phone: string | null
  phoneSource: string | null
  phones: PhoneEntry[]
  websitePhone: string | null
  websiteAddress: string | null
  contactFormUrl: string | null
  socialLinks: SocialLink[]
  locality: string | null
  address: string | null
  placeSource: string | null
  mapsUrl: string | null
  hours: string | null
  lat: number | null
  lng: number | null
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
  if (src === 'webSearch') return t('contacts.source.webSearch')
  if (src === 'website') return t('contacts.source.website')
  if (src === 'googleMaps') return t('contacts.source.googleMaps')
  if (src === 'dei') return 'DEI'
  if (src === 'rupe') return 'RUPE'
  if (src === 'impo') return 'IMPO'
  if (src === 'manual') return t('contacts.source.manual')
  return ''
}
function websiteOriginLabel(src: string | null): string {
  return src === 'webSearch' ? t('contacts.source.verifiedWebsite') : originLabel(src)
}
function displayPhones(row: ContactRow): PhoneEntry[] {
  if (row.phones?.length) return row.phones
  const fallback: PhoneEntry[] = []
  if (row.phone && row.phoneSource) {
    fallback.push({ phone: row.phone, source: row.phoneSource, sourceUrl: null, confidence: 0 })
  }
  if (row.websitePhone && row.websitePhone !== row.phone) {
    fallback.push({ phone: row.websitePhone, source: 'website', sourceUrl: row.website, confidence: 0 })
  }
  return fallback
}
function emailChannels(row: ContactRow): ContactChannel[] {
  return row.emails.map(entry => ({
    key: entry.email,
    label: entry.email,
    href: `mailto:${entry.email}`,
    sourceLabel: originLabel(entry.source),
    sourceUrl: entry.sourceUrl,
    external: false,
  }))
}
function phoneChannels(row: ContactRow): ContactChannel[] {
  return displayPhones(row).map(entry => ({
    key: `${entry.phone}-${entry.source}-${entry.sourceUrl || ''}`,
    label: entry.phone,
    href: `tel:${entry.phone}`,
    sourceLabel: originLabel(entry.source),
    sourceUrl: entry.sourceUrl,
    external: false,
  }))
}
function moreContactChannels(row: ContactRow): ContactChannel[] {
  const entries: ContactChannel[] = []
  if (row.contactFormUrl) {
    entries.push({
      key: row.contactFormUrl,
      label: t('contacts.contactForm'),
      href: row.contactFormUrl,
      sourceLabel: '',
      sourceUrl: null,
      external: true,
    })
  }
  for (const social of row.socialLinks ?? []) {
    entries.push({
      key: social.url,
      label: social.label || social.platform,
      href: social.url,
      sourceLabel: originLabel(social.source),
      sourceUrl: social.sourceUrl,
      external: true,
    })
  }
  return entries
}
interface RubroFacet { classificationId: string, label: string, count: number }

/** How each enrichment method is badged (label + css modifier). */
const METHOD_BADGES: Record<string, { label: string, cls: string }> = {
  dei: { label: 'DEI', cls: 'is-dei' },
  rupe: { label: 'RUPE', cls: 'is-rupe' },
  crawl4ai: { label: 'crawl4ai', cls: 'is-crawl' },
  googleMaps: { label: 'Google Maps', cls: 'is-maps' },
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
const rupeEstado = ref((route.query.rupeEstado as string) ?? '')
const deiOnly = ref(route.query.dei === '1')
const onlyDirect = ref(route.query.onlyDirect === '1')
// Which population to include: todas (default) | con-email | sin-adjudicaciones.
const origen = ref((route.query.origen as string) ?? 'todas')
// Verified email is an opt-in global restriction. The API receives an explicit
// 0/1 so the control has one unambiguous meaning across list, map and export.
const verifiedOnly = ref(route.query.verified === '1')
const hasPhone = ref(route.query.hasPhone === '1')
const hasWebsite = ref(route.query.hasWebsite === '1')
const sort = ref((route.query.sort as string) ?? 'priorityDesc')
const locationDialogOpen = ref(false)
const locationContact = shallowRef<ContactRow | null>(null)

const SORTS: Record<string, { sortBy: string, sortOrder: string }> = {
  priorityDesc: { sortBy: 'priority', sortOrder: 'desc' },
  nameAsc: { sortBy: 'name', sortOrder: 'asc' },
}

const hasFilters = computed(() =>
  !!rubro.value || !!departamento.value || !!tamano.value || !!categoria.value || !!rupeEstado.value || deiOnly.value || onlyDirect.value
  || verifiedOnly.value || hasPhone.value || hasWebsite.value || origen.value !== 'todas')

function clearFilters() {
  track('filter_clear', { surface: 'contacts' })
  rubro.value = ''
  departamento.value = ''
  tamano.value = ''
  categoria.value = ''
  rupeEstado.value = ''
  deiOnly.value = false
  onlyDirect.value = false
  origen.value = 'todas'
  verifiedOnly.value = false
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
  ...(rupeEstado.value ? { rupeEstado: rupeEstado.value } : {}),
  ...(departamento.value ? { departamento: departamento.value } : {}),
  ...(origen.value !== 'todas' ? { origen: origen.value } : {}),
  verified: verifiedOnly.value ? '1' : '0',
  ...(hasPhone.value ? { hasPhone: '1' } : {}),
  ...(hasWebsite.value ? { hasWebsite: '1' } : {}),
  ...(SORTS[sort.value] ?? SORTS.priorityDesc),
}))

const listQuery = computed(() => ({ page: page.value, limit: 25, ...filterQuery.value }))

watch([searchTerm, rubro, departamento, tamano, categoria, rupeEstado, deiOnly, onlyDirect, origen, verifiedOnly, hasPhone, hasWebsite, sort], () => {
  page.value = 1
})

watch([searchTerm, page, rubro, departamento, tamano, categoria, rupeEstado, deiOnly, onlyDirect, origen, verifiedOnly, hasPhone, hasWebsite, sort], () => {
  const q: Record<string, string> = {}
  if (searchTerm.value) q.search = searchTerm.value
  if (page.value > 1) q.page = String(page.value)
  if (rubro.value) q.rubro = rubro.value
  if (departamento.value) q.departamento = departamento.value
  if (tamano.value) q.tamano = tamano.value
  if (categoria.value) q.categoria = categoria.value
  if (rupeEstado.value) q.rupeEstado = rupeEstado.value
  if (deiOnly.value) q.dei = '1'
  if (onlyDirect.value) q.onlyDirect = '1'
  if (origen.value !== 'todas') q.origen = origen.value
  if (verifiedOnly.value) q.verified = '1'
  if (hasPhone.value) q.hasPhone = '1'
  if (hasWebsite.value) q.hasWebsite = '1'
  if (sort.value !== 'priorityDesc') q.sort = sort.value
  router.replace({ query: q })
})

const { data: listRes, pending, error } = await useFetch<any>('/api/contacts', { query: listQuery })
const { data: totalRes } = await useFetch<any>('/api/contacts', {
  query: { limit: 1, verified: '0' },
  key: 'contacts-directory-total',
})
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

function resetDirectory() {
  clearSearch()
  clearFilters()
}

function openLocation(row: ContactRow) {
  locationContact.value = row
  locationDialogOpen.value = true
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

const columns = computed<DataColumn<ContactRow>[]>(() => [
  { key: 'name', label: t('contacts.table.name'), primary: true, width: '18%', cellClass: 'contact-col--name' },
  { key: 'rupeEstado', label: t('contacts.table.rupeStatus'), width: '9%', cellClass: 'contact-col--status' },
  { key: 'rubro', label: t('contacts.table.rubro'), width: '12%', cellClass: 'contact-col--rubro' },
  { key: 'locality', label: t('contacts.table.locality'), width: '12%', cellClass: 'contact-col--locality' },
  { key: 'email', label: t('contacts.table.email'), width: '18%', cellClass: 'contact-col--email' },
  { key: 'website', label: t('contacts.table.website'), width: '12%', cellClass: 'contact-col--website' },
  { key: 'phone', label: t('contacts.table.phone'), mono: true, width: '10%', cellClass: 'contact-col--phone' },
  { key: 'moreContact', label: t('contacts.table.moreContact'), width: '9%', cellClass: 'contact-col--more' },
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

    <ContactsViewTabs />

    <ContactsDirectoryFilters
      v-model:search="search"
      v-model:sort="sort"
      v-model:origen="origen"
      v-model:rupe-estado="rupeEstado"
      v-model:rubro="rubro"
      v-model:departamento="departamento"
      v-model:tamano="tamano"
      v-model:categoria="categoria"
      v-model:dei-only="deiOnly"
      v-model:only-direct="onlyDirect"
      v-model:verified-only="verifiedOnly"
      v-model:has-phone="hasPhone"
      v-model:has-website="hasWebsite"
      class="directory-filters"
      :rubros="rubros"
      @clear="clearFilters"
      @clear-search="clearSearch"
    />

    <section class="results-toolbar">
      <div
        class="results-toolbar__summary"
        role="status"
        aria-live="polite"
      >
        <span>{{ t('contacts.resultsTitle') }}</span>
        <strong>{{ t('contacts.resultsSummary', { count: formatNumber(filteredTotal) }) }}</strong>
      </div>
      <div class="results-toolbar__export">
        <span class="results-toolbar__export-label">{{ t('contacts.download.actionsLabel') }}</span>
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
    </section>

    <p
      v-if="exportTruncated"
      class="dl__warn"
    >
      {{ t('contacts.download.capWarning', { cap: formatNumber(EXPORT_CAP) }) }}
    </p>

    <!-- ===== Results ===== -->
    <PaginatedList
      v-model:page="page"
      :total-pages="totalPages"
    >
      <StatePanel
        v-if="error"
        :title="t('errors.generic.title')"
        :body="t('errors.generic.body')"
        :action-label="t('errors.generic.action')"
        @action="() => refreshNuxtData()"
      />

      <SkeletonList
        v-else-if="pending && !contacts.length"
        :rows="8"
      />

      <StatePanel
        v-else-if="!contacts.length"
        :title="t('contacts.empty.title')"
        :body="verifiedOnly ? t('contacts.empty.bodyVerified') : t('contacts.empty.body')"
        :action-label="hasFilters || searchTerm ? t('contacts.filter.clear') : undefined"
        @action="resetDirectory"
      />

      <DataTable
        v-else
        class="contacts-table"
        :columns="columns"
        :rows="contacts"
        :row-key="(r) => r.supplierId"
        min-width="0"
      >
        <template #cell:name="{ row }">
          <div class="namecell">
            <div class="namecell__identity">
              <span
                v-if="row.neverAwarded"
                class="namecell__name"
              >{{ row.name }}</span>
              <NuxtLink
                v-else
                :to="supplierPath(row.supplierId)"
                class="namecell__link"
              >
                {{ row.name }}
              </NuxtLink>
            </div>
            <DeiChip
              v-if="row.dei"
              :estado="row.dei.estado"
            />
            <NeverAwardedChip v-if="row.neverAwarded" />
            <OnlyDirectAwardChip
              v-if="row.onlyDirectAward"
              :count="row.directAwardCount"
            />
            <div
              v-if="row.methods && row.methods.length"
              class="srcbadges"
              :aria-label="t('contacts.table.sources')"
            >
              <span
                v-for="m in row.methods"
                :key="m"
                class="srcbadge"
                :class="METHOD_BADGES[m]?.cls"
              >{{ METHOD_BADGES[m]?.label || m }}</span>
            </div>
          </div>
        </template>
        <template #cell:rubro="{ row }">
          {{ row.rubro || '—' }}
        </template>
        <template #cell:rupeEstado="{ row }">
          <RupeStatusChip
            v-if="row.rupeEstado"
            :status="row.rupeEstado"
          />
          <span v-else>—</span>
        </template>
        <template #cell:locality="{ row }">
          <button
            class="locationcell"
            type="button"
            :aria-label="t('contacts.location.openFor', { name: row.name })"
            @click="openLocation(row)"
          >
            <span class="locationcell__summary">{{ row.locality || '—' }}</span>
            <span class="locationcell__action">
              {{ t('contacts.location.open') }}
              <v-icon size="15">mdi-map-marker-outline</v-icon>
            </span>
          </button>
        </template>
        <template #cell:email="{ row }">
          <ContactChannelList
            :entries="emailChannels(row)"
            :empty-label="row.neverAwarded ? t('contacts.noPublicEmail') : '—'"
          />
        </template>
        <template #cell:website="{ row }">
          <template v-if="row.website">
            <a
              :href="websiteHref(row.website)"
              target="_blank"
              rel="nofollow noopener"
              class="link"
            >{{ hostname(row.website) }}</a>
            <a
              v-if="websiteOriginLabel(row.websiteSource)"
              :href="row.websiteSourceUrl || undefined"
              :target="row.websiteSourceUrl ? '_blank' : undefined"
              :rel="row.websiteSourceUrl ? 'nofollow noopener' : undefined"
              class="fieldsrc"
              :class="{ 'fieldsrc--link': row.websiteSourceUrl }"
            >
              {{ websiteOriginLabel(row.websiteSource) }}
            </a>
          </template>
          <span v-else>—</span>
        </template>
        <template #cell:phone="{ row }">
          <ContactChannelList :entries="phoneChannels(row)" />
        </template>
        <template #cell:moreContact="{ row }">
          <ContactChannelList :entries="moreContactChannels(row)" />
        </template>
      </DataTable>
    </PaginatedList>

    <ContactLocationDialog
      v-model="locationDialogOpen"
      :contact="locationContact"
      :source-label="locationContact ? originLabel(locationContact.placeSource) : ''"
    />

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
.directory-filters { margin-bottom: var(--s-5); }

/* ---- Results / export toolbar ---- */
.results-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-4);
  padding: var(--s-3) var(--s-4);
  margin-bottom: var(--s-3);
  background: var(--surface-sunken);
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
}

.results-toolbar__summary {
  display: grid;
  gap: var(--s-1);
}

.results-toolbar__summary span,
.results-toolbar__export-label {
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  letter-spacing: 0.03em;
}

.results-toolbar__summary strong {
  font-size: var(--t-sm);
  font-weight: 600;
  color: var(--text);
}

.results-toolbar__export {
  display: flex;
  align-items: center;
  gap: var(--s-3);
}

.dl__btns { display: flex; flex-wrap: wrap; gap: var(--s-2); }

.dl__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--s-2);
  min-height: 44px;
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

/* ---- Cells ---- */
.namecell {
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
  min-width: 0;
  gap: var(--s-2);
}

.namecell__identity {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  min-width: 0;
  gap: 2px;
}

.namecell__link, .namecell__name {
  overflow-wrap: anywhere;
  font-weight: 600;
  color: var(--text);
}

.namecell__link {
  text-decoration: none;
}

.namecell__link:hover { color: var(--celeste-deep); text-decoration: underline; }

.contacts-table :deep(.dt__table) { table-layout: fixed; }
.contacts-table :deep(.dt__td),
.contacts-table :deep(.dt__value) {
  min-width: 0;
  overflow-wrap: anywhere;
}

.locationcell {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 100%;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.locationcell__summary {
  display: -webkit-box;
  max-width: 100%;
  overflow: hidden;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.locationcell__action {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin-top: var(--s-1);
  color: var(--celeste-deep);
  font-size: var(--t-xs);
  font-weight: 600;
}

.locationcell:hover .locationcell__action {
  text-decoration: underline;
  text-underline-offset: 2px;
}

.link {
  color: var(--celeste-deep);
  overflow-wrap: anywhere;
  text-decoration: none;
}
.fieldsrc {
  display: block;
  font-family: var(--font-mono);
  font-size: 0.68rem;
  color: var(--text-muted);
  line-height: 1.25;
}
.fieldsrc--link { text-decoration: underline; text-underline-offset: 2px; }

/* Source/method badges (which enrichment produced the record). */
.srcbadges { display: flex; flex-wrap: wrap; gap: 4px; }
.srcbadge {
  font-size: 0.72rem;
  line-height: 1;
  padding: 3px 6px;
  border-radius: 999px;
  border: 1px solid var(--stroke, var(--ink-rule-soft));
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
  .results-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .results-toolbar__export {
    display: grid;
    gap: var(--s-2);
  }

  .dl__btns {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
