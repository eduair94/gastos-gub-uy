<script setup lang="ts">
/**
 * The in-page "we could not find that record" state.
 *
 * Four detail routes render this when a slug resolves to nothing. They return
 * 200 with this panel rather than a hard 404 because the record may simply have
 * moved and the reader is one click from the index that lists every one — which
 * is why the action is required, not optional: a dead end with no way out is
 * the whole failure mode this replaces.
 *
 * The page that renders it must also pass `noindex` to `useSeo()`; a soft 404
 * is worse than a hard one if it gets indexed.
 *
 *   <NotFoundPanel
 *     :title="t('casos.notFound.title')"
 *     :body="t('casos.notFound.body')"
 *     :action-to="localePath('/investigaciones/casos')"
 *     :action-label="t('casos.notFound.action')"
 *   />
 */
defineProps<{
  title: string
  body: string
  actionTo: string
  actionLabel: string
}>()
</script>

<template>
  <section class="u-container nf">
    <h1 class="nf__t">
      {{ title }}
    </h1>
    <p class="nf__b">
      {{ body }}
    </p>
    <NuxtLink
      :to="actionTo"
      class="nf__cta"
    >
      {{ actionLabel }}
    </NuxtLink>
  </section>
</template>

<style scoped>
.nf { padding-block: var(--s-9); text-align: center; }
.nf__t { margin: 0 0 var(--s-2); font-size: var(--t-2xl); }
.nf__b { margin: 0 0 var(--s-5); color: var(--text-muted); }

.nf__cta {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  padding: var(--s-3) var(--s-5);
  border-radius: var(--r-full);
  background: var(--cta-fill);
  color: var(--cta-fg);
  font-size: var(--t-sm);
  font-weight: 600;
  text-decoration: none;
}

.nf__cta:hover { filter: brightness(1.06); }
</style>
