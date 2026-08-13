<script setup lang="ts">
/**
 * "Read next" — a wrapping rail of pill links to sibling records.
 *
 * Four surfaces ended an investigation with this and each rolled its own, so
 * one of them let a long Spanish title set the pill's width and pushed the
 * document sideways on a phone. Here the label truncates and the glyph, count
 * and status chip are fixed-basis, so the rail can never widen the page.
 *
 *   <RelatedRail :items="related.map(r => ({
 *     to: localePath(`/investigaciones/casos/${r.slug}`),
 *     emoji: r.emoji,
 *     label: text(r).title,
 *     status: r.status,
 *     statusLabel: t(`casos.status.${r.status}`),
 *   }))" />
 */
defineProps<{
  items: Array<{
    to: string
    label: string
    emoji?: string | undefined
    /** Renders a <StatusChip>; both fields are required together. */
    status?: string | undefined
    statusLabel?: string | undefined
    /** A trailing count or short metric, in mono. */
    meta?: string | number | undefined
  }>
}>()
</script>

<template>
  <div class="rrail">
    <NuxtLink
      v-for="(i, idx) in items"
      :key="`${i.to}-${idx}`"
      :to="i.to"
      class="rrail__card"
    >
      <span
        v-if="i.emoji"
        class="rrail__emoji"
      >{{ i.emoji }}</span>
      <span class="rrail__label">{{ i.label }}</span>
      <StatusChip
        v-if="i.status && i.statusLabel"
        :status="i.status"
        :label="i.statusLabel"
        variant="micro"
      />
      <span
        v-else-if="i.meta != null"
        class="rrail__meta u-mono"
      >{{ i.meta }}</span>
    </NuxtLink>
  </div>
</template>

<style scoped>
.rrail { display: flex; flex-wrap: wrap; gap: var(--s-3); }

.rrail__card {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  max-width: 100%;
  padding: var(--s-3) var(--s-4);
  border: 1px solid var(--rule);
  border-radius: var(--r-md);
  background: var(--surface);
  color: var(--text);
  font-size: var(--t-sm);
  font-weight: 600;
  text-decoration: none;
  transition: border-color var(--dur) var(--ease), background var(--dur) var(--ease);
}

.rrail__card:hover { border-color: var(--celeste); background: var(--surface-sunken); }

.rrail__emoji { flex: 0 0 auto; font-size: 1.2em; }

/* The only element allowed to shrink — everything else is fixed-basis, so a
   200-character contract title clips instead of widening the document. */
.rrail__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rrail__meta { flex: 0 0 auto; font-size: var(--t-xs); color: var(--text-muted); }
</style>
