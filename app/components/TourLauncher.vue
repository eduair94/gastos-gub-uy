<script setup lang="ts">
// The "?" help trigger. `icon` variant sits in the header actions next to the theme
// toggle; `drawer` variant sits in the mobile drawer prefs. Both open the tour picker.
withDefaults(defineProps<{ variant?: 'icon' | 'drawer' }>(), { variant: 'icon' })
const emit = defineEmits<{ (e: 'activate'): void }>()

const { t } = useI18n()
const { openPicker } = useTour()

function open() {
  openPicker(false)
  emit('activate')
}
</script>

<template>
  <button
    v-if="variant === 'drawer'"
    type="button"
    class="drawer__pref"
    @click="open"
  >
    <v-icon size="18">
      mdi-help-circle-outline
    </v-icon>
    {{ t('tour.launcher') }}
  </button>
  <button
    v-else
    type="button"
    class="iconbtn"
    :aria-label="t('tour.launcher')"
    :title="t('tour.launcher')"
    @click="open"
  >
    <v-icon size="19">
      mdi-help-circle-outline
    </v-icon>
  </button>
</template>
