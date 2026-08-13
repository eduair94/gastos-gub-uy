<script setup lang="ts">
/**
 * The ink panel that carries the decisive sentence of a section.
 *
 * Nine pages built it by hand, four of them repeating the same
 * `style="margin-top: var(--s-6)"` because the panel almost always follows a
 * chart or a table; one wrote its own `style="margin: 0 0 6px"` on the heading.
 * The spacing is the SECTION's job now (see `_investigaciones.scss`), and the
 * heading rank is fixed here, so neither can drift page to page.
 *
 *   <InvFinding :kicker="c.disc.tag" :body="c.disc.finding" />
 *   <InvFinding :kicker="cx.hallazgoKicker" :title="cx.hallazgoH" :body="cx.hallazgoP" :law="cx.hallazgoLaw">
 *     …the contra grid…
 *   </InvFinding>
 *
 * The panel sits on `--ink`, which does NOT flip in dark mode: anything added
 * through the slot must use the fixed `--ink-fg` / `--ink-fg-dim` pair, and a
 * chip inside it needs `on="ink"`.
 */
const props = withDefaults(defineProps<{
  /** Mono kicker — what kind of finding this is. */
  kicker?: string
  title?: string
  /** One paragraph, or several. */
  body?: string | string[]
  /** Verbatim legal text, in the quoted block with the gold edge. */
  law?: string
}>(), {})

const paragraphs = computed(() => {
  if (!props.body) return []
  return Array.isArray(props.body) ? props.body : [props.body]
})
</script>

<template>
  <div class="inv-finding">
    <p
      v-if="kicker"
      class="inv-kicker"
    >
      {{ kicker }}
    </p>
    <h3 v-if="title">
      {{ title }}
    </h3>
    <p
      v-for="(p, i) in paragraphs"
      :key="i"
    >
      {{ p }}
    </p>
    <div
      v-if="law"
      class="inv-law"
    >
      {{ law }}
    </div>
    <slot />
  </div>
</template>
