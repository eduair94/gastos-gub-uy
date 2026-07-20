<script setup lang="ts">
/**
 * Anticipación de llamados — public read surface for the tender-anticipation
 * feature (Fase 1). Per (buyer × mid-level SICE rubro), estimates when that
 * organism is likely to publish its next tender, from its own historical
 * purchasing cadence. Reads the precomputed `tender_forecast` collection via
 * GET /api/analytics/anticipacion, which already defaults to only upcoming
 * (non-elapsed) forecasts, sorted soonest-first.
 *
 * DESCRIPTIVE / derived, never a fact: the OCDS feed carries no
 * pre-publication signal (0% "planning" stage, 91% null status), so this is
 * a pattern estimate over the organism's own past. Two things this page must
 * never do: print `confidence` as a raw percentage (it saturates at 1.0 on
 * tight cadences, which reads as false certainty — shown as a qualitative
 * Alta/Media/Baja band instead, thresholds from shared/forecast/constants),
 * and let anyone walk away thinking a date shown here is an announcement.
 */
import { ALERT_THRESHOLD, DISPLAY_THRESHOLD } from '#shared/forecast/constants'
import { effectiveWindow } from '#shared/forecast/window-display'

const { t, locale } = useI18n()
const localePath = useLocalePath()

// ---- Filters (server-side, over the WHOLE eligible set — not just the
// fetched page) -------------------------------------------------------------
// The endpoint's own `buyer`/`rubro` params expect exact ids (buyerId,
// rubroAncestors token) that a citizen typing a name would never guess, so
// the free-text boxes here are wired to the endpoint's separate `buyerText`/
// `rubroText` params (case-insensitive regex, server-side) instead. Earlier
// version of this page filtered client-side over only the first 150 fetched
// rows — a real organism/rubro that wasn't among the 150 globally-soonest
// forecasts (of ~7,100 eligible) silently read as "nothing coming" even
// though a match existed further down the sorted set. Debounced so typing
// doesn't fire a request per keystroke; `useFetch`'s `query` is reactive to
// the debounced refs, so a filter change re-queries the whole set rather
// than re-slicing an already-narrow local array.
const buyerFilter = ref('')
const rubroFilter = ref('')
const buyerFilterDebounced = refDebounced(buyerFilter, 300)
const rubroFilterDebounced = refDebounced(rubroFilter, 300)

function hasActiveFilters(): boolean {
  return !!(buyerFilter.value || rubroFilter.value)
}
function clearFilters() {
  buyerFilter.value = ''
  rubroFilter.value = ''
}

const { data: res, pending, error } = await useFetch<any>('/api/analytics/anticipacion', {
  query: computed(() => ({
    limit: 200,
    ...(buyerFilterDebounced.value.trim() ? { buyerText: buyerFilterDebounced.value.trim() } : {}),
    ...(rubroFilterDebounced.value.trim() ? { rubroText: rubroFilterDebounced.value.trim() } : {}),
  })),
})

const rows = computed<any[]>(() => res.value?.data?.rows ?? [])
const total = computed<number>(() => res.value?.data?.total ?? 0)
const calculatedAt = computed(() => res.value?.data?.calculatedAt ?? null)

// ---- Confidence → qualitative band (AMENDMENT 1) --------------------------
// `confidence` saturates at exactly 1.0 for very tight cadences; showing
// "100%" would print false certainty on a derived estimate. Mapped to a
// 3-level band instead, and rendered as a coloured chip carrying the WORD —
// the raw number never reaches the template. Thresholds are the feature's
// real locked constants (shared/forecast/constants.ts), imported rather than
// re-hardcoded so this page can never drift from the job that computes them.
type Band = 'alta' | 'media' | 'baja'
function confidenceBand(c: number): Band {
  if (c >= ALERT_THRESHOLD) return 'alta' // >= 0.60
  if (c >= DISPLAY_THRESHOLD) return 'media' // >= 0.35 and < 0.60
  return 'baja' // < 0.35 — the read endpoint's own default already excludes
  // these, but the band stays total in case minConfidence is ever relaxed.
}
const BAND_COLOR: Record<Band, string> = { alta: 'success', media: 'warning', baja: 'grey' }

// ---- Expected window as a human range, never a false-precision date -------
// Overdue buyers (their own cadence already elapsed) have a raw `start` in
// the past while `end` is still ahead — rendering that raw range produced
// nonsense like "ago. 2025 – ago. 2026" (a window that appears to START
// before today). effectiveWindow() (shared/forecast/window-display, reused
// by Task 8's card) clamps the DISPLAYED start to `now` without dropping the
// row — overdue is the most actionable signal here, not noise.
// Single `now` reused by both windowLabel() and isOverdue() for the same row,
// instead of each calling `new Date()` independently — avoids a (theoretical)
// disagreement between the two if a clock-boundary is crossed between calls,
// and avoids redundant allocations across the whole table. Recomputed only
// when the row set actually changes (a fetch/refetch), not on every unrelated
// re-render, so it doesn't go stale on a long-open tab either.
const now = computed(() => {
  void rows.value
  return new Date()
})
function effWindow(r: any) {
  return effectiveWindow(r.expectedWindow.start, r.expectedWindow.end, now.value)
}
function windowLabel(r: any): string {
  const { start, end } = effWindow(r)
  // effectiveWindow()'s no-throw contract can still hand back an Invalid
  // Date (unparseable/absent input) — Intl.DateTimeFormat#format throws a
  // RangeError on those, which would take the whole row down with it.
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return t('anticipacion.windowUnknown')
  const fmt = new Intl.DateTimeFormat(locale.value === 'en' ? 'en-GB' : 'es-UY', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
  const a = fmt.format(start)
  const b = fmt.format(end)
  return a === b ? a : `${a} – ${b}`
}
function isOverdue(r: any): boolean {
  return effWindow(r).overdue
}

function evidenceTitle(r: any): string {
  const items = (r.evidenceItems ?? []).slice(0, 3).map((e: any) => e.label).filter(Boolean)
  return items.length ? `${t('anticipacion.evidence')}: ${items.join(' · ')}` : ''
}

useSeo(() => ({
  title: t('seo.anticipacion.title'),
  description: t('seo.anticipacion.description'),
  path: '/analytics/anticipacion',
}))
</script>

<template>
  <div class="antic">
    <v-sheet
      class="hero"
      tag="header"
    >
      <div class="u-container hero__in">
        <p class="hero__eyebrow u-mono">
          {{ t('home.eyebrow') }}
        </p>
        <h1 class="hero__title">
          {{ t('anticipacion.title') }}
        </h1>
        <p class="hero__dek">
          {{ t('anticipacion.subtitle') }}
        </p>
      </div>
    </v-sheet>

    <div class="u-container page">
      <!-- AMENDMENT 2: the honesty caveat — plainly visible, near the top,
           never buried in a footer. -->
      <v-alert
        type="warning"
        variant="tonal"
        border="start"
        icon="mdi-crystal-ball-outline"
        class="disclaimer"
      >
        <p class="disclaimer__t">
          {{ t('anticipacion.disclaimer.title') }}
        </p>
        <p class="disclaimer__b">
          {{ t('anticipacion.disclaimer.body') }}
        </p>
      </v-alert>

      <div
        v-if="error"
        class="empty"
      >
        <p class="empty__t">
          {{ t('errors.generic.title') }}
        </p>
        <p class="empty__b">
          {{ t('anticipacion.notReady.body') }}
        </p>
      </div>

      <v-skeleton-loader
        v-else-if="pending && !rows.length"
        type="table"
      />

      <template v-else-if="rows.length || hasActiveFilters()">
        <!-- Filters — always visible once past the initial load, even when
             the current search matches nothing, so a citizen can see and
             correct/clear the search rather than land on a dead end. -->
        <div class="controls">
          <v-text-field
            v-model="buyerFilter"
            :label="t('anticipacion.filters.buyer')"
            density="comfortable"
            variant="outlined"
            hide-details
            clearable
            prepend-inner-icon="mdi-bank-outline"
            class="controls__field"
          />
          <v-text-field
            v-model="rubroFilter"
            :label="t('anticipacion.filters.rubro')"
            density="comfortable"
            variant="outlined"
            hide-details
            clearable
            prepend-inner-icon="mdi-tag-outline"
            class="controls__field"
          />
        </div>

        <template v-if="rows.length">
          <p class="count u-mono">
            {{ t('anticipacion.resultsCount', { n: rows.length }) }}
          </p>
          <!-- The endpoint always returns a soonest-first page capped at
               `limit`; when the full eligible set is bigger than what's
               shown, say so plainly rather than let the list read as
               exhaustive. -->
          <p
            v-if="total > rows.length"
            class="caveat u-mono"
          >
            {{ t('anticipacion.showingCaveat', { n: rows.length, total }) }}
          </p>

          <v-card
            border
            class="tablecard"
          >
            <div class="u-scroll-x">
              <table class="dt">
                <thead>
                  <tr>
                    <th>{{ t('anticipacion.col.organismo') }}</th>
                    <th>{{ t('anticipacion.col.rubro') }}</th>
                    <th>{{ t('anticipacion.col.ventana') }}</th>
                    <th>{{ t('anticipacion.col.cadencia') }}</th>
                    <th>{{ t('anticipacion.col.confianza') }}</th>
                    <th>{{ t('anticipacion.col.incumbente') }}</th>
                    <th>{{ t('anticipacion.col.monto') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="r in rows"
                    :key="r._id"
                  >
                    <td>
                      <NuxtLink
                        v-if="r.buyerId"
                        :to="localePath(`/buyers/${r.buyerId}`)"
                        class="dt__link"
                      >
                        {{ r.buyerName || r.buyerId }}
                      </NuxtLink>
                      <span v-else>{{ r.buyerName || '—' }}</span>
                    </td>
                    <td :title="evidenceTitle(r)">
                      {{ r.rubroLabel }}
                    </td>
                    <td class="u-mono">
                      <v-chip
                        v-if="isOverdue(r)"
                        size="x-small"
                        color="error"
                        variant="tonal"
                        class="overdue-chip"
                        :title="t('anticipacion.overdueHelp')"
                      >
                        {{ t('anticipacion.overdue') }}
                      </v-chip>
                      {{ windowLabel(r) }}
                    </td>
                    <td>
                      {{ t('anticipacion.everyMonths', { n: Math.round(r.cadence.medianDays / 30) }) }}
                      <span class="cell-sub u-mono">{{ t('anticipacion.events', { n: r.cadence.eventCount }) }}</span>
                    </td>
                    <td>
                      <v-chip
                        size="small"
                        :color="BAND_COLOR[confidenceBand(r.confidence)]"
                        variant="tonal"
                        :title="t('anticipacion.confidenceHelp')"
                      >
                        {{ t(`anticipacion.confidence.${confidenceBand(r.confidence)}`) }}
                      </v-chip>
                    </td>
                    <td>{{ r.incumbentSupplier?.name || '—' }}</td>
                    <td>
                      <span
                        v-if="r.expectedAmount"
                        class="amt"
                      >
                        <span class="amt__approx">≈</span>
                        <MoneyAmount
                          :amount="r.expectedAmount.p50"
                          :currency="r.expectedAmount.currency"
                          :rule="false"
                          align="start"
                        />
                        <span class="amt__unit">{{ t('anticipacion.perUnit', { unit: r.expectedAmount.unitName || t('anticipacion.unitGeneric') }) }}</span>
                      </span>
                      <span
                        v-else
                        class="amt amt--none"
                      >{{ t('anticipacion.noAmount') }}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p
              v-if="calculatedAt"
              class="tablecard__foot u-mono"
            >
              {{ t('anticipacion.updated', { date: formatDate(calculatedAt) }) }}
            </p>
          </v-card>

          <p class="coverage">
            {{ t('anticipacion.coverage') }}
          </p>
        </template>

        <div
          v-else
          class="empty"
        >
          <p class="empty__t">
            {{ t('anticipacion.noMatches.title') }}
          </p>
          <p class="empty__b">
            {{ t('anticipacion.noMatches.body') }}
          </p>
          <v-btn
            v-if="hasActiveFilters()"
            color="primary"
            variant="tonal"
            size="small"
            @click="clearFilters"
          >
            {{ t('common.clearAll') }}
          </v-btn>
        </div>
      </template>

      <div
        v-else
        class="empty"
      >
        <p class="empty__t">
          {{ t('anticipacion.notReady.title') }}
        </p>
        <p class="empty__b">
          {{ t('anticipacion.notReady.body') }}
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.antic { padding-bottom: var(--s-8); }
.hero { background: var(--ink) !important; color: #eaf1f6; padding-block: var(--s-7) var(--s-6); }
.hero__in { max-width: 76ch; }
.hero__eyebrow { margin: 0 0 var(--s-3); font-size: var(--t-xs); letter-spacing: 0.14em; text-transform: uppercase; color: var(--sol); }
.hero__title { margin: 0 0 var(--s-3); font-family: var(--font-display); font-size: clamp(28px, 5vw, var(--t-3xl)); line-height: 1.05; color: #fff; }
.hero__dek { margin: 0; color: #b9c8d4; font-size: var(--t-md); line-height: 1.55; }

.page { padding-top: var(--s-6); }

.disclaimer { margin-bottom: var(--s-5); }
.disclaimer__t { margin: 0 0 4px; font-weight: 700; font-size: var(--t-sm); }
.disclaimer__b { margin: 0; font-size: var(--t-sm); line-height: 1.55; }

.controls { display: flex; flex-wrap: wrap; gap: var(--s-3) var(--s-4); margin-bottom: var(--s-4); }
.controls__field { flex: 0 1 260px; min-width: 200px; }

.count { margin: 0 0 var(--s-2); font-size: var(--t-xs); color: var(--text-muted); }
.caveat { margin: 0 0 var(--s-3); font-size: var(--t-xs); color: var(--text-muted); }

.tablecard { overflow: hidden; }
.dt { width: 100%; border-collapse: collapse; }
.dt th { padding: var(--s-3) var(--s-4); text-align: left; font-family: var(--font-mono); font-size: var(--t-xs); text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); border-bottom: 1px solid var(--rule); white-space: nowrap; }
.dt td { padding: var(--s-3) var(--s-4); font-size: var(--t-sm); border-bottom: 1px solid var(--rule); vertical-align: top; }
.dt tr:last-child td { border-bottom: 0; }
.dt__link { font-weight: 600; color: var(--text); text-decoration: none; }
.dt__link:hover { color: var(--celeste-deep); text-decoration: underline; }
.cell-sub { display: block; margin-top: 2px; font-size: var(--t-xs); color: var(--text-muted); }
.overdue-chip { display: block; width: fit-content; margin-bottom: 4px; }
.tablecard__foot { margin: 0; padding: var(--s-2) var(--s-4); font-size: var(--t-xs); color: var(--text-muted); border-top: 1px solid var(--rule); }

.amt { display: inline-flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.amt__approx { color: var(--text-muted); }
.amt__unit { font-size: var(--t-xs); color: var(--text-muted); }
.amt--none { color: var(--text-muted); font-size: var(--t-sm); }

.coverage { margin-top: var(--s-3); font-size: var(--t-xs); color: var(--text-muted); line-height: 1.5; }

.empty { padding: var(--s-8) var(--s-5); text-align: center; border: 1px solid var(--rule); border-radius: var(--r-lg); background: var(--surface); }
.empty__t { margin: 0 0 var(--s-2); font-size: var(--t-lg); }
.empty__b { margin: 0 0 var(--s-3); color: var(--text-muted); font-size: var(--t-sm); }

@media (max-width: 640px) {
  .controls__field { flex: 1 1 100%; }
}
</style>
