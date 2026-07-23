<script setup lang="ts">
interface ContactLocation {
  name: string
  locality: string | null
  address: string | null
  websiteAddress: string | null
  hours: string | null
  mapsUrl: string | null
}

const props = defineProps<{
  contact: ContactLocation | null
  sourceLabel: string
}>()

const open = defineModel<boolean>({ required: true })
const { t } = useI18n()

const hourLines = computed(() =>
  props.contact?.hours
    ?.split(/\s*\|\s*/)
    .map(line => line.trim())
    .filter(Boolean) ?? [],
)
</script>

<template>
  <v-dialog
    v-model="open"
    max-width="720"
    scrollable
  >
    <section
      v-if="contact"
      class="location-dialog"
      role="document"
      aria-labelledby="contact-location-title"
    >
      <header class="location-dialog__head">
        <div class="location-dialog__heading">
          <p class="u-eyebrow">
            {{ t('contacts.location.eyebrow') }}
          </p>
          <h2
            id="contact-location-title"
            class="location-dialog__title"
          >
            {{ t('contacts.location.title', { name: contact.name }) }}
          </h2>
        </div>
        <button
          class="location-dialog__close"
          type="button"
          :aria-label="t('nav.close')"
          @click="open = false"
        >
          <v-icon size="22">
            mdi-close
          </v-icon>
        </button>
      </header>

      <div class="location-dialog__body">
        <dl class="location-dialog__fields">
          <div class="location-dialog__field">
            <dt>{{ t('contacts.table.locality') }}</dt>
            <dd>{{ contact.locality || '—' }}</dd>
          </div>
          <div class="location-dialog__field">
            <dt>{{ t('contacts.location.address') }}</dt>
            <dd>{{ contact.address || '—' }}</dd>
          </div>
          <div class="location-dialog__field">
            <dt>{{ t('contacts.location.websiteAddress') }}</dt>
            <dd>{{ contact.websiteAddress || '—' }}</dd>
          </div>
          <div class="location-dialog__field location-dialog__field--wide">
            <dt>{{ t('contacts.businessHours') }}</dt>
            <dd>
              <ul
                v-if="hourLines.length"
                class="location-dialog__hours"
              >
                <li
                  v-for="line in hourLines"
                  :key="line"
                >
                  {{ line }}
                </li>
              </ul>
              <span v-else>—</span>
            </dd>
          </div>
          <div class="location-dialog__field">
            <dt>{{ t('contacts.location.source') }}</dt>
            <dd>{{ sourceLabel || '—' }}</dd>
          </div>
          <div class="location-dialog__field">
            <dt>{{ t('contacts.source.googleMaps') }}</dt>
            <dd>
              <a
                v-if="contact.mapsUrl"
                :href="contact.mapsUrl"
                target="_blank"
                rel="nofollow noopener"
                class="location-dialog__link"
              >
                {{ t('contacts.location.openMaps') }}
                <v-icon size="16">mdi-open-in-new</v-icon>
              </a>
              <span v-else>—</span>
            </dd>
          </div>
        </dl>
      </div>
    </section>
  </v-dialog>
</template>

<style scoped>
.location-dialog {
  overflow: hidden;
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow-3);
}

.location-dialog__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--s-4);
  padding: var(--s-5);
  border-bottom: 1px solid var(--rule);
  background: var(--surface-sunken);
}

.location-dialog__heading {
  min-width: 0;
}

.location-dialog__head .u-eyebrow {
  margin: 0 0 var(--s-2);
}

.location-dialog__title {
  margin: 0;
  overflow-wrap: anywhere;
  font-family: var(--font-display);
  font-size: var(--t-xl);
  line-height: 1.2;
}

.location-dialog__close {
  display: grid;
  place-items: center;
  flex: none;
  width: 36px;
  height: 36px;
  border: 1px solid var(--rule);
  border-radius: var(--r-full);
  background: var(--surface);
  color: var(--text-muted);
  cursor: pointer;
}

.location-dialog__close:hover {
  border-color: var(--celeste);
  color: var(--celeste-deep);
}

.location-dialog__body {
  max-height: min(68vh, 620px);
  overflow-y: auto;
  padding: var(--s-5);
}

.location-dialog__fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1px;
  margin: 0;
  overflow: hidden;
  border: 1px solid var(--rule);
  border-radius: var(--r-md);
  background: var(--rule);
}

.location-dialog__field {
  min-width: 0;
  padding: var(--s-4);
  background: var(--surface);
}

.location-dialog__field--wide {
  grid-column: 1 / -1;
}

.location-dialog__field dt {
  margin-bottom: var(--s-2);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.location-dialog__field dd {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
  line-height: 1.5;
}

.location-dialog__hours {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--s-2) var(--s-5);
  margin: 0;
  padding: 0;
  list-style: none;
}

.location-dialog__hours li {
  padding-bottom: var(--s-2);
  border-bottom: 1px solid color-mix(in srgb, var(--rule) 60%, transparent);
}

.location-dialog__link {
  display: inline-flex;
  align-items: center;
  gap: var(--s-1);
  color: var(--celeste-deep);
  text-decoration: none;
}

.location-dialog__link:hover {
  text-decoration: underline;
  text-underline-offset: 2px;
}

@media (max-width: 600px) {
  .location-dialog__head,
  .location-dialog__body {
    padding: var(--s-4);
  }

  .location-dialog__fields,
  .location-dialog__hours {
    grid-template-columns: minmax(0, 1fr);
  }

  .location-dialog__field--wide {
    grid-column: auto;
  }
}
</style>
