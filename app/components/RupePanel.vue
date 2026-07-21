<script setup lang="ts">
/**
 * The "Registro de Proveedores del Estado (RUPE)" card on a supplier profile —
 * official ARCE open data cross-referenced by RUT (91.7% of suppliers match).
 * Shown whenever the supplier is in RUPE so its registration state is visible,
 * independently of the richer DEI location record. A fact of record, cited to source.
 * No gold here: this card carries no money (DESIGN.md).
 *
 * The address text is always present; the map pin appears only once geocode-rupe
 * has resolved coordinates for the address.
 */
import type { DeiMapPoint } from './DeiMap.vue'

interface RupeInfo {
  rut: string
  pais: string
  denominacionSocial: string
  domicilioFiscal: string | null
  localidad: string | null
  departamento: string | null
  estado: string
  lat: number | null
  lng: number | null
}

const props = defineProps<{ rupe: RupeInfo, supplierName?: string, supplierId?: string }>()
const { t } = useI18n()

/** Show country only when it adds something (i.e. not Uruguay). */
const foreignCountry = computed(() => {
  const p = props.rupe.pais?.trim()
  return p && p.toUpperCase() !== 'URUGUAY' ? p : null
})

const location = computed(() => {
  const parts = [props.rupe.localidad, props.rupe.departamento].filter(Boolean) as string[]
  return parts.length ? [...new Set(parts)].join(', ') : null
})

/** Coordinates win when present (geocoded point); else fall back to the address text. */
const mapsHref = computed(() => {
  const { lat, lng, domicilioFiscal, localidad, departamento } = props.rupe
  if (lat != null && lng != null) return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
  const q = [domicilioFiscal, localidad, departamento].filter(Boolean).join(', ')
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null
})

const mapPoints = computed<DeiMapPoint[]>(() => {
  const { lat, lng } = props.rupe
  if (lat == null || lng == null) return []
  return [{
    lat, lng,
    name: props.rupe.denominacionSocial || props.supplierName || '',
    ...(props.supplierId ? { supplierId: props.supplierId } : {}),
  }]
})
</script>

<template>
  <section class="block">
    <div class="block__head">
      <h2>{{ t('sup.rupe.title') }}</h2>
      <RupeStatusChip
        v-if="rupe.estado"
        :status="rupe.estado"
      />
    </div>

    <div class="panel rupe">
      <dl class="rupe__grid">
        <div class="rupe__i">
          <dt>{{ t('sup.rupe.f.razonSocial') }}</dt>
          <dd>{{ rupe.denominacionSocial || '—' }}</dd>
        </div>
        <div
          v-if="foreignCountry"
          class="rupe__i"
        >
          <dt>{{ t('sup.rupe.f.pais') }}</dt>
          <dd>{{ foreignCountry }}</dd>
        </div>
        <div
          v-if="location || rupe.domicilioFiscal"
          class="rupe__i rupe__i--wide"
        >
          <dt>{{ t('sup.rupe.f.ubicacion') }}</dt>
          <dd>
            {{ location || '—' }}
            <span
              v-if="rupe.domicilioFiscal"
              class="rupe__sub"
            >{{ rupe.domicilioFiscal }}</span>
            <a
              v-if="mapsHref"
              :href="mapsHref"
              target="_blank"
              rel="noopener noreferrer nofollow"
              class="rupe__link rupe__maplink"
            >
              <v-icon size="14">mdi-map-marker-outline</v-icon>
              {{ t('sup.rupe.f.mapLink') }}
            </a>
          </dd>
        </div>
      </dl>

      <ClientOnly>
        <DeiMap
          v-if="mapPoints.length"
          :points="mapPoints"
          :height="220"
          class="rupe__map"
        />
      </ClientOnly>
    </div>

    <p class="rupe__source">
      {{ t('sup.rupe.source') }}
    </p>
  </section>
</template>

<style scoped>
/* Mirrors DeiPanel's header (heading + status chip, centred) — scoped CSS can't
   reach the page's own .block__head, so this card carries its own copy. */
.block__head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: var(--s-3);
  margin-bottom: var(--s-3);
}

.rupe { padding: var(--s-5); }

.rupe__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--s-4) var(--s-5);
  margin: 0;
}

.rupe__i { min-width: 0; }
.rupe__i--wide { grid-column: 1 / -1; }

.rupe__i dt {
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.rupe__i dd {
  margin: var(--s-1) 0 0;
  font-size: var(--t-sm);
  color: var(--text);
  line-height: 1.45;
}

.rupe__sub {
  display: block;
  margin-top: 2px;
  font-size: var(--t-xs);
  color: var(--text-muted);
}

.rupe__link {
  color: var(--celeste-deep);
  text-decoration: none;
  font-weight: 600;
  word-break: break-all;
}

.rupe__link:hover { text-decoration: underline; }

.rupe__maplink {
  display: flex;
  width: fit-content;
  align-items: center;
  gap: 3px;
  margin-top: 4px;
  font-size: var(--t-xs);
  font-weight: 600;
}

.rupe__map { margin-top: var(--s-5); }

.rupe__source {
  margin: var(--s-3) 0 0;
  font-size: var(--t-xs);
  color: var(--text-muted);
  line-height: 1.5;
}

@media (max-width: 560px) {
  .rupe__grid { grid-template-columns: 1fr; }
}
</style>
