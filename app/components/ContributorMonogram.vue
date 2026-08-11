<script setup lang="ts">
/**
 * A contributor's initials on a colour hashed from their GitHub handle.
 *
 * Stands in for an avatar on purpose: this site makes ZERO third-party requests,
 * and pulling avatars.githubusercontent.com would make it make one — an extra
 * DNS+TLS handshake on the critical path, every visitor's IP handed to GitHub,
 * and a hole in the page whenever GitHub is slow. The hue is stable per handle,
 * so each person keeps their colour across deploys.
 *
 * Decorative: the name is always rendered next to it, so this is aria-hidden
 * rather than given a redundant label.
 */
const props = withDefaults(defineProps<{
  name: string
  handle: string
  size?: number
}>(), { size: 52 })

const hue = computed(() => monogramHue(props.handle))
const text = computed(() => initials(props.name))
</script>

<template>
  <span
    class="mono"
    aria-hidden="true"
    :style="{
      '--mono-size': `${size}px`,
      '--mono-tint': `hsl(${hue} 55% 45%)`,
    }"
  >{{ text }}</span>
</template>

<style scoped>
/* Fixed px box so a two-letter monogram and a one-letter one line up in a
   column of cards.

   The hue is MIXED INTO the theme's own tokens rather than set as a fixed
   lightness, so the light and dark treatments fall out of `--surface`/`--text`
   with no theme selector at all. Two reasons that matters here: a scoped
   `:global([data-theme="dark"]) .mono` rule silently never reached the
   stylesheet (BrandMark carries the same latent bug), and `data-theme` is only
   applied on mount — anything keyed to it flashes the wrong colours through
   SSR and hydration. Mixing means there is nothing to flash. */
.mono {
  display: grid;
  flex: none;
  place-items: center;
  width: var(--mono-size);
  height: var(--mono-size);
  border: 1px solid color-mix(in srgb, var(--mono-tint) 34%, var(--rule));
  border-radius: var(--r-sm);
  background: color-mix(in srgb, var(--mono-tint) 16%, var(--surface));
  /* Mostly `--text` with a hue cast, NOT mostly hue: the fill already carries
     the identity, and a letter weighted toward a mid-lightness hue loses
     contrast against whichever theme's background is closer to it (measured
     2.9:1 on dark before this). Leaning on `--text` keeps both themes legible. */
  color: color-mix(in srgb, var(--mono-tint) 35%, var(--text));
  font-family: var(--font-mono);
  font-size: calc(var(--mono-size) * 0.34);
  font-weight: 600;
  letter-spacing: 0.04em;
  font-variant-numeric: tabular-nums;
}
</style>
