<script setup lang="ts">
/**
 * Reusable single-forecast teaser for "Anticipación de llamados" (Fase 1).
 * Mounted on the product page (app/pages/products/[code].vue): given the
 * product's rubro/classification code, shows the single most-relevant
 * upcoming tender forecast — "this buyer tends to tender this category
 * around <window>". Reuses the EXACT display rules the public
 * /analytics/anticipacion page (Task 7) established, so the feature never
 * reads two different ways in two places:
 *   - confidence is a qualitative band (Alta/Media/Baja), never a raw
 *     percentage — it saturates at 1.0 on tight cadences, which would read
 *     as false certainty on a derived estimate;
 *   - the expected window is clamped via effectiveWindow() so an overdue
 *     buyer's window never appears to start before today, flagged instead
 *     with an "Atrasado" chip;
 *   - a typical amount is always shown WITH its unit ("≈ $X por <unidad>"),
 *     never as a bare total (expectedAmount.p50 is a unit price, not a
 *     tender total).
 *
 * An enhancement, not required content: fetches client-side only (so a
 * slow/empty lookup never blocks the host page's SSR) and renders nothing
 * at all — no empty box, no error — when there is no upcoming forecast for
 * the given rubro/buyer.
 */
import { ALERT_THRESHOLD, DISPLAY_THRESHOLD } from '#shared/forecast/constants'
import { effectiveWindow } from '#shared/forecast/window-display'
import { cadenceUnit } from '#shared/forecast/cadence-label'

const props = defineProps<{
  /** Exact-match token: a rubroAncestors member (rubro node id OR a leaf classification.id). */
  rubro?: string
  /** Exact-match buyerId, when the host page has a single-buyer context (e.g. a buyer profile). */
  buyer?: string
}>()

const { t, locale } = useI18n()
const localePath = useLocalePath()

// Without at least one of rubro/buyer the endpoint's filter is empty, which
// would return the globally-soonest forecast for ANY organism/rubro — not
// "relevant to this page". Skip the fetch entirely in that case.
const hasFilter = !!(props.rubro || props.buyer)

const { data: res } = await useFetch<any>('/api/analytics/anticipacion', {
  query: computed(() => {
    const q: Record<string, string> = { limit: '1' }
    if (props.rubro) q.rubro = props.rubro
    if (props.buyer) q.buyer = props.buyer
    return q
  }),
  server: false,
  immediate: hasFilter,
})

const forecast = computed<any | null>(() => (hasFilter ? (res.value?.data?.rows?.[0] ?? null) : null))

// ---- Confidence → qualitative band, identical thresholds to the public
// page (shared/forecast/constants) — the raw number never reaches the template.
type Band = 'alta' | 'media' | 'baja'
function confidenceBand(c: number): Band {
  if (c >= ALERT_THRESHOLD) return 'alta'
  if (c >= DISPLAY_THRESHOLD) return 'media'
  return 'baja'
}
const BAND_COLOR: Record<Band, string> = { alta: 'success', media: 'warning', baja: 'grey' }

// ---- Expected window, clamped for display exactly like the public page —
// single `now` per render so overdue-check and label agree with each other.
const now = computed(() => {
  void forecast.value
  return new Date()
})
const effWindow = computed(() => {
  const f = forecast.value
  if (!f) return null
  return effectiveWindow(f.expectedWindow.start, f.expectedWindow.end, now.value)
})
const windowLabel = computed(() => {
  const w = effWindow.value
  if (!w) return ''
  // effectiveWindow()'s no-throw contract can still hand back an Invalid
  // Date (unparseable/absent input); Intl.DateTimeFormat#format throws a
  // RangeError on those — guard it, same as the page's windowLabel().
  if (Number.isNaN(w.start.getTime()) || Number.isNaN(w.end.getTime())) return t('anticipacion.windowUnknown')
  const fmt = new Intl.DateTimeFormat(locale.value === 'en' ? 'en-GB' : 'es-UY', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
  const a = fmt.format(w.start)
  const b = fmt.format(w.end)
  return a === b ? a : `${a} – ${b}`
})
const isOverdue = computed(() => effWindow.value?.overdue ?? false)

// Cadence label, unit picked by magnitude — same shared helper and same i18n
// keys as app/pages/analytics/anticipacion.vue, so the two surfaces read
// identically for the same input (was `Math.round(medianDays / 30)` months,
// which rendered "every ~0 months" for cadences under ~15 days).
const cadenceLabel = computed(() => {
  const f = forecast.value
  if (!f) return ''
  const { key, n } = cadenceUnit(f.cadence.medianDays)
  const i18nKey = key === 'days' ? 'anticipacion.everyDays' : key === 'weeks' ? 'anticipacion.everyWeeks' : 'anticipacion.everyMonths'
  return t(i18nKey, { n })
})

const buyerHref = computed(() => {
  const id = forecast.value?.buyerId
  return id ? localePath(`/buyers/${id}`) : null
})
</script>

<template>
  <v-card
    v-if="forecast"
    border
    class="atc"
  >
    <v-card-text class="atc__body">
      <p class="atc__eyebrow u-mono">
        <v-icon
          icon="mdi-crystal-ball-outline"
          size="14"
          class="atc__eyeicon"
        />{{ t('anticipacion.card.title') }}
      </p>

      <p class="atc__line">
        <NuxtLink
          v-if="buyerHref"
          :to="buyerHref"
          class="atc__buyer"
        >{{ forecast.buyerName || forecast.buyerId }}</NuxtLink>
        <strong
          v-else
          class="atc__buyer"
        >{{ forecast.buyerName || forecast.buyerId }}</strong>
        {{ cadenceLabel }}
        <span
          v-if="forecast.rubroLabel"
          class="atc__rubro"
        >· {{ forecast.rubroLabel }}</span>
      </p>

      <p class="atc__row">
        <v-chip
          v-if="isOverdue"
          size="x-small"
          color="error"
          variant="tonal"
          class="atc__overdue"
          :title="t('anticipacion.overdueHelp')"
        >
          {{ t('anticipacion.overdue') }}
        </v-chip>
        <span class="atc__window">{{ t('anticipacion.col.ventana') }}: <strong>{{ windowLabel }}</strong></span>
        <v-chip
          size="small"
          :color="BAND_COLOR[confidenceBand(forecast.confidence)]"
          variant="tonal"
          class="atc__band"
          :title="t('anticipacion.confidenceHelp')"
        >
          {{ t(`anticipacion.confidence.${confidenceBand(forecast.confidence)}`) }}
        </v-chip>
      </p>

      <p
        v-if="forecast.incumbentSupplier?.name"
        class="atc__inc"
      >
        {{ t('anticipacion.col.incumbente') }}: {{ forecast.incumbentSupplier.name }}
      </p>

      <p
        v-if="forecast.expectedAmount"
        class="atc__amt"
      >
        <span class="atc__approx">≈</span>
        <MoneyAmount
          :amount="forecast.expectedAmount.p50"
          :currency="forecast.expectedAmount.currency"
          :rule="false"
          align="start"
        />
        <span class="atc__unit">{{ t('anticipacion.perUnit', { unit: forecast.expectedAmount.unitName || t('anticipacion.unitGeneric') }) }}</span>
      </p>

      <p class="atc__note">
        {{ t('anticipacion.card.disclaimer') }}
      </p>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.atc { background: var(--surface); }
.atc__body { padding: var(--s-4) var(--s-5) !important; }

.atc__eyebrow {
  display: flex;
  align-items: center;
  margin: 0 0 var(--s-2);
  font-size: var(--t-xs);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
}
.atc__eyeicon { margin-right: 4px; }

.atc__line { margin: 0 0 var(--s-2); font-size: var(--t-sm); line-height: 1.5; }
.atc__buyer { color: var(--text); text-decoration: none; }
a.atc__buyer:hover { color: var(--celeste-deep); text-decoration: underline; }
.atc__rubro { color: var(--text-muted); }

.atc__row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s-2); margin: 0 0 var(--s-2); font-size: var(--t-sm); }
.atc__window { color: var(--text); }
.atc__overdue { margin-right: 2px; }

.atc__inc { margin: 0 0 var(--s-2); font-size: var(--t-sm); color: var(--text-muted); }

.atc__amt { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; margin: 0 0 var(--s-3); font-size: var(--t-sm); }
.atc__approx { color: var(--text-muted); }
.atc__unit { font-size: var(--t-xs); color: var(--text-muted); }

.atc__note { margin: 0; font-size: var(--t-xs); color: var(--text-muted); line-height: 1.5; }
</style>
