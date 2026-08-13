<script setup lang="ts">
/**
 * One caso, as a card. Used by the collection index, the fourteen theme pages
 * and the "read next" rail, so the three cannot drift the way the curros index
 * and detail pills once did.
 *
 * What it deliberately does NOT show is a peso figure in gold. `amountReported`
 * is the number the SOURCES published — prose, sometimes two currencies,
 * sometimes a range — and gold on this site means "a figure we derived from the
 * data". Same reasoning as <ReportedFigure>, which is the detail page's version
 * of this restraint. The card shows the claim as plain ink, and whether a
 * cross-reference exists at all.
 */
const props = defineProps<{
  item: {
    slug: string
    emoji: string
    theme: string
    period?: string | null
    statusKind: string
    status: string
    amountReported?: string | null
    feedCoverage: string
    hasQuery?: boolean
    sourceCount: number
    es: { title: string, dek: string }
    en: { title: string, dek: string }
  }
  /**
   * The theme's glyph and its already-translated name. Omitted on a theme page,
   * where repeating the theme on every card is noise — so the whole row simply
   * does not render rather than the caller passing a flag to hide it.
   */
  themeEmoji?: string
  themeLabel?: string
}>()

const { t, locale } = useI18n()
const localePath = useLocalePath()

const text = computed(() => (locale.value === 'en' ? props.item.en : props.item.es))
</script>

<template>
  <NuxtLink
    :to="localePath(`/investigaciones/casos/${item.slug}`)"
    class="ccard"
  >
    <div class="ccard__top">
      <span class="ccard__emoji">{{ item.emoji }}</span>
      <StatusChip
        :status="item.status"
        :label="t(`casos.status.${item.status}`)"
        variant="micro"
      />
    </div>

    <h3 class="ccard__title">
      {{ text.title }}
    </h3>
    <p class="ccard__dek">
      {{ text.dek }}
    </p>

    <p
      v-if="item.amountReported"
      class="ccard__reported"
    >
      <span class="ccard__reportedl">{{ t('casos.card.reported') }}</span>
      <span class="ccard__reportedv">{{ item.amountReported }}</span>
    </p>

    <div class="ccard__foot">
      <span class="chip-row ccard__meta">
        <span
          v-if="themeLabel"
          class="ccard__theme"
        >{{ themeEmoji }} {{ themeLabel }}</span>
        <span
          v-if="item.period"
          class="u-mono ccard__period"
        >{{ item.period }}</span>
      </span>
      <span class="ccard__srcs">
        <v-icon size="13">mdi-link-variant</v-icon>
        {{ t('casos.card.sources', { n: item.sourceCount }) }}
      </span>
    </div>
  </NuxtLink>
</template>

<style scoped>
.ccard {
  display: flex;
  flex-direction: column;
  padding: var(--s-5);
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-1);
  text-decoration: none;
  color: inherit;
  transition: border-color var(--dur) var(--ease), transform var(--dur) var(--ease), box-shadow var(--dur) var(--ease);
}

.ccard:hover {
  border-color: var(--celeste);
  transform: translateY(-2px);
  box-shadow: var(--shadow-2);
}

.ccard__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-3);
  margin-bottom: var(--s-3);
}

.ccard__emoji { font-size: 1.75rem; line-height: 1; }

.ccard__title { margin: 0 0 var(--s-2); font-size: var(--t-md); line-height: 1.25; }

.ccard__dek {
  margin: 0 0 var(--s-4);
  font-size: var(--t-sm);
  color: var(--text-muted);
  line-height: 1.5;
  flex: 1 1 auto;
}

/* The published claim, plain ink. Never <MoneyAmount>: gold is reserved for a
   figure derived from this database, and a quoted number has not earned it. */
.ccard__reported {
  display: flex;
  flex-direction: column;
  gap: 1px;
  margin: 0 0 var(--s-4);
  padding: var(--s-2) var(--s-3);
  background: var(--surface-sunken);
  border-left: 2px solid var(--rule);
  border-radius: var(--r-sm);
}
.ccard__reportedl {
  font-family: var(--font-mono);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}
.ccard__reportedv { font-size: var(--t-xs); line-height: 1.45; color: var(--text); }

.ccard__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-3);
  padding-top: var(--s-3);
  border-top: 1px solid var(--rule);
}
.ccard__meta { min-width: 0; }
.ccard__theme {
  font-size: var(--t-xs);
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ccard__period { font-size: var(--t-xs); color: var(--text-muted); }
.ccard__srcs {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  flex: 0 0 auto;
  font-size: var(--t-xs);
  color: var(--celeste-deep);
  font-weight: 600;
}
</style>
