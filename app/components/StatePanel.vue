<script setup lang="ts">
/**
 * The panel a list shows when it has nothing to show: no results, a failed
 * fetch, a slug that resolves to nothing.
 *
 * Twenty files had built this by hand under two names — `.state` on the
 * directories and detail pages, `.empty` on the analytics pages — and they had
 * drifted into four different panels: nine byte-identical cards, two bare
 * centred blocks at `--s-7`, one at `--s-9` with no card, and
 * `contactos/index.vue`, which used the class names and never declared the CSS
 * at all, so its error state rendered as unstyled flush text. One component, so
 * the fifth variant cannot happen.
 *
 * The heading level is a prop because this panel plays two roles: on a detail
 * route that resolved to nothing it IS the page's `h1`; inside a section that
 * already has one it is an `h2`, and a soft "no rows match your filter" is not
 * a heading at all. Pages that render it as the whole page must also pass
 * `noindex` to `useSeo()` — a soft 404 is worse than a hard one if it is
 * indexed.
 *
 *   <StatePanel
 *     :title="t('errors.generic.title')"
 *     :body="t('errors.generic.body')"
 *     :action-label="t('errors.generic.action')"
 *     @action="refreshNuxtData()"
 *   />
 */
withDefaults(defineProps<{
  /**
   * Optional: the `inline` variant is a one-line note under a table ("this body
   * reported no amounts"), where a heading would announce a section that is not
   * there.
   */
  title?: string | undefined
  body?: string | undefined
  /** With `actionTo` it renders a link; without, a button that emits `action`. */
  actionLabel?: string | undefined
  actionTo?: string | undefined
  /** `h1` when this panel is the page, `h2` inside a section, `p` for a soft empty. */
  level?: 'h1' | 'h2' | 'p'
  /**
   * `card` is the bordered surface used in lists; `bare` sits inside a panel
   * that already has one; `inline` is the tight note that replaces a table.
   */
  variant?: 'card' | 'bare' | 'inline'
}>(), {
  level: 'h2',
  variant: 'card',
})

defineEmits<{ action: [] }>()
</script>

<template>
  <div
    class="sp"
    :class="`sp--${variant}`"
  >
    <component
      :is="level"
      v-if="title"
      class="sp__t"
    >
      {{ title }}
    </component>

    <p
      v-if="body"
      class="sp__b"
    >
      {{ body }}
    </p>

    <NuxtLink
      v-if="actionLabel && actionTo"
      :to="actionTo"
      class="sp__a"
    >
      {{ actionLabel }}
    </NuxtLink>
    <button
      v-else-if="actionLabel"
      type="button"
      class="sp__a"
      @click="$emit('action')"
    >
      {{ actionLabel }}
    </button>

    <slot />
  </div>
</template>

<style scoped>
.sp { text-align: center; }

.sp--card {
  padding: var(--s-8) var(--s-5);
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--r-lg);
}

.sp--bare { padding: var(--s-7) var(--s-5); }
.sp--inline { padding: var(--s-6) var(--s-5); }

.sp__t { margin: 0 0 var(--s-2); font-size: var(--t-lg); }

/* Centred prose needs its own measure — a one-line body across 1400px of
   directory reads as a caption that lost its element. */
.sp__b {
  margin: 0 auto;
  max-width: 52ch;
  color: var(--text-muted);
  font-size: var(--t-sm);
  line-height: 1.55;
}

.sp__a {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  margin-top: var(--s-5);
  padding: var(--s-2) var(--s-5);
  border: 1px solid var(--rule-strong);
  border-radius: var(--r-full);
  background: var(--surface);
  color: var(--text);
  font-size: var(--t-sm);
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
  transition: border-color var(--dur) var(--ease), background var(--dur) var(--ease);
}

.sp__a:hover { border-color: var(--celeste); background: var(--surface-sunken); }
</style>
