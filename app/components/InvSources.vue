<script setup lang="ts">
/**
 * The citation panel the evidence contract rests on: every figure's source,
 * grouped, at the foot of the piece.
 *
 * Seven pages wrote their own, and the group heading was quietly broken in all
 * five that had one: the stylesheet dressed `.inv-srcgroup h4`, the pages all
 * wrote `<h3>`, so those headings shipped with no styling at all. Only
 * `mejor-o-peor` carried the `overflow-wrap: anywhere` that keeps an
 * unbreakable institutional URL from pushing a 360px document sideways — that
 * fix now reaches every source list on the site.
 *
 *   <InvSources :items="SOURCES" />
 *   <InvSources :groups="[{ title: c.sourcesNorm, items: [...] }, …]" />
 *
 * Links open in a new tab so the reader does not lose the argument they are in
 * the middle of; an internal `to` stays in the app.
 */
export interface InvSourceItem {
  label: string
  /** External source. */
  url?: string
  /** Internal route — a live page on this site that backs the claim. */
  to?: string
  /** The record id or note under the link. */
  note?: string
}

withDefaults(defineProps<{
  /** Named groups, side by side. */
  groups?: { title?: string, items: InvSourceItem[] }[]
  /** One ungrouped list. */
  items?: InvSourceItem[]
  /** Split an ungrouped list into two reading columns on desktop. */
  split?: boolean
}>(), {
  split: true,
})
</script>

<template>
  <div
    v-if="groups?.length"
    class="inv-srcgroups"
  >
    <div
      v-for="(g, gi) in groups"
      :key="gi"
      class="inv-srcgroup"
    >
      <h3 v-if="g.title">
        {{ g.title }}
      </h3>
      <ul class="inv-srclist">
        <li
          v-for="s in g.items"
          :key="s.url ?? s.to ?? s.label"
        >
          <NuxtLink
            v-if="s.to"
            :to="s.to"
          >
            {{ s.label }}
          </NuxtLink>
          <a
            v-else
            :href="s.url"
            target="_blank"
            rel="noopener"
          >{{ s.label }}</a>
          <div
            v-if="s.note"
            class="u"
          >
            {{ s.note }}
          </div>
        </li>
      </ul>
    </div>
  </div>

  <ul
    v-else
    class="inv-srclist"
    :class="{ 'inv-srclist--split': split }"
  >
    <li
      v-for="s in items"
      :key="s.url ?? s.to ?? s.label"
    >
      <NuxtLink
        v-if="s.to"
        :to="s.to"
      >
        {{ s.label }}
      </NuxtLink>
      <a
        v-else
        :href="s.url"
        target="_blank"
        rel="noopener"
      >{{ s.label }}</a>
      <div
        v-if="s.note"
        class="u"
      >
        {{ s.note }}
      </div>
    </li>
  </ul>
</template>

<style scoped>
/* One long list reads as two columns on a wide screen; the grouped form already
   has its own grid. */
.inv-srclist--split {
  columns: 2;
  column-gap: var(--s-7);
}

.inv-srclist--split li { break-inside: avoid; }

/* Institutional source strings carry bare URLs with no break opportunity;
   without this the line box runs past the viewport and the whole page scrolls
   sideways at 360px. */
.inv-srclist a,
.inv-srclist :deep(a) { overflow-wrap: anywhere; }

@media (max-width: 900px) {
  .inv-srclist--split { columns: 1; }
}
</style>
