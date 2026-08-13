<script setup lang="ts">
/**
 * "A cuántos llamados se presentó y cuántos ganó" + contra quién compite.
 *
 * El feed OCDS publica sólo al ganador, así que las ofertas PERDIDAS de una empresa no
 * existían en ningún lado. Salen del bloque "Proveedores participantes" de la ficha del
 * gobierno, donde cada oferente viene con RUT — que es lo que permite este cruce.
 *
 * LO MIRADO NO ES EL HISTORIAL COMPLETO. El sondeo avanza de a tandas por noche, así que
 * la tasa de éxito es sobre los llamados que llegamos a mirar, y el panel lo dice en la
 * misma frase que el porcentaje. Sin ese denominador el número sería inventado.
 */
interface Rival { name: string, rut: string, times: number }
interface Competition {
  available: boolean
  reason?: string
  probed: number
  wins?: number
  winRate?: number | null
  soleBidder?: number
  avgRivals?: number
  rivals?: Rival[]
}

const props = defineProps<{ supplierId: string }>()
const { t } = useI18n()
const localePath = useLocalePath()

const { data } = await useLazyFetch<{ data: Competition }>(
  () => `/api/suppliers/${encodeURIComponent(props.supplierId)}/competencia`,
)
const comp = computed(() => data.value?.data ?? null)
const show = computed(() => comp.value?.available === true && (comp.value?.probed ?? 0) > 0)

const pct = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}%`)

function supplierPath(rut: string): string {
  return localePath(`/suppliers/${rut.split('/').map(encodeURIComponent).join('/')}`)
}
</script>

<template>
  <section
    v-if="show && comp"
    class="panel block scomp"
  >
    <div class="panel__head">
      <h2>{{ t('suppliers.competitionTitle') }}</h2>
    </div>
    <div class="panel__body">
      <p class="scomp__lead u-muted">
        {{ t('suppliers.competitionHelp', { n: comp.probed }) }}
      </p>

      <div class="scomp__kpis">
        <div class="scomp__kpi">
          <span class="scomp__v u-mono">{{ comp.wins }}/{{ comp.probed }}</span>
          <span class="scomp__l">{{ t('suppliers.competitionWon') }}</span>
        </div>
        <div class="scomp__kpi">
          <span class="scomp__v u-mono">{{ pct(comp.winRate) }}</span>
          <span class="scomp__l">{{ t('suppliers.competitionRate') }}</span>
        </div>
        <div class="scomp__kpi">
          <span class="scomp__v u-mono">{{ (comp.avgRivals ?? 0).toFixed(1) }}</span>
          <span class="scomp__l">{{ t('suppliers.competitionRivalsAvg') }}</span>
        </div>
        <div
          v-if="comp.soleBidder"
          class="scomp__kpi scomp__kpi--alert"
        >
          <span class="scomp__v u-mono">{{ comp.soleBidder }}</span>
          <span class="scomp__l">{{ t('suppliers.competitionSole') }}</span>
        </div>
      </div>

      <template v-if="comp.rivals && comp.rivals.length">
        <h3 class="scomp__h">
          {{ t('suppliers.competitionRivals') }}
        </h3>
        <ul class="scomp__rivals">
          <li
            v-for="r in comp.rivals"
            :key="r.rut"
          >
            <NuxtLink :to="supplierPath(r.rut)">
              {{ r.name }}
            </NuxtLink>
            <span class="scomp__times u-mono">{{ t('suppliers.competitionTimes', { n: r.times }) }}</span>
          </li>
        </ul>
      </template>
    </div>
  </section>
</template>

<style scoped>
.scomp__lead { font-size: var(--t-xs); line-height: 1.5; max-width: 76ch; margin: 0 0 var(--s-3); }
.scomp__kpis { display: flex; flex-wrap: wrap; gap: var(--s-4); margin-bottom: var(--s-4); }
.scomp__kpi { display: flex; flex-direction: column; gap: 2px; min-width: 90px; }
.scomp__v { font-size: var(--t-lg); font-weight: 700; }
.scomp__l { font-size: var(--t-xs); color: var(--text-muted); line-height: 1.3; }
.scomp__kpi--alert .scomp__v { color: var(--alerta); }
.scomp__h {
  font-family: var(--font-mono); font-size: var(--t-xs); text-transform: uppercase;
  letter-spacing: 0.04em; color: var(--text-muted); font-weight: 500; margin: 0 0 var(--s-2);
}
.scomp__rivals { list-style: none; padding: 0; margin: 0; }
.scomp__rivals li {
  display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between;
  gap: var(--s-2); padding: var(--s-2) 0; border-bottom: 1px solid var(--rule);
}
.scomp__rivals li:last-child { border-bottom: 0; }
.scomp__rivals a { color: var(--celeste-deep); }
.scomp__times { font-size: var(--t-xs); color: var(--text-muted); flex: 0 0 auto; }
</style>
