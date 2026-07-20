<script setup lang="ts">
/**
 * MandateTimeline — the political administrations that governed an organism across
 * its terms. For an Intendencia, the succession of intendentes; for a ministry or
 * an executive-controlled ente, the succession of presidents.
 *
 * Context, not attribution: it states who held office, as public electoral record.
 * Terms with no overlap with the organism's reporting span are dimmed, not hidden —
 * the whole sequence is the point. Renders nothing for self-governed / unclassified
 * bodies (mandateTimeline → null).
 */
import { mandateTimeline, MANDATE_SOURCE } from '#shared/political-mandates'

const props = defineProps<{
  buyerId?: string | null
  /** The organism's reporting span; terms outside it are dimmed. */
  firstYear?: number | null
  lastYear?: number | null
}>()

const { t } = useI18n()

const tl = computed(() => mandateTimeline(String(props.buyerId ?? '')))

/** A term is "active" if it overlaps the organism's reporting span at all. */
function isActive(startYear: number, endYear: number): boolean {
  const lo = props.firstYear ?? -Infinity
  const hi = props.lastYear ?? Infinity
  return endYear >= lo && startYear <= hi
}

const roleLabel = computed(() =>
  tl.value?.role === 'president' ? t('mandate.role.president') : t('mandate.role.intendente'))
</script>

<template>
  <div
    v-if="tl"
    class="mtl"
  >
    <div class="mtl__head">
      <p class="mtl__eyebrow u-mono">
        {{ t('mandate.timeline.title') }} · {{ roleLabel }}
      </p>
      <p class="mtl__note">
        {{ t('mandate.timeline.note') }}
      </p>
    </div>
    <div class="mtl__scroll">
      <ol class="mtl__row">
        <li
          v-for="term in tl.terms"
          :key="term.label"
          class="term"
          :class="{ 'term--dim': !isActive(term.startYear, term.endYear) }"
        >
          <span
            class="term__bar"
            :style="{ background: term.partyColor }"
            aria-hidden="true"
          />
          <span class="term__period u-mono">{{ term.label }}</span>
          <span class="term__holder">{{ term.holder }}</span>
          <span class="term__party">
            <span
              class="term__dot"
              :style="{ background: term.partyColor }"
              aria-hidden="true"
            />
            {{ term.coalition ?? term.partyLabel }}
          </span>
        </li>
      </ol>
    </div>
    <p class="mtl__src">
      {{ t('mandate.disclaimer') }} {{ t('mandate.source', { source: MANDATE_SOURCE }) }}
    </p>
  </div>
</template>

<style scoped>
.mtl { margin-top: var(--s-2); }
.mtl__head { margin-bottom: var(--s-3); }
.mtl__eyebrow {
  margin: 0;
  font-size: var(--t-xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.mtl__note {
  margin: var(--s-1) 0 0;
  font-size: var(--t-sm);
  color: var(--text-muted);
}
.mtl__scroll { overflow-x: auto; padding-bottom: 2px; }
.mtl__row {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(150px, 1fr);
  gap: var(--s-3);
  margin: 0;
  padding: 0;
  list-style: none;
  min-width: min-content;
}
.term {
  display: flex;
  flex-direction: column;
  gap: var(--s-1);
  padding: var(--s-3);
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-md);
}
/* Dimming the whole card (including its text) via opacity pushed the
   already-muted term text below the AA contrast floor at any opacity low
   enough to read as "de-emphasized" — text and background dim together, so
   it isn't a simple color swap to fix. The party-colour accents carry the
   "past term" cue instead; the text itself always stays at full contrast. */
.term--dim .term__bar,
.term--dim .term__dot { opacity: 0.5; }
.term__bar {
  height: 4px;
  border-radius: var(--r-full);
  margin-bottom: var(--s-1);
}
.term__period {
  font-size: var(--t-xs);
  color: var(--text-muted);
  letter-spacing: 0.03em;
}
.term__holder {
  font-size: var(--t-sm);
  font-weight: 700;
  line-height: 1.25;
}
.term__party {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: var(--t-xs);
  color: var(--text-muted);
}
.term__dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: var(--r-full);
  flex: none;
}
.mtl__src {
  margin: var(--s-3) 0 0;
  font-size: var(--t-xs);
  color: var(--text-muted);
  line-height: 1.45;
}
</style>
