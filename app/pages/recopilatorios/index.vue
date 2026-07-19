<script setup lang="ts">
/**
 * Recopilatorios index — the front door to the event-driven compilations.
 * Each card is a curated event with its live total and contract count, pulled
 * from /api/recopilatorios. The pieces themselves live in
 * server/utils/recopilatorios.ts.
 */
const { t, locale } = useI18n()
const localePath = useLocalePath()

const { data: res } = await useFetch<any>('/api/recopilatorios')
const items = computed<any[]>(() => res.value?.data?.items ?? [])

function itemText(i: any) {
  return locale.value === 'en' ? i.en : i.es
}

useSeo(() => ({
  title: t('seo.recop.title'),
  description: t('seo.recop.description'),
  path: '/recopilatorios',
}))
</script>

<template>
  <div class="recops">
    <!-- Hero -->
    <section class="rhero">
      <div class="rhero__in u-container">
        <p class="u-eyebrow rhero__eyebrow">
          {{ t('recop.eyebrow') }}
        </p>
        <h1 class="rhero__title">
          {{ t('recop.indexTitle') }}
        </h1>
        <p class="rhero__dek">
          {{ t('recop.indexLead') }}
        </p>
      </div>
    </section>

    <!-- Cards -->
    <section class="u-container grid">
      <NuxtLink
        v-for="i in items"
        :key="i.slug"
        :to="localePath(`/recopilatorios/${i.slug}`)"
        class="card"
      >
        <div class="card__top">
          <span class="card__emoji">{{ i.emoji }}</span>
          <span
            v-if="i.period"
            class="card__period u-mono"
          >{{ i.period }}</span>
        </div>
        <h2 class="card__title">
          {{ itemText(i).title }}
        </h2>
        <p class="card__dek">
          {{ itemText(i).dek }}
        </p>
        <div class="card__foot">
          <MoneyAmount
            :amount="i.total"
            compact
            size="md"
          />
          <span class="card__count u-mono">{{ t('recop.card.count', { n: formatNumber(i.count) }) }}</span>
        </div>
      </NuxtLink>
    </section>

    <section class="u-container method">
      <h2 class="method__t">
        {{ t('recop.methodTitle') }}
      </h2>
      <p class="method__b">
        {{ t('recop.methodBody') }}
      </p>
      <NuxtLink
        :to="localePath('/gastos')"
        class="method__link"
      >
        {{ t('recop.toGastos') }}
        <v-icon size="16">
          mdi-arrow-right
        </v-icon>
      </NuxtLink>
    </section>
  </div>
</template>

<style scoped>
.recops { padding-bottom: var(--s-9); }

.rhero {
  background:
    radial-gradient(1000px 340px at 88% -20%, color-mix(in srgb, var(--sol) 15%, transparent), transparent 70%),
    var(--ink);
  color: #eaf1f6;
  border-bottom: 1px solid var(--rule);
}

/* Full container width (pinned by .u-container) so the left edge lines up with
   the cards below; the measure is capped per child, never on the whole block. */
.rhero__in {
  padding-block: clamp(var(--s-7), 6vw, var(--s-9));
}

.rhero__eyebrow { color: var(--sol); }

.rhero__title {
  margin: var(--s-3) 0 0;
  max-width: 18ch;
  font-family: var(--font-display);
  font-size: clamp(28px, 5vw, var(--t-3xl));
  font-stretch: 112%;
  line-height: 1.05;
  letter-spacing: -0.02em;
  color: #fff;
  text-wrap: balance;
}

.rhero__dek {
  margin: var(--s-4) 0 0;
  max-width: 56ch;
  font-size: var(--t-md);
  line-height: 1.55;
  color: #b9c8d4;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
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
  margin-bottom: var(--s-3);
}

.card__emoji { font-size: 2rem; line-height: 1; }
.card__period { font-size: var(--t-xs); color: var(--text-muted); }

.card__title { margin: 0 0 var(--s-2); font-size: var(--t-lg); line-height: 1.2; }
.card__dek {
  margin: 0 0 var(--s-4);
  font-size: var(--t-sm);
  color: var(--text-muted);
  line-height: 1.5;
  flex: 1 1 auto;
}

.card__foot {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--s-3);
  padding-top: var(--s-4);
  border-top: 1px solid var(--rule);
}

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
</style>
