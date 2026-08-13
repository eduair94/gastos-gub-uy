<script setup lang="ts">
/**
 * "Seguí vos": the band that hands the reader the live filters behind the
 * piece, so a static investigation ends in the explorer rather than at a full
 * stop.
 *
 * Written twice, identically, in `intendencia-montevideo` and `tv-ciudad`.
 *
 *   <InvExplore :tag="c.explore.tag" :title="c.explore.title" :intro="c.explore.intro">
 *     <v-btn :to="localePath('/buyers/98-1')" color="primary" variant="flat" class="text-none">…</v-btn>
 *   </InvExplore>
 */
defineProps<{
  tag?: string
  title: string
  intro?: string
}>()
</script>

<template>
  <div class="invexp">
    <p
      v-if="tag"
      class="invexp__tag u-mono"
    >
      {{ tag }}
    </p>
    <h3>{{ title }}</h3>
    <p
      v-if="intro"
      class="invexp__intro"
    >
      {{ intro }}
    </p>
    <InvActions>
      <slot />
    </InvActions>
  </div>
</template>

<style scoped>
.invexp {
  margin-top: var(--s-6);
  padding: var(--s-5) var(--s-6);
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
  background: var(--surface-sunken);
}

.invexp__tag {
  margin: 0 0 4px;
  font-size: var(--t-xs);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--celeste-deep);
}

.invexp h3 {
  margin: 0 0 6px;
  font-size: var(--t-lg);
}

.invexp__intro {
  margin: 0 0 var(--s-4);
  max-width: 68ch;
  font-size: var(--t-sm);
  color: var(--text-muted);
}
</style>
