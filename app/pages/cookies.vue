<script setup lang="ts">
import { getCookieRows } from '~/utils/legal-content'

const { locale, t } = useI18n()
const { track } = useAnalytics()
const { state, reopen } = useConsent()

const rows = computed(() => getCookieRows(locale.value === 'en' ? 'en' : 'es'))
const cookieColumns = computed(() => [
  { key: 'name', label: t('cookiesPage.colName'), primary: true, mono: true },
  { key: 'purpose', label: t('cookiesPage.colPurpose') },
  { key: 'duration', label: t('cookiesPage.colDuration') },
  { key: 'kind', label: t('cookiesPage.colKind') },
])

const orgLd = useOrgLd()

useSeo(() => ({
  title: t('cookiesPage.title'),
  description: t('cookiesPage.desc'),
  path: '/cookies',
  jsonLd: {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    'name': t('cookiesPage.title'),
    'description': t('cookiesPage.desc'),
    'isPartOf': orgLd,
  },
}))

const statusLabel = computed(() => {
  if (state.value === 'granted') return t('cookiesPage.stateGranted')
  if (state.value === 'denied') return t('cookiesPage.stateDenied')
  return t('cookiesPage.stateUnset')
})

function changeDecision() {
  track('consent_reopen')
  reopen()
}
</script>

<template>
  <div class="u-container page">
    <article class="ck">
      <header class="ck__head">
        <h1>{{ t('cookiesPage.title') }}</h1>
        <p class="ck__updated u-mono">
          {{ t('legalPage.updated', { date: t('cookiesPage.updated') }) }}
        </p>
      </header>

      <div class="ck__intro">
        <p>{{ t('cookiesPage.intro') }}</p>
      </div>

      <section class="ck__sec">
        <h2>{{ t('cookiesPage.howTitle') }}</h2>
        <p>{{ t('cookiesPage.howUnset') }}</p>
        <p>{{ t('cookiesPage.howGranted') }}</p>
        <p>{{ t('cookiesPage.howDenied') }}</p>
      </section>

      <!-- Current decision + a way to change it. ClientOnly because the state
           is read from localStorage; SSR would render a stale value. -->
      <section class="ck__sec">
        <h2>{{ t('cookiesPage.decisionTitle') }}</h2>
        <ClientOnly>
          <div class="ck__decision">
            <p class="ck__status">
              {{ t('cookiesPage.stateLabel') }}
              <strong>{{ statusLabel }}</strong>
            </p>
            <button
              type="button"
              class="ck__btn"
              @click="changeDecision"
            >
              {{ t('cookiesPage.change') }}
            </button>
          </div>
          <template #fallback>
            <p class="ck__status u-muted">
              {{ t('cookiesPage.stateLabel') }} …
            </p>
          </template>
        </ClientOnly>
      </section>

      <section class="ck__sec">
        <h2>{{ t('cookiesPage.tableTitle') }}</h2>
        <DataTable
          :columns="cookieColumns"
          :rows="rows"
          :row-key="row => row.name"
          min-width="640px"
        >
          <template #cell:name="{ row }">
            <span class="ck__name">{{ row.name }}</span>
          </template>
          <template #cell:purpose="{ row }">
            {{ row.purpose }}
          </template>
          <template #cell:duration="{ row }">
            <span class="ck__dur">{{ row.duration }}</span>
          </template>
          <template #cell:kind="{ row }">
            <span
              class="tag"
              :class="row.kind === 'measure' ? 'tag--celeste' : 'tag--neutral'"
            >
              {{ row.kind === 'measure' ? t('cookiesPage.kindMeasure') : t('cookiesPage.kindNecessary') }}
            </span>
          </template>
        </DataTable>
      </section>

      <section class="ck__sec">
        <h2>{{ t('cookiesPage.moreTitle') }}</h2>
        <p>
          {{ t('cookiesPage.moreBody') }}
          <NuxtLink :to="useLocalePath()('/privacidad')">
            {{ t('footer.privacy') }}
          </NuxtLink>.
        </p>
      </section>
    </article>
  </div>
</template>

<style scoped>
.page { padding-block: var(--s-7) var(--s-8); }
.ck { max-width: 72ch; }

.ck__head { margin-bottom: var(--s-6); }
.ck__head h1 { margin: 0 0 var(--s-2); }

.ck__updated {
  margin: 0;
  font-size: var(--t-xs);
  color: var(--text-muted);
  letter-spacing: 0.02em;
}

.ck__intro p { margin: 0; color: var(--text); line-height: 1.7; }

.ck__sec {
  margin-top: var(--s-6);
  padding-top: var(--s-6);
  border-top: 1px solid var(--rule);
}

.ck__sec h2 { margin: 0 0 var(--s-3); font-size: var(--t-xl); }
.ck__sec p { margin: 0 0 var(--s-3); color: var(--text-muted); line-height: 1.7; }
.ck__sec p:last-child { margin-bottom: 0; }
.ck__sec a { color: var(--celeste-deep); text-decoration: underline; }

.ck__decision {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-4);
  flex-wrap: wrap;
  padding: var(--s-4);
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
  background: var(--surface);
}

.ck__status { margin: 0 !important; color: var(--text); }

.ck__btn {
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  letter-spacing: 0.02em;
  padding: var(--s-2) var(--s-4);
  border-radius: var(--r-sm);
  border: 1px solid var(--ink);
  background: var(--ink);
  color: var(--paper);
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.ck__btn:hover { background: var(--celeste-deep); border-color: var(--celeste-deep); }
.ck__btn:focus-visible { outline: 2px solid var(--celeste); outline-offset: 2px; }

.ck__name { white-space: nowrap; color: var(--text); }
.ck__dur { white-space: nowrap; }
</style>
