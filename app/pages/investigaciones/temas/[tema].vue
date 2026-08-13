<script setup lang="ts">
/**
 * One theme of the caso collection — fourteen of these, one per front where
 * Uruguay's public money gets argued over.
 *
 * It exists so each subject has an indexable page of its own: a reader who
 * searches "salud mental presupuesto Uruguay" should land on the theme, not on
 * a hundred-card index they have to filter. Metadata only, no database — the
 * cross-references are resolved on the individual dossiers.
 */
const { t, locale } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const tema = computed(() => String(route.params.tema))

const { data: res } = await useFetch<any>(() => `/api/casos?theme=${encodeURIComponent(tema.value)}`)

const items = computed<any[]>(() => res.value?.data?.items ?? [])
const themes = computed<any[]>(() => res.value?.data?.themes ?? [])
const theme = computed(() => themes.value.find((th: any) => th.key === tema.value) ?? null)
const themeText = computed(() => (theme.value ? (locale.value === 'en' ? theme.value.en : theme.value.es) : null))
const others = computed(() => themes.value.filter((th: any) => th.key !== tema.value))

const sourceTotal = computed(() => items.value.reduce((a: number, i: any) => a + (i.sourceCount ?? 0), 0))

const siteUrl = useRuntimeConfig().public.siteUrl as string
const orgLd = useOrgLd()
const breadcrumbLd = themeText.value
  ? useBreadcrumbLd([
      { name: t('nav.investigaciones'), path: '/investigaciones' },
      { name: t('casos.indexTitle'), path: '/investigaciones/casos' },
      { name: themeText.value.label },
    ])
  : null

useSeo(() => ({
  title: themeText.value
    ? t('seo.casosTema.title', { theme: themeText.value.label })
    : t('seo.casos.title'),
  description: themeText.value?.dek ?? t('seo.casos.description'),
  path: `/investigaciones/temas/${tema.value}`,
  kicker: 'Investigaciones',
  noindex: !theme.value,
  jsonLd: theme.value
    ? [
        {
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          'name': themeText.value?.label,
          'description': themeText.value?.dek,
        },
        {
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          'numberOfItems': items.value.length,
          'itemListElement': items.value.map((i: any, idx: number) => ({
            '@type': 'ListItem',
            'position': idx + 1,
            'name': (locale.value === 'en' ? i.en : i.es).title,
            'url': `${siteUrl}/investigaciones/casos/${i.slug}`,
          })),
        },
        breadcrumbLd,
        orgLd,
      ]
    : [],
}))
</script>

<template>
  <div class="tema">
    <template v-if="theme">
      <section class="chero">
        <div class="chero__in u-container">
          <NuxtLink
            :to="localePath('/investigaciones/casos')"
            class="chero__back"
          >
            <v-icon size="16">
              mdi-arrow-left
            </v-icon>
            {{ t('casos.backToAll') }}
          </NuxtLink>
          <p class="u-eyebrow chero__eyebrow">
            <span class="chero__emoji">{{ theme.emoji }}</span>
            {{ t('casos.eyebrow') }}
          </p>
          <h1 class="chero__title">
            {{ themeText?.label }}
          </h1>
          <p class="chero__dek">
            {{ themeText?.dek }}
          </p>
          <p class="chero__meta u-mono">
            {{ t('casos.themePageLead', { n: items.length }) }} · {{ t('casos.sourcesTotal', { n: sourceTotal }) }}
          </p>
        </div>
      </section>

      <section class="u-container sec">
        <div class="cgrid">
          <CasoCard
            v-for="i in items"
            :key="i.slug"
            :item="i"
          />
        </div>
      </section>

      <section class="u-container sec">
        <div class="sec__head">
          <h2>{{ t('casos.themesTitle') }}</h2>
        </div>
        <div class="rel">
          <NuxtLink
            v-for="th in others"
            :key="th.key"
            :to="localePath(`/investigaciones/temas/${th.key}`)"
            class="relcard"
          >
            <span class="relcard__emoji">{{ th.emoji }}</span>
            <span class="relcard__t">{{ (locale === 'en' ? th.en : th.es).label }}</span>
            <span class="relcard__n u-mono">{{ th.count }}</span>
          </NuxtLink>
        </div>
        <NuxtLink
          :to="localePath('/investigaciones/casos')"
          class="sec__cta"
        >
          {{ t('casos.themeAllCta') }}
          <v-icon size="16">
            mdi-arrow-right
          </v-icon>
        </NuxtLink>
      </section>
    </template>

    <section
      v-else
      class="u-container notfound"
    >
      <h1 class="notfound__t">
        {{ t('casos.notFound.title') }}
      </h1>
      <p class="notfound__b">
        {{ t('casos.notFound.body') }}
      </p>
      <NuxtLink
        :to="localePath('/investigaciones/casos')"
        class="btn btn--primary"
      >
        {{ t('casos.notFound.action') }}
      </NuxtLink>
    </section>
  </div>
</template>

<style scoped>
.tema { padding-bottom: var(--s-9); }

.chero {
  background:
    radial-gradient(1000px 340px at 88% -20%, color-mix(in srgb, var(--celeste) 20%, transparent), transparent 70%),
    var(--ink);
  color: var(--ink-fg);
  border-bottom: 1px solid var(--rule);
}
.chero__in { padding-block: clamp(var(--s-6), 5vw, var(--s-8)); }
.chero__back {
  display: inline-flex;
  align-items: center;
  gap: var(--s-1);
  margin-bottom: var(--s-4);
  color: var(--ink-fg-dim);
  font-size: var(--t-sm);
  font-weight: 600;
  text-decoration: none;
}
.chero__back:hover { color: #fff; }
.chero__eyebrow { color: var(--sol); display: flex; align-items: center; gap: var(--s-2); }
.chero__emoji { font-size: 1.3em; }
.chero__title {
  margin: var(--s-3) 0 0;
  max-width: 22ch;
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
  max-width: 64ch;
  font-size: var(--t-md);
  line-height: 1.55;
  color: var(--ink-fg-dim);
}
.chero__meta { margin: var(--s-5) 0 0; font-size: var(--t-xs); color: var(--ink-fg-dim); }

.sec { margin-top: var(--s-8); }
.sec__head { margin-bottom: var(--s-4); }
.sec__head h2 { margin: 0; font-size: var(--t-lg); }
.sec__cta {
  display: inline-flex;
  align-items: center;
  gap: var(--s-1);
  margin-top: var(--s-5);
  font-size: var(--t-sm);
  font-weight: 600;
  color: var(--celeste-deep);
  text-decoration: none;
}
.sec__cta:hover { text-decoration: underline; }

.cgrid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: var(--s-5);
}

.rel { display: flex; flex-wrap: wrap; gap: var(--s-3); }
.relcard {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  padding: var(--s-2) var(--s-4);
  border: 1px solid var(--rule);
  border-radius: var(--r-md);
  background: var(--surface);
  color: var(--text);
  font-size: var(--t-sm);
  font-weight: 600;
  text-decoration: none;
  max-width: 100%;
  transition: border-color var(--dur) var(--ease), background var(--dur) var(--ease);
}
.relcard:hover { border-color: var(--celeste); background: var(--surface-sunken); }
.relcard__emoji { font-size: 1.15em; flex: 0 0 auto; }
.relcard__t { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.relcard__n { flex: 0 0 auto; font-size: var(--t-xs); color: var(--text-muted); }

.btn { display: inline-flex; align-items: center; gap: var(--s-2); padding: var(--s-3) var(--s-5); border-radius: var(--r-full); font-size: var(--t-sm); font-weight: 600; text-decoration: none; }
.btn--primary { background: var(--cta-fill); color: var(--cta-fg); }
.btn--primary:hover { filter: brightness(1.06); }
.notfound { padding-block: var(--s-9); text-align: center; }
.notfound__t { font-size: var(--t-2xl); margin: 0 0 var(--s-2); }
.notfound__b { color: var(--text-muted); margin: 0 0 var(--s-5); }

@media (max-width: 640px) {
  .cgrid { grid-template-columns: minmax(0, 1fr); }
}
</style>
