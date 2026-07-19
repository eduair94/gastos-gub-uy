<script setup lang="ts">
/**
 * Pauta oficial — the state's advertising spend and who receives it. The whole
 * "Publicidad y Propaganda" catalogue class, apportioned per recipient and per
 * payer (via /api/pauta over product_analytics). The point is the cross: which
 * public bodies pay for advertising, and which media/agencies collect it.
 */
const { t } = useI18n()
const localePath = useLocalePath()

const { data: res } = await useFetch<any>('/api/pauta')
const d = computed(() => res.value?.data ?? null)

const total = computed(() => d.value?.total ?? 0)
const outlets = computed<any[]>(() => d.value?.outlets ?? [])
const buyers = computed<any[]>(() => d.value?.buyers ?? [])
const formats = computed<any[]>(() => d.value?.formats ?? [])
const byYear = computed(() => (d.value?.byYear ?? []).map((y: any) => ({ year: y.year, value: y.value })))

const top5Share = computed(() => {
  const s = outlets.value.slice(0, 5).reduce((a, o) => a + (o.share ?? 0), 0)
  return Math.round(s * 100)
})
const pct = (v: number) => `${(v * 100).toFixed(1)}%`

useSeo(() => ({
  title: t('seo.pauta.title'),
  description: t('seo.pauta.description'),
  path: '/pauta',
}))
</script>

<template>
  <div class="pauta">
    <!-- Hero -->
    <section class="phero">
      <div class="phero__in u-container">
        <p class="u-eyebrow phero__eyebrow">
          {{ t('pauta.eyebrow') }}
        </p>
        <h1 class="phero__title">
          {{ t('pauta.title') }}
        </h1>
        <p class="phero__lead">
          {{ t('pauta.lead') }}
        </p>
      </div>
    </section>

    <!-- KPIs -->
    <section class="u-container stats">
      <div class="stat stat--money">
        <MoneyAmount
          :amount="total"
          size="xl"
          align="start"
          compact
        />
        <span class="stat__l">{{ t('pauta.stat.total') }}</span>
      </div>
      <div class="stat">
        <span class="stat__n u-mono">{{ top5Share }}%</span>
        <span class="stat__l">{{ t('pauta.stat.top5') }}</span>
      </div>
      <div class="stat">
        <span class="stat__n u-mono">{{ formatNumber(d?.formatCount) }}</span>
        <span class="stat__l">{{ t('pauta.stat.formats') }}</span>
      </div>
    </section>

    <!-- Who receives -->
    <section class="u-container block">
      <div class="block__head">
        <h2>{{ t('pauta.outletsTitle') }}</h2>
      </div>
      <p class="block__help block__help--wide">
        {{ t('pauta.outletsHelp') }}
      </p>
      <ol class="rank">
        <li
          v-for="(o, i) in outlets"
          :key="o.name"
          class="rank__row"
        >
          <NuxtLink
            :to="localePath(`/contracts?suppliers=${encodeURIComponent(o.name)}`)"
            class="rank__link"
            :title="t('pauta.viewContracts', { name: o.name })"
          >
            <span class="rank__pos u-mono">{{ i + 1 }}</span>
            <span class="rank__id">
              <span class="rank__nameline">
                <span class="rank__name">{{ o.name }}</span>
                <SupplierChip :category="o.category" />
              </span>
              <span
                v-if="o.description"
                class="rank__desc"
              >{{ o.description }}</span>
            </span>
            <span class="rank__meta">{{ pct(o.share) }}</span>
            <MoneyAmount
              :amount="o.value"
              compact
              size="sm"
            />
            <v-icon
              size="16"
              class="rank__go"
            >
              mdi-chevron-right
            </v-icon>
          </NuxtLink>
        </li>
      </ol>
      <p class="block__note">
        {{ t('pauta.outletsNote') }}
      </p>
      <p class="block__note">
        {{ t('sup.aiNote') }}
      </p>
    </section>

    <!-- Who pays + formats -->
    <section class="u-container cols">
      <div class="block block--flush">
        <div class="block__head">
          <h2>{{ t('pauta.buyersTitle') }}</h2>
        </div>
        <p class="block__help block__help--wide">
          {{ t('pauta.buyersHelp') }}
        </p>
        <ol class="rank">
          <li
            v-for="b in buyers"
            :key="b.name"
            class="rank__row"
          >
            <NuxtLink
              :to="localePath(`/contracts?buyers=${encodeURIComponent(b.name)}`)"
              class="rank__link"
              :title="t('pauta.viewContracts', { name: b.name })"
            >
              <span class="rank__name">{{ b.name }}</span>
              <MoneyAmount
                :amount="b.value"
                compact
                size="sm"
              />
            </NuxtLink>
          </li>
        </ol>
      </div>

      <div class="block block--flush">
        <div class="block__head">
          <h2>{{ t('pauta.formatsTitle') }}</h2>
        </div>
        <p class="block__help block__help--wide">
          {{ t('pauta.formatsHelp') }}
        </p>
        <ol class="rank">
          <li
            v-for="f in formats"
            :key="f.name"
            class="rank__row"
          >
            <NuxtLink
              :to="localePath(`/contracts?search=${encodeURIComponent(f.name)}`)"
              class="rank__link"
            >
              <span class="rank__name">{{ f.name }}</span>
              <span class="rank__meta">{{ pct(f.share) }}</span>
              <MoneyAmount
                :amount="f.value"
                compact
                size="sm"
              />
            </NuxtLink>
          </li>
        </ol>
      </div>
    </section>

    <!-- Year trend -->
    <section
      v-if="byYear.length > 1"
      class="u-container block"
    >
      <div class="block__head">
        <h2>{{ t('pauta.byYearTitle') }}</h2>
        <p class="block__help">
          {{ t('pauta.byYearHelp') }}
        </p>
      </div>
      <div class="panel panel--pad">
        <YearBars
          :data="byYear"
          unit="money"
          :height="170"
        />
      </div>
    </section>

    <section class="u-container source">
      <p class="source__note">
        {{ t('pauta.sourceNote') }}
      </p>
      <NuxtLink
        :to="localePath('/gastos')"
        class="source__cta"
      >
        {{ t('recop.toGastos') }}
        <v-icon size="18">
          mdi-arrow-right
        </v-icon>
      </NuxtLink>
    </section>
  </div>
</template>

<style scoped>
.pauta { padding-bottom: var(--s-8); }

.phero {
  background:
    radial-gradient(1100px 380px at 85% -20%, color-mix(in srgb, var(--sol) 16%, transparent), transparent 70%),
    var(--ink);
  color: #eaf1f6;
  border-bottom: 1px solid var(--rule);
}

.phero__in { padding-block: clamp(var(--s-7), 6vw, var(--s-9)); }
.phero__eyebrow { color: var(--sol); }

.phero__title {
  margin: var(--s-3) 0 0;
  max-width: 20ch;
  font-family: var(--font-display);
  font-size: clamp(28px, 5vw, var(--t-3xl));
  font-stretch: 112%;
  line-height: 1.04;
  letter-spacing: -0.02em;
  color: #fff;
  text-wrap: balance;
}

.phero__lead {
  margin: var(--s-4) 0 0;
  max-width: 58ch;
  font-size: var(--t-md);
  line-height: 1.55;
  color: #b9c8d4;
}

/* KPIs */
.stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--s-4);
  margin-top: calc(var(--s-6) * -1);
  position: relative;
  z-index: 1;
}

.stat {
  display: flex;
  flex-direction: column;
  gap: var(--s-1);
  padding: var(--s-4) var(--s-5);
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-1);
}

.stat__n {
  font-family: var(--font-display);
  font-size: var(--t-2xl);
  font-weight: 700;
  font-stretch: 112%;
  line-height: 1;
  letter-spacing: -0.03em;
}

.stat__l { font-size: var(--t-sm); color: var(--text-muted); }

/* Blocks */
.block { margin-top: var(--s-8); }
.block--flush { margin-top: 0; }

.block__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--s-4);
  margin-bottom: var(--s-3);
}

.block__help {
  margin: 0 0 var(--s-4);
  font-size: var(--t-sm);
  color: var(--text-muted);
  text-align: right;
}

/* A subtitle under its heading: sits close, but never glued to it. */
.block__help--wide { max-width: 72ch; margin-top: 0; text-align: left; }

.block__note {
  margin: var(--s-3) 0 0;
  font-size: var(--t-xs);
  color: var(--text-muted);
  line-height: 1.5;
  max-width: 80ch;
}

.panel--pad { padding: var(--s-5); }

.cols {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--s-6);
  margin-top: var(--s-8);
}

/* Rank */
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

/* pos | name | share | money | chevron */
.rank__link {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto auto;
  align-items: center;
  gap: var(--s-3) var(--s-4);
  padding: var(--s-3) var(--s-4);
  text-decoration: none;
  color: inherit;
  transition: background var(--dur) var(--ease);
}

a.rank__link:hover { background: var(--surface-sunken); }
a.rank__link:hover .rank__go { color: var(--celeste-deep); transform: translateX(2px); }

/* buyers: name | money · formats: name | share | money (no pos/chevron) */
.cols .rank__link { grid-template-columns: minmax(0, 1fr) auto; }
.cols .block:last-child .rank__link { grid-template-columns: minmax(0, 1fr) auto auto; }

.rank__pos {
  font-size: var(--t-xs);
  color: var(--text-muted);
  min-width: 1.4em;
  text-align: right;
}

/* Names wrap fully — never truncate an entity to an unreadable "…". */
.rank__id { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.rank__nameline { display: flex; align-items: center; flex-wrap: wrap; gap: var(--s-2); }
.rank__name { font-size: var(--t-sm); font-weight: 600; line-height: 1.3; }
.rank__desc { font-size: var(--t-xs); color: var(--text-muted); line-height: 1.35; }

/* AI category chip — a quiet, neutral pill by default; media types tinted. */
.chip {
  display: inline-flex;
  align-items: center;
  padding: 1px var(--s-2);
  border-radius: var(--r-full);
  font-family: var(--font-mono);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--text-muted);
  background: var(--surface-sunken);
  border: 1px solid var(--rule);
  white-space: nowrap;
}

.chip--medio-tv,
.chip--medio-radio,
.chip--medio-prensa,
.chip--medio-digital,
.chip--medio-via-publica {
  color: var(--celeste-deep);
  background: var(--celeste-wash);
  border-color: color-mix(in srgb, var(--celeste) 40%, transparent);
}

.chip--agencia-publicidad,
.chip--productora {
  color: var(--verde);
  background: color-mix(in srgb, var(--verde) 10%, transparent);
  border-color: color-mix(in srgb, var(--verde) 34%, transparent);
}

.chip--organismo-publico {
  color: var(--text-muted);
  background: color-mix(in srgb, var(--ink) 8%, transparent);
  border-color: var(--rule-strong);
}

.rank__meta {
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  color: var(--text-muted);
  white-space: nowrap;
}

.rank__go {
  color: var(--text-muted);
  transition: color var(--dur) var(--ease), transform var(--dur) var(--ease);
}

/* Source */
.source {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-4);
  margin-top: var(--s-8);
  padding-top: var(--s-5);
  border-top: 1px solid var(--rule);
}

.source__note { margin: 0; font-size: var(--t-sm); color: var(--text-muted); max-width: 70ch; }
.source__cta {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  font-size: var(--t-sm);
  font-weight: 600;
  color: var(--celeste-deep);
  text-decoration: none;
}

@media (max-width: 900px) {
  .cols { grid-template-columns: 1fr; gap: var(--s-8); }
}

@media (max-width: 640px) {
  .stats { grid-template-columns: 1fr; margin-top: var(--s-5); }

  /* Rank rows become cards: full wrapping name, figures stacked, whole row taps. */
  .rank__link {
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: start;
    row-gap: 2px;
  }
  .rank__pos { grid-column: 1; grid-row: 1; }
  .rank__name { grid-column: 2; grid-row: 1; }
  .rank__link :deep(.money) { grid-column: 3; grid-row: 1; }
  .rank__meta { grid-column: 2; grid-row: 2; }
  .rank__go { display: none; }

  .cols .rank__link,
  .cols .block:last-child .rank__link {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
    row-gap: 2px;
  }
  .cols .rank__meta { grid-column: 1; grid-row: 2; }
}
</style>
