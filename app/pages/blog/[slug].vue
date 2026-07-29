<script setup lang="ts">
const { t, locale } = useI18n()
const localePath = useLocalePath()
const route = useRoute()

interface Expense {
  rank: number
  releaseId: string
  title: string
  buyerName?: string
  supplierNames: string[]
  amountUyu: number
  publishedAt: string
}

interface Finding {
  anomalyId: string
  releaseId: string
  type: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  description: string
  buyerName?: string
  supplierName?: string
  itemDescription?: string
  detectedValue: number
  expectedMin: number
  expectedMax: number
  currency?: string
  zScore?: number
  aiExplainable?: 'yes' | 'no' | 'uncertain'
  aiCategory?: string
}

interface Issue {
  weekKey: string
  slug: string
  title: string
  excerpt: string
  periodStart: string
  periodEnd: string
  publishedAt: string
  eligibleExpenseCount: number
  totalAmountUyu: number
  topExpenses: Expense[]
  anomalySummary: {
    total: number
    highCritical: number
    unexplained: number
    dataErrors: number
    pendingAiReview: number
    bySeverity: { low: number, medium: number, high: number, critical: number }
  }
  anomalyFindings: Finding[]
  analysis: { headline: string, overview: string[], spendingPatterns: string[], cautions: string[] }
  ai: { provider: 'gemini', model: string, generatedAt: string }
  methodology: { expenseScope: string, anomalyDisclaimer: string }
}

const slug = String(route.params.slug ?? '')
const { data: response, error } = await useFetch<{ data: Issue }>(`/api/blog/${encodeURIComponent(slug)}`)
if (error.value || !response.value?.data) {
  throw createError({ statusCode: 404, statusMessage: t('newsletter.notFound') })
}
const issue = computed(() => response.value!.data)

const formatter = computed(() => new Intl.DateTimeFormat(locale.value === 'en' ? 'en-GB' : 'es-UY', {
  timeZone: 'America/Montevideo',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
}))
const period = computed(() => `${formatter.value.format(new Date(issue.value.periodStart))} — ${formatter.value.format(new Date(new Date(issue.value.periodEnd).getTime() - 1))}`)

function severityLabel(severity: Finding['severity']): string {
  return t(`newsletter.severity.${severity}`)
}

function aiReviewLabel(finding: Finding): string {
  if (finding.aiCategory === 'error-carga' || finding.aiCategory === 'moneda-erronea') return t('newsletter.review.dataError')
  if (finding.aiExplainable === 'no') return t('newsletter.review.unexplained')
  if (finding.aiExplainable === 'yes') return t('newsletter.review.explained')
  return t('newsletter.review.pending')
}

const siteUrl = useRuntimeConfig().public.siteUrl as string
useSeo(() => ({
  title: issue.value.title,
  description: issue.value.excerpt,
  path: `/blog/${issue.value.slug}`,
  type: 'article',
  jsonLd: [{
    '@context': 'https://schema.org',
    '@type': 'Article',
    'headline': issue.value.title,
    'description': issue.value.excerpt,
    'datePublished': issue.value.publishedAt,
    'dateModified': issue.value.publishedAt,
    'mainEntityOfPage': `${siteUrl}/blog/${issue.value.slug}`,
    'author': { '@type': 'Organization', 'name': 'Con la tuya, contribuyente' },
  }],
}))
</script>

<template>
  <main class="issuepage">
    <header class="issuehero">
      <div class="u-container issuehero__inner">
        <NuxtLink
          :to="localePath('/blog')"
          class="issuehero__back"
        >
          <v-icon size="16">
            mdi-arrow-left
          </v-icon>
          {{ t('newsletter.archiveTitle') }}
        </NuxtLink>
        <div class="issuehero__register u-mono">
          <span>{{ t('newsletter.weeklyStamp') }} / {{ issue.weekKey }}</span>
          <span>{{ period }}</span>
        </div>
        <h1>{{ issue.title }}</h1>
        <p class="issuehero__excerpt">
          {{ issue.excerpt }}
        </p>
        <div class="issuehero__meta">
          <span>{{ t('newsletter.generatedWith', { model: issue.ai.model }) }}</span>
          <span>{{ t('newsletter.published', { date: formatter.format(new Date(issue.publishedAt)) }) }}</span>
        </div>
      </div>
    </header>

    <article class="u-container issuebody">
      <section class="lede">
        <p
          v-for="paragraph in issue.analysis.overview"
          :key="paragraph"
        >
          {{ paragraph }}
        </p>
        <div class="ai-note">
          <strong>{{ t('newsletter.aiLabel') }}</strong>
          <span>{{ t('newsletter.aiDisclosure') }}</span>
        </div>
      </section>

      <section class="factsline">
        <div class="factsline__money">
          <span class="u-eyebrow">{{ t('newsletter.weekTotal') }}</span>
          <MoneyAmount
            :amount="issue.totalAmountUyu"
            size="xl"
          />
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
            <dt>{{ t('newsletter.highCritical') }}</dt>
            <dd class="u-mono">
              {{ formatNumber(issue.anomalySummary.highCritical) }}
            </dd>
          </div>
        </dl>
      </section>

      <section class="section">
        <div class="section__head">
          <p class="u-eyebrow">
            {{ t('newsletter.rankingEyebrow') }}
          </p>
          <h2>{{ t('newsletter.rankingTitle') }}</h2>
          <p>{{ t('newsletter.rankingLead') }}</p>
        </div>
        <ol class="ledger">
          <li
            v-for="expense in issue.topExpenses"
            :id="`gasto-${expense.rank}`"
            :key="expense.releaseId"
            class="ledger__row"
          >
            <span class="ledger__rank u-mono">{{ String(expense.rank).padStart(2, '0') }}</span>
            <div class="ledger__identity">
              <NuxtLink :to="localePath(`/contracts/${expense.releaseId}`)">
                {{ expense.title }}
              </NuxtLink>
              <span>{{ expense.buyerName || t('newsletter.notReported') }}</span>
              <span>{{ expense.supplierNames.join(', ') || t('newsletter.notReported') }}</span>
            </div>
            <MoneyAmount
              :amount="expense.amountUyu"
              compact
              size="md"
            />
          </li>
        </ol>
      </section>

      <section class="section">
        <div class="section__head">
          <p class="u-eyebrow">
            {{ t('newsletter.patternsEyebrow') }}
          </p>
          <h2>{{ t('newsletter.patternsTitle') }}</h2>
        </div>
        <ul class="patterns">
          <li
            v-for="pattern in issue.analysis.spendingPatterns"
            :key="pattern"
          >
            {{ pattern }}
          </li>
        </ul>
      </section>

      <section class="section anomaly">
        <div class="section__head">
          <p class="u-eyebrow">
            {{ t('newsletter.anomaliesEyebrow') }}
          </p>
          <h2>{{ t('newsletter.anomaliesTitle') }}</h2>
          <p>{{ issue.methodology.anomalyDisclaimer }}</p>
        </div>
        <dl class="anomaly__summary">
          <div>
            <dt>{{ t('newsletter.unexplained') }}</dt>
            <dd>{{ formatNumber(issue.anomalySummary.unexplained) }}</dd>
          </div>
          <div>
            <dt>{{ t('newsletter.dataErrors') }}</dt>
            <dd>{{ formatNumber(issue.anomalySummary.dataErrors) }}</dd>
          </div>
          <div>
            <dt>{{ t('newsletter.pendingAi') }}</dt>
            <dd>{{ formatNumber(issue.anomalySummary.pendingAiReview) }}</dd>
          </div>
        </dl>
        <ul class="findings">
          <li
            v-for="finding in issue.anomalyFindings"
            :key="finding.anomalyId"
          >
            <div class="finding__top">
              <span
                class="finding__severity"
                :class="`finding__severity--${finding.severity}`"
              >{{ severityLabel(finding.severity) }}</span>
              <span class="finding__review">{{ aiReviewLabel(finding) }}</span>
            </div>
            <NuxtLink
              :to="localePath(`/contracts/${finding.releaseId}`)"
              class="finding__title"
            >
              {{ finding.itemDescription || finding.description }}
            </NuxtLink>
            <p>{{ finding.buyerName || t('newsletter.notReported') }} · {{ finding.supplierName || t('newsletter.notReported') }}</p>
            <div class="finding__range">
              <span>{{ t('newsletter.detected') }}</span>
              <MoneyAmount
                :amount="finding.detectedValue"
                :currency="finding.currency || 'UYU'"
                compact
                size="sm"
              />
              <span>{{ t('newsletter.expected') }}</span>
              <MoneyAmount
                :amount="finding.expectedMin"
                :currency="finding.currency || 'UYU'"
                compact
                size="sm"
              />
              <span>—</span>
              <MoneyAmount
                :amount="finding.expectedMax"
                :currency="finding.currency || 'UYU'"
                compact
                size="sm"
              />
            </div>
          </li>
        </ul>
      </section>

      <section class="section methodology">
        <div class="section__head">
          <p class="u-eyebrow">
            {{ t('newsletter.methodologyEyebrow') }}
          </p>
          <h2>{{ t('newsletter.methodologyTitle') }}</h2>
        </div>
        <p>{{ issue.methodology.expenseScope }}</p>
        <ul>
          <li
            v-for="caution in issue.analysis.cautions"
            :key="caution"
          >
            {{ caution }}
          </li>
        </ul>
      </section>

      <NewsletterSubscription />
    </article>
  </main>
</template>

<style scoped>
.issuepage { padding-bottom: var(--s-9); }
.issuehero { background: var(--ink); color: var(--ink-fg); border-bottom: 1px solid var(--ink-rule); }
.issuehero__inner { padding-block: var(--s-6) clamp(var(--s-7), 7vw, var(--s-9)); }
.issuehero__back { display: inline-flex; align-items: center; gap: var(--s-1); color: var(--ink-fg-dim); font-size: var(--t-sm); text-decoration: none; }
.issuehero__back:hover { color: var(--ink-fg); }
.issuehero__register { display: flex; flex-wrap: wrap; justify-content: space-between; gap: var(--s-3); margin-top: var(--s-7); padding-block: var(--s-2); border-block: 1px solid var(--ink-rule); color: var(--ink-fg-dim); font-size: var(--t-xs); text-transform: uppercase; }
.issuehero h1 { max-width: 22ch; margin: var(--s-5) 0 var(--s-3); font-family: var(--font-display); font-size: clamp(var(--t-2xl), 5vw, var(--t-3xl)); line-height: 1.07; text-wrap: balance; }
.issuehero__excerpt { max-width: 70ch; color: var(--ink-fg-dim); font-size: var(--t-lg); line-height: 1.55; }
.issuehero__meta { display: flex; flex-wrap: wrap; gap: var(--s-2) var(--s-5); margin-top: var(--s-5); color: var(--ink-fg-dim); font-size: var(--t-xs); }
.issuebody { display: grid; gap: var(--s-8); max-width: 1040px; padding-top: var(--s-7); }
.lede { max-width: 780px; font-size: var(--t-lg); line-height: 1.75; }
.lede > p { margin: 0 0 var(--s-4); }
.ai-note { display: flex; gap: var(--s-3); padding: var(--s-3); border-left: 3px solid var(--celeste-deep); background: var(--surface-sunken); color: var(--text-muted); font-size: var(--t-sm); line-height: 1.5; }
.ai-note strong { flex: none; color: var(--ink); }
.factsline { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(280px, .7fr); gap: var(--s-6); padding: var(--s-5); border: 1px solid var(--rule-strong); background: var(--surface); }
.factsline__money { display: grid; gap: var(--s-2); }
.factsline dl { display: grid; gap: var(--s-2); margin: 0; }
.factsline dl div { display: flex; align-items: baseline; justify-content: space-between; gap: var(--s-3); padding-bottom: var(--s-2); border-bottom: 1px solid var(--rule); }
.factsline dt { color: var(--text-muted); font-size: var(--t-sm); }
.factsline dd { margin: 0; font-size: var(--t-lg); font-weight: 700; }
.section { min-width: 0; }
.section__head { max-width: 760px; margin-bottom: var(--s-5); }
.section__head h2 { margin: var(--s-2) 0; font-family: var(--font-display); font-size: var(--t-2xl); line-height: 1.15; }
.section__head > p:not(.u-eyebrow) { color: var(--text-muted); line-height: 1.6; }
.ledger { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--rule-strong); }
.ledger__row { display: grid; grid-template-columns: 42px minmax(0, 1fr) auto; align-items: start; gap: var(--s-4); padding: var(--s-4) 0; border-bottom: 1px solid var(--rule); scroll-margin-top: var(--s-6); }
.ledger__rank { color: var(--text-muted); font-size: var(--t-sm); }
.ledger__identity { display: grid; gap: var(--s-1); min-width: 0; }
.ledger__identity a { color: var(--ink); font-weight: 700; line-height: 1.35; text-decoration: none; }
.ledger__identity a:hover { color: var(--celeste-deep); text-decoration: underline; }
.ledger__identity span { color: var(--text-muted); font-size: var(--t-xs); }
.patterns { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--s-3); list-style: none; margin: 0; padding: 0; }
.patterns li { padding: var(--s-4); border: 1px solid var(--rule); background: var(--surface); line-height: 1.55; }
.anomaly { padding: var(--s-5); border: 1px solid var(--rule-strong); background: var(--surface-sunken); }
.anomaly__summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--s-3); margin: 0 0 var(--s-5); }
.anomaly__summary div { padding: var(--s-3); border: 1px solid var(--rule); background: var(--surface); }
.anomaly__summary dt { color: var(--text-muted); font-size: var(--t-xs); }
.anomaly__summary dd { margin: var(--s-1) 0 0; font-family: var(--font-mono); font-size: var(--t-xl); }
.findings { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--s-3); list-style: none; margin: 0; padding: 0; }
.findings li { min-width: 0; padding: var(--s-4); border: 1px solid var(--rule); background: var(--surface); }
.finding__top { display: flex; flex-wrap: wrap; justify-content: space-between; gap: var(--s-2); margin-bottom: var(--s-3); font-size: var(--t-xs); }
.finding__severity { padding: 2px var(--s-2); border-radius: var(--r-sm); background: var(--surface-sunken); }
.finding__severity--high, .finding__severity--critical { color: var(--alerta); }
.finding__review { color: var(--text-muted); }
.finding__title { color: var(--ink); font-weight: 700; line-height: 1.4; text-decoration: none; }
.finding__title:hover { color: var(--celeste-deep); text-decoration: underline; }
.findings p { color: var(--text-muted); font-size: var(--t-xs); }
.finding__range { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s-1) var(--s-2); padding-top: var(--s-3); border-top: 1px solid var(--rule); color: var(--text-muted); font-size: var(--t-xs); }
.methodology { padding-top: var(--s-5); border-top: 1px solid var(--rule-strong); }
.methodology > p, .methodology li { color: var(--text-muted); line-height: 1.6; }
@media (max-width: 760px) {
  .factsline, .patterns, .findings { grid-template-columns: 1fr; }
  .anomaly__summary { grid-template-columns: 1fr; }
  .ledger__row { grid-template-columns: 32px minmax(0, 1fr); }
  .ledger__row > :last-child { grid-column: 2; }
  .ai-note { flex-direction: column; }
}
</style>
