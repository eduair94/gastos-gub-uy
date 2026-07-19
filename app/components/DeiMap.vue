<script setup lang="ts">
/**
 * A Leaflet map of registered industrial companies (DEI). Client-only: Leaflet
 * is imported dynamically in onMounted so it never runs during SSR.
 *
 * Markers are celeste circleMarkers, never gold — gold is reserved for money
 * (DESIGN.md). We avoid L.marker/image icons on purpose (bundler asset paths
 * break); circleMarkers need no images. Popups link to the supplier profile.
 */
import 'leaflet/dist/leaflet.css'

export interface DeiMapPoint {
  lat: number
  lng: number
  name: string
  tamano?: string
  actividad?: string
  departamento?: string
  totalValue?: number
  supplierId?: string
}

const props = withDefaults(defineProps<{
  points: DeiMapPoint[]
  height?: number
}>(), { height: 420 })

const localePath = useLocalePath()
const el = ref<HTMLElement | null>(null)
let map: any = null
let layer: any = null

function supplierHref(id: string) {
  return localePath(`/suppliers/${id.split('/').map(encodeURIComponent).join('/')}`)
}

/** Marker radius grows gently with the supplier total (visual weight, not gold). */
function radiusFor(v: number | undefined): number {
  if (!v || v <= 0) return 4
  return Math.max(4, Math.min(16, 3 + Math.log10(v)))
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c] as string
  ))
}

async function render() {
  if (!el.value || !props.points.length) return
  const L = (await import('leaflet')).default ?? (await import('leaflet'))

  if (!map) {
    map = L.map(el.value, { scrollWheelZoom: false }).setView([-32.8, -56], 6)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 18,
    }).addTo(map)
  }

  if (layer) { layer.remove(); layer = null }
  layer = L.layerGroup().addTo(map)

  const style = getComputedStyle(document.documentElement)
  const celeste = style.getPropertyValue('--celeste').trim() || '#5e93c4'
  const celesteDeep = style.getPropertyValue('--celeste-deep').trim() || '#33607f'

  const latlngs: [number, number][] = []
  for (const p of props.points) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue
    latlngs.push([p.lat, p.lng])
    const money = p.totalValue != null ? formatMoney(p.totalValue, 'UYU', { compact: true }) : null
    const bits = [
      `<strong>${escapeHtml(p.name)}</strong>`,
      p.tamano ? escapeHtml(p.tamano) : null,
      p.actividad ? escapeHtml(p.actividad) : null,
      money ? `<span style="font-variant-numeric:tabular-nums">${escapeHtml(money)}</span>` : null,
      p.supplierId ? `<a href="${supplierHref(p.supplierId)}">Ver proveedor →</a>` : null,
    ].filter(Boolean).join('<br>')

    L.circleMarker([p.lat, p.lng], {
      radius: radiusFor(p.totalValue),
      color: celesteDeep,
      weight: 1,
      fillColor: celeste,
      fillOpacity: 0.55,
    }).bindPopup(bits, { closeButton: true }).addTo(layer)
  }

  if (latlngs.length === 1) map.setView(latlngs[0], 13)
  else if (latlngs.length > 1) map.fitBounds(latlngs, { padding: [24, 24], maxZoom: 12 })
}

onMounted(render)
watch(() => props.points, render, { deep: false })
onBeforeUnmount(() => { if (map) { map.remove(); map = null; layer = null } })
</script>

<template>
  <div
    ref="el"
    class="deimap"
    :style="{ height: `${height}px` }"
  />
</template>

<style scoped>
.deimap {
  width: 100%;
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
  overflow: hidden;
  background: var(--surface-sunken);
  z-index: 0;
}

/* Keep Leaflet's controls/popups on-brand-ish without fighting the plugin. */
.deimap :deep(.leaflet-popup-content) {
  font-family: var(--font-body);
  font-size: var(--t-xs);
  line-height: 1.5;
}

.deimap :deep(.leaflet-popup-content a) {
  color: var(--celeste-deep);
  font-weight: 600;
  text-decoration: none;
}

.deimap :deep(.leaflet-container) {
  font-family: var(--font-body);
  background: var(--surface-sunken);
}
</style>
