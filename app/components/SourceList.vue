<script setup lang="ts">
/**
 * The citation panel: outlet · date over the headline, linking out.
 *
 * This is the component the evidence contract rests on — a claim on this site
 * is only publishable because this list sits beside it — so it is one
 * implementation rather than a block copied into each investigation.
 *
 * Every link opens in a new tab with `rel="noopener noreferrer"`: the reader is
 * mid-way through an argument and losing the page to a news site would cost
 * them the thread.
 *
 *   <SourceList :title="t('casos.sec.fuentes')" :sources="sources">
 *     <template #footer>…coverage note…</template>
 *   </SourceList>
 */
withDefaults(defineProps<{
  title: string
  sources: Array<{ outlet: string, title: string, url: string, date?: string | undefined }>
  /**
   * Heading level. `h2` when the panel sits beside `h2` prose sections, which
   * is the usual case; `h3` only inside an already-nested block.
   */
  level?: 'h2' | 'h3'
}>(), {
  level: 'h2',
})
</script>

<template>
  <aside class="srcs">
    <component
      :is="level"
      class="srcs__h"
    >
      {{ title }}
    </component>
    <ul class="srcs__list">
      <li
        v-for="(s, idx) in sources"
        :key="`${s.url}-${idx}`"
        class="srcs__item"
      >
        <a
          :href="s.url"
          target="_blank"
          rel="noopener noreferrer"
          class="srcs__link"
        >
          <span class="srcs__outlet">{{ s.outlet }}<span
            v-if="s.date"
            class="srcs__date"
          > · {{ s.date }}</span></span>
          <span class="srcs__title">{{ s.title }}</span>
        </a>
      </li>
    </ul>
    <p
      v-if="$slots.footer"
      class="srcs__foot"
    >
      <slot name="footer" />
    </p>
  </aside>
</template>

<style scoped>
.srcs {
  align-self: start;
  padding: var(--s-4);
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-1);
}

.srcs__h {
  margin: 0 0 var(--s-3);
  font-size: var(--t-sm);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

.srcs__list { margin: 0; padding: 0; list-style: none; }
.srcs__item + .srcs__item { border-top: 1px solid var(--rule); }

.srcs__link {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--s-3) 0;
  text-decoration: none;
  color: inherit;
}

.srcs__link:hover .srcs__title { color: var(--celeste-deep); text-decoration: underline; }

.srcs__outlet { font-size: var(--t-xs); font-weight: 700; color: var(--text); }
.srcs__date { color: var(--text-muted); font-weight: 400; }
.srcs__title { font-size: var(--t-sm); color: var(--text-muted); line-height: 1.4; }

.srcs__foot {
  margin: var(--s-4) 0 0;
  padding-top: var(--s-3);
  border-top: 1px solid var(--rule);
  font-size: var(--t-xs);
  color: var(--text-muted);
  line-height: 1.5;
}
</style>
