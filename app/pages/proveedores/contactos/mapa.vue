<!--
THESIS: Expediente público vivo; el mapa convierte ubicación en evidencia consultable.
OWN-WORLD: Cartografía, RUT, RUPE/DEI, canales con procedencia y contratación pública.
STORY: Buscar lugar, leer radio, seleccionar proveedor y revisar su ficha completa.
FIRST VIEWPORT: Alcance, vistas, filtros compartidos, controles geográficos y mapa.
FORM: Bordes estructurales, controles compactos; sombra sólo en flotantes y diálogo.
-->
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
const verifiedOnly = ref(route.query.verified === '1')
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
  verified: verifiedOnly.value ? '1' : '0',
  ...(hasPhone.value ? { hasPhone: '1' } : {}),
  ...(hasWebsite.value ? { hasWebsite: '1' } : {}),
}))

const { data: rubroRes } = await useFetch<any>('/api/contacts/rubros', {
  key: 'contacts-rubros',
})
const rubros = computed<RubroFacet[]>(() => rubroRes.value?.data?.rubros ?? [])
const activeFilterCount = computed(() => [
  searchTerm.value,
  rubro.value,
  departamento.value,
  tamano.value,
  categoria.value,
  rupeEstado.value,
  deiOnly.value,
  onlyDirect.value,
  verifiedOnly.value,
  hasPhone.value,
  hasWebsite.value,
  origen.value !== 'todas',
].filter(Boolean).length)

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
  verifiedOnly.value = false
  hasPhone.value = false
  hasWebsite.value = false
}

watch(
  [searchTerm, rubro, departamento, tamano, categoria, rupeEstado, deiOnly, onlyDirect, origen, verifiedOnly, hasPhone, hasWebsite],
  () => {
    const query: Record<string, string> = { ...filterQuery.value }
    if (!verifiedOnly.value) delete query.verified
    router.replace({ query })
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
    <header class="map-hero">
      <div class="map-hero__copy">
        <p class="u-eyebrow">
          {{ t('nav.suppliers') }}
        </p>
        <h1>{{ t('contacts.map.title') }}</h1>
        <p class="u-lead page__lead">
          {{ t('contacts.map.lead') }}
        </p>
      </div>
      <dl class="map-hero__facts">
        <div>
          <dt>{{ t('contacts.map.heroBase') }}</dt>
          <dd>{{ t('contacts.map.heroBaseValue') }}</dd>
        </div>
        <div>
          <dt>{{ t('contacts.map.heroLoading') }}</dt>
          <dd>{{ t('contacts.map.heroLoadingValue') }}</dd>
        </div>
        <div>
          <dt>{{ t('contacts.map.heroSelection') }}</dt>
          <dd>{{ t('contacts.map.heroSelectionValue') }}</dd>
        </div>
      </dl>
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
      :show-sort="false"
      @clear="clearFilters"
      @clear-search="clearSearch"
    />

    <section
      class="map-stage"
      :aria-label="t('contacts.map.title')"
    >
      <header class="map-stage__head">
        <div>
          <p>{{ t('contacts.map.workbenchEyebrow') }}</p>
          <h2>{{ t('contacts.map.workbenchTitle') }}</h2>
        </div>
        <span class="map-stage__filter-count">
          {{ activeFilterCount
            ? t('filters.active', activeFilterCount)
            : t('contacts.map.noActiveFilters') }}
        </span>
      </header>
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

.directory-filters {
  margin-bottom: var(--s-5);
}

.map-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(18rem, 0.6fr);
  gap: var(--s-7);
  align-items: end;
  margin-bottom: var(--s-5);
  padding-bottom: var(--s-5);
  border-bottom: 1px solid var(--rule-strong);
}

.map-hero__copy {
  max-width: 58rem;
}

.map-hero h1 {
  max-width: 18ch;
  text-wrap: balance;
}

.map-hero__facts {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin: 0;
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
  background: var(--surface);
}

.map-hero__facts > div {
  min-width: 0;
  padding: var(--s-3);
  border-right: 1px solid var(--rule);
}

.map-hero__facts > div:last-child {
  border-right: 0;
}

.map-hero__facts dt,
.map-stage__head p {
  margin: 0 0 var(--s-1);
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.map-hero__facts dd {
  margin: 0;
  overflow-wrap: anywhere;
  font-size: var(--t-xs);
  font-weight: 650;
}

.page__lead {
  margin: var(--s-3) 0 0;
}

.map-stage {
  min-width: 0;
  padding: var(--s-4);
  border: 1px solid var(--rule-strong);
  border-radius: var(--r-lg);
  background: var(--surface);
}

.map-stage__head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--s-4);
  margin-bottom: var(--s-4);
  padding-bottom: var(--s-3);
  border-bottom: 1px solid var(--rule);
}

.map-stage__head h2 {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--t-lg);
}

.map-stage__filter-count {
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
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
  .map-hero {
    grid-template-columns: 1fr;
    gap: var(--s-4);
  }

  .map-hero__facts {
    grid-template-columns: 1fr;
  }

  .map-hero__facts > div {
    border-right: 0;
    border-bottom: 1px solid var(--rule);
  }

  .map-hero__facts > div:last-child {
    border-bottom: 0;
  }

  .map-stage {
    padding: var(--s-3);
  }

  .map-stage__head {
    align-items: flex-start;
    flex-direction: column;
  }

  .map-notes {
    grid-template-columns: 1fr;
  }
}
</style>
