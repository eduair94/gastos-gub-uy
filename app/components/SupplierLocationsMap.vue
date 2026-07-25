<script setup lang="ts">
/**
 * Client-only Leaflet map over the geospatial supplier_contacts endpoint.
 * The viewport payload stays small; complete contact details load only after
 * the user asks for them inside a marker popup.
 */
import 'leaflet/dist/leaflet.css'

interface SupplierMapPoint {
  supplierId: string
  rut: string
  name: string
  lat: number
  lng: number
  locality: string | null
  address: string | null
  placeSource: string | null
  rubro: string | null
  neverAwarded: boolean
  rupeEstado: string | null
}

interface ScanArea {
  center: { lat: number, lng: number }
  radiusMeters: number
}

interface MapResponse {
  success: true
  data: {
    points: SupplierMapPoint[]
    loaded: number
    truncated: boolean
    scan: ScanArea
  }
}

interface PopupDetail {
  supplierId: string
  rut: string
  name: string
  rubro: string | null
  emails: string[]
  phones: string[]
  website: string | null
  contactFormUrl: string | null
  socialLinks: Array<{ platform: string, label: string, url: string }>
  locality: string | null
  address: string | null
  websiteAddress: string | null
  hours: string | null
  mapsUrl: string | null
}

interface DetailResponse {
  success: true
  data: PopupDetail
}

interface LocationResult {
  id: string
  label: string
  lat: number
  lng: number
  type: string
  bounds: {
    south: number
    north: number
    west: number
    east: number
  } | null
}

interface LocationResponse {
  success: true
  data: { results: LocationResult[] }
}

const props = withDefaults(defineProps<{
  height?: number
  filters?: Record<string, string>
}>(), {
  height: 620,
  filters: () => ({}),
})

const { t } = useI18n()
const localePath = useLocalePath()
const el = ref<HTMLElement | null>(null)
const loading = ref(true)
const error = ref(false)
const loaded = ref(0)
const truncated = ref(false)
const scanRadiusMeters = ref(0)
const locationQuery = ref('')
const locationSearching = ref(false)
const locationResults = ref<LocationResult[]>([])
const locationError = ref('')
const locating = ref(false)

let L: any = null
let map: any = null
let pointLayer: any = null
let scanCircle: any = null
let searchedPlaceMarker: any = null
let userMarker: any = null
let userAccuracyCircle: any = null
let controller: AbortController | null = null
let locationController: AbortController | null = null
let requestSequence = 0
let debounceTimer: ReturnType<typeof setTimeout> | null = null

const detailCache = new Map<string, PopupDetail>()

function supplierHref(id: string): string {
  return localePath(`/suppliers/${id.split('/').map(encodeURIComponent).join('/')}`)
}

function externalHref(value: string): string | null {
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  }
  catch {
    return null
  }
}

function externalLabel(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, '')
  }
  catch {
    return value
  }
}

function node<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const item = document.createElement(tag)
  item.className = className
  if (text !== undefined) item.textContent = text
  return item
}

function link(label: string, href: string, external = false): HTMLAnchorElement {
  const item = node('a', 'supplier-card__link', label)
  item.href = href
  if (external) {
    item.target = '_blank'
    item.rel = 'noopener noreferrer'
  }
  return item
}

function appendField(
  card: HTMLElement,
  label: string,
  values: Array<HTMLElement | null>,
): boolean {
  const usable = values.filter((value): value is HTMLElement => !!value)
  if (!usable.length) return false
  const field = node('div', 'supplier-card__field')
  field.append(node('span', 'supplier-card__label', label))
  const content = node('div', 'supplier-card__values')
  usable.forEach(value => content.append(value))
  field.append(content)
  card.append(field)
  return true
}

function popupHeader(name: string, rubro: string | null, place: string | null): HTMLElement {
  const header = node('header', 'supplier-card__header')
  header.append(node('strong', 'supplier-card__title', name))
  if (rubro) header.append(node('span', 'supplier-card__meta', rubro))
  if (place) header.append(node('span', 'supplier-card__place', place))
  return header
}

function popupActions(supplierId: string): HTMLElement {
  const actions = node('div', 'supplier-card__actions')
  actions.append(link(t('contacts.map.openProfile'), supplierHref(supplierId)))
  return actions
}

function contactCard(detail: PopupDetail): HTMLElement {
  const card = node('article', 'supplier-card')
  const place = detail.locality || detail.address
  card.append(popupHeader(detail.name, detail.rubro, place))

  let hasContact = false
  hasContact = appendField(
    card,
    t('contacts.table.email'),
    detail.emails.map(email => link(email, `mailto:${email}`)),
  ) || hasContact
  hasContact = appendField(
    card,
    t('contacts.table.phone'),
    detail.phones.map(phone => link(phone, `tel:${phone}`)),
  ) || hasContact

  const website = detail.website ? externalHref(detail.website) : null
  hasContact = appendField(
    card,
    t('contacts.table.website'),
    website ? [link(externalLabel(website), website, true)] : [],
  ) || hasContact
  hasContact = appendField(
    card,
    t('contacts.contactForm'),
    detail.contactFormUrl
      ? [link(t('contacts.contactForm'), detail.contactFormUrl, true)]
      : [],
  ) || hasContact
  hasContact = appendField(
    card,
    t('contacts.map.socialChannels'),
    detail.socialLinks.map(item => link(item.label || item.platform, item.url, true)),
  ) || hasContact

  appendField(
    card,
    t('contacts.location.address'),
    detail.address ? [node('span', '', detail.address)] : [],
  )
  appendField(
    card,
    t('contacts.location.websiteAddress'),
    detail.websiteAddress && detail.websiteAddress !== detail.address
      ? [node('span', '', detail.websiteAddress)]
      : [],
  )
  appendField(
    card,
    t('contacts.businessHours'),
    detail.hours ? [node('span', '', detail.hours)] : [],
  )
  appendField(
    card,
    t('contacts.location.openMaps'),
    detail.mapsUrl ? [link(t('contacts.location.openMaps'), detail.mapsUrl, true)] : [],
  )

  if (!hasContact) {
    card.append(node('p', 'supplier-card__empty', t('contacts.map.noContact')))
  }
  card.append(popupActions(detail.supplierId))
  return card
}

function errorCard(point: SupplierMapPoint, marker: any): HTMLElement {
  const card = node('article', 'supplier-card')
  card.append(popupHeader(point.name, point.rubro, point.locality || point.address))
  card.append(node('p', 'supplier-card__empty', t('contacts.map.contactError')))
  const retry = node('button', 'supplier-card__button', t('contacts.map.retryContact'))
  retry.type = 'button'
  retry.addEventListener('click', () => void showContactDetails(point, marker, retry))
  card.append(retry, popupActions(point.supplierId))
  return card
}

async function showContactDetails(
  point: SupplierMapPoint,
  marker: any,
  trigger: HTMLButtonElement,
): Promise<void> {
  const cached = detailCache.get(point.supplierId)
  if (cached) {
    marker.setPopupContent(contactCard(cached)).openPopup()
    return
  }

  trigger.disabled = true
  trigger.textContent = t('contacts.map.loadingContact')
  try {
    const response = await $fetch<DetailResponse>('/api/contacts/map-detail', {
      query: { supplierId: point.supplierId },
    })
    detailCache.set(point.supplierId, response.data)
    marker.setPopupContent(contactCard(response.data)).openPopup()
  }
  catch {
    marker.setPopupContent(errorCard(point, marker)).openPopup()
  }
}

function summaryCard(point: SupplierMapPoint, marker: any): HTMLElement {
  const card = node('article', 'supplier-card')
  card.append(popupHeader(point.name, point.rubro, point.locality || point.address))
  if (point.neverAwarded) {
    card.append(node('span', 'supplier-card__note', t('contacts.chip.neverAwarded')))
  }
  const button = node('button', 'supplier-card__button', t('contacts.map.viewContacts'))
  button.type = 'button'
  button.addEventListener('click', () => void showContactDetails(point, marker, button))
  card.append(button)
  return card
}

function markerLimit(): number {
  const zoom = map?.getZoom?.() ?? 6
  if (zoom <= 5) return 500
  if (zoom <= 8) return 900
  return 1500
}

function rootColor(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

function renderScanArea(scan: ScanArea): void {
  if (!map || !L) return
  if (scanCircle) scanCircle.remove()
  scanRadiusMeters.value = scan.radiusMeters
  scanCircle = L.circle([scan.center.lat, scan.center.lng], {
    radius: scan.radiusMeters,
    color: rootColor('--celeste-deep'),
    weight: 2,
    opacity: 0.9,
    fillColor: rootColor('--celeste'),
    fillOpacity: 0.07,
    dashArray: '8 8',
    interactive: false,
  }).addTo(map)
  scanCircle.bringToBack()
}

function renderPoints(points: SupplierMapPoint[]): void {
  if (!map || !L) return
  if (pointLayer) pointLayer.remove()
  pointLayer = L.layerGroup().addTo(map)

  const ink = rootColor('--ink')
  const celeste = rootColor('--celeste')
  const verde = rootColor('--verde')
  for (const point of points) {
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) continue
    const marker = L.circleMarker([point.lat, point.lng], {
      radius: 8,
      color: ink,
      weight: 2.5,
      opacity: 1,
      fillColor: celeste,
      fillOpacity: 1,
    })
    marker.bindPopup(() => summaryCard(point, marker), {
      closeButton: true,
      minWidth: 280,
      maxWidth: 380,
      autoPanPadding: [24, 24],
    })
    marker.on('mouseover', () => marker.setRadius(10))
    marker.on('mouseout', () => {
      if (!marker.isPopupOpen()) marker.setRadius(8)
    })
    marker.on('popupopen', () => {
      marker.setRadius(10)
      marker.setStyle({ fillColor: verde })
    })
    marker.on('popupclose', () => {
      marker.setRadius(8)
      marker.setStyle({ fillColor: celeste })
    })
    marker.addTo(pointLayer)
  }
}

async function loadVisiblePoints(): Promise<void> {
  if (!map) return
  const sequence = ++requestSequence
  controller?.abort()
  controller = new AbortController()
  loading.value = true
  error.value = false

  const center = map.getCenter()
  const bounds = map.getBounds()
  try {
    const response = await $fetch<MapResponse>('/api/contacts/map', {
      query: {
        ...props.filters,
        lat: center.lat,
        lng: center.lng,
        south: bounds.getSouth(),
        west: bounds.getWest(),
        north: bounds.getNorth(),
        east: bounds.getEast(),
        limit: markerLimit(),
      },
      signal: controller.signal,
    })
    if (sequence !== requestSequence) return
    loaded.value = response.data.loaded
    truncated.value = response.data.truncated
    renderScanArea(response.data.scan)
    renderPoints(response.data.points)
  }
  catch (reason) {
    if (sequence !== requestSequence || (reason as { name?: string })?.name === 'AbortError') return
    error.value = true
  }
  finally {
    if (sequence === requestSequence) loading.value = false
  }
}

function queueLoad(delay = 140): void {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(loadVisiblePoints, delay)
}

async function searchLocation(): Promise<void> {
  const query = locationQuery.value.trim()
  locationError.value = ''
  locationResults.value = []
  if (query.length < 3) {
    locationError.value = t('contacts.map.searchMin')
    return
  }

  locationController?.abort()
  locationController = new AbortController()
  locationSearching.value = true
  try {
    const response = await $fetch<LocationResponse>('/api/geo/search', {
      query: { q: query },
      signal: locationController.signal,
    })
    locationResults.value = response.data.results
    if (!response.data.results.length) locationError.value = t('contacts.map.searchEmpty')
  }
  catch (reason) {
    if ((reason as { name?: string })?.name !== 'AbortError') {
      locationError.value = t('contacts.map.searchError')
    }
  }
  finally {
    locationSearching.value = false
  }
}

function chooseLocation(result: LocationResult): void {
  if (!map || !L) return
  locationResults.value = []
  locationQuery.value = result.label
  if (searchedPlaceMarker) searchedPlaceMarker.remove()
  searchedPlaceMarker = L.circleMarker([result.lat, result.lng], {
    radius: 9,
    color: rootColor('--ink'),
    weight: 3,
    fillColor: rootColor('--verde'),
    fillOpacity: 1,
  }).addTo(map)

  if (result.bounds) {
    map.fitBounds([
      [result.bounds.south, result.bounds.west],
      [result.bounds.north, result.bounds.east],
    ], { padding: [36, 36], maxZoom: 15 })
  }
  else {
    map.flyTo([result.lat, result.lng], 14)
  }
}

function locateUser(): void {
  if (!map || locating.value) return
  locating.value = true
  locationError.value = ''
  map.locate({
    setView: true,
    maxZoom: 14,
    enableHighAccuracy: true,
    timeout: 10_000,
  })
}

function onLocationFound(event: any): void {
  if (!map || !L) return
  locating.value = false
  if (userMarker) userMarker.remove()
  if (userAccuracyCircle) userAccuracyCircle.remove()
  userAccuracyCircle = L.circle(event.latlng, {
    radius: event.accuracy,
    color: rootColor('--verde'),
    weight: 1.5,
    opacity: 0.9,
    fillColor: rootColor('--verde'),
    fillOpacity: 0.12,
    interactive: false,
  }).addTo(map)
  userMarker = L.circleMarker(event.latlng, {
    radius: 8,
    color: rootColor('--ink'),
    weight: 3,
    fillColor: rootColor('--verde'),
    fillOpacity: 1,
  }).addTo(map)
  userMarker.bindTooltip(t('contacts.map.youAreHere'), {
    permanent: false,
    direction: 'top',
  })
}

function onLocationError(): void {
  locating.value = false
  locationError.value = t('contacts.map.locateError')
}

watch(
  () => props.filters,
  () => {
    if (!map) return
    map.closePopup()
    queueLoad(0)
  },
  { deep: true },
)

onMounted(async () => {
  if (!el.value) return
  const leaflet = await import('leaflet')
  L = leaflet.default ?? leaflet
  map = L.map(el.value, {
    preferCanvas: true,
    scrollWheelZoom: true,
    minZoom: 2,
    maxBounds: [[-85, -180], [85, 180]],
    maxBoundsViscosity: 0.8,
  }).setView([-32.8, -56], 6)

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(map)
  map.on('moveend', queueLoad)
  map.on('locationfound', onLocationFound)
  map.on('locationerror', onLocationError)
  map.whenReady(loadVisiblePoints)
})

onBeforeUnmount(() => {
  requestSequence++
  controller?.abort()
  locationController?.abort()
  if (debounceTimer) clearTimeout(debounceTimer)
  if (map) map.remove()
  map = null
  pointLayer = null
  scanCircle = null
  L = null
})
</script>

<template>
  <div class="supplier-map-shell">
    <div class="supplier-map-tools">
      <form
        class="place-search"
        role="search"
        @submit.prevent="searchLocation"
      >
        <label
          class="u-sr-only"
          for="supplier-map-place"
        >
          {{ t('contacts.map.searchLabel') }}
        </label>
        <v-icon
          class="place-search__icon"
          size="20"
        >
          mdi-map-search-outline
        </v-icon>
        <input
          id="supplier-map-place"
          v-model="locationQuery"
          class="place-search__input"
          type="search"
          autocomplete="street-address"
          :placeholder="t('contacts.map.searchPlaceholder')"
        >
        <button
          class="place-search__submit"
          type="submit"
          :disabled="locationSearching"
        >
          {{ locationSearching ? t('contacts.map.searching') : t('contacts.map.searchAction') }}
        </button>
      </form>

      <button
        class="locate-button"
        type="button"
        :disabled="locating"
        @click="locateUser"
      >
        <v-icon size="19">
          mdi-crosshairs-gps
        </v-icon>
        <span>{{ locating ? t('contacts.map.locating') : t('contacts.map.locateMe') }}</span>
      </button>

      <div
        v-if="locationResults.length"
        class="place-results"
      >
        <button
          v-for="result in locationResults"
          :key="result.id"
          class="place-results__item"
          type="button"
          @click="chooseLocation(result)"
        >
          {{ result.label }}
        </button>
        <a
          class="place-results__credit"
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noopener noreferrer"
        >
          {{ t('contacts.map.searchCredit') }}
        </a>
      </div>

      <p
        v-if="locationError"
        class="place-search__error"
        role="alert"
      >
        {{ locationError }}
      </p>
    </div>

    <div
      ref="el"
      class="supplier-map"
      :style="{ height: `${height}px` }"
      role="application"
      :aria-label="t('contacts.map.aria')"
    />

    <div
      class="supplier-map-readout"
      role="status"
      aria-live="polite"
    >
      <span
        class="supplier-map-readout__signal"
        :class="{ 'supplier-map-readout__signal--busy': loading }"
        aria-hidden="true"
      />
      <span v-if="error">{{ t('contacts.map.error') }}</span>
      <span v-else-if="loading">{{ t('contacts.map.loading') }}</span>
      <span v-else>{{ t('contacts.map.loaded', { count: formatNumber(loaded) }) }}</span>
      <span
        v-if="scanRadiusMeters && !loading && !error"
        class="supplier-map-readout__radius"
      >
        {{ t('contacts.map.scanRadius', { radius: formatNumber(Math.round(scanRadiusMeters / 100) / 10) }) }}
      </span>
      <span
        v-if="truncated && !loading && !error"
        class="supplier-map-readout__hint"
      >
        {{ t('contacts.map.zoomHint') }}
      </span>
      <button
        v-if="error"
        type="button"
        class="supplier-map-readout__retry"
        @click="loadVisiblePoints"
      >
        {{ t('contacts.map.retry') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.supplier-map-shell {
  position: relative;
  isolation: isolate;
  min-width: 0;
}

.supplier-map-tools {
  position: relative;
  z-index: 600;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--s-3);
  margin-bottom: var(--s-3);
}

.place-search {
  display: flex;
  align-items: center;
  min-width: 0;
  border: 1px solid var(--rule-strong);
  border-radius: var(--r-md);
  background: var(--surface);
}

.place-search:focus-within { border-color: var(--celeste); }

.place-search__icon {
  flex: none;
  margin-left: var(--s-3);
  color: var(--text-muted);
}

.place-search__input {
  flex: 1 1 auto;
  min-width: 0;
  padding: var(--s-3);
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text);
  font: var(--t-sm)/1.3 var(--font-body);
}

.place-search__input::placeholder { color: var(--text-muted); }

.place-search__submit,
.locate-button {
  min-height: 42px;
  border: 1px solid var(--rule-strong);
  border-radius: var(--r-md);
  background: var(--surface);
  color: var(--text);
  font: 700 var(--t-sm)/1 var(--font-body);
  cursor: pointer;
}

.place-search__submit {
  align-self: stretch;
  padding-inline: var(--s-4);
  border-width: 0 0 0 1px;
  border-radius: 0;
  color: var(--celeste-deep);
}

.locate-button {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  padding-inline: var(--s-4);
}

.place-search__submit:hover,
.locate-button:hover {
  background: var(--surface-sunken);
}

.place-search__submit:disabled,
.locate-button:disabled {
  cursor: wait;
  opacity: 0.65;
}

.place-results {
  position: absolute;
  z-index: 700;
  top: calc(100% - var(--s-1));
  right: 0;
  left: 0;
  display: grid;
  overflow: hidden;
  border: 1px solid var(--rule-strong);
  border-radius: var(--r-md);
  background: var(--surface);
  box-shadow: var(--shadow-2);
}

.place-results__item {
  padding: var(--s-3) var(--s-4);
  border: 0;
  border-bottom: 1px solid var(--rule);
  background: transparent;
  color: var(--text);
  font: var(--t-sm)/1.35 var(--font-body);
  text-align: left;
  cursor: pointer;
}

.place-results__item:hover,
.place-results__item:focus-visible {
  background: var(--surface-sunken);
}

.place-results__credit {
  justify-self: end;
  padding: var(--s-2) var(--s-4);
  color: var(--text-muted);
  font: var(--t-xs)/1.2 var(--font-mono);
}

.place-search__error {
  grid-column: 1 / -1;
  margin: calc(var(--s-2) * -1) 0 0;
  color: var(--alerta);
  font-size: var(--t-xs);
}

.supplier-map {
  width: 100%;
  min-height: 480px;
  overflow: hidden;
  border: 1px solid var(--rule-strong);
  border-radius: var(--r-lg);
  background: var(--surface-sunken);
  z-index: 0;
}

.supplier-map-readout {
  position: absolute;
  z-index: 500;
  top: calc(42px + var(--s-6));
  right: var(--s-3);
  display: flex;
  align-items: center;
  gap: var(--s-2);
  max-width: min(40rem, calc(100% - 6rem));
  padding: var(--s-2) var(--s-3);
  border: 1px solid var(--rule-strong);
  border-radius: var(--r-md);
  background: color-mix(in srgb, var(--surface) 96%, transparent);
  box-shadow: var(--shadow-1);
  color: var(--text);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  line-height: 1.35;
  pointer-events: auto;
}

.supplier-map-readout__signal {
  width: 0.55rem;
  height: 0.55rem;
  flex: none;
  border-radius: var(--r-full);
  background: var(--verde);
}

.supplier-map-readout__signal--busy {
  background: var(--celeste);
  animation: map-pulse 1.1s var(--ease) infinite alternate;
}

.supplier-map-readout__radius,
.supplier-map-readout__hint {
  color: var(--text-muted);
}

.supplier-map-readout__retry {
  padding: 0;
  border: 0;
  border-bottom: 1px solid currentColor;
  background: transparent;
  color: var(--celeste-deep);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.supplier-map :deep(.leaflet-container) {
  background: var(--surface-sunken);
  font-family: var(--font-body);
}

.supplier-map :deep(.leaflet-popup-content-wrapper),
.supplier-map :deep(.leaflet-popup-tip) {
  background: var(--surface);
  color: var(--text);
}

.supplier-map :deep(.leaflet-popup-content-wrapper) {
  overflow: hidden;
  border: 1px solid var(--rule-strong);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-2);
}

.supplier-map :deep(.leaflet-popup-content) {
  min-width: 0;
  margin: 0;
  color: var(--text);
  font-family: var(--font-body);
  font-size: var(--t-xs);
  line-height: 1.5;
}

.supplier-map :deep(.leaflet-popup-close-button) {
  top: var(--s-2);
  right: var(--s-2);
  width: 2rem;
  height: 2rem;
  color: var(--text-muted);
  font-size: 1.5rem;
}

.supplier-map :deep(.supplier-card) {
  display: grid;
  gap: var(--s-3);
  max-height: min(62vh, 460px);
  overflow-y: auto;
  padding: var(--s-4);
}

.supplier-map :deep(.supplier-card__header) {
  display: grid;
  gap: var(--s-1);
  padding-right: var(--s-6);
  padding-bottom: var(--s-3);
  border-bottom: 1px solid var(--rule);
}

.supplier-map :deep(.supplier-card__title) {
  color: var(--text);
  font-family: var(--font-display);
  font-size: var(--t-base);
  line-height: 1.2;
}

.supplier-map :deep(.supplier-card__meta),
.supplier-map :deep(.supplier-card__place),
.supplier-map :deep(.supplier-card__note) {
  color: var(--text-muted);
}

.supplier-map :deep(.supplier-card__note) {
  font-family: var(--font-mono);
}

.supplier-map :deep(.supplier-card__field) {
  display: grid;
  grid-template-columns: minmax(5.5rem, auto) minmax(0, 1fr);
  gap: var(--s-3);
  align-items: start;
}

.supplier-map :deep(.supplier-card__label) {
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.supplier-map :deep(.supplier-card__values) {
  display: grid;
  gap: var(--s-1);
  min-width: 0;
  overflow-wrap: anywhere;
}

.supplier-map :deep(.supplier-card__link) {
  color: var(--celeste-deep);
  font-weight: 700;
  text-decoration: none;
}

.supplier-map :deep(.supplier-card__link:hover) {
  text-decoration: underline;
}

.supplier-map :deep(.supplier-card__button) {
  justify-self: start;
  padding: var(--s-2) var(--s-3);
  border: 1px solid var(--celeste-deep);
  border-radius: var(--r-md);
  background: var(--surface);
  color: var(--celeste-deep);
  font: 700 var(--t-sm)/1.2 var(--font-body);
  cursor: pointer;
}

.supplier-map :deep(.supplier-card__button:hover) {
  background: var(--surface-sunken);
}

.supplier-map :deep(.supplier-card__button:disabled) {
  cursor: wait;
  opacity: 0.7;
}

.supplier-map :deep(.supplier-card__empty) {
  margin: 0;
  color: var(--text-muted);
}

.supplier-map :deep(.supplier-card__actions) {
  padding-top: var(--s-3);
  border-top: 1px solid var(--rule);
}

@keyframes map-pulse {
  from { opacity: 0.45; }
  to { opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .supplier-map-readout__signal--busy { animation: none; }
}

@media (max-width: 640px) {
  .supplier-map-tools {
    grid-template-columns: 1fr;
  }

  .locate-button {
    justify-content: center;
  }

  .supplier-map {
    height: 70vh !important;
    min-height: 440px;
  }

  .supplier-map-readout {
    top: auto;
    right: var(--s-2);
    bottom: var(--s-2);
    left: var(--s-2);
    max-width: none;
    flex-wrap: wrap;
  }

  .supplier-map-readout__hint {
    flex-basis: 100%;
    padding-left: calc(0.55rem + var(--s-2));
  }

  .supplier-map :deep(.supplier-card__field) {
    grid-template-columns: 1fr;
    gap: var(--s-1);
  }
}
</style>
