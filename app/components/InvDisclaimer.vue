<script setup lang="ts">
/**
 * "Cómo leer esta investigación" — the ink panel that closes every piece with
 * what the data does and does not prove.
 *
 * Nine pages rendered it as this panel and two rendered the same content as a
 * muted bullet list, which meant the site's most load-bearing caveat looked
 * like a footnote on the two pages whose figures are live. One treatment now.
 * Rich copy (a link, a bolded clause) goes through the default slot instead of
 * `paragraphs`.
 *
 *   <InvDisclaimer :title="c.common.disclaimerTitle" :paragraphs="c.common.disclaimer" />
 *   <InvDisclaimer :title="c.discTitle" :paragraphs="c.disc" :sources-title="c.srcTitle" :sources="c.sources" />
 *
 * It sits on `--ink`, which does not flip in dark mode, so its links are
 * painted from the cover's fixed foreground pair rather than from `--celeste`.
 */
defineProps<{
  title: string
  paragraphs?: readonly string[]
  /** Sources belonging to the caveat, listed inside the panel. */
  sourcesTitle?: string
  sources?: readonly { label: string, url: string }[]
}>()
</script>

<template>
  <div class="inv-disclaimer">
    <h3>{{ title }}</h3>
    <slot>
      <p
        v-for="(p, i) in paragraphs"
        :key="i"
      >
        {{ p }}
      </p>
    </slot>

    <template v-if="sources?.length">
      <h4
        v-if="sourcesTitle"
        class="invdisc__srch"
      >
        {{ sourcesTitle }}
      </h4>
      <ul class="invdisc__src">
        <li
          v-for="s in sources"
          :key="s.url"
        >
          <a
            :href="s.url"
            target="_blank"
            rel="noopener"
          >{{ s.label }}</a>
        </li>
      </ul>
    </template>
  </div>
</template>

<style scoped>
.invdisc__srch {
  margin: var(--s-5) 0 var(--s-3);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-fg-dim);
}

.invdisc__src {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--s-2);
  font-size: 0.92rem;
}

/* On ink the celeste link token flips with the theme while the surface under it
   does not, so links here use the ink pair's own link tone. */
.invdisc__src a {
  color: var(--ink-link);
  overflow-wrap: anywhere;
}
</style>
