<script setup lang="ts">
/**
 * "Registered in RUPE, never won an award" badge — the chip that distinguishes
 * an address-only registry row (no email/phone/website, name+address from RUPE
 * only) from a contactable supplier in the same directory. The parent guards
 * rendering with `v-if` on the row's `neverAwarded`.
 *
 * Built on v-chip (not a hand-rolled span), same reasoning as DeiChip: it
 * inherits Vuetify's inline-flex sizing/vertical-centring wherever it's dropped.
 */
const { t } = useI18n()
</script>

<template>
  <v-chip
    size="x-small"
    rounded="pill"
    prepend-icon="mdi-file-question-outline"
    class="neverawardedchip"
    :title="t('contacts.chip.neverAwardedTitle')"
  >
    {{ t('contacts.chip.neverAwarded') }}
  </v-chip>
</template>

<style scoped>
.neverawardedchip {
  font-weight: 600;
}
</style>
