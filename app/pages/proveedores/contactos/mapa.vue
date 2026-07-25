<script setup lang="ts">
const { t } = useI18n()
const orgLd = useOrgLd()

useSeo(() => ({
  title: t('seo.contactsMap.title'),
  description: t('seo.contactsMap.description'),
  path: '/proveedores/contactos/mapa',
  noindex: true,
  kicker: 'Proveedores',
  jsonLd: [orgLd],
}))
</script>

<template>
  <div class="u-container page">
    <header class="page__head">
      <p class="u-eyebrow">
        {{ t('nav.suppliers') }}
      </p>
      <h1>{{ t('contacts.map.title') }}</h1>
      <p class="u-lead page__lead">
        {{ t('contacts.map.lead') }}
      </p>
    </header>

    <ContactsViewTabs />

    <section
      class="map-stage"
      :aria-label="t('contacts.map.title')"
    >
      <SupplierLocationsMap />
    </section>

    <div class="map-notes">
      <p class="map-notes__legend">
        <span
          class="map-notes__dot"
          aria-hidden="true"
        />
        {{ t('contacts.map.legend') }}
      </p>
      <p class="map-notes__source">
        {{ t('contacts.map.source') }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.page {
  padding-block: var(--s-6) var(--s-8);
}

.page__head {
  max-width: 58rem;
  margin-bottom: var(--s-5);
}

.page__lead {
  margin: var(--s-3) 0 0;
}

.map-stage {
  min-width: 0;
}

.map-notes {
  display: grid;
  grid-template-columns: minmax(0, auto) minmax(18rem, 1fr);
  gap: var(--s-4) var(--s-6);
  align-items: start;
  margin-top: var(--s-4);
  padding-top: var(--s-4);
  border-top: 1px solid var(--rule);
  color: var(--text-muted);
  font-size: var(--t-xs);
}

.map-notes p {
  margin: 0;
}

.map-notes__legend {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  color: var(--text);
  font-family: var(--font-mono);
}

.map-notes__dot {
  width: 0.65rem;
  height: 0.65rem;
  flex: none;
  border: 1px solid var(--celeste-deep);
  border-radius: var(--r-full);
  background: var(--celeste);
}

@media (max-width: 720px) {
  .map-notes {
    grid-template-columns: 1fr;
  }
}
</style>
