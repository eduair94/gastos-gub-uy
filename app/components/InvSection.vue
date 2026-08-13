<script setup lang="ts">
/**
 * The band an investigation is written in: one full-width section, one gutter,
 * one optional head.
 *
 * Every long-form page under `pages/investigaciones/` was rebuilding this by
 * hand — 157 copies of
 *
 *   <section class="inv-sec inv-sec--alt">
 *     <div class="u-container">
 *       <div class="inv-head">
 *         <p class="u-eyebrow">…</p><h2>…</h2><p>…</p>
 *
 * and the copies had already drifted: `mejor-o-peor` puts a `.inv-serie__tag`
 * pill where its siblings put a `.u-eyebrow`, and the hub's series intro carried
 * its own inline `margin-bottom` (two values, --s-6 and --s-7, for the same
 * beat). Both grammars survive here as ONE component with two heads, so a page
 * picks a head instead of authoring one.
 *
 *   <InvSection alt :eyebrow="c.ctxTag" :title="c.ctxTitle" :dek="c.ctxIntro">
 *   <InvSection serie :tag="c.serieTag" :title="c.serieTitle" :dek="c.serieIntro">
 *
 * The gutter is `.u-container`'s `padding-inline` and nothing else: never add a
 * `padding` shorthand to the container element (it outranks the inline padding
 * and flushes the page against the phone's edge).
 */
withDefaults(defineProps<{
  /** Tinted band. The page alternates it; two plain sections in a row read as one. */
  alt?: boolean
  /** Stacked kicker over the title — the house grammar for an article section. */
  eyebrow?: string
  /** Pill kicker. Beside the title with `serie`, above it without. */
  tag?: string
  title?: string
  /** One line under the title: what the section measures, or its caveat. */
  dek?: string
  /** Hub grammar: pill and title on one baseline, intro in muted prose. */
  serie?: boolean
  /** Heading rank — follows the document outline, and the size follows the rank. */
  level?: 2 | 3
  /** Anchor target for in-page navigation. */
  id?: string
}>(), {
  alt: false,
  serie: false,
  level: 2,
})
</script>

<template>
  <section
    :id="id"
    class="inv-sec"
    :class="{ 'inv-sec--alt': alt }"
  >
    <div class="u-container">
      <template v-if="serie">
        <div
          v-if="tag || title"
          class="inv-serie"
        >
          <span
            v-if="tag"
            class="inv-serie__tag"
          >{{ tag }}</span>
          <component
            :is="level === 3 ? 'h3' : 'h2'"
            v-if="title"
          >
            {{ title }}
          </component>
        </div>
        <p
          v-if="dek"
          class="inv-prose inv-sec__intro"
        >
          {{ dek }}
        </p>
      </template>

      <div
        v-else-if="eyebrow || tag || title || dek || $slots.head"
        class="inv-head"
      >
        <p
          v-if="eyebrow"
          class="u-eyebrow"
        >
          {{ eyebrow }}
        </p>
        <span
          v-else-if="tag"
          class="inv-serie__tag"
        >{{ tag }}</span>
        <component
          :is="level === 3 ? 'h3' : 'h2'"
          v-if="title"
        >
          {{ title }}
        </component>
        <p v-if="dek">
          {{ dek }}
        </p>
        <slot name="head" />
      </div>

      <slot />
    </div>
  </section>
</template>

<style scoped>
/* The series intro is the head's dek, so it carries the head's own bottom beat
   — it used to be an inline style, at two different values across the hub. */
.inv-sec__intro {
  margin-bottom: var(--s-6);
  color: var(--text-muted);
}

/* A pill in the stacked head is a block above the title, not an inline chip
   welded to it. Vue condenses the newline between two sibling tags, so the gap
   has to be laid down here rather than left to a text node. */
.inv-head > .inv-serie__tag {
  display: inline-block;
  margin-bottom: var(--s-2);
}
</style>
