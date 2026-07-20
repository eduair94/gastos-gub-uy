<script setup lang="ts">
/**
 * El mapa del gasto — a treemap of state spending, area = money. Every public
 * body sized against every other, grouped by type (intendencias, ministerios,
 * salud, entes, educación). "Todos" shows the whole picture nested; picking a
 * group zooms the map to that group's members. Reuses the precomputed
 * organism_group_stats via /api/analytics/organism-groups.
 */
const { t, locale } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const router = useRouter()

const { data: res, error } = await useFetch<any>('/api/analytics/organism-groups')
const rawGroups = computed<any[]>(() => res.value?.data?.groups ?? [])
const calculatedAt = computed(() => res.value?.data?.calculatedAt ?? null)

const focus = ref<string>((route.query.g as string) || 'all')
watch(focus, (v) => {
  router.replace({ query: v && v !== 'all' ? { g: v } : {} })
})

const groupOptions = computed(() => [
  { value: 'all', title: t('mapa.all') },
  ...rawGroups.value.map(g => ({ value: g.groupKey, title: locale.value === 'en' ? g.labelEn : g.label })),
])

// Feed the treemap: all groups nested, or one focused group.
const treeGroups = computed(() => {
  const mapGroup = (g: any) => ({
    key: g.groupKey,
    label: locale.value === 'en' ? g.labelEn : g.label,
    value: g.total ?? (g.members ?? []).reduce((a: number, m: any) => a + (m.total || 0), 0),
    members: (g.members ?? []).map((m: any) => ({
      label: m.label,
      value: m.total || 0,
      // A real buyer id (e.g. "98-1") opens that body's profile; ministries
      // are inciso aggregates with no single profile, so they open the group
      // breakdown instead. Either way the cell leads somewhere real.
      href: m.buyerId
        ? localePath(`/buyers/${encodeURIComponent(m.buyerId)}`)
        : localePath(`/analytics/organismos?g=${g.groupKey}`),
    })),
  })
  if (focus.value !== 'all') {
    const g = rawGroups.value.find(x => x.groupKey === focus.value)
    return g ? [mapGroup(g)] : []
  }
  return rawGroups.value.map(mapGroup)
})

const grandTotal = computed(() => treeGroups.value.reduce((a, g) => a + g.value, 0))

// ---- View: treemap vs ranked list ---------------------------------------
// The treemap encodes money as area — commanding on a wide screen, cramped on a
// phone (cells shrink below their labels). So on mobile the ranked-list view is
// the default; both are always switchable. SSR renders the treemap (crawlable),
// then a phone flips to the list on mount — a post-hydration ref change, no
// mismatch.
const view = ref<'map' | 'list'>('map')
onMounted(() => {
  if (window.matchMedia?.('(max-width: 640px)').matches) view.value = 'list'
})

// Same hues as <TreemapChart> so switching views keeps each group's colour.
const GROUP_COLORS = ['#5e93c4', '#3f7d62', '#6b7f8f', '#8a6ea0', '#4f9a94', '#b0805a', '#9a6a6a', '#7a86b8']

// List rows mirror the treemap's two levels: at "all", one row per group (tap
// drills in); focused on a group, one row per member (tap opens its profile).
const listItems = computed(() => {
  if (focus.value === 'all') {
    return [...treeGroups.value]
      .sort((a, b) => b.value - a.value)
      .map((g, i) => ({
        label: g.label,
        value: g.value,
        color: GROUP_COLORS[i % GROUP_COLORS.length],
        groupKey: g.key,
        sub: t('mapa.memberCount', { n: g.members.length }),
      }))
  }
  const g = treeGroups.value[0]
  if (!g) return []
  return [...g.members]
    .filter(m => m.value > 0)
    .sort((a, b) => b.value - a.value)
    .map(m => ({ label: m.label, value: m.value, href: m.href, color: GROUP_COLORS[0]! }))
})

function onListSelect(i: number) {
  const key = (listItems.value[i] as any)?.groupKey
  if (key) focus.value = key
}

const orgLd = useOrgLd()

useSeo(() => ({
  title: t('seo.mapa.title'),
  description: t('seo.mapa.description'),
  path: '/analytics/mapa',
  kicker: 'Mapa',
  jsonLd: [
    {
      '@context': 'https://schema.org',
      '@type': 'Dataset',
      'name': t('seo.mapa.title'),
      'description': t('seo.mapa.description'),
      'creator': orgLd,
      'isAccessibleForFree': true,
      'license': 'https://catalogodatos.gub.uy',
    },
    orgLd,
  ],
}))
</script>

<template>
  <div class="mapa">
    <v-sheet
      class="hero"
      tag="header"
    >
      <div class="u-container hero__in">
        <p class="hero__eyebrow u-mono">
          {{ t('home.eyebrow') }}
        </p>
        <h1 class="hero__title">
          {{ t('mapa.title') }}
        </h1>
        <p class="hero__dek">
          {{ t('mapa.lead') }}
        </p>
      </div>
    </v-sheet>

    <div class="u-container page">
      <div class="controls">
        <v-chip-group
          v-model="focus"
          mandatory
          color="primary"
          class="groupsel"
          :aria-label="t('mapa.groupAria')"
        >
          <v-chip
            v-for="g in groupOptions"
            :key="g.value"
            :value="g.value"
            filter
            variant="outlined"
          >
            {{ g.title }}
          </v-chip>
        </v-chip-group>
        <p class="controls__total">
          {{ t('mapa.totalLabel') }}
          <MoneyAmount
            :amount="grandTotal"
            compact
            size="sm"
            :rule="false"
          />
        </p>
      </div>

      <div
        v-if="!error && treeGroups.length"
        class="viewbar"
      >
        <v-btn-toggle
          v-model="view"
          mandatory
          density="comfortable"
          variant="outlined"
          divided
          class="viewsel"
          :aria-label="t('mapa.viewAria')"
        >
          <v-btn
            value="map"
            size="small"
          >
            <v-icon
              start
              size="18"
            >
              mdi-view-grid-outline
            </v-icon>
            {{ t('mapa.viewMap') }}
          </v-btn>
          <v-btn
            value="list"
            size="small"
          >
            <v-icon
              start
              size="18"
            >
              mdi-format-list-bulleted
            </v-icon>
            {{ t('mapa.viewList') }}
          </v-btn>
        </v-btn-toggle>
      </div>

      <div
        v-if="error"
        class="empty"
      >
        <p class="empty__t">
          {{ t('organismos.empty.title') }}
        </p>
        <p class="empty__b">
          {{ t('organismos.empty.body') }}
        </p>
      </div>

      <div
        v-else-if="treeGroups.length && view === 'map'"
        class="panel treemap-wrap"
      >
        <TreemapChart
          :groups="treeGroups"
          :height="focus === 'all' ? 660 : 560"
        />
      </div>

      <SpendBars
        v-else-if="treeGroups.length"
        :items="listItems"
        class="listview"
        @select="onListSelect"
      />

      <p class="hint">
        {{ t('mapa.hint') }}
      </p>

      <div class="foot">
        <p class="foot__note">
          {{ t('mapa.note') }}
          <span v-if="calculatedAt"> · {{ t('organismos.updated', { date: formatDate(calculatedAt) }) }}</span>
        </p>
        <div class="foot__links">
          <NuxtLink
            :to="localePath('/analytics/organismos')"
            class="foot__link"
          >
            {{ t('mapa.toOrganismos') }}
            <v-icon size="16">
              mdi-arrow-right
            </v-icon>
          </NuxtLink>
          <NuxtLink
            :to="localePath('/analytics/intendencias')"
            class="foot__link"
          >
            {{ t('organismos.toIntendencias') }}
          </NuxtLink>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mapa { padding-bottom: var(--s-8); }

.hero {
  background: var(--ink) !important;
  color: #eaf1f6;
  padding-block: var(--s-7) var(--s-6);
}
.hero__in { max-width: 74ch; }
.hero__eyebrow { margin: 0 0 var(--s-3); font-size: var(--t-xs); letter-spacing: 0.14em; text-transform: uppercase; color: var(--sol); }
.hero__title { margin: 0 0 var(--s-3); font-family: var(--font-display); font-size: clamp(28px, 5vw, var(--t-3xl)); line-height: 1.05; color: #fff; }
.hero__dek { margin: 0; color: #b9c8d4; font-size: var(--t-md); line-height: 1.55; }

.page { padding-top: var(--s-6); }

.controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-3);
  margin-bottom: var(--s-4);
}

.groupsel { flex-wrap: wrap; height: auto; }

.viewbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: var(--s-4);
}

.listview { margin-top: var(--s-1); }

.controls__total {
  display: inline-flex;
  align-items: baseline;
  gap: var(--s-2);
  margin: 0;
  font-size: var(--t-sm);
  color: var(--text-muted);
}

.treemap-wrap { padding: var(--s-3); overflow: hidden; }

.hint {
  margin: var(--s-3) 0 0;
  font-size: var(--t-xs);
  color: var(--text-muted);
}

.foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-4);
  margin-top: var(--s-5);
  padding-top: var(--s-5);
  border-top: 1px solid var(--rule);
}

.foot__note { margin: 0; font-size: var(--t-sm); color: var(--text-muted); max-width: 66ch; }
.foot__links { display: flex; flex-wrap: wrap; gap: var(--s-4); }
.foot__link {
  display: inline-flex;
  align-items: center;
  gap: var(--s-1);
  font-size: var(--t-sm);
  font-weight: 600;
  color: var(--celeste-deep);
  text-decoration: none;
}
.foot__link:hover { text-decoration: underline; }

.empty { padding: var(--s-8) var(--s-5); text-align: center; border: 1px solid var(--rule); border-radius: var(--r-lg); background: var(--surface); }
.empty__t { margin: 0 0 var(--s-2); font-size: var(--t-lg); }
.empty__b { margin: 0; color: var(--text-muted); font-size: var(--t-sm); }

@media (max-width: 600px) {
  .controls { flex-direction: column; align-items: flex-start; }
}
</style>
