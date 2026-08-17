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

// PAGINA, y no es opcional. El endpoint devuelve 24 fichas por página, así que sin paginador
// un tema grande mostraba 24 y escondía el resto sin decirlo. Los catorce temas curados tienen
// diez fichas cada uno, pero los temas ARMADOS tienen cientos.
const PER_PAGE = 24
const page = ref(1)
watch(tema, () => {
  page.value = 1
})

const { data: res } = await useFetch<any>('/api/casos', {
  query: computed(() => ({ theme: tema.value, page: page.value, perPage: PER_PAGE })),
})

const items = computed<any[]>(() => res.value?.data?.items ?? [])
const themes = computed<any[]>(() => res.value?.data?.themes ?? [])
const totalPages = computed<number>(() => res.value?.data?.totalPages ?? 1)
/** El total del tema, que NO es lo que vino en esta página. */
const total = computed<number>(() => res.value?.data?.total ?? 0)
const theme = computed(() => themes.value.find((th: any) => th.key === tema.value) ?? null)
const themeText = computed(() => (theme.value ? (locale.value === 'en' ? theme.value.en : theme.value.es) : null))
const others = computed(() => themes.value.filter((th: any) => th.key !== tema.value))
const otherThemeItems = computed(() => others.value.map((th: any) => ({
  to: localePath(`/investigaciones/temas/${th.key}`),
  emoji: th.emoji,
  label: (locale.value === 'en' ? th.en : th.es).label,
  meta: th.count,
})))

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
          // Cuenta el tema entero; la lista enumera la página a la vista. Cada ficha tiene su
          // URL propia en el sitemap, así que el rastreo no depende de esta enumeración.
          'numberOfItems': total.value,
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
      <RecordHero
        :emoji="theme.emoji"
        :eyebrow="t('casos.eyebrow')"
        :title="themeText?.label ?? ''"
        :dek="themeText?.dek"
        :back-to="localePath('/investigaciones/casos')"
        :back-label="t('casos.backToAll')"
      >
        <p class="hero__meta u-mono">
          {{ t('casos.themePageLead', { n: total }) }} · {{ t('casos.sourcesTotal', { n: sourceTotal }) }}
        </p>
      </RecordHero>

      <section
        id="tema-fichas"
        class="u-container sec"
      >
        <div class="cgrid">
          <CasoCard
            v-for="i in items"
            :key="i.slug"
            :item="i"
          />
        </div>
        <DataPager
          v-if="totalPages > 1"
          v-model:page="page"
          :total-pages="totalPages"
          scroll-target-id="tema-fichas"
          class="pager"
        />
      </section>

      <section class="u-container sec">
        <div class="sec__head">
          <h2>{{ t('casos.themesTitle') }}</h2>
        </div>
        <RelatedRail :items="otherThemeItems" />
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

    <NotFoundPanel
      v-else
      :title="t('casos.notFound.title')"
      :body="t('casos.notFound.body')"
      :action-to="localePath('/investigaciones/casos')"
      :action-label="t('casos.notFound.action')"
    />
  </div>
</template>

<style scoped>
.tema { padding-bottom: var(--s-9); }

.hero__meta { margin: var(--s-5) 0 0; font-size: var(--t-xs); color: var(--ink-fg-dim); }

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

.pager { margin-top: var(--s-6); }

@media (max-width: 640px) {
  .cgrid { grid-template-columns: minmax(0, 1fr); }
}
</style>
