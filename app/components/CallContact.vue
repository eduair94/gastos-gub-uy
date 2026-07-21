<script setup lang="ts">
// The contracting unit's contact. Public data republished from
// comprasestatales.gub.uy — official purchasing contact, shown verbatim.
interface Contact { name?: string, telephone?: string, faxNumber?: string, email?: string }
const props = defineProps<{ contact?: Contact | null, organism?: string | null }>()
const { t } = useI18n()

const has = computed(() => {
  const c = props.contact
  return !!(c && (c.email || c.telephone || c.name))
})

// tel: needs the raw number; strip the "INT 151/152" annotation for the link
// but keep the full string on screen.
const telHref = computed(() => {
  const raw = props.contact?.telephone ?? ''
  const digits = raw.replace(/[^\d+]/g, '')
  return digits ? `tel:${digits}` : ''
})

const copied = ref('')
async function copy(value: string) {
  try {
    await navigator.clipboard.writeText(value)
    copied.value = value
    setTimeout(() => {
      if (copied.value === value) copied.value = ''
    }, 1500)
  }
  catch { /* clipboard unavailable — no-op */ }
}
</script>

<template>
  <section
    v-if="has"
    class="panel calldetail__section cc"
  >
    <h2 class="u-eyebrow">
      {{ t('contactPanel.title') }}
    </h2>
    <ul class="cc__list">
      <li
        v-if="contact?.name"
        class="cc__row"
      >
        <v-icon
          size="16"
          class="cc__icon"
        >
          mdi-account-outline
        </v-icon>
        <span class="cc__val">{{ contact.name }}</span>
      </li>
      <li
        v-if="organism"
        class="cc__row"
      >
        <v-icon
          size="16"
          class="cc__icon"
        >
          mdi-office-building-outline
        </v-icon>
        <span class="cc__val u-truncate">{{ organism }}</span>
      </li>
      <li
        v-if="contact?.email"
        class="cc__row"
      >
        <v-icon
          size="16"
          class="cc__icon"
        >
          mdi-email-outline
        </v-icon>
        <a
          class="cc__val cc__link"
          :href="`mailto:${contact.email}`"
          :aria-label="t('contactPanel.srEmail', { v: contact.email })"
        >{{ contact.email }}</a>
        <button
          type="button"
          class="cc__copy"
          :title="t('contactPanel.copy')"
          @click="copy(contact.email!)"
        >
          <v-icon size="14">
            {{ copied === contact.email ? 'mdi-check' : 'mdi-content-copy' }}
          </v-icon>
        </button>
      </li>
      <li
        v-if="contact?.telephone"
        class="cc__row"
      >
        <v-icon
          size="16"
          class="cc__icon"
        >
          mdi-phone-outline
        </v-icon>
        <a
          v-if="telHref"
          class="cc__val cc__link"
          :href="telHref"
          :aria-label="t('contactPanel.srPhone', { v: contact.telephone })"
        >{{ contact.telephone }}</a>
        <span
          v-else
          class="cc__val"
        >{{ contact.telephone }}</span>
        <button
          type="button"
          class="cc__copy"
          :title="t('contactPanel.copy')"
          @click="copy(contact.telephone!)"
        >
          <v-icon size="14">
            {{ copied === contact.telephone ? 'mdi-check' : 'mdi-content-copy' }}
          </v-icon>
        </button>
      </li>
    </ul>
    <p class="cc__note">
      {{ t('contactPanel.note') }}
    </p>
  </section>
</template>

<style scoped>
.cc__list { list-style: none; margin: 0; padding: 0; border: 1px solid var(--rule); border-radius: var(--r-md); overflow: hidden; }
.cc__row { display: flex; align-items: center; gap: var(--s-2); padding: var(--s-2) var(--s-3); font-size: var(--t-sm); }
.cc__row + .cc__row { border-top: 1px solid var(--rule); }
.cc__icon { color: var(--celeste-deep); flex: none; }
.cc__val { min-width: 0; }
.cc__link { color: var(--celeste-deep); text-decoration: none; }
.cc__link:hover { text-decoration: underline; }
.cc__copy { margin-left: auto; flex: none; display: inline-flex; align-items: center; padding: 2px 6px; border: 1px solid var(--rule); border-radius: var(--r-sm); background: transparent; color: var(--text-muted); cursor: pointer; }
.cc__copy:hover { background: var(--surface-sunken); color: var(--text); }
.cc__note { margin: var(--s-2) 0 0; font-size: var(--t-xs); color: var(--text-muted); }
</style>
