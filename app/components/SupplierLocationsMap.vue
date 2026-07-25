<script setup lang="ts">
/**
 * Client-only Leaflet map over the geospatial supplier_contacts endpoint.
 * Requests happen on `moveend`, so panning/zooming replaces one bounded canvas
 * layer instead of sending the global directory to the browser.
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

interface MapResponse {
  success: true
  data: {
    points: SupplierMapPoint[]
    loaded: number
    truncated: boolean
  }
}

withDefaults(defineProps<{ height?: number }>(), { height: 620 })
const { t } = useI18n()
const localePath = useLocalePath()
const el = ref<HTMLElement | null>(null)
const loading = ref(true)
const error = ref(false)
const loaded = ref(0)
const truncated = ref(false)

let L: any = null
let map: any = null
let pointLayer: any = null
let controller: AbortController | null = null
let requestSequence = 0
let debounceTimer: ReturnType<typeof setTimeout> | null = null

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[char] as string
  ))
}

function supplierHref(id: string): string {
  return localePath(`/suppliers/${id.split('/').map(encodeURIComponent).join('/')}`)
}

function popupHtml(point: SupplierMapPoint): string {
  const place = point.locality || point.address
  const lines = [
    `<strong>${escapeHtml(point.name)}</strong>`,
    point.rubro ? `<span>${escapeHtml(point.rubro)}</span>` : null,
    place ? `<span>${escapeHtml(place)}</span>` : null,
    point.neverAwarded
      ? `<span class="supplier-map__popup-note">${escapeHtml(t('contacts.chip.neverAwarded'))}</span>`
      : null,
    `<a href="${escapeHtml(supplierHref(point.supplierId))}">${escapeHtml(t('contacts.map.viewSupplier'))} →</a>`,
  ]
  return lines.filter(Boolean).join('<br>')
}

function markerLimit(): number {
  const zoom = map?.getZoom?.() ?? 6
  if (zoom <= 5) return 500
  if (zoom <= 8) return 900
  return 1500
}

function renderPoints(points: SupplierMapPoint[]): void {
  if (!map || !L) return
  if (pointLayer) pointLayer.remove()
  pointLayer = L.layerGroup().addTo(map)

  const rootStyle = getComputedStyle(document.documentElement)
  const celeste = rootStyle.getPropertyValue('--celeste').trim()
  const celesteDeep = rootStyle.getPropertyValue('--celeste-deep').trim()
  for (const point of points) {
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) continue
    L.circleMarker([point.lat, point.lng], {
      radius: 5,
      color: celesteDeep,
      weight: 1,
      fillColor: celeste,
      fillOpacity: 0.58,
    })
      .bindPopup(popupHtml(point), { closeButton: true, maxWidth: 280 })
      .addTo(pointLayer)
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

function queueLoad(): void {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(loadVisiblePoints, 140)
}

onMounted(async () => {
  if (!el.value) return
  const leaflet = await import('leaflet')
  L = leaflet.default ?? leaflet
  map = L.map(el.value, {
    preferCanvas: true,
    scrollWheelZoom: false,
    minZoom: 2,
    maxBounds: [[-85, -180], [85, 180]],
    maxBoundsViscosity: 0.8,
  }).setView([-32.8, -56], 6)

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(map)
  map.on('moveend', queueLoad)
  map.whenReady(loadVisiblePoints)
})

onBeforeUnmount(() => {
  requestSequence++
  controller?.abort()
  if (debounceTimer) clearTimeout(debounceTimer)
  if (map) map.remove()
  map = null
  pointLayer = null
  L = null
})
</script>

<template>
  <div class="supplier-map-shell">
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

.supplier-map {
  width: 100%;
  min-height: 480px;
  border: 1px solid var(--rule-strong);
  border-radius: var(--r-lg);
  overflow: hidden;
  background: var(--surface-sunken);
  z-index: 0;
}

.supplier-map-readout {
  position: absolute;
  z-index: 500;
  top: var(--s-3);
  right: var(--s-3);
  display: flex;
  align-items: center;
  gap: var(--s-2);
  max-width: min(32rem, calc(100% - 6rem));
  padding: var(--s-2) var(--s-3);
  border: 1px solid var(--rule-strong);
  border-radius: var(--r-md);
  background: color-mix(in srgb, var(--surface) 94%, transparent);
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
  font-family: var(--font-body);
  background: var(--surface-sunken);
}

.supplier-map :deep(.leaflet-popup-content) {
  margin: var(--s-3) var(--s-4);
  color: var(--text);
  font-family: var(--font-body);
  font-size: var(--t-xs);
  line-height: 1.55;
}

.supplier-map :deep(.leaflet-popup-content strong) {
  font-family: var(--font-display);
  font-size: var(--t-sm);
}

.supplier-map :deep(.leaflet-popup-content a) {
  color: var(--celeste-deep);
  font-weight: 700;
  text-decoration: none;
}

.supplier-map :deep(.supplier-map__popup-note) {
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
}

@keyframes map-pulse {
  from { opacity: 0.45; }
  to { opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .supplier-map-readout__signal--busy { animation: none; }
}

@media (max-width: 640px) {
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
