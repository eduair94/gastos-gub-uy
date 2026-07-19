<script setup lang="ts">
/**
 * The "Registro Industrial (DEI)" card on a supplier profile — official MIEM
 * open data cross-referenced by RUT. Rendered only when the supplier matches
 * (the ~6% that are registered industrial firms). A fact of record, cited to
 * source, not hedged. No gold here: this card carries no money (DESIGN.md).
 */
import type { DeiMapPoint } from './DeiMap.vue'

interface DeiInfo {
  rut: string
  estado: string
  denominacionSocial: string
  nombreComercial: string
  tamano: string
  tiposActividad: string[]
  descripcionActividad: string
  ciiuPrincipal: string
  ciiuPrincipalDesc: string
  ciiuSecundarios: string[]
  departamento: string
  localidad: string
  direccion: string | null
  lat: number | null
  lng: number | null
  email: string | null
  sitioWeb: string | null
  telefono: string | null
  fechaRegistro: string | null
  fechaVencimiento: string | null
}

const props = defineProps<{ dei: DeiInfo, supplierName?: string }>()
const { t } = useI18n()

/** Site URL may lack a scheme; make it safe to link. */
const webHref = computed(() => {
  const w = props.dei.sitioWeb
  if (!w) return null
  return /^https?:\/\//i.test(w) ? w : `https://${w}`
})

/** tel: needs bare digits (+ allowed); strip the formatting the source data carries. */
const telHref = computed(() => (props.dei.telefono ?? '').replace(/[^\d+]/g, ''))

/** Coordinates win when present (exact establishment); else fall back to the address text. */
const mapsHref = computed(() => {
  const { lat, lng, direccion, localidad, departamento } = props.dei
  if (lat != null && lng != null) return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
  const q = [direccion, localidad, departamento].filter(Boolean).join(', ')
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null
})

/** Show the trade name only when it adds something over the legal name. */
const showTrade = computed(() => {
  const n = props.dei.nombreComercial?.trim()
  return n && n.toUpperCase() !== props.dei.denominacionSocial?.trim().toUpperCase()
})

const location = computed(() => {
  const parts = [props.dei.localidad, props.dei.departamento].filter(Boolean)
  return parts.length ? [...new Set(parts)].join(', ') : null
})

const mapPoints = computed<DeiMapPoint[]>(() => {
  const { lat, lng } = props.dei
  if (lat == null || lng == null) return []
  return [{ lat, lng, name: props.dei.denominacionSocial || props.supplierName || '', tamano: props.dei.tamano, actividad: props.dei.ciiuPrincipalDesc }]
})
</script>

<template>
  <section class="block">
    <div class="block__head">
      <h2>{{ t('sup.dei.title') }}</h2>
      <DeiChip :estado="dei.estado" />
    </div>

    <div class="panel dei">
      <dl class="dei__grid">
        <div class="dei__i">
          <dt>{{ t('sup.dei.f.razonSocial') }}</dt>
          <dd>{{ dei.denominacionSocial || '—' }}</dd>
        </div>
        <div
          v-if="showTrade"
          class="dei__i"
        >
          <dt>{{ t('sup.dei.f.nombreComercial') }}</dt>
          <dd>{{ dei.nombreComercial }}</dd>
        </div>
        <div
          v-if="dei.tamano"
          class="dei__i"
        >
          <dt>{{ t('sup.dei.f.tamano') }}</dt>
          <dd>{{ dei.tamano }}</dd>
        </div>
        <div
          v-if="dei.ciiuPrincipalDesc"
          class="dei__i dei__i--wide"
        >
          <dt>{{ t('sup.dei.f.actividad') }}</dt>
          <dd>
            {{ dei.ciiuPrincipalDesc }}
            <span
              v-if="dei.ciiuPrincipal"
              class="dei__code"
            >CIIU {{ dei.ciiuPrincipal }}</span>
          </dd>
        </div>
        <div
          v-if="dei.tiposActividad.length"
          class="dei__i dei__i--wide"
        >
          <dt>{{ t('sup.dei.f.tipos') }}</dt>
          <dd class="dei__tags">
            <span
              v-for="ta in dei.tiposActividad"
              :key="ta"
              class="tag tag--neutral"
            >{{ ta }}</span>
          </dd>
        </div>
        <div
          v-if="location"
          class="dei__i"
        >
          <dt>{{ t('sup.dei.f.ubicacion') }}</dt>
          <dd>
            {{ location }}
            <span
              v-if="dei.direccion"
              class="dei__sub"
            >{{ dei.direccion }}</span>
            <a
              v-if="mapsHref"
              :href="mapsHref"
              target="_blank"
              rel="noopener noreferrer nofollow"
              class="dei__link dei__maplink"
            >
              <v-icon size="14">mdi-map-marker-outline</v-icon>
              {{ t('sup.dei.f.mapLink') }}
            </a>
          </dd>
        </div>
        <div
          v-if="dei.estado || dei.fechaVencimiento"
          class="dei__i"
        >
          <dt>{{ t('sup.dei.f.estado') }}</dt>
          <dd>
            {{ dei.estado || '—' }}
            <span
              v-if="dei.fechaVencimiento"
              class="dei__sub"
            >{{ t('sup.dei.f.vence', { date: formatDate(dei.fechaVencimiento) }) }}</span>
          </dd>
        </div>
        <div
          v-if="webHref || dei.email || dei.telefono"
          class="dei__i dei__i--wide"
        >
          <dt>{{ t('sup.dei.f.contacto') }}</dt>
          <dd class="dei__contact">
            <a
              v-if="webHref"
              :href="webHref"
              target="_blank"
              rel="noopener noreferrer nofollow"
              class="dei__link"
            >{{ dei.sitioWeb }}</a>
            <a
              v-if="dei.email"
              :href="`mailto:${dei.email}`"
              class="dei__link"
            >{{ dei.email }}</a>
            <a
              v-if="dei.telefono"
              :href="`tel:${telHref}`"
              class="dei__link u-mono"
            >{{ dei.telefono }}</a>
          </dd>
        </div>
      </dl>

      <ClientOnly>
        <DeiMap
          v-if="mapPoints.length"
          :points="mapPoints"
          :height="220"
          class="dei__map"
        />
      </ClientOnly>
    </div>

    <p class="dei__source">
      {{ t('sup.dei.source') }}
    </p>
  </section>
</template>

<style scoped>
/* This page's other section headers get `.block__head` from the page's own
   <style>, which scoped CSS can't reach across into this component — so this
   card needs its own copy. `align-items: center` (not the sitewide `baseline`)
   because it pairs a heading with a chip, not two text baselines. */
.block__head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: var(--s-3);
  margin-bottom: var(--s-3);
}

.dei { padding: var(--s-5); }

.dei__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--s-4) var(--s-5);
  margin: 0;
}

.dei__i { min-width: 0; }
.dei__i--wide { grid-column: 1 / -1; }

.dei__i dt {
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.dei__i dd {
  margin: var(--s-1) 0 0;
  font-size: var(--t-sm);
  color: var(--text);
  line-height: 1.45;
}

.dei__code {
  margin-left: var(--s-2);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  color: var(--text-muted);
}

.dei__sub {
  display: block;
  margin-top: 2px;
  font-size: var(--t-xs);
  color: var(--text-muted);
}

.dei__tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2);
}

.dei__contact {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2) var(--s-4);
  align-items: baseline;
}

.dei__link {
  color: var(--celeste-deep);
  text-decoration: none;
  font-weight: 600;
  word-break: break-all;
}

.dei__link:hover { text-decoration: underline; }

.dei__maplink {
  display: flex;
  width: fit-content;
  align-items: center;
  gap: 3px;
  margin-top: 4px;
  font-size: var(--t-xs);
  font-weight: 600;
}

.dei__map { margin-top: var(--s-5); }

.dei__source {
  margin: var(--s-3) 0 0;
  font-size: var(--t-xs);
  color: var(--text-muted);
  line-height: 1.5;
}

@media (max-width: 560px) {
  .dei__grid { grid-template-columns: 1fr; }
}
</style>
