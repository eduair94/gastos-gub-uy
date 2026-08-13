<script setup lang="ts">
/**
 * The caso collection — every dossier on questioned public investment, with a
 * theme grid over it and client-side filters.
 *
 * `/api/casos` returns metadata only and touches no database (see the handler
 * for why), so the whole list ships in one SSR payload and filtering is
 * instant and local — no request per keystroke.
 *
 * It IS paged, though. Rendering every dossier at once put 447KB of HTML on
 * the wire for a page whose first screen shows six cards, on a site that went
 * to the trouble of stripping 900KB of inlined CSS. Crawl coverage does not
 * depend on this page anyway: every dossier is in the sitemap and every one of
 * them is listed in full on its theme page.
 *
 * Filtered permutations are noindexed — the canonical index is the unfiltered
 * one, and each theme already has its own indexable page.
 */
const { t, locale } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const router = useRouter()

const { data: res } = await useFetch<any>('/api/casos')

const items = computed<any[]>(() => res.value?.data?.items ?? [])
const themes = computed<any[]>(() => res.value?.data?.themes ?? [])

function themeText(th: any) {
  return locale.value === 'en' ? th.en : th.es
}
const themeById = computed<Record<string, any>>(() =>
  Object.fromEntries(themes.value.map((th: any) => [th.key, th])))

const KINDS = ['judicial', 'auditoria', 'gestion', 'debate'] as const

// Filters live in the URL so a filtered view is a shareable link.
const theme = computed({
  get: () => (typeof route.query.tema === 'string' ? route.query.tema : ''),
  set: (v: string) => setQuery({ tema: v || undefined }),
})
const kind = computed({
  get: () => (typeof route.query.tipo === 'string' ? route.query.tipo : ''),
  set: (v: string) => setQuery({ tipo: v || undefined }),
})
const q = ref(typeof route.query.q === 'string' ? route.query.q : '')

function setQuery(patch: Record<string, string | undefined>) {
  // Rebuilt rather than mutated: an empty value must LEAVE the address bar, not
  // sit there as `?tema=`, and a filtered URL is the thing a reader shares.
  const merged = { ...route.query, ...patch }
  const next = Object.fromEntries(
    Object.entries(merged).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  )
  router.replace({ query: next })
}

const filtered = computed(() => {
  const needle = q.value.trim().toLowerCase()
  return items.value.filter((i: any) => {
    if (theme.value && i.theme !== theme.value) return false
    if (kind.value && i.statusKind !== kind.value) return false
    if (!needle) return true
    const txt = locale.value === 'en' ? i.en : i.es
    const hay = `${txt.title} ${txt.dek} ${(i.organisms ?? []).join(' ')} ${i.amountReported ?? ''}`.toLowerCase()
    return hay.includes(needle)
  })
})

const hasFilters = computed(() => Boolean(theme.value || kind.value || q.value.trim()))
function clearFilters() {
  q.value = ''
  router.replace({ query: {} })
}

const PER_PAGE = 24
const page = ref(1)
const totalPages = computed(() => Math.max(1, Math.ceil(filtered.value.length / PER_PAGE)))
const paged = computed(() => filtered.value.slice((page.value - 1) * PER_PAGE, page.value * PER_PAGE))
// Narrowing the set while parked on page 7 would show an empty grid and read
// as "no results" for a filter that has plenty.
watch(filtered, () => {
  page.value = 1
})

const sourceTotal = computed(() => items.value.reduce((a: number, i: any) => a + (i.sourceCount ?? 0), 0))

const siteUrl = useRuntimeConfig().public.siteUrl as string
const orgLd = useOrgLd()

useSeo(() => ({
  title: t('seo.casos.title'),
  description: t('seo.casos.description'),
  path: '/investigaciones/casos',
  kicker: 'Investigaciones',
  noindex: hasFilters.value,
  jsonLd: [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      'name': t('seo.casos.title'),
      'description': t('seo.casos.description'),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      'numberOfItems': items.value.length,
      'itemListElement': items.value.slice(0, 100).map((i: any, idx: number) => ({
        '@type': 'ListItem',
        'position': idx + 1,
        'name': (locale.value === 'en' ? i.en : i.es).title,
        'url': `${siteUrl}/investigaciones/casos/${i.slug}`,
      })),
    },
    orgLd,
  ],
}))
</script>

<template>
  <div class="casos">
    <!-- Hero -->
    <RecordHero
      :eyebrow="t('casos.eyebrow')"
      :title="t('casos.indexTitle')"
      :dek="t('casos.indexLead')"
      :back-to="localePath('/investigaciones')"
      :back-label="t('casos.backToHub')"
    >
      <div class="hero__stats">
        <div class="hero__stat">
          <b>{{ formatNumber(items.length) }}</b>
          <span>{{ t('casos.count', { n: items.length }) }}</span>
        </div>
        <div class="hero__stat">
          <b>{{ formatNumber(sourceTotal) }}</b>
          <span>{{ t('casos.sourcesTotal', { n: sourceTotal }) }}</span>
        </div>
        <div class="hero__stat">
          <b>{{ themes.length }}</b>
          <span>{{ t('casos.themesTitle') }}</span>
        </div>
      </div>
      <p class="hero__disclaimer">
        <v-icon size="15">
          mdi-scale-balance
        </v-icon>
        {{ t('casos.disclaimer') }}
      </p>
    </RecordHero>

    <!-- Theme grid -->
    <section class="u-container sec">
      <div class="sec__head">
        <h2>{{ t('casos.themesTitle') }}</h2>
        <p>{{ t('casos.themesLead') }}</p>
      </div>
      <div class="tgrid">
        <NuxtLink
          v-for="th in themes"
          :key="th.key"
          :to="localePath(`/investigaciones/temas/${th.key}`)"
          class="tcard"
        >
          <span class="tcard__emoji">{{ th.emoji }}</span>
          <span class="tcard__body">
            <span class="tcard__t">{{ themeText(th).label }}</span>
            <span class="tcard__d">{{ themeText(th).dek }}</span>
          </span>
          <span class="tcard__n u-mono">{{ th.count }}</span>
        </NuxtLink>
      </div>
    </section>

    <!-- Filters -->
    <section class="u-container sec">
      <div class="sec__head">
        <h2>{{ t('casos.filters.title') }}</h2>
      </div>

      <div class="fbar">
        <div class="fgroup">
          <p class="fgroup__l">
            {{ t('casos.filters.theme') }}
          </p>
          <div class="fchips">
            <button
              type="button"
              class="fchip"
              :class="!theme && 'fchip--on'"
              @click="theme = ''"
            >
              {{ t('casos.filters.all') }}
            </button>
            <button
              v-for="th in themes"
              :key="th.key"
              type="button"
              class="fchip"
              :class="theme === th.key && 'fchip--on'"
              @click="theme = theme === th.key ? '' : th.key"
            >
              {{ th.emoji }} {{ themeText(th).label }}
            </button>
          </div>
        </div>

        <div class="fgroup">
          <p class="fgroup__l">
            {{ t('casos.filters.kind') }}
          </p>
          <div class="fchips">
            <button
              type="button"
              class="fchip"
              :class="!kind && 'fchip--on'"
              @click="kind = ''"
            >
              {{ t('casos.filters.all') }}
            </button>
            <button
              v-for="k in KINDS"
              :key="k"
              type="button"
              class="fchip"
              :class="kind === k && 'fchip--on'"
              @click="kind = kind === k ? '' : k"
            >
              {{ t(`casos.kind.${k}`) }}
            </button>
          </div>
        </div>

        <div class="fgroup fgroup--search">
          <label
            class="fgroup__l"
            for="caso-q"
          >{{ t('casos.filters.search') }}</label>
          <input
            id="caso-q"
            v-model="q"
            type="search"
            class="fsearch"
            :placeholder="t('casos.filters.searchPlaceholder')"
          >
        </div>
      </div>

      <div class="fmeta">
        <span class="u-mono">{{ t('casos.filters.results', { n: filtered.length, total: items.length }) }}</span>
        <button
          v-if="hasFilters"
          type="button"
          class="fclear"
          @click="clearFilters"
        >
          {{ t('casos.filters.clear') }}
        </button>
      </div>
    </section>

    <!-- Results -->
    <section
      id="casos-results"
      class="u-container sec"
    >
      <template v-if="filtered.length">
        <div class="cgrid">
          <CasoCard
            v-for="i in paged"
            :key="i.slug"
            :item="i"
            :theme-emoji="themeById[i.theme]?.emoji"
            :theme-label="themeById[i.theme] ? themeText(themeById[i.theme]).label : undefined"
          />
        </div>
        <DataPager
          v-if="totalPages > 1"
          v-model:page="page"
          :total-pages="totalPages"
          scroll-target-id="casos-results"
          class="pager"
        />
      </template>
      <div
        v-else
        class="empty"
      >
        <p>{{ t('casos.filters.empty') }}</p>
        <button
          type="button"
          class="btn btn--primary"
          @click="clearFilters"
        >
          {{ t('casos.filters.emptyAction') }}
        </button>
      </div>
    </section>

    <!-- Method -->
    <section class="u-container sec">
      <div class="method">
        <h2 class="method__t">
          {{ t('casos.method.title') }}
        </h2>
        <p class="method__b">
          {{ t('casos.method.body') }}
        </p>
        <div class="method__cols">
          <div>
            <h3>{{ t('casos.method.sourcesTitle') }}</h3>
            <p>{{ t('casos.method.sourcesBody') }}</p>
          </div>
          <div>
            <h3>{{ t('casos.method.correctionsTitle') }}</h3>
            <p>{{ t('casos.method.correctionsBody') }}</p>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.casos { padding-bottom: var(--s-9); }

/* padding-block, never the `padding` shorthand: this element also carries
   .u-container, whose padding-inline IS the page gutter, and a shorthand here
   outranks it and flushes the page against the phone's edge. */
.hero__stats { display: flex; flex-wrap: wrap; gap: var(--s-6); margin-top: var(--s-6); }
.hero__stat { display: flex; flex-direction: column; gap: 2px; }
.hero__stat b {
  font-family: var(--font-display);
  font-size: var(--t-2xl);
  font-stretch: 112%;
  line-height: 1;
  color: #fff;
}
.hero__stat span { font-size: var(--t-xs); color: var(--ink-fg-dim); }
.hero__disclaimer {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  margin: var(--s-6) 0 0;
  padding: var(--s-2) var(--s-3);
  border: 1px solid color-mix(in srgb, #fff 18%, transparent);
  border-radius: var(--r-md);
  font-size: var(--t-xs);
  color: #cdd9e2;
  max-width: 78ch;
  line-height: 1.5;
}

.sec { margin-top: var(--s-8); }
.sec__head { margin-bottom: var(--s-5); }
.sec__head h2 { margin: 0 0 var(--s-2); font-size: var(--t-xl); }
.sec__head p { margin: 0; max-width: 70ch; font-size: var(--t-sm); color: var(--text-muted); }

/* Theme grid */
.tgrid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--s-4);
}
.tcard {
  display: flex;
  align-items: flex-start;
  gap: var(--s-3);
  padding: var(--s-4);
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
  text-decoration: none;
  color: inherit;
  transition: border-color var(--dur) var(--ease), background var(--dur) var(--ease);
}
.tcard:hover { border-color: var(--celeste); background: var(--surface-sunken); }
.tcard__emoji { font-size: 1.5rem; line-height: 1.2; flex: 0 0 auto; }
.tcard__body { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1 1 auto; }
.tcard__t { font-size: var(--t-sm); font-weight: 700; }
.tcard__d { font-size: var(--t-xs); color: var(--text-muted); line-height: 1.45; }
.tcard__n {
  flex: 0 0 auto;
  font-size: var(--t-xs);
  font-weight: 700;
  color: var(--celeste-deep);
  background: var(--celeste-wash);
  border-radius: var(--r-full);
  padding: 1px var(--s-2);
}

/* Filters */
.fbar { display: flex; flex-direction: column; gap: var(--s-5); }
.fgroup { display: flex; flex-direction: column; gap: var(--s-2); min-width: 0; }
.fgroup__l {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}
.fchips { display: flex; flex-wrap: wrap; gap: var(--s-2); }
.fchip {
  padding: var(--s-1) var(--s-3);
  border: 1px solid var(--rule);
  border-radius: var(--r-full);
  background: var(--surface);
  color: var(--text);
  font-size: var(--t-xs);
  font-weight: 600;
  cursor: pointer;
  transition: border-color var(--dur) var(--ease), background var(--dur) var(--ease);
}
.fchip:hover { border-color: var(--celeste); }
.fchip--on { background: var(--celeste-wash); border-color: var(--celeste); color: var(--celeste-deep); }
.fgroup--search { max-width: 420px; }
.fsearch {
  width: 100%;
  padding: var(--s-2) var(--s-3);
  border: 1px solid var(--rule);
  border-radius: var(--r-md);
  background: var(--surface);
  color: var(--text);
  font-size: var(--t-sm);
}
.fsearch:focus { outline: 2px solid var(--celeste); outline-offset: 1px; }
.fmeta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-4);
  flex-wrap: wrap;
  margin-top: var(--s-5);
  padding-top: var(--s-3);
  border-top: 1px solid var(--rule);
  font-size: var(--t-xs);
  color: var(--text-muted);
}
.fclear {
  border: 0;
  background: none;
  padding: 0;
  color: var(--celeste-deep);
  font-size: var(--t-xs);
  font-weight: 600;
  cursor: pointer;
}
.fclear:hover { text-decoration: underline; }

/* Results */
.cgrid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: var(--s-5);
}
.pager { margin-top: var(--s-6); }
.empty { padding-block: var(--s-8); text-align: center; }
.empty p { margin: 0 0 var(--s-4); color: var(--text-muted); }

.btn {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  padding: var(--s-3) var(--s-5);
  border: 0;
  border-radius: var(--r-full);
  font-size: var(--t-sm);
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
}
.btn--primary { background: var(--cta-fill); color: var(--cta-fg); }
.btn--primary:hover { filter: brightness(1.06); }

.method {
  padding: clamp(var(--s-5), 4vw, var(--s-6));
  background: var(--surface-sunken);
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
}
.method__t { margin: 0 0 var(--s-3); font-size: var(--t-lg); }
.method__b { margin: 0 0 var(--s-5); font-size: var(--t-sm); color: var(--text-muted); max-width: 80ch; line-height: 1.6; }
.method__cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: var(--s-5); }
.method__cols h3 { margin: 0 0 var(--s-2); font-size: var(--t-sm); }
.method__cols p { margin: 0; font-size: var(--t-xs); color: var(--text-muted); line-height: 1.6; }

@media (max-width: 640px) {
  .cgrid, .tgrid { grid-template-columns: minmax(0, 1fr); }
}
</style>
