<script setup lang="ts">
import { getTerms } from '~/utils/legal-content'

const { locale, t } = useI18n()
const doc = computed(() => getTerms(locale.value === 'en' ? 'en' : 'es'))

useSeo(() => ({
  title: doc.value.title,
  description: t('legalPage.termsDesc'),
  path: '/terminos',
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
