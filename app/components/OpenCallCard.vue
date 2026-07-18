<script setup lang="ts">
interface OpenCallLite {
  compraId: string
  title: string
  buyer?: { id?: string, name?: string }
  procurementMethodDetails?: string
  status?: string
  tenderPeriod?: { endDate?: string | Date | null }
  publishDate?: string | Date | null
}

const props = defineProps<{ call: OpenCallLite }>()
const { t } = useI18n()
const localePath = useLocalePath()

const statusKey = computed(() => {
  const s = props.call.status || 'open'
  const map: Record<string, string> = {
    open: 'statusOpen',
    clarification: 'statusClarification',
    amended: 'statusAmended',
    closed: 'statusClosed',
    awarded: 'statusAwarded',
    cancelled: 'statusCancelled',
  }
  return map[s] || 'statusOpen'
})

const statusClass = computed(() => {
  const s = props.call.status || 'open'
  if (s === 'closed' || s === 'cancelled') return 'tag--neutral'
  if (s === 'awarded') return 'tag--celeste'
  if (s === 'amended' || s === 'clarification') return 'tag--alerta'
  return 'tag--activo'
})

const endDate = computed(() => props.call.tenderPeriod?.endDate ?? null)
</script>

<template>
  <NuxtLink
    :to="localePath(`/llamados/${call.compraId}`)"
    class="occard panel"
  >
    <div class="occard__top">
      <span class="tag" :class="statusClass">{{ t(`llamados.${statusKey}`) }}</span>
      <span v-if="call.procurementMethodDetails" class="occard__method u-mono">{{ call.procurementMethodDetails }}</span>
    </div>
    <h3 class="occard__title u-clamp-2">
      {{ call.title }}
    </h3>
    <p v-if="call.buyer?.name" class="occard__buyer u-truncate">
      {{ call.buyer.name }}
    </p>
    <div class="occard__foot">
      <span class="occard__deadline">
        <v-icon size="15">mdi-calendar-clock</v-icon>
        <template v-if="endDate">{{ t('llamados.closes') }} {{ formatDateTime(endDate) }}</template>
        <template v-else>{{ t('llamados.noDeadline') }}</template>
      </span>
    </div>
  </NuxtLink>
</template>

<style scoped>
.occard {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  padding: var(--s-4);
  text-decoration: none;
  color: var(--text);
  transition: border-color var(--dur) var(--ease), transform var(--dur) var(--ease);
}

.occard:hover {
  border-color: var(--celeste);
}

.occard__top {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  flex-wrap: wrap;
}

.occard__method {
  font-size: var(--t-xs);
  color: var(--text-muted);
}

.occard__title {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: var(--t-base);
  line-height: 1.3;
  margin: 0;
}

.occard__buyer {
  font-size: var(--t-sm);
  color: var(--text-muted);
  margin: 0;
}

.occard__foot {
  margin-top: auto;
  padding-top: var(--s-2);
}

.occard__deadline {
  display: inline-flex;
  align-items: center;
  gap: var(--s-1);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  color: var(--text-muted);
}
</style>
