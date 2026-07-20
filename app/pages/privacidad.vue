<script setup lang="ts">
import { getPrivacy } from '~/utils/legal-content'

const { locale, t } = useI18n()
const doc = computed(() => getPrivacy(locale.value === 'en' ? 'en' : 'es'))

const orgLd = useOrgLd()

useSeo(() => ({
  title: doc.value.title,
  description: t('legalPage.privacyDesc'),
  path: '/privacidad',
  jsonLd: {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    'name': doc.value.title,
    'description': t('legalPage.privacyDesc'),
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
