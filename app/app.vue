<script setup lang="ts">
// Emits <html lang>, dir, and the hreflang alternates for every
// locale. Without this the whole site claimed a single language to
// crawlers while serving Spanish content.
const head = useLocaleHead({ dir: true, seo: true })
const { t } = useI18n()

useHead(() => ({
  htmlAttrs: {
    lang: head.value.htmlAttrs?.lang,
    dir: head.value.htmlAttrs?.dir,
  },
  link: [...(head.value.link ?? [])],
  meta: [...(head.value.meta ?? [])],
  titleTemplate: (title?: string) => title || t('brand.name'),
}))
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
