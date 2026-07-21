<script setup lang="ts">
const props = defineProps<{ count: number }>()
const { t } = useI18n()
</script>

<template>
  <v-chip
    size="x-small"
    rounded="pill"
    prepend-icon="mdi-file-sign"
    class="only-direct-chip"
    :title="t('contacts.chip.onlyDirectAwardTitle', { count: formatNumber(props.count) })"
  >
    {{ t('contacts.chip.onlyDirectAward') }}
  </v-chip>
</template>

<style scoped>
.only-direct-chip {
  font-weight: 600;
}
</style>
