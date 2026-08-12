<script setup lang="ts">
const { t, locale } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const router = useRouter()

interface BlogIssueCard {
  weekKey: string
  slug: string
  title: string
  excerpt: string
  periodStart: string
  periodEnd: string
  publishedAt: string
  eligibleExpenseCount: number
  totalAmountUyu: number
  anomalySummary: { total: number, highCritical: number, unexplained: number }
  ai: { model: string }
}

interface BlogResponse {
  data: {
    items: BlogIssueCard[]
    pagination: { page: number, limit: number, total: number, pages: number }
  }
}

const page = computed(() => Math.max(1, Number(route.query.page) || 1))
const { data: response, status } = await useFetch<BlogResponse>('/api/blog', {
  query: computed(() => ({ page: page.value, limit: 12 })),
  watch: [page],
})
const issues = computed(() => response.value?.data.items ?? [])
const pages = computed(() => response.value?.data.pagination.pages ?? 1)

function periodLabel(issue: BlogIssueCard): string {
  const formatter = new Intl.DateTimeFormat(locale.value === 'en' ? 'en-GB' : 'es-UY', {
    timeZone: 'America/Montevideo',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
  return `${formatter.format(new Date(issue.periodStart))} — ${formatter.format(new Date(new Date(issue.periodEnd).getTime() - 1))}`
}

async function changePage(next: number): Promise<void> {
  await router.push({ query: next > 1 ? { page: String(next) } : {} })
  if (import.meta.client) window.scrollTo({ top: 0, behavior: 'smooth' })
}

const siteUrl = useRuntimeConfig().public.siteUrl as string
useSeo(() => ({
  title: t('seo.blog.title'),
  description: t('seo.blog.description'),
  path: '/blog',
  jsonLd: [{
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    'name': t('seo.blog.title'),
    'description': t('seo.blog.description'),
    'mainEntity': {
      '@type': 'ItemList',
      'itemListElement': issues.value.map((issue, index) => ({
        '@type': 'ListItem',
        'position': index + 1,
        'name': issue.title,
        'url': `${siteUrl}/blog/${issue.slug}`,
      })),
    },
  }],
}))
</script>

<template>
  <main class="blog">
    <header class="bloghero">
      <div class="u-container bloghero__inner">
        <div>
          <p class="u-eyebrow bloghero__eyebrow">
            {{ t('newsletter.eyebrow') }}
          </p>
          <h1>{{ t('newsletter.indexTitle') }}</h1>
          <p>{{ t('newsletter.indexLead') }}</p>
        </div>
        <div class="bloghero__stamp u-mono">
          <span>{{ t('newsletter.weeklyStamp') }}</span>
          <strong>{{ t('newsletter.everyMonday') }}</strong>
        </div>
      </div>
    </header>

    <div class="u-container blog__body">
      <NewsletterSubscription />

      <div
        v-if="status === 'pending'"
        class="blog__loading"
      >
        <v-progress-circular indeterminate />
      </div>
      <section
        v-else-if="issues.length"
        class="issues"
        :aria-label="t('newsletter.archiveTitle')"
      >
        <NuxtLink
          v-for="issue in issues"
          :key="issue.slug"
          :to="localePath(`/blog/${issue.slug}`)"
          class="issue"
        >
          <div class="issue__register">
            <span class="u-mono">{{ issue.weekKey }}</span>
            <span>{{ periodLabel(issue) }}</span>
          </div>
          <h2>{{ issue.title }}</h2>
          <p class="issue__excerpt">
            {{ issue.excerpt }}
          </p>
          <div class="issue__facts">
            <div>
              <MoneyAmount
                :amount="issue.totalAmountUyu"
                compact
                size="md"
              />
              <span>{{ t('newsletter.weekTotal') }}</span>
            </div>
            <dl>
              <div>
                <dt>{{ t('newsletter.awards') }}</dt>
                <dd class="u-mono">
                  {{ formatNumber(issue.eligibleExpenseCount) }}
                </dd>
              </div>
              <div>
                <dt>{{ t('newsletter.anomalySignals') }}</dt>
                <dd class="u-mono">
                  {{ formatNumber(issue.anomalySummary.total) }}
                </dd>
              </div>
              <div>
                <dt>{{ t('newsletter.unexplained') }}</dt>
                <dd class="u-mono">
                  {{ formatNumber(issue.anomalySummary.unexplained) }}
                </dd>
              </div>
            </dl>
          </div>
          <span class="issue__read">
            {{ t('newsletter.readIssue') }}
            <v-icon size="16">mdi-arrow-right</v-icon>
          </span>
        </NuxtLink>
      </section>
      <section
        v-else
        class="panel blog__empty"
      >
        <h2>{{ t('newsletter.emptyTitle') }}</h2>
        <p>{{ t('newsletter.emptyBody') }}</p>
      </section>

      <!-- `<DataPager>`, not `<v-pagination>`: a numbered pager needs 48px per
           page button and pushes the whole page sideways on a phone once the
           archive grows past a handful of issues. -->
      <DataPager
        v-if="pages > 1"
        :page="page"
        :total-pages="pages"
        class="blog__pager"
        @update:page="changePage"
      />
    </div>
  </main>
</template>

<style scoped>
.blog { padding-bottom: var(--s-9); }
.bloghero { background: var(--ink); color: var(--ink-fg); border-bottom: 1px solid var(--ink-rule); }
.bloghero__inner {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: var(--s-6);
  padding-block: clamp(var(--s-7), 7vw, var(--s-9));
}
.bloghero__eyebrow { color: var(--ink-fg-dim); }
.bloghero h1 { margin: var(--s-2) 0; max-width: 18ch; font-family: var(--font-display); font-size: clamp(var(--t-2xl), 5vw, var(--t-3xl)); line-height: 1.05; }
.bloghero p:not(.u-eyebrow) { max-width: 62ch; margin: 0; color: var(--ink-fg-dim); line-height: 1.6; }
.bloghero__stamp { display: grid; gap: var(--s-1); min-width: 170px; padding: var(--s-3); border: 1px solid var(--ink-rule); font-size: var(--t-xs); text-transform: uppercase; }
.bloghero__stamp strong { color: var(--ink-fg); font-size: var(--t-sm); }
.blog__body { display: grid; gap: var(--s-6); padding-top: var(--s-6); }
.blog__loading { display: grid; place-items: center; min-height: 220px; }
.issues { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--s-4); }
.issue {
  display: flex;
  min-width: 0;
  flex-direction: column;
  padding: var(--s-5);
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
  background: var(--surface);
  color: inherit;
  text-decoration: none;
  transition: border-color var(--dur) var(--ease), background var(--dur) var(--ease);
}
.issue:hover { border-color: var(--celeste-deep); background: var(--surface-sunken); }
.issue:focus-visible { outline: 3px solid var(--focus); outline-offset: 3px; }
.issue__register { display: flex; flex-wrap: wrap; justify-content: space-between; gap: var(--s-2); padding-bottom: var(--s-3); border-bottom: 1px solid var(--rule); color: var(--text-muted); font-size: var(--t-xs); }
.issue h2 { margin: var(--s-4) 0 var(--s-2); font-family: var(--font-display); font-size: var(--t-xl); line-height: 1.15; }
.issue__excerpt { flex: 1; margin: 0; color: var(--text-muted); line-height: 1.55; }
.issue__facts { display: grid; grid-template-columns: minmax(0, 1fr) minmax(190px, auto); gap: var(--s-4); margin-top: var(--s-5); padding-top: var(--s-4); border-top: 1px solid var(--rule); }
.issue__facts > div { display: flex; flex-direction: column; gap: var(--s-1); }
.issue__facts > div > span { color: var(--text-muted); font-size: var(--t-xs); }
.issue__facts dl { display: grid; gap: var(--s-1); margin: 0; }
.issue__facts dl div { display: flex; justify-content: space-between; gap: var(--s-3); }
.issue__facts dt { color: var(--text-muted); font-size: var(--t-xs); }
.issue__facts dd { margin: 0; font-size: var(--t-xs); }
.issue__read { display: inline-flex; align-items: center; align-self: flex-end; gap: var(--s-1); margin-top: var(--s-4); color: var(--celeste-deep); font-size: var(--t-sm); font-weight: 700; }
.blog__empty { padding: var(--s-6); text-align: center; }
.blog__empty h2 { margin-top: 0; }
.blog__empty p { margin-bottom: 0; color: var(--text-muted); }
.blog__pager { margin-top: var(--s-2); }
@media (max-width: 900px) {
  .issues { grid-template-columns: 1fr; }
}
@media (max-width: 640px) {
  .bloghero__inner { grid-template-columns: 1fr; align-items: start; }
  .bloghero__stamp { min-width: 0; }
  .issue__facts { grid-template-columns: 1fr; }
}
@media (prefers-reduced-motion: reduce) {
  .issue { transition: none; }
}
</style>
