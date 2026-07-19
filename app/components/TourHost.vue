<script setup lang="ts">
// Mounted once in the default layout. Owns two things:
//  1. resuming an in-progress tour after each route change (and after a reload),
//  2. rendering the tour-picker dialog (opened only by the manual TourLauncher button).
// The tour never auto-offers itself — it is opt-in via the "?" launcher next to the nav.
// All driver.js work is client-only (guarded inside useTour()).
import type { TourId } from '~/utils/tours'

const { t } = useI18n()
const route = useRoute()
const {
  pickerOpen,
  pickerWelcome,
  state,
  startTour,
  dismissPicker,
  resume,
  rehydrate,
} = useTour()

const options: Array<{ id: TourId, icon: string }> = [
  { id: 'explore', icon: 'mdi-chart-box-outline' },
  { id: 'alerts', icon: 'mdi-bell-plus-outline' },
]

function choose(id: TourId) {
  startTour(id)
}

onMounted(() => {
  rehydrate()
  if (state.value.tourId) resume()
})

// Resume across route changes (our own cross-page navigation, and safe no-op otherwise).
watch(() => route.fullPath, () => {
  if (state.value.tourId) nextTick(() => resume())
})
</script>

<template>
  <ClientOnly>
    <v-dialog
      v-model="pickerOpen"
      max-width="560"
      persistent
      scrim="rgba(15,34,51,0.55)"
    >
      <div class="tourpick">
        <p
          v-if="pickerWelcome"
          class="tourpick__eyebrow u-eyebrow"
        >
          {{ t('tour.picker.welcome') }}
        </p>
        <h2 class="tourpick__title">
          {{ t('tour.picker.title') }}
        </h2>
        <p class="tourpick__sub u-lead">
          {{ t('tour.picker.subtitle') }}
        </p>

        <div class="tourpick__opts">
          <button
            v-for="o in options"
            :key="o.id"
            type="button"
            class="tourpick__opt"
            :class="`tourpick__opt--${o.id}`"
            @click="choose(o.id)"
          >
            <v-icon
              class="tourpick__ic"
              size="28"
            >
              {{ o.icon }}
            </v-icon>
            <span class="tourpick__optbody">
              <span class="tourpick__opth">{{ t(`tour.picker.${o.id}Title`) }}</span>
              <span class="tourpick__optd">{{ t(`tour.picker.${o.id}Desc`) }}</span>
            </span>
            <v-icon
              class="tourpick__go"
              size="20"
            >
              mdi-arrow-right
            </v-icon>
          </button>
        </div>

        <button
          type="button"
          class="tourpick__dismiss"
          @click="dismissPicker"
        >
          {{ t('tour.picker.dismiss') }}
        </button>
      </div>
    </v-dialog>
  </ClientOnly>
</template>
