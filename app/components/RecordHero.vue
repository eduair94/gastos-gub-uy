<script setup lang="ts">
/**
 * The dark record header that opens an investigation surface.
 *
 * Five pages had built this by hand — the curros index and detail, the caso
 * collection, theme and detail — and they had already drifted: two radial
 * tints, two title measures (20ch vs 22ch vs 24ch), and a back link that was a
 * flex row in one file and an inline-flex in the next. It is one component now,
 * so the next surface inherits the header instead of re-deciding it.
 *
 * The `--ink` surface does NOT flip in dark mode, which is the whole reason
 * this is a component: text on it must use the fixed `--ink-fg` / `--ink-fg-dim`
 * pair rather than the paper tokens, and every hand-rolled copy is a chance to
 * forget that and go dark-on-dark. Chips passed through the default slot must
 * likewise be given `on="ink"`.
 *
 *   <RecordHero
 *     :eyebrow="t('casos.eyebrow')"
 *     :title="text.title"
 *     :dek="text.dek"
 *     :back-to="localePath('/investigaciones/casos')"
 *     :back-label="t('casos.backToAll')"
 *   >
 *     <template #eyebrow> · {{ period }}</template>
 *     <div class="chip-row"><StatusChip … on="ink" /></div>
 *   </RecordHero>
 */
withDefaults(defineProps<{
  /** Kicker text. Extra nodes (a period, a theme link) go in the `eyebrow` slot. */
  eyebrow?: string | undefined
  /** Leading glyph for the eyebrow. */
  emoji?: string | undefined
  title: string
  dek?: string | undefined
  /** Already locale-pathed. Omit for a top-level surface with nothing to go back to. */
  backTo?: string | undefined
  backLabel?: string | undefined
  /**
   * The radial tint. `alerta` marks the surfaces about wrongdoing under
   * investigation (curros); `celeste` is the neutral record header. It tints
   * the corner glow only — never the text, which stays on the fixed ink pair.
   */
  tone?: 'celeste' | 'alerta'
  /** `h1` on a page, `h2` when the header opens a section inside one. */
  level?: 'h1' | 'h2'
}>(), {
  tone: 'celeste',
  level: 'h1',
})
</script>

<template>
  <section
    class="rhero"
    :class="`rhero--${tone}`"
  >
    <div class="rhero__in u-container">
      <NuxtLink
        v-if="backTo"
        :to="backTo"
        class="rhero__back"
      >
        <v-icon size="16">
          mdi-arrow-left
        </v-icon>
        {{ backLabel }}
      </NuxtLink>

      <p
        v-if="eyebrow || emoji || $slots.eyebrow"
        class="u-eyebrow rhero__eyebrow"
      >
        <span
          v-if="emoji"
          class="rhero__emoji"
        >{{ emoji }}</span>
        <span v-if="eyebrow">{{ eyebrow }}</span>
        <slot name="eyebrow" />
      </p>

      <component
        :is="level"
        class="rhero__title"
      >
        {{ title }}
      </component>

      <p
        v-if="dek"
        class="rhero__dek"
      >
        {{ dek }}
      </p>

      <slot />
    </div>
  </section>
</template>

<style scoped>
.rhero {
  color: var(--ink-fg);
  border-bottom: 1px solid var(--rule);
}

.rhero--celeste {
  background:
    radial-gradient(1000px 340px at 88% -20%, color-mix(in srgb, var(--celeste) 22%, transparent), transparent 70%),
    var(--ink);
}

.rhero--alerta {
  background:
    radial-gradient(1000px 340px at 88% -20%, color-mix(in srgb, var(--ink-alerta) 22%, transparent), transparent 70%),
    var(--ink);
}

/* padding-block, never the `padding` shorthand: this element also carries
   .u-container, whose padding-inline IS the page gutter, and a shorthand here
   outranks it and flushes the header against the phone's edge. */
.rhero__in { padding-block: clamp(var(--s-6), 5vw, var(--s-8)); }

.rhero__back {
  display: inline-flex;
  align-items: center;
  gap: var(--s-1);
  margin-bottom: var(--s-4);
  color: var(--ink-fg-dim);
  font-size: var(--t-sm);
  font-weight: 600;
  text-decoration: none;
}

.rhero__back:hover { color: #fff; }

.rhero__eyebrow {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--s-2);
  color: var(--sol);
}

.rhero__emoji { font-size: 1.15em; }

.rhero__title {
  margin: var(--s-3) 0 0;
  max-width: 22ch;
  font-family: var(--font-display);
  font-size: clamp(28px, 5vw, var(--t-3xl));
  font-stretch: 112%;
  line-height: 1.05;
  letter-spacing: -0.02em;
  color: #fff;
  text-wrap: balance;
}

.rhero__dek {
  margin: var(--s-4) 0 0;
  max-width: 64ch;
  font-size: var(--t-md);
  line-height: 1.55;
  color: var(--ink-fg-dim);
}
</style>
