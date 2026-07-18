<script setup lang="ts">
/**
 * Organismos — state spending grouped by type of public body (Vuetify).
 * Reads the precomputed organism_group_stats (refreshed monthly). A group selector
 * switches between Intendencias, Ministerios, Salud, Entes and Educación; each shows
 * KPIs, a member ranking, a year trend and a full-width table. Per-capita is the
 * Intendencias' dedicated page — linked, not duplicated.
 */
const { t, locale } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const router = useRouter()

const { data: res, pending, error } = await useFetch<any>('/api/analytics/organism-groups')

const groups = computed<any[]>(() => res.value?.data?.groups ?? [])
const calculatedAt = computed(() => res.value?.data?.calculatedAt ?? null)

const selected = ref<string>((route.query.g as string) || 'intendencias')
watch(selected, (v) => {
  if (!v) return
  router.replace({ query: v !== 'intendencias' ? { g: v } : {} })
})

const current = computed<any | null>(() =>
  groups.value.find(g => g.groupKey === selected.value) ?? groups.value[0] ?? null)

const groupItems = computed(() =>
  groups.value.map(g => ({ value: g.groupKey, title: locale.value === 'en' ? g.labelEn : g.label })))
function groupBlurb(g: any): string {
  return locale.value === 'en' ? g.blurbEn : g.blurbEs
}

const members = computed<any[]>(() => current.value?.members ?? [])
const memberBars = computed(() =>
  members.value.map(m => ({ label: m.label, value: m.total, color: 'gold' })))
const byYear = computed(() =>
  (current.value?.byYear ?? []).map((y: any) => ({ year: y.year, value: y.total, count: y.contracts })))

const topMember = computed(() => members.value[0] ?? null)
function sharePct(m: any): string {
  if (!current.value?.total) return '—'
  return `${((m.total / current.value.total) * 100).toFixed(1)}%`
}
const groupSpan = computed(() => {
  const years = members.value.flatMap(m => [m.minYear, m.maxYear]).filter((y: any) => typeof y === 'number')
  if (!years.length) return '—'
  const lo = Math.min(...years); const hi = Math.max(...years)
  return lo === hi ? String(lo) : `${lo}–${hi}`
})

const rows = computed(() => members.value.map((m, i) => ({ ...m, rank: i + 1, share: sharePct(m) })))
const headers = computed(() => [
  { title: '#', key: 'rank', sortable: false, width: 48, align: 'end' as const },
  { title: t('organismos.col.member'), key: 'label', sortable: false },
  { title: t('organismos.col.spend'), key: 'total', align: 'end' as const },
  { title: t('organismos.col.contracts'), key: 'contracts', align: 'end' as const },
  { title: t('organismos.col.share'), key: 'share', sortable: false, align: 'end' as const },
])

useSeo(() => ({
  title: t('seo.organismos.title'),
  description: t('seo.organismos.description'),
  path: '/analytics/organismos',
}))
</script>

<template>
  <div class="organ">
    <v-sheet
      class="hero"
      tag="header"
    >
      <div class="u-container hero__in">
        <p class="hero__eyebrow u-mono">
          {{ t('home.eyebrow') }}
        </p>
        <h1 class="hero__title">
          {{ t('organismos.title') }}
        </h1>
        <p class="hero__dek">
          {{ t('organismos.lead') }}
        </p>
        <v-btn
          :to="localePath('/analytics/intendencias')"
          class="hero__cta"
          color="accent"
          variant="flat"
          append-icon="mdi-arrow-right"
        >
          {{ t('organismos.toIntendencias') }}
        </v-btn>
      </div>
    </v-sheet>

    <div class="u-container page">
      <!-- Group selector -->
      <v-btn-toggle
        v-model="selected"
        mandatory
        color="primary"
        density="comfortable"
        variant="outlined"
        divided
        class="groupsel"
      >
        <v-btn
          v-for="g in groupItems"
          :key="g.value"
          :value="g.value"
          size="small"
          class="text-none"
        >
          {{ g.title }}
        </v-btn>
      </v-btn-toggle>

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

      <v-skeleton-loader
        v-else-if="pending && !groups.length"
        type="card, table"
      />

      <template v-else-if="current">
        <p class="groupblurb">
          {{ groupBlurb(current) }}
        </p>

        <!-- KPIs -->
        <v-row
          class="kpis"
          dense
        >
          <v-col
            cols="6"
            md="3"
          >
            <v-card
              class="kpi"
              border
            >
              <MoneyAmount
                :amount="current.total"
                size="lg"
                align="start"
                compact
              />
              <div class="kpi__l">
                {{ t('organismos.kpi.total') }}
              </div>
            </v-card>
          </v-col>
          <v-col
            cols="6"
            md="3"
          >
            <v-card
              class="kpi"
              border
            >
              <div class="kpi__n u-mono">
                {{ formatNumber(current.memberCount) }}
              </div>
              <div class="kpi__l">
                {{ t('organismos.kpi.members') }}
              </div>
            </v-card>
          </v-col>
          <v-col
            cols="12"
            md="3"
          >
            <v-card
              class="kpi"
              border
            >
              <div class="kpi__top">
                {{ topMember?.label ?? '—' }}
              </div>
              <div class="kpi__l">
                {{ t('organismos.kpi.top') }} · {{ topMember ? sharePct(topMember) : '—' }}
              </div>
            </v-card>
          </v-col>
          <v-col
            cols="6"
            md="3"
          >
            <v-card
              class="kpi"
              border
            >
              <div class="kpi__n u-mono">
                {{ groupSpan }}
              </div>
              <div class="kpi__l">
                {{ t('organismos.kpi.span') }}
              </div>
            </v-card>
          </v-col>
        </v-row>

        <!-- Panels -->
        <v-row dense>
          <v-col
            cols="12"
            md="6"
          >
            <v-card
              border
              class="panel"
            >
              <h3 class="panel__t">
                {{ t('organismos.panel.ranking') }}
              </h3>
              <p class="panel__s">
                {{ t('organismos.panel.rankingSub') }}
              </p>
              <div class="chartscroll">
                <InvHBars
                  :items="memberBars"
                  format="moneyM"
                  :row-height="28"
                />
              </div>
            </v-card>
          </v-col>
          <v-col
            cols="12"
            md="6"
          >
            <v-card
              border
              class="panel"
            >
              <h3 class="panel__t">
                {{ t('organismos.panel.trend') }}
              </h3>
              <p class="panel__s">
                {{ t('organismos.panel.trendSub') }}
              </p>
              <YearBars
                :data="byYear"
                unit="money"
                :height="200"
              />
            </v-card>
          </v-col>
        </v-row>

        <!-- Table -->
        <v-card
          border
          class="tablecard"
        >
          <v-data-table
            :headers="headers"
            :items="rows"
            item-value="key"
            :items-per-page="-1"
            density="comfortable"
            hide-default-footer
          >
            <template #[`item.total`]="{ item }">
              <MoneyAmount
                :amount="item.total"
                compact
              />
            </template>
            <template #[`item.contracts`]="{ item }">
              <span class="u-mono">{{ formatNumber(item.contracts) }}</span>
            </template>
            <template #[`item.share`]="{ item }">
              <span class="u-mono">{{ item.share }}</span>
            </template>
          </v-data-table>
          <p
            v-if="calculatedAt"
            class="tablecard__foot u-mono"
          >
            {{ t('organismos.updated', { date: formatDate(calculatedAt) }) }}
          </p>
        </v-card>

        <!-- Interconnection -->
        <div class="interlink">
          <v-btn
            :to="localePath('/buyers')"
            variant="tonal"
            color="primary"
            prepend-icon="mdi-bank-outline"
            class="text-none"
          >
            {{ t('organismos.linkBuyers') }}
          </v-btn>
          <v-btn
            :to="localePath('/contracts')"
            variant="text"
            prepend-icon="mdi-magnify"
            class="text-none"
          >
            {{ t('home.exploreCta') }}
          </v-btn>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.organ { padding-bottom: var(--s-8); }

.hero {
  background: var(--ink) !important;
  color: #eaf1f6;
  padding-block: var(--s-7) var(--s-6);
}
.hero__in { max-width: 74ch; }
.hero__eyebrow { margin: 0 0 var(--s-3); font-size: var(--t-xs); letter-spacing: 0.14em; text-transform: uppercase; color: var(--sol); }
.hero__title { margin: 0 0 var(--s-3); font-family: var(--font-display); font-size: clamp(28px, 5vw, var(--t-3xl)); line-height: 1.05; color: #fff; }
.hero__dek { margin: 0 0 var(--s-5); color: #b9c8d4; font-size: var(--t-md); line-height: 1.55; }
.hero__cta { text-transform: none; letter-spacing: 0; font-weight: 600; }

.page { padding-top: var(--s-6); }
.groupsel { flex-wrap: wrap; height: auto; margin-bottom: var(--s-5); }
.groupblurb { margin: 0 0 var(--s-5); color: var(--text-muted); font-size: var(--t-sm); max-width: 74ch; }

.kpis { margin-bottom: var(--s-4); }
.kpi { padding: var(--s-4); height: 100%; }
.kpi__n { font-size: var(--t-2xl); line-height: 1; font-weight: 700; letter-spacing: -0.02em; }
.kpi__top { font-size: var(--t-md); font-weight: 700; line-height: 1.2; }
.kpi__l { margin-top: var(--s-2); font-family: var(--font-mono); font-size: var(--t-xs); text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); }

.panel { padding: var(--s-5); height: 100%; }
.panel__t { margin: 0 0 var(--s-1); font-size: var(--t-lg); }
.panel__s { margin: 0 0 var(--s-4); color: var(--text-muted); font-size: var(--t-sm); }
.chartscroll { overflow-x: auto; }

.tablecard { margin-top: var(--s-4); overflow: hidden; }
.tablecard__foot { margin: 0; padding: var(--s-2) var(--s-4); font-size: var(--t-xs); color: var(--text-muted); border-top: 1px solid var(--rule); }

.interlink { display: flex; flex-wrap: wrap; gap: var(--s-3); margin-top: var(--s-5); }

.empty { padding: var(--s-8) var(--s-5); text-align: center; border: 1px solid var(--rule); border-radius: var(--r-lg); background: var(--surface); }
.empty__t { margin: 0 0 var(--s-2); font-size: var(--t-lg); }
.empty__b { margin: 0; color: var(--text-muted); font-size: var(--t-sm); }
</style>
