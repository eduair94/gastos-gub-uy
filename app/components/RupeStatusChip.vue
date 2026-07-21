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
  <span class="rupe-status" :class="statusClass">{{ status }}</span>
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
.rupe-status.is-active { color: #70c994; border-color: rgba(112, 201, 148, 0.45); }
.rupe-status.is-pending { color: #e6c46a; border-color: rgba(230, 196, 106, 0.45); }
.rupe-status.is-inactive { color: #ef8b8b; border-color: rgba(239, 139, 139, 0.45); }
.rupe-status.is-neutral { color: var(--text-muted); }
</style>
