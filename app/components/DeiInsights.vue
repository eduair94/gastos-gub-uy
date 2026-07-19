<script setup lang="ts">
/**
 * DEI cross-reference section for the supplier directory: the size-vs-spend
 * transparency signal (registered micro/small firms that are among the biggest
 * state suppliers) and a map of registered industrial companies that supply
 * the State. Both come from the DEI registry joined to supplier_patterns by RUT.
 *
 * The map's ~1.9k points are fetched client-side (server:false) so they don't
 * bloat the page's SSR HTML; the signal list is small and rendered server-side.
 */
import type { DeiMapPoint } from './DeiMap.vue'

const { t } = useI18n()
const localePath = useLocalePath()

interface Signal {
  supplierId: string
  name: string
  totalValue: number
  tamano: string
  actividad: string
  departamento: string
}

const { data: sigRes } = await useFetch<any>('/api/analytics/dei-signals')
const summary = computed(() => sigRes.value?.data?.summary ?? null)
const signals = computed<Signal[]>(() => sigRes.value?.data?.microBigContracts ?? [])

// Map points: client-only, lazy — big payload kept out of SSR.
const { data: mapRes, pending: mapPending } = await useFetch<any>('/api/suppliers/dei-map', {
  server: false,
  lazy: true,
})
const points = computed<DeiMapPoint[]>(() => mapRes.value?.data?.points ?? [])

function supplierPath(id: string) {
  return localePath(`/suppliers/${id.split('/').map(encodeURIComponent).join('/')}`)
}
</script>

<template>
  <section
    v-if="signals.length || summary"
    class="dins"
  >
    <div class="dins__head">
      <h2 class="dins__title">
        {{ t('sup.dei.insights.title') }}
      </h2>
      <p
        v-if="summary"
        class="dins__lead"
      >
        {{ t('sup.dei.insights.summary', { matched: formatNumber(summary.matchedSuppliers), total: formatNumber(summary.deiTotal) }) }}
      </p>
    </div>

    <!-- ===== Size-vs-spend signal ===== -->
    <div
      v-if="signals.length"
      class="dins__block"
    >
      <h3 class="dins__h3">
        {{ t('sup.dei.insights.smallTitle') }}
      </h3>
      <p class="dins__help">
        {{ t('sup.dei.insights.smallHelp') }}
      </p>
      <ol class="rank">
        <li
          v-for="s in signals"
          :key="s.supplierId"
          class="rank__row"
        >
          <NuxtLink
            :to="supplierPath(s.supplierId)"
            class="rank__link"
          >
            <span class="rank__id">
              <span class="rank__name u-truncate">{{ s.name }}</span>
              <span class="rank__meta">
                <span class="tag tag--neutral">{{ s.tamano }}</span>
                <span
                  v-if="s.actividad"
                  class="rank__act u-truncate"
                >{{ s.actividad }}</span>
              </span>
            </span>
            <MoneyAmount
              :amount="s.totalValue"
              compact
              size="sm"
            />
          </NuxtLink>
        </li>
      </ol>
    </div>

    <!-- ===== Map ===== -->
    <div class="dins__block">
      <h3 class="dins__h3">
        {{ t('sup.dei.insights.mapTitle') }}
      </h3>
      <p class="dins__help">
        {{ t('sup.dei.insights.mapHelp') }}
      </p>
      <ClientOnly>
        <div
          v-if="mapPending && !points.length"
          class="dins__mapskel"
        >
          {{ t('common.loading') }}
        </div>
        <DeiMap
          v-else-if="points.length"
          :points="points"
          :height="440"
        />
      </ClientOnly>
    </div>
  </section>
</template>

<style scoped>
.dins {
  margin-top: var(--s-8);
  padding-top: var(--s-6);
  border-top: 1px solid var(--rule);
}

.dins__title {
  font-size: var(--t-xl);
  margin: 0;
}

.dins__lead {
  margin: var(--s-2) 0 0;
  max-width: 68ch;
  font-size: var(--t-sm);
  color: var(--text-muted);
}

.dins__block { margin-top: var(--s-6); }

.dins__h3 {
  font-size: var(--t-md);
  margin: 0 0 var(--s-1);
}

.dins__help {
  margin: 0 0 var(--s-3);
  max-width: 68ch;
  font-size: var(--t-sm);
  color: var(--text-muted);
}

.rank {
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
  background: var(--surface);
  overflow: hidden;
}

.rank__row + .rank__row { border-top: 1px solid var(--rule); }

.rank__link {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--s-4);
  padding: var(--s-3) var(--s-4);
  text-decoration: none;
  color: inherit;
  transition: background var(--dur) var(--ease);
}

.rank__link:hover { background: var(--surface-sunken); }

.rank__id { min-width: 0; }

.rank__name {
  display: block;
  font-size: var(--t-sm);
  font-weight: 600;
}

.rank__meta {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  margin-top: 3px;
  min-width: 0;
}

.rank__act {
  font-size: var(--t-xs);
  color: var(--text-muted);
}

.dins__mapskel {
  display: grid;
  place-items: center;
  height: 200px;
  border: 1px dashed var(--rule);
  border-radius: var(--r-lg);
  color: var(--text-muted);
  font-size: var(--t-sm);
}

@media (max-width: 480px) {
  .rank__link {
    grid-template-columns: 1fr;
    row-gap: var(--s-1);
  }
}
</style>
