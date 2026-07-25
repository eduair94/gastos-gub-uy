<script setup lang="ts">
const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()

const views = computed(() => [
  { label: t('contacts.views.list'), to: localePath('/proveedores/contactos') },
  { label: t('contacts.views.map'), to: localePath('/proveedores/contactos/mapa') },
])
</script>

<template>
  <nav
    class="contact-views"
    :aria-label="t('contacts.views.label')"
  >
    <NuxtLink
      v-for="view in views"
      :key="view.to"
      :to="view.to"
      class="contact-views__link"
      :aria-current="route.path === view.to ? 'page' : undefined"
    >
      {{ view.label }}
    </NuxtLink>
  </nav>
</template>

<style scoped>
.contact-views {
  display: inline-flex;
  max-width: 100%;
  margin-bottom: var(--s-5);
  padding: 3px;
  border: 1px solid var(--rule-strong);
  border-radius: var(--r-md);
  background: var(--surface-sunken);
}

.contact-views__link {
  min-width: 8rem;
  padding: var(--s-2) var(--s-4);
  border-radius: calc(var(--r-md) - 3px);
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  font-weight: 650;
  letter-spacing: 0.02em;
  text-align: center;
  text-decoration: none;
  transition:
    background-color var(--dur) var(--ease),
    color var(--dur) var(--ease);
}

.contact-views__link:hover {
  color: var(--celeste-deep);
}

.contact-views__link[aria-current="page"] {
  background: var(--surface);
  color: var(--celeste-deep);
  box-shadow: var(--shadow-1);
}

@media (max-width: 480px) {
  .contact-views {
    display: flex;
    width: 100%;
  }

  .contact-views__link {
    flex: 1 1 50%;
    min-width: 0;
  }
}
</style>
