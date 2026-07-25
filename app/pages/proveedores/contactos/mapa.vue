<script setup lang="ts">
interface RubroFacet {
  classificationId: string
  label: string
  count: number
}

const { t } = useI18n()
const orgLd = useOrgLd()
const route = useRoute()
const router = useRouter()

const search = ref((route.query.search as string) ?? '')
const sort = ref('priorityDesc')
const rubro = ref((route.query.rubro as string) ?? '')
const departamento = ref((route.query.departamento as string) ?? '')
const tamano = ref((route.query.tamano as string) ?? '')
const categoria = ref((route.query.categoria as string) ?? '')
const rupeEstado = ref((route.query.rupeEstado as string) ?? '')
const deiOnly = ref(route.query.dei === '1')
const onlyDirect = ref(route.query.onlyDirect === '1')
const origen = ref((route.query.origen as string) ?? 'todas')
const verifiedOnly = ref(route.query.verified !== '0')
const hasPhone = ref(route.query.hasPhone === '1')
const hasWebsite = ref(route.query.hasWebsite === '1')

const searchDebounced = refDebounced(search, 350)
const searchTerm = computed(() => searchDebounced.value.trim())
const filterQuery = computed<Record<string, string>>(() => ({
  ...(searchTerm.value ? { search: searchTerm.value } : {}),
  ...(rubro.value ? { rubro: rubro.value } : {}),
  ...(deiOnly.value ? { dei: '1' } : {}),
  ...(onlyDirect.value ? { onlyDirect: '1' } : {}),
  ...(tamano.value ? { tamano: tamano.value } : {}),
  ...(categoria.value ? { categoria: categoria.value } : {}),
  ...(rupeEstado.value ? { rupeEstado: rupeEstado.value } : {}),
  ...(departamento.value ? { departamento: departamento.value } : {}),
  ...(origen.value !== 'todas' ? { origen: origen.value } : {}),
  ...(verifiedOnly.value ? {} : { verified: '0' }),
  ...(hasPhone.value ? { hasPhone: '1' } : {}),
  ...(hasWebsite.value ? { hasWebsite: '1' } : {}),
}))

const { data: rubroRes } = await useFetch<any>('/api/contacts/rubros', {
  key: 'contacts-rubros',
})
const rubros = computed<RubroFacet[]>(() => rubroRes.value?.data?.rubros ?? [])

function clearSearch() {
  search.value = ''
}

function clearFilters() {
  rubro.value = ''
  departamento.value = ''
  tamano.value = ''
  categoria.value = ''
  rupeEstado.value = ''
  deiOnly.value = false
  onlyDirect.value = false
  origen.value = 'todas'
  verifiedOnly.value = true
  hasPhone.value = false
  hasWebsite.value = false
}

watch(
  [searchTerm, rubro, departamento, tamano, categoria, rupeEstado, deiOnly, onlyDirect, origen, verifiedOnly, hasPhone, hasWebsite],
  () => {
    router.replace({ query: { ...filterQuery.value } })
  },
)

useSeo(() => ({
  title: t('seo.contactsMap.title'),
  description: t('seo.contactsMap.description'),
  path: '/proveedores/contactos/mapa',
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
      <h1>{{ t('contacts.map.title') }}</h1>
      <p class="u-lead page__lead">
        {{ t('contacts.map.lead') }}
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
      :rubros="rubros"
      :show-sort="false"
      @clear="clearFilters"
      @clear-search="clearSearch"
    />

    <section
      class="map-stage"
      :aria-label="t('contacts.map.title')"
    >
      <SupplierLocationsMap :filters="filterQuery" />
    </section>

    <div class="map-notes">
      <p class="map-notes__legend">
        <span
          class="map-notes__dot"
          aria-hidden="true"
        />
        {{ t('contacts.map.legend') }}
      </p>
      <p class="map-notes__source">
        {{ t('contacts.map.source') }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.page {
  padding-block: var(--s-6) var(--s-8);
}

.page__head {
  max-width: 58rem;
  margin-bottom: var(--s-5);
}

.page__lead {
  margin: var(--s-3) 0 0;
}

.map-stage {
  min-width: 0;
}

.map-notes {
  display: grid;
  grid-template-columns: minmax(0, auto) minmax(18rem, 1fr);
  gap: var(--s-4) var(--s-6);
  align-items: start;
  margin-top: var(--s-4);
  padding-top: var(--s-4);
  border-top: 1px solid var(--rule);
  color: var(--text-muted);
  font-size: var(--t-xs);
}

.map-notes p {
  margin: 0;
}

.map-notes__legend {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  color: var(--text);
  font-family: var(--font-mono);
}

.map-notes__dot {
  width: 0.85rem;
  height: 0.85rem;
  flex: none;
  border: 2px solid var(--ink);
  border-radius: var(--r-full);
  background: var(--celeste);
}

@media (max-width: 720px) {
  .map-notes {
    grid-template-columns: 1fr;
  }
}
</style>
