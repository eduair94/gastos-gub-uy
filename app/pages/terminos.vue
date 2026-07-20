<script setup lang="ts">
import { getTerms } from '~/utils/legal-content'

const { locale, t } = useI18n()
const doc = computed(() => getTerms(locale.value === 'en' ? 'en' : 'es'))
const orgLd = useOrgLd()

useSeo(() => ({
  title: doc.value.title,
  description: t('legalPage.termsDesc'),
  path: '/terminos',
  jsonLd: {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    'name': doc.value.title,
    'description': t('legalPage.termsDesc'),
    'isPartOf': orgLd,
  },
}))
</script>

<template>
  <div class="u-container page">
    <LegalArticle :doc="doc" />
  </div>
</template>

<style scoped>
.page { padding-block: var(--s-7) var(--s-8); }
</style>
