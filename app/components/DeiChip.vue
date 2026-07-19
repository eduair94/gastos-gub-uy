<script setup lang="ts">
/**
 * "Registered industrial company (DEI)" badge. Unlike SupplierChip (advisory AI
 * category), this marks a verified fact of record from MIEM open data, so it
 * reads as a credential, not a guess. The parent guards rendering with `v-if`
 * on the supplier's `dei`. A lapsed certificate (estado ≠ Aprobado) shows muted.
 *
 * Built on v-chip (not a hand-rolled span) so it inherits Vuetify's inline-flex
 * sizing/vertical-centring wherever it's dropped — next to a heading, inline
 * after a table-row link, anywhere — instead of drifting via ad hoc CSS per page.
 */
const props = defineProps<{ estado?: string | null }>()
const { t } = useI18n()

const vigente = computed(() => (props.estado ?? '').toLowerCase().startsWith('aprob'))
</script>

<template>
  <v-chip
    :color="vigente ? 'success' : undefined"
    size="x-small"
    rounded="pill"
    prepend-icon="mdi-shield-check-outline"
    class="deichip"
    :title="t('sup.dei.badgeTitle')"
  >
    {{ t('sup.dei.badge') }}
  </v-chip>
</template>

<style scoped>
.deichip {
  font-weight: 600;
  text-transform: uppercase;
}
</style>
