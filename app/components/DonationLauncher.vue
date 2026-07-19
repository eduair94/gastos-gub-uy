<script setup lang="ts">
// Heart trigger that reveals the support card (DonationCard). `icon` variant sits
// in the header actions next to the tour launcher; `drawer` variant sits in the
// mobile drawer prefs. The card is hidden until this flips the shared open state,
// so support is opt-in — never a popup.
withDefaults(defineProps<{ variant?: 'icon' | 'drawer' }>(), { variant: 'icon' })
const emit = defineEmits<{ (e: 'activate'): void }>()

const { t } = useI18n()
const open = useState<boolean>('donation:open', () => false)

function activate() {
  open.value = true
  emit('activate')
}
</script>

<template>
  <button
    v-if="variant === 'drawer'"
    type="button"
    class="drawer__pref"
    @click="activate"
  >
    <v-icon size="18">
      mdi-heart-outline
    </v-icon>
    {{ t('donation.support') }}
  </button>
  <button
    v-else
    type="button"
    class="iconbtn iconbtn--love"
    :aria-label="t('donation.support')"
    :title="t('donation.support')"
    @click="activate"
  >
    <v-icon size="19">
      mdi-heart-outline
    </v-icon>
  </button>
</template>

<style scoped>
.iconbtn--love:hover {
  color: #e5484d;
}
</style>
