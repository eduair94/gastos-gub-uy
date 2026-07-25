<script setup lang="ts">
/**
 * Client-only Leaflet map over the geospatial supplier_contacts endpoint.
 * The viewport payload stays small; selecting a marker immediately opens the
 * complete supplier dialog while its bounded detail request resolves.
 */
import 'leaflet/dist/leaflet.css'
import type {
  SupplierBusinessDetail,
  SupplierBusinessDetailResponse,
  SupplierMapPoint,
} from '~/types/supplier-business'

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
const dialogOpen = ref(false)
const selectedPoint = ref<SupplierMapPoint | null>(null)
const selectedDetail = ref<SupplierBusinessDetail | null>(null)
const detailLoading = ref(false)
const detailError = ref(false)

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
let detailRequestSequence = 0
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let selectedMarker: any = null

const detailCache = new Map<string, SupplierBusinessDetail>()

function markerLimit(): number {
  const zoom = map?.getZoom?.() ?? 6
  if (zoom <= 5) return 500
  if (zoom <= 8) return 900
  return 1500
}

function rootColor(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

function setMarkerSelected(marker: any, selected: boolean): void {
  if (!marker) return
  marker.setRadius(selected ? 11 : 8)
  marker.setStyle({
    color: selected ? rootColor('--celeste-deep') : rootColor('--ink'),
    fillColor: selected ? rootColor('--ink') : rootColor('--celeste'),
    weight: selected ? 4 : 2.5,
  })
  if (selected) marker.bringToFront()
}

async function loadSupplierDetail(point = selectedPoint.value): Promise<void> {
  if (!point) return
  const cached = detailCache.get(point.supplierId)
  if (cached) {
    selectedDetail.value = cached
    detailLoading.value = false
    detailError.value = false
    return
  }

  const sequence = ++detailRequestSequence
  detailLoading.value = true
  detailError.value = false
  try {
    const response = await $fetch<SupplierBusinessDetailResponse>('/api/contacts/map-detail', {
      query: { supplierId: point.supplierId },
    })
    if (sequence !== detailRequestSequence || selectedPoint.value?.supplierId !== point.supplierId) return
    detailCache.set(point.supplierId, response.data)
    selectedDetail.value = response.data
  }
  catch {
    if (sequence !== detailRequestSequence) return
    detailError.value = true
  }
  finally {
    if (sequence === detailRequestSequence) detailLoading.value = false
  }
}

function selectSupplier(point: SupplierMapPoint, marker: any): void {
  if (selectedMarker && selectedMarker !== marker) setMarkerSelected(selectedMarker, false)
  selectedMarker = marker
  setMarkerSelected(marker, true)
  selectedPoint.value = point
  selectedDetail.value = detailCache.get(point.supplierId) ?? null
  detailError.value = false
  dialogOpen.value = true
  void loadSupplierDetail(point)
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
  if (pointLayer) {
    pointLayer.remove()
    selectedMarker = null
  }
  pointLayer = L.layerGroup().addTo(map)

  const ink = rootColor('--ink')
  const celeste = rootColor('--celeste')
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
    marker.bindTooltip(point.name, {
      direction: 'top',
      offset: [0, -8],
      opacity: 0.96,
    })
    marker.on('mouseover', () => marker.setRadius(10))
    marker.on('mouseout', () => {
      if (marker !== selectedMarker) marker.setRadius(8)
    })
    marker.on('click', () => selectSupplier(point, marker))
    marker.addTo(pointLayer)

    const markerElement = marker.getElement?.() as SVGElement | null
    if (markerElement) {
      markerElement.setAttribute('tabindex', '0')
      markerElement.setAttribute('role', 'button')
      markerElement.setAttribute('aria-label', t('contacts.map.markerLabel', { name: point.name }))
      markerElement.addEventListener('focus', () => marker.setRadius(10))
      markerElement.addEventListener('blur', () => {
        if (marker !== selectedMarker) marker.setRadius(8)
      })
      markerElement.addEventListener('keydown', (event: KeyboardEvent) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        selectSupplier(point, marker)
      })
    }
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
    dialogOpen.value = false
    queueLoad(0)
  },
  { deep: true },
)

watch(dialogOpen, (isOpen) => {
  if (isOpen) return
  detailRequestSequence++
  detailLoading.value = false
  if (selectedMarker) setMarkerSelected(selectedMarker, false)
  selectedMarker = null
})

onMounted(async () => {
  if (!el.value) return
  const leaflet = await import('leaflet')
  L = leaflet.default ?? leaflet
  map = L.map(el.value, {
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
  detailRequestSequence++
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
      role="region"
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

    <SupplierBusinessDialog
      v-model="dialogOpen"
      :point="selectedPoint"
      :detail="selectedDetail"
      :loading="detailLoading"
      :error="detailError"
      @retry="loadSupplierDetail()"
    />
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

.supplier-map :deep(.leaflet-tooltip) {
  max-width: 24rem;
  padding: var(--s-2) var(--s-3);
  border: 1px solid var(--rule-strong);
  border-radius: var(--r-md);
  background: var(--ink);
  box-shadow: var(--shadow-2);
  color: var(--ink-fg);
  font-family: var(--font-body);
  font-size: var(--t-xs);
  font-weight: 650;
  line-height: 1.35;
}

.supplier-map :deep(.leaflet-tooltip::before) {
  border-top-color: var(--ink);
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

}
</style>
