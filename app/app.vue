<script setup lang="ts">
// Emits <html lang>, dir, and the hreflang alternates for every
// locale. Without this the whole site claimed a single language to
// crawlers while serving Spanish content.
const head = useLocaleHead({ dir: true, seo: true })
const { t } = useI18n()
const siteUrl = useRuntimeConfig().public.siteUrl as string

// The site's identity graph, present on every page: who publishes it
// (Organization) and who built it (Person, sameAs'd to LinkedIn/GitHub —
// what lets a byline resolve to a real profile instead of a bare name).
// A page-specific useSeo() call layers its own JSON-LD on top of this, it
// never replaces it.
const orgLd = useOrgLd()
const personLd = usePersonLd()

useHead(() => ({
  htmlAttrs: {
    lang: head.value.htmlAttrs?.lang,
    dir: head.value.htmlAttrs?.dir,
  },
  link: [
    ...(head.value.link ?? []),
    { rel: 'author', href: AUTHOR.linkedin },
    { rel: 'me', href: AUTHOR.linkedin },
    { rel: 'me', href: AUTHOR.github },
  ],
  meta: [
    ...(head.value.meta ?? []),
    { name: 'author', content: AUTHOR.name },
  ],
  script: [{
    key: 'ld-identity',
    type: 'application/ld+json',
    innerHTML: JSON.stringify([
      { '@context': 'https://schema.org', ...orgLd, 'logo': `${siteUrl}/pwa-512x512.png`, 'founder': { '@id': personLd['@id'] } },
      { '@context': 'https://schema.org', ...personLd, 'worksFor': { '@id': orgLd['@id'] } },
    ]),
  }],
  titleTemplate: (title?: string) => title || t('brand.name'),
}))
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
  <!-- Cookie notice. Client-only: its visibility depends on localStorage, so
       rendering it on the server would guarantee a hydration mismatch. -->
  <ClientOnly>
    <ConsentBanner />
  </ClientOnly>
</template>
