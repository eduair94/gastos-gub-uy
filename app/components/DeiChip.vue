<script setup lang="ts">
/**
 * "Registered industrial company (DEI)" badge. Unlike SupplierChip (advisory AI
 * category), this marks a verified fact of record from MIEM open data, so it
 * reads as a credential, not a guess. The parent guards rendering with `v-if`
 * on the supplier's `dei`. A lapsed certificate (estado ≠ Aprobado) shows muted.
 */
const props = defineProps<{ estado?: string | null }>()
const { t } = useI18n()

const vigente = computed(() => (props.estado ?? '').toLowerCase().startsWith('aprob'))
</script>

<template>
  <span
    :class="['deichip', { 'deichip--lapsed': !vigente }]"
    :title="t('sup.dei.badgeTitle')"
  >
    <svg
      class="deichip__i"
      viewBox="0 0 16 16"
      width="11"
      height="11"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M8 1l2 1.4 2.4-.2.6 2.3L15 7l-1.6 2.5L15 12l-2.2 1.1-.6 2.3-2.4-.2L8 16l-1.8-1.9-2.4.2-.6-2.3L1 12l1.6-2.5L1 7l2.2-1.1.6-2.3L6.2 2z"
      />
      <path
        fill="var(--surface)"
        d="M6.9 10.4L4.9 8.4l.9-.9 1.1 1.1 3-3 .9.9z"
      />
    </svg>
    {{ t('sup.dei.badge') }}
  </span>
</template>

<style scoped>
.deichip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px var(--s-2);
  border-radius: var(--r-full);
  font-family: var(--font-mono);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  white-space: nowrap;
  color: var(--verde);
  background: color-mix(in srgb, var(--verde) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--verde) 34%, transparent);
}

.deichip__i { flex: none; }

.deichip--lapsed {
  color: var(--text-muted);
  background: var(--surface-sunken);
  border-color: var(--rule);
}
</style>
