<script setup lang="ts">
const props = defineProps<{ status: string }>()

const statusClass = computed(() => {
  const normalized = props.status.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
  if (normalized.includes('BAJA')) return 'is-inactive'
  if (normalized.includes('INGRES') || normalized.includes('TRAMIT') || normalized.includes('CURSO')) return 'is-pending'
  if (normalized.includes('ACTIVO')) return 'is-active'
  return 'is-neutral'
})
</script>

<template>
  <span
    class="rupe-status"
    :class="statusClass"
  >{{ status }}</span>
</template>

<style scoped>
.rupe-status {
  display: inline-flex;
  padding: 3px 7px;
  border: 1px solid var(--rule);
  border-radius: 999px;
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  line-height: 1.2;
  white-space: nowrap;
}
/* These were three hardcoded hexes — and they were the DARK tones, used in
   both themes: "ACTIVO" measured 2.0:1 on paper. Tokens flip with the theme,
   so each state now clears AA on either surface. Gold is money and nothing
   else, so "en ingreso" reads celeste (a preliminary signal, same as the
   observación tag) rather than amber. */
.rupe-status.is-active { color: var(--verde); border-color: color-mix(in srgb, var(--verde) 45%, transparent); }
.rupe-status.is-pending { color: var(--celeste-deep); border-color: color-mix(in srgb, var(--celeste) 45%, transparent); }
.rupe-status.is-inactive { color: var(--alerta); border-color: color-mix(in srgb, var(--alerta) 45%, transparent); }
.rupe-status.is-neutral { color: var(--text-muted); }
</style>
