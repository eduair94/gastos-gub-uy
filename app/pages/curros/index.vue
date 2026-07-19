<script setup lang="ts">
/**
 * Curros index — documented procurement cases, each cross-referenced with the
 * live data. Every card carries its legal status and its source count; the money
 * shown is what the state spent with the entities named in the case (a
 * cross-reference, not a verdict). Cards + figures come from /api/curros; the
 * cases themselves live in server/utils/curros.ts.
 */
const { t, locale } = useI18n()
const localePath = useLocalePath()

const { data: res } = await useFetch<any>('/api/curros')
const items = computed<any[]>(() => res.value?.data?.items ?? [])

function itemText(i: any) {
  return locale.value === 'en' ? i.en : i.es
}
function statusLabel(s: string) {
  return t(`curros.status.${s}`)
}

useSeo(() => ({
  title: t('seo.curros.title'),
  description: t('seo.curros.description'),
  path: '/curros',
}))
</script>

<template>
  <div class="curros">
    <!-- Hero -->
    <section class="chero">
      <div class="chero__in u-container">
        <p class="u-eyebrow chero__eyebrow">
          {{ t('curros.eyebrow') }}
        </p>
        <h1 class="chero__title">
          {{ t('curros.indexTitle') }}
        </h1>
        <p class="chero__dek">
          {{ t('curros.indexLead') }}
        </p>
        <p class="chero__disclaimer">
          <v-icon size="15">
            mdi-scale-balance
          </v-icon>
          {{ t('curros.disclaimer') }}
        </p>
      </div>
    </section>

    <!-- Cards -->
    <section class="u-container grid">
      <NuxtLink
        v-for="i in items"
        :key="i.slug"
        :to="localePath(`/curros/${i.slug}`)"
        class="card"
      >
        <div class="card__top">
          <span class="card__emoji">{{ i.emoji }}</span>
          <StatusChip
            :status="i.status"
            :label="statusLabel(i.status)"
          />
        </div>
        <h2 class="card__title">
          {{ itemText(i).title }}
        </h2>
        <p class="card__dek">
          {{ itemText(i).dek }}
        </p>
        <div class="card__meta">
          <span
            v-if="i.period"
            class="u-mono card__period"
          >{{ i.period }}</span>
          <span class="card__srcs">
            <v-icon size="13">mdi-link-variant</v-icon>
            {{ t('curros.card.sources', { n: i.sourceCount }) }}
          </span>
        </div>
        <div class="card__foot">
          <div class="card__money">
            <MoneyAmount
              :amount="i.total"
              compact
              size="md"
            />
            <span class="card__moneyl">{{ t('curros.card.crossRef') }}</span>
          </div>
          <span class="card__count u-mono">{{ t('curros.card.count', { n: formatNumber(i.count) }) }}</span>
        </div>
      </NuxtLink>
    </section>

    <!-- Method -->
    <section class="u-container method">
      <h2 class="method__t">
        {{ t('curros.methodTitle') }}
      </h2>
      <p class="method__b">
        {{ t('curros.methodBody') }}
      </p>
      <div class="method__links">
        <NuxtLink
          :to="localePath('/investigaciones')"
          class="method__link"
        >
          {{ t('curros.toInvestigaciones') }}
          <v-icon size="16">
            mdi-arrow-right
          </v-icon>
        </NuxtLink>
        <NuxtLink
          :to="localePath('/gastos')"
          class="method__link"
        >
          {{ t('curros.toGastos') }}
          <v-icon size="16">
            mdi-arrow-right
          </v-icon>
        </NuxtLink>
      </div>
    </section>
  </div>
</template>

<style scoped>
.curros { padding-bottom: var(--s-9); }

.chero {
  background:
    radial-gradient(1000px 340px at 88% -20%, color-mix(in srgb, var(--ink-alerta) 22%, transparent), transparent 70%),
    var(--ink);
  color: var(--ink-fg);
  border-bottom: 1px solid var(--rule);
}

.chero__in { padding-block: clamp(var(--s-7), 6vw, var(--s-9)); }
.chero__eyebrow { color: var(--sol); }

.chero__title {
  margin: var(--s-3) 0 0;
  max-width: 20ch;
  font-family: var(--font-display);
  font-size: clamp(28px, 5vw, var(--t-3xl));
  font-stretch: 112%;
  line-height: 1.05;
  letter-spacing: -0.02em;
  color: #fff;
  text-wrap: balance;
}

.chero__dek {
  margin: var(--s-4) 0 0;
  max-width: 60ch;
  font-size: var(--t-md);
  line-height: 1.55;
  color: var(--ink-fg-dim);
}

.chero__disclaimer {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  margin: var(--s-5) 0 0;
  padding: var(--s-2) var(--s-3);
  border: 1px solid color-mix(in srgb, #fff 18%, transparent);
  border-radius: var(--r-md);
  font-size: var(--t-xs);
  color: #cdd9e2;
  max-width: 68ch;
  line-height: 1.5;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: var(--s-5);
  margin-top: var(--s-7);
}

.card {
  display: flex;
  flex-direction: column;
  padding: var(--s-5);
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-1);
  text-decoration: none;
  color: inherit;
  transition: border-color var(--dur) var(--ease), transform var(--dur) var(--ease), box-shadow var(--dur) var(--ease);
}

.card:hover {
  border-color: var(--celeste);
  transform: translateY(-2px);
  box-shadow: var(--shadow-2);
}

.card__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-3);
  margin-bottom: var(--s-3);
}

.card__emoji { font-size: 2rem; line-height: 1; }

.card__title { margin: 0 0 var(--s-2); font-size: var(--t-lg); line-height: 1.2; }
.card__dek {
  margin: 0 0 var(--s-3);
  font-size: var(--t-sm);
  color: var(--text-muted);
  line-height: 1.5;
  flex: 1 1 auto;
}

.card__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-3);
  margin-bottom: var(--s-3);
}
.card__period { font-size: var(--t-xs); color: var(--text-muted); }
.card__srcs {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--t-xs);
  color: var(--celeste-deep);
  font-weight: 600;
}

.card__foot {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--s-3);
  padding-top: var(--s-4);
  border-top: 1px solid var(--rule);
}
.card__money { display: flex; flex-direction: column; gap: 2px; }
.card__moneyl { font-size: var(--t-2xs, 11px); color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.03em; }
.card__count { font-size: var(--t-xs); color: var(--text-muted); }

.method {
  margin-top: var(--s-8);
  padding: clamp(var(--s-5), 4vw, var(--s-6));
  background: var(--surface-sunken);
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
}
.method__t { margin: 0 0 var(--s-2); font-size: var(--t-lg); }
.method__b { margin: 0 0 var(--s-4); font-size: var(--t-sm); color: var(--text-muted); max-width: 72ch; }
.method__links { display: flex; flex-wrap: wrap; gap: var(--s-5); }
.method__link {
  display: inline-flex;
  align-items: center;
  gap: var(--s-1);
  font-size: var(--t-sm);
  font-weight: 600;
  color: var(--celeste-deep);
  text-decoration: none;
}
.method__link:hover { text-decoration: underline; }

@media (max-width: 640px) {
  .grid { grid-template-columns: 1fr; }
}
</style>
