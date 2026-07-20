<script setup lang="ts">
// Audience-segmented value pitch reused in two places: the "Coming soon" pliego
// slot on a call detail (variant="slot") and a band above the /llamados grid
// (variant="band"). The segment toggle is shared + persisted via useAudience, so a
// visitor picks "empresa" or "ciudadano" once and it sticks everywhere.
const props = defineProps<{ variant: 'slot' | 'band', compraId?: string, hasBenchmarks?: boolean }>()

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const authEnabled = useAuthEnabled()
const { audience, setAudience: setAudienceState } = useAudience()
const { track } = useAnalytics()

function setAudience(next: 'empresa' | 'ciudadano') {
  track('audience_select', { audience: next })
  setAudienceState(next)
}

// Empresa alert CTA reuses the alert-builder deep link (`new=1` auto-opens the form,
// `keyword=` prefills it). On the band we carry the current search into the alert so
// "create an alert for this search" is literal; the slot has no search box.
const alertTo = computed(() => {
  const q = typeof route.query.q === 'string' ? route.query.q.trim() : ''
  return {
    path: localePath('/app/alertas'),
    query: { new: '1', ...(props.variant === 'band' && q ? { keyword: q } : {}) },
  }
})

interface Cta { key: string, label: string, to?: ReturnType<typeof localePath> | typeof alertTo.value, href?: string, primary?: boolean }

const values = computed<string[]>(() =>
  audience.value === 'empresa'
    ? [t('hook.empresaV1'), t('hook.empresaV2')]
    : [t('hook.ciudadanoV1'), t('hook.ciudadanoV2')],
)

const ctas = computed<Cta[]>(() => {
  if (audience.value === 'empresa') {
    const list: Cta[] = []
    // Alert needs an account — gate it on Firebase like the rest of the auth surface.
    if (authEnabled) {
      list.push({ key: 'alert', label: t('hook.empresaCtaAlert'), to: alertTo.value, primary: true })
    }
    // Second CTA doubles as the fallback primary when auth is off, so empresa is never
    // left without an action: the slot jumps to the on-page benchmarks when the call
    // actually has them, otherwise (and on the band) it sends to the spending explorer —
    // a #benchmarks link would be a dead no-op on a call with no benchmarks section.
    if (props.variant === 'slot' && props.hasBenchmarks) {
      list.push({ key: 'bench', label: t('hook.empresaCtaBenchmarks'), href: '#benchmarks' })
    }
    else {
      list.push({ key: 'org', label: t('hook.empresaCtaExplore'), to: localePath('/analytics/organismos') })
    }
    return list
  }
  return [
    { key: 'anom', label: t('hook.ciudadanoCtaAnomalias'), to: localePath('/analytics/anomalies'), primary: true },
    { key: 'gasto', label: t('hook.ciudadanoCtaExplorar'), to: localePath('/analytics/organismos') },
  ]
})
</script>

<template>
  <div
    class="hook"
    :class="`hook--${variant}`"
  >
    <h3
      v-if="variant === 'band'"
      class="hook__title"
    >
      {{ t('hook.bandTitle') }}
    </h3>
    <p
      v-else
      class="hook__lead u-muted"
    >
      {{ t('hook.slotLead') }}
    </p>

    <div
      class="hook__seg"
      role="tablist"
      :aria-label="t('hook.segLabel')"
    >
      <button
        type="button"
        role="tab"
        :aria-selected="audience === 'empresa'"
        class="hook__chip"
        :class="{ 'hook__chip--on': audience === 'empresa' }"
        @click="setAudience('empresa')"
      >
        <v-icon size="16">
          mdi-office-building-outline
        </v-icon>
        {{ t('hook.segEmpresa') }}
      </button>
      <button
        type="button"
        role="tab"
        :aria-selected="audience === 'ciudadano'"
        class="hook__chip"
        :class="{ 'hook__chip--on': audience === 'ciudadano' }"
        @click="setAudience('ciudadano')"
      >
        <v-icon size="16">
          mdi-account-search-outline
        </v-icon>
        {{ t('hook.segCiudadano') }}
      </button>
    </div>

    <ul class="hook__values">
      <li
        v-for="(v, i) in values"
        :key="`v-${audience}-${i}`"
      >
        <v-icon
          size="16"
          class="hook__vicon"
        >
          mdi-check
        </v-icon>
        {{ v }}
      </li>
    </ul>

    <div class="hook__ctas">
      <template
        v-for="c in ctas"
        :key="c.key"
      >
        <NuxtLink
          v-if="c.to"
          :to="c.to"
          class="hook__cta"
          :class="{ 'hook__cta--primary': c.primary }"
        >
          {{ c.label }}
          <v-icon size="16">
            mdi-arrow-right
          </v-icon>
        </NuxtLink>
        <a
          v-else
          :href="c.href"
          class="hook__cta"
          :class="{ 'hook__cta--primary': c.primary }"
        >
          {{ c.label }}
          <v-icon size="16">
            mdi-arrow-down
          </v-icon>
        </a>
      </template>
    </div>
  </div>
</template>

<style scoped>
.hook { display: flex; flex-direction: column; gap: var(--s-3); }
.hook--band {
  padding: var(--s-5);
  border: 1px solid var(--rule);
  border-radius: var(--r-md);
  background: var(--surface);
  margin-bottom: var(--s-4);
}
.hook__title {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: var(--t-lg);
  margin: 0;
}
.hook__lead { font-size: var(--t-sm); margin: 0; }

.hook__seg { display: inline-flex; gap: var(--s-1); flex-wrap: wrap; }
.hook__chip {
  display: inline-flex;
  align-items: center;
  gap: var(--s-1);
  padding: var(--s-1) var(--s-3);
  height: 32px;
  border: 1px solid var(--rule-strong);
  border-radius: 999px;
  background: transparent;
  color: var(--text-muted);
  font-size: var(--t-sm);
  font-weight: 600;
  cursor: pointer;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
}
.hook__chip:hover { border-color: var(--celeste); color: var(--celeste-deep); }
.hook__chip--on {
  background: var(--celeste-wash);
  border-color: var(--celeste);
  color: var(--celeste-deep);
}

.hook__values { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--s-2); }
.hook__values li {
  display: flex;
  align-items: flex-start;
  gap: var(--s-2);
  font-size: var(--t-sm);
  line-height: 1.45;
}
.hook__vicon { color: var(--celeste); margin-top: 2px; flex: 0 0 auto; }

.hook__ctas { display: flex; flex-wrap: wrap; gap: var(--s-2); margin-top: var(--s-1); }
.hook__cta {
  display: inline-flex;
  align-items: center;
  gap: var(--s-1);
  padding: 0 var(--s-3);
  height: 38px;
  border-radius: var(--r-md);
  border: 1px solid var(--rule-strong);
  color: var(--celeste-deep);
  background: transparent;
  font-size: var(--t-sm);
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;
}
.hook__cta:hover { border-color: var(--celeste); background: var(--celeste-wash); }
.hook__cta--primary {
  background: var(--cta-fill);
  border-color: var(--cta-fill);
  color: var(--cta-fg);
}
.hook__cta--primary:hover { filter: brightness(1.05); background: var(--cta-fill); }
</style>
