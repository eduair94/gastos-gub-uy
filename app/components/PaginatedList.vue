<script setup lang="ts">
/**
 * The one paginated list.
 *
 * Wrap any list's results in this and pagination becomes a solved problem
 * everywhere at once: a sticky pager pins below the app header, a matching
 * one sits at the foot, and every page change scrolls the results back to
 * the top. No page wires an anchor, a scroll target, or two pager
 * instances by hand — this owns all of that, so the behaviour can only
 * ever live in one place.
 *
 * It holds a zero-height anchor at the top of the results and hands its id
 * to both pagers as their scroll target; `<DataPager>` does the scroll, so
 * a page still using the pager directly keeps working unchanged.
 *
 * Bind `v-model:page`. The pagers render only when `totalPages > 1`, so a
 * single-page or empty list shows nothing. The default slot is the results
 * (table, cards, loading + empty states — whatever the page renders); it
 * sits between the two bars.
 *
 *   <PaginatedList v-model:page="page" :total-pages="totalPages">
 *     …table / cards / loading + empty states…
 *   </PaginatedList>
 */
withDefaults(defineProps<{
  page: number
  totalPages: number
  /** Render the bottom pager too. */
  foot?: boolean
}>(), {
  foot: true,
})

const emit = defineEmits<{ 'update:page': [value: number] }>()

// SSR-stable id so the pagers can bring the results anchor back under the
// header on a page change (see DataPager's scrollTargetId).
const anchorId = useId()
</script>

<template>
  <div class="plist">
    <!-- Zero-height scroll target; scroll-margin clears the sticky header. -->
    <div
      :id="anchorId"
      class="plist__anchor"
      aria-hidden="true"
    />

    <DataPager
      v-if="totalPages > 1"
      :page="page"
      :total-pages="totalPages"
      sticky
      :scroll-target-id="anchorId"
      @update:page="emit('update:page', $event)"
    />

    <slot />

    <DataPager
      v-if="foot && totalPages > 1"
      class="plist__foot"
      :page="page"
      :total-pages="totalPages"
      :scroll-target-id="anchorId"
      @update:page="emit('update:page', $event)"
    />
  </div>
</template>

<style scoped>
.plist { width: 100%; }

.plist__anchor {
  scroll-margin-top: calc(var(--header-h) + var(--s-3));
}

/* Parent-scoped class lands on the foot <DataPager>'s root. */
.plist__foot { margin-top: var(--s-5); }
</style>
