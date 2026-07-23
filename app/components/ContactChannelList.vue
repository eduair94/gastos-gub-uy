<script setup lang="ts">
interface ContactChannel {
  key: string
  label: string
  href: string
  sourceLabel: string
  sourceUrl: string | null
  external: boolean
}

const props = withDefaults(defineProps<{
  entries: ContactChannel[]
  emptyLabel?: string
  initialLimit?: number
}>(), {
  emptyLabel: '—',
  initialLimit: 1,
})

const { t } = useI18n()
const expanded = ref(false)
const hiddenCount = computed(() => Math.max(0, props.entries.length - props.initialLimit))
const visibleEntries = computed(() =>
  expanded.value ? props.entries : props.entries.slice(0, props.initialLimit),
)
</script>

<template>
  <div
    v-if="entries.length"
    class="channel-list"
  >
    <div
      v-for="entry in visibleEntries"
      :key="entry.key"
      class="channel-list__entry"
    >
      <a
        :href="entry.href"
        :target="entry.external ? '_blank' : undefined"
        :rel="entry.external ? 'nofollow noopener' : undefined"
        class="channel-list__link"
      >{{ entry.label }}</a>
      <a
        v-if="entry.sourceUrl && entry.sourceLabel"
        :href="entry.sourceUrl"
        target="_blank"
        rel="nofollow noopener"
        class="channel-list__source channel-list__source--link"
      >{{ entry.sourceLabel }}</a>
      <span
        v-else-if="entry.sourceLabel"
        class="channel-list__source"
      >{{ entry.sourceLabel }}</span>
    </div>

    <button
      v-if="hiddenCount"
      class="channel-list__toggle"
      type="button"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      {{ expanded
        ? t('contacts.values.showLess')
        : t('contacts.values.showMore', { count: hiddenCount }) }}
      <v-icon size="15">
        {{ expanded ? 'mdi-chevron-up' : 'mdi-chevron-down' }}
      </v-icon>
    </button>
  </div>
  <span
    v-else
    class="channel-list__empty"
  >{{ emptyLabel }}</span>
</template>

<style scoped>
.channel-list,
.channel-list__entry {
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: flex-start;
}

.channel-list {
  gap: var(--s-2);
}

.channel-list__entry {
  gap: 2px;
}

.channel-list__link {
  max-width: 100%;
  overflow-wrap: anywhere;
  color: var(--celeste-deep);
  text-decoration: none;
}

.channel-list__link:hover,
.channel-list__source--link:hover {
  text-decoration: underline;
  text-underline-offset: 2px;
}

.channel-list__source {
  max-width: 100%;
  overflow-wrap: anywhere;
  font-family: var(--font-mono);
  font-size: 0.68rem;
  line-height: 1.25;
  color: var(--text-muted);
}

.channel-list__source--link {
  text-decoration: underline;
  text-underline-offset: 2px;
}

.channel-list__toggle {
  display: inline-flex;
  align-items: center;
  gap: 1px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--celeste-deep);
  font-family: var(--font-body);
  font-size: var(--t-xs);
  font-weight: 600;
  cursor: pointer;
}

.channel-list__toggle:hover {
  text-decoration: underline;
  text-underline-offset: 2px;
}

.channel-list__empty {
  color: var(--text-muted);
}
</style>
